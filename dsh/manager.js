// dsh/manager.js — DSH adapter over the zero-dependency core.
//
// Owns the SkillStore location (~/.dsh/dsh-skills), reconciles disk census
// with persisted state, resolves "loaded" status from the host skills
// registry when it is composed, and executes operations with undo entries.
// All filesystem truth comes from core/; this file only wires DSH services.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  SkillStore, discoverRoots, liveRoots, scanRoot, scanDisabledRoot,
  reconcile, annotateCollisions, healthReport, readSkillBody, peekSkill,
  disableSkill, enableSkill, removeSkill, linkSkill, unlinkSkill, materializeSkill,
  backupSkill, rollbackSkill, pruneBackups, listBackups,
  SkillsCli, OpError, pushManifest, pullManifest, Marketplace, validateSources, validateRemotes, testRemote
} from '../core/index.js'
import { checkSkill, previewFix } from '../core/health.js'

export function managerDir() {
  const dshHome = process.env.DSH_HOME && process.env.DSH_HOME.trim()
    ? process.env.DSH_HOME.trim()
    : path.join(os.homedir(), '.dsh')
  return path.join(dshHome, 'dsh-skills')
}

export function backupsDir() {
  return path.join(managerDir(), 'backups')
}

const DEFAULT_CONFIG = {
  home: null,                 // null = os.homedir(); tests inject a sandbox
  projectRoot: null,          // null = follow each requesting session's cwd
  customRoots: [],
  retentionMaxPerSkill: 10,
  retentionMaxAgeDays: 30,
  cliTimeoutMs: 60000
}

export class SkillsManager {
  constructor(ctx, config = {}) {
    this.ctx = ctx
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.store = new SkillStore(managerDir())
    this.cli = new SkillsCli({ onEvent: (entry) => this.store.log(entry) })
    this.marketplace = new Marketplace(this.cli)
    this._roots = null
    this._rootsAt = 0
    this._loadedCache = { at: 0, names: new Set() }
    this._tombstones = new Map()
  }

  /** (Re)scan the world: discover roots, census, reconcile, persist. */
  refresh() {
    this.migrateLegacyDisabled()
    const roots = this.roots({ force: true })
    const disk = []
    for (const root of roots) {
      disk.push(...scanRoot(root), ...scanDisabledRoot(root))
    }
    const state = this.store.state()
    const disabled = new Set(state.dshDisabled || [])
    const records = annotateCollisions(reconcile(disk, state.skills)).map((record) => ({
      ...record,
      disabled: disabled.has(record.name)
    }))
    this.store.write({ ...state, skills: records })
    this._records = records
    return records
  }

  /**
   * v0.1 moved disabled skills into *-disabled directories, which disabled
   * them for every agent on the machine. Restore those dirs and carry the
   * user's intent into dshDisabled: DSH-only, shared files untouched.
   */
  migrateLegacyDisabled() {
    const state = this.store.state()
    const disabledSet = new Set(state.dshDisabled || [])
    let changed = false
    const skills = state.skills.map((record) => {
      if (!record.disabled) return record
      const parent = path.dirname(record.dir)
      if (!parent.endsWith('-disabled') || !fs.existsSync(record.dir)) return record
      const root = parent.slice(0, -'-disabled'.length)
      const target = path.join(root, record.name)
      if (fs.existsSync(target)) return record
      try {
        fs.mkdirSync(root, { recursive: true })
        fs.renameSync(record.dir, target)
        disabledSet.add(record.name)
        changed = true
        return { ...record, dir: target, disabled: false }
      } catch { return record }
    })
    if (changed) this.store.write({ ...state, skills, dshDisabled: [...disabledSet] })
  }

  refreshSummary() {
    const records = this.refresh()
    return { ok: true, scanned: records.length, dsh: this.dshGroups().length }
  }

  records() {
    const state = this.store.state()
    if (!this._records) return this.refresh()
    return this._records
  }

  roots({ force = false } = {}) {
    const now = Date.now()
    if (!force && this._roots && now - this._rootsAt < 3000) return this._roots
    const projectRoot = this.resolveProjectRoot()
    this._roots = discoverRoots({
      home: this.config.home || os.homedir(),
      projectRoot,
      customRoots: [...this.store.state().customRoots, ...this.config.customRoots]
    })
    this._rootsAt = now
    return this._roots
  }

  resolveProjectRoot() {
    if (this.config.projectRoot) return this.config.projectRoot
    // Follow the most recent session cwd so the project scope stays useful.
    try {
      const sessions = this.ctx.sessions
      if (sessions && typeof sessions.list === 'function') {
        const all = sessions.list()
        const withCwd = all.map((s) => s && s.header && s.header.cwd).filter(Boolean)
        if (withCwd.length) return withCwd[withCwd.length - 1]
      }
    } catch { /* fall through */ }
    return null
  }

  /**
   * Read the CURRENT session's user-invocable skill catalog. This is the only
   * loaded view we claim: per-cwd probes cannot see preset skill layers, and
   * enumerating every stored session was the wrong level of abstraction.
   */
  currentAgentSessionId() {
    try {
      const agents = this.ctx.get('agents')
      if (!agents) return undefined
      if (typeof agents.currentInitiator === 'function') {
        const current = agents.currentInitiator()
        if (current && current.id) return current.id
      }
      if (typeof agents.roots === 'function') {
        const roots = agents.roots()
        if (roots && roots[0] && roots[0].id) return roots[0].id
      }
    } catch { /* no active agent */ }
    return undefined
  }

  async latestStoredSessionId() {
    try {
      const persistence = this.ctx.sessionPersistence
      if (!persistence || typeof persistence.list !== 'function') return undefined
      const snapshots = await persistence.list()
      const ids = snapshots
        .map((snap) => snap && snap.header)
        .filter((header) => header && header.id)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      return ids.length ? ids[0].id : undefined
    } catch {
      return undefined
    }
  }

  async loadedNames(sessionId) {
    const now = Date.now()
    if (now - this._loadedCache.at < 2000 && this._loadedCache.sessionId === (sessionId || this.currentAgentSessionId())) return this._loadedCache.names
    const names = new Set()
    const effectiveId = sessionId || this.currentAgentSessionId() || await this.latestStoredSessionId()
    const debug = { sessionId: sessionId || null, effectiveId: effectiveId || null, catalogPresent: false, count: 0, error: null }
    const catalog = this.ctx.get('sessionSkillCatalog')
    debug.catalogPresent = !!catalog
    if (catalog && effectiveId) {
      try {
        const value = await catalog.list({ sessionId: effectiveId })
        const list = value && Array.isArray(value.skills) ? value.skills : []
        debug.count = list.length
        for (const entry of list) {
          if (entry && typeof entry.name === 'string') names.add(entry.name)
        }
      } catch (error) {
        debug.error = String((error && error.message) || error).slice(0, 160)
      }
    }
    this._loadedDebug = debug
    this._loadedCache = { at: now, sessionId: effectiveId, names }
    return names
  }

  /** Group DSH-local records by name; newest mtime is the preferred source. */
  dshGroups() {
    const byName = new Map()
    for (const record of this.records()) {
      if (record.agent !== 'agents') continue
      if (!byName.has(record.name)) byName.set(record.name, [])
      byName.get(record.name).push(record)
    }
    return [...byName.values()].map((group) => {
      const sorted = group.slice().sort((a, b) => {
        const am = a.brokenLink ? 0 : safePeek(a).mtime || 0
        const bm = b.brokenLink ? 0 : safePeek(b).mtime || 0
        return bm - am
      })
      const preferred = sorted[0]
      const external = this.records().filter((source) => source.name === preferred.name && source.agent !== 'agents')
      const sources = [
        ...sorted.map((source) => ({
          dir: source.dir,
          scope: source.scope,
          agent: source.agent,
          origin: source.origin,
          sourceRef: source.sourceRef,
          linkedFrom: source.linkedFrom,
          mtime: source.brokenLink ? 0 : safePeek(source).mtime || 0,
          disabled: source.disabled
        })),
        ...external.map((source) => ({
          dir: source.dir,
          scope: source.scope,
          agent: source.agent,
          origin: source.origin,
          sourceRef: source.sourceRef,
          linkedFrom: source.linkedFrom,
          mtime: source.brokenLink ? 0 : safePeek(source).mtime || 0,
          disabled: source.disabled,
          external: true
        }))
      ]
      return {
        ...preferred,
        mtime: preferred.brokenLink ? 0 : safePeek(preferred).mtime || 0,
        conflict: sources.length > 1,
        shadowed: group.some((s) => s.scope === 'project') && preferred.scope === 'global',
        sources
      }
    })
  }

  /** Full panel payload: DSH-local skills + importable external skills. */
  async view(sessionId) {
    const records = this.records()
    const loaded = await this.loadedNames(sessionId)
    const dshNames = new Set(records.filter((r) => r.agent === 'agents').map((r) => r.name))
    const externalByName = new Map()
    for (const record of records) {
      if (record.agent === 'agents' || dshNames.has(record.name) || record.disabled) continue
      if (!externalByName.has(record.name)) externalByName.set(record.name, record)
    }
    const externalSkills = [...externalByName.values()].map((r) => ({
      name: r.name,
      dir: r.dir,
      sourceAgent: r.agent,
      description: safePeek(r).description || '',
      brokenLink: !!r.brokenLink
    }))
    const enriched = this.dshGroups().map((preferred) => {
      const probe = preferred.brokenLink ? { mtime: 0, description: '' } : safePeek(preferred)
      return {
        ...preferred,
        description: probe.description || '',
        mtime: probe.mtime || 0,
        loaded: !preferred.disabled && loaded.has(preferred.name),
        issues: checkSkill(preferred).issues
      }
    })
    const roots = this.roots().filter((r) => r.agent === 'agents').map((r) => ({
      dir: r.dir, scope: r.scope, agent: r.agent, standard: r.standard,
      present: r.kind === 'dir', readable: r.readable, writable: r.writable
    }))
    return {
      ok: true,
      at: Date.now(),
      roots,
      skills: enriched,
      externalSkills,
      env: this.cli.available(),
      loadedDebug: this._loadedDebug || null,
      lockfiles: this.lockfiles(),
      paths: { state: path.join(managerDir(), 'state.json'), backups: backupsDir() }
    }
  }

  lockfiles() {
    const out = []
    for (const root of this.roots()) {
      if (root.scope !== 'project' || !root.readable) continue
      const lock = this.cli.lockfileStatus(root.dir.replace(/[\\/]skills$/, ''))
      if (lock.present) out.push({ scope: root.scope, path: lock.path })
    }
    const globalLock = this.cli.lockfileStatus(os.homedir())
    if (globalLock.present) out.push({ scope: 'global', path: globalLock.path })
    return out
  }

  async detail(name, dir) {
    const record = this.dshGroups().find((r) => r.name === name && (!dir || r.dir === dir)) || this.records().find((r) => r.name === name && (!dir || r.dir === dir))
    if (!record) throw new OpError('not-found', '未找到技能：' + name)
    const body = record.brokenLink ? { ok: false, error: '软链已失效' } : await readSkillBody(record.dir)
    const health = this.healthFor(record)
    return {
      ok: true,
      record,
      body,
      health,
      fixPreviews: health.issues.map((issue) => ({ issue, ...previewFixSafe(record, issue) }))
    }
  }

  healthFor(record) {
    return checkSkill(record)
  }

  health() {
    return { ok: true, report: healthReport(this.dshGroups()) }
  }

  // ---- operations (each logs with an undo entry) ----

  async opDisable(name, dir) {
    const record = this.mustRecord(name, dir)
    const state = this.store.state()
    const dshDisabled = Array.from(new Set([...(state.dshDisabled || []), name]))
    const skills = state.skills.map((s) => s.name === name ? { ...s, disabled: true } : s)
    this.store.write({ ...state, dshDisabled, skills })
    this.syncTombstones()
    this.store.log({ op: 'disable', skill: name, message: '仅 DSH 停用', undo: { op: 'enable', name, dir: record.dir } })
    return this.finishMutation({ name, disabled: true, scope: 'dsh-only' })
  }

  async opEnable(name, dir) {
    const record = this.mustRecord(name, dir)
    const state = this.store.state()
    const dshDisabled = (state.dshDisabled || []).filter((n) => n !== name)
    const skills = state.skills.map((s) => s.name === name ? { ...s, disabled: false } : s)
    this.store.write({ ...state, dshDisabled, skills })
    this.syncTombstones()
    this.store.log({ op: 'enable', skill: name, message: '仅 DSH 启用', undo: { op: 'disable', name, dir: record.dir } })
    return this.finishMutation({ name, disabled: false, scope: 'dsh-only' })
  }

  /** Install/remove DSH-only invocation tombstones on live agents. */
  syncTombstones() {
    const disabled = new Set(this.store.state().dshDisabled || [])
    let agents = []
    try {
      const service = this.ctx.get('agents')
      if (service && typeof service.list === 'function') agents = service.list() || []
    } catch { agents = [] }
    for (const agent of agents) this.installAgentTombstones(agent, disabled)
    for (const [key, dispose] of this._tombstones) {
      const name = key.slice(key.indexOf('|') + 1)
      if (!disabled.has(name)) {
        try { dispose() } catch { /* noop */ }
        this._tombstones.delete(key)
      }
    }
  }

  /** New agents inherit every current DSH-only disablement. */
  onAgentCreated(agent) {
    try { this.installAgentTombstones(agent, new Set(this.store.state().dshDisabled || [])) } catch { /* never block agent creation */ }
  }

  installAgentTombstones(agent, disabled) {
    if (!agent || !agent.ctx || typeof agent.ctx.get !== 'function') return
    const skills = agent.ctx.get('skills')
    if (!skills || typeof skills.register !== 'function') return
    for (const name of disabled) {
      const key = String(agent.id || 'agent') + '|' + name
      if (this._tombstones.has(key)) continue
      try {
        const dispose = skills.register({
          name,
          description: 'Disabled in DeepSeek Harness by Skills Butler',
          content: 'This skill is disabled in DeepSeek Harness by Skills Butler.',
          source: 'dsh-skills-butler',
          invocation: { modelInvocable: false, userInvocable: false }
        })
        this._tombstones.set(key, dispose)
      } catch { /* duplicate runtime name or disposed agent: leave untouched */ }
    }
  }

  async opRemove(name, dir, { confirmed = false, backup: takeBackup = true } = {}) {
    const record = this.mustRecord(name, dir)
    if (!confirmed) throw new OpError('needs-confirmation', '真移除需要二次确认')
    let backupEntry = null
    if (takeBackup && !record.brokenLink) {
      backupEntry = await backupSkill(backupsDir(), path.dirname(record.dir), name, 'pre-remove')
    }
    const result = await removeSkill(path.dirname(record.dir), name, { confirmed: true, backupTaken: !!backupEntry })
    this.store.log({
      op: 'remove', skill: name,
      message: backupEntry ? '已先备份' : '',
      undo: backupEntry ? { op: 'rollback', name, backupDir: backupEntry.dir } : null
    })
    return this.finishMutation({ ...result, backup: backupEntry ? backupEntry.dir : null })
  }

  async opLink(name, target, rootDir, sourceAgent) {
    const root = rootDir || defaultRootDir(this.roots(), 'global', 'agents')
    const result = await linkSkill(root, name, target)
    // Census first creates the new DSH row; annotate that exact directory, not
    // the same-named external row we imported from.
    this.refresh()
    this.store.updateSkill(name, (s) => s.dir === result.link ? ({
      ...s,
      origin: result.via === 'copy' ? 'manual' : 'symlink',
      linkedFrom: result.target,
      sourceRef: sourceAgent ? 'external:' + sourceAgent : s.sourceRef,
      installedBy: 'dsh-skills',
      installedAt: Date.now()
    }) : s)
    this.store.log({ op: 'link', skill: name, message: result.via, undo: { op: 'unlink', name, dir: path.join(root, name) } })
    return this.finishMutation(result)
  }

  async opUnlink(name, dir) {
    const record = this.mustRecord(name, dir)
    const result = await unlinkSkill(path.dirname(record.dir), name)
    this.store.log({ op: 'unlink', skill: name, undo: { op: 'link', name, target: record.linkedFrom } })
    return this.finishMutation(result)
  }

  async opMaterialize(name, dir) {
    const record = this.mustRecord(name, dir)
    const result = await materializeSkill(path.dirname(record.dir), name)
    this.store.updateSkill(name, (s) => ({ ...s, origin: 'manual', linkedFrom: null }))
    this.store.log({ op: 'materialize', skill: name, undo: null })
    return this.finishMutation(result)
  }

  async opPin(name, dir, pinned) {
    const record = this.mustRecord(name, dir)
    this.store.updateSkill(name, (s) => ({ ...s, pinned: !!pinned }))
    this.store.log({ op: pinned ? 'pin' : 'unpin', skill: name, undo: { op: pinned ? 'unpin' : 'pin', name, dir: record.dir } })
    return { ok: true }
  }

  async opRollback(name, backupDir) {
    const backupsRoot = backupsDir()
    const targetRoot = defaultRootDir(this.roots(), 'global', 'agents')
    const result = await rollbackSkill(backupsRoot, targetRoot, name, backupDir)
    this.store.log({ op: 'rollback', skill: name, message: result.priorBackup || '' })
    return this.finishMutation(result)
  }

  async opAddCustomRoot(dir) {
    const resolved = path.resolve(String(dir || '').trim())
    if (!resolved) throw new OpError('bad-input', '目录不能为空')
    const st = fs.existsSync(resolved)
    const state = this.store.state()
    if (!state.customRoots.includes(resolved)) state.customRoots.push(resolved)
    this.store.write({ ...state, customRoots: state.customRoots })
    this._roots = null
    this.store.log({ op: 'add-root', message: resolved + (st ? '' : ' (尚不存在)') })
    return { ok: true, dir: resolved, exists: st }
  }

  async opRemoveCustomRoot(dir) {
    const state = this.store.state()
    const customRoots = state.customRoots.filter((d) => d !== dir)
    this.store.write({ ...state, customRoots })
    this._roots = null
    this.store.log({ op: 'remove-root', message: String(dir) })
    return { ok: true }
  }

  /** Undo the most recent undoable operation. */
  async opUndo() {
    const logs = this.store.state().logs || []
    for (let i = logs.length - 1; i >= 0; i--) {
      const entry = logs[i]
      if (!entry.undo) continue
      const undo = entry.undo
      switch (undo.op) {
        case 'enable': return { ok: true, ...(await this.opEnable(undo.name, undo.dir)) }
        case 'disable': return { ok: true, ...(await this.opDisable(undo.name, undo.dir)) }
        case 'link': return { ok: true, ...(await this.opLink(undo.name, undo.target)) }
        case 'unlink': return { ok: true, ...(await this.opUnlink(undo.name, undo.dir)) }
        case 'rollback': return { ok: true, ...(await this.opRollback(undo.name, undo.backupDir)) }
        case 'pin': return { ok: true, ...(await this.opPin(undo.name, undo.dir, true)) }
        case 'unpin': return { ok: true, ...(await this.opPin(undo.name, undo.dir, false)) }
        default: continue
      }
    }
    throw new OpError('nothing-to-undo', '没有可撤销的操作')
  }

  // ---- CLI pass-through (market install/update) ----

  async cliFind(query) {
    const result = await this.cli.find(query)
    this.store.log({ op: 'find', message: String(query || ''), status: result.ok ? 'ok' : 'error' })
    return result
  }

  async cliAdd(pkg, { scope = 'global' } = {}) {
    const result = await this.cli.add(pkg, { scope })
    this.store.log({ op: 'cli-add', message: String(pkg), status: result.ok ? 'ok' : 'error' })
    if (result.ok) this.finishMutation(result)
    return result
  }

  async cliUpdate(names, { scope = 'global' } = {}) {
    // Backup affected skills first when they live in known roots.
    const targets = this.records().filter((r) => !names || names.includes(r.name))
    for (const target of targets.slice(0, 20)) {
      if (!target.brokenLink) {
        try { await backupSkill(backupsDir(), path.dirname(target.dir), target.name, 'pre-update') } catch { /* best effort */ }
      }
    }
    const result = await this.cli.update(names, { scope })
    this.store.log({ op: 'cli-update', message: Array.isArray(names) ? names.join(',') : String(names || '*'), status: result.ok ? 'ok' : 'error' })
    this.finishMutation(result)
    return result
  }

  async cliRemove(names, { scope = 'global' } = {}) {
    const result = await this.cli.remove(names, { scope })
    this.store.log({ op: 'cli-remove', message: (Array.isArray(names) ? names : [names]).join(','), status: result.ok ? 'ok' : 'error' })
    this.finishMutation(result)
    return result
  }

  async prune() {
    const removed = await pruneBackups(backupsDir(), {
      maxPerSkill: this.config.retentionMaxPerSkill,
      maxAgeDays: this.config.retentionMaxAgeDays
    })
    return { ok: true, removed }
  }

  async backups() {
    return { ok: true, backups: await listBackups(backupsDir()) }
  }

  logs(limit = 100) {
    const logs = this.store.state().logs || []
    return { ok: true, logs: logs.slice(-Math.max(1, Math.min(300, limit))) }
  }

  mustRecord(name, dir) {
    const records = this.records()
    let record = records.find((r) => r.name === name && (!dir || r.dir === dir))
    // After a disable the row's dir moves into the *-disabled shadow dir, so
    // an undo entry captured pre-move still resolves by name.
    if (!record && dir) record = records.find((r) => r.name === name)
    if (!record) throw new OpError('not-found', '未找到技能：' + String(name))
    return record
  }

  finishMutation(extra) {
    this.refresh()
    this._loadedCache.at = 0
    return { ok: true, ...extra }
  }

  marketSourcesFile() {
    return path.join(managerDir(), 'market-sources.json')
  }

  marketSources() {
    try {
      return validateSources(JSON.parse(fs.readFileSync(this.marketSourcesFile(), 'utf8')))
    } catch {
      return this.marketplace.sources()
    }
  }

  saveMarketSources(input) {
    const sources = validateSources(input)
    fs.mkdirSync(managerDir(), { recursive: true })
    const temp = this.marketSourcesFile() + '.tmp-' + process.pid
    fs.writeFileSync(temp, JSON.stringify(sources, null, 2) + '\n', 'utf8')
    fs.renameSync(temp, this.marketSourcesFile())
    this.store.log({ op: 'market-sources', message: sources.filter((s) => s.enabled).map((s) => s.id).join(',') })
    return { ok: true, sources }
  }

  async marketSearch(sourceId, query) {
    const source = this.marketSources().find((s) => s.id === sourceId) || this.marketSources()[0]
    if (!source.enabled) return { ok: false, reason: '该来源已停用，请在来源配置中启用', rows: [] }
    return this.marketplace.search(source, query)
  }

  async skillhubInstall(name, sourceId) {
    const source = this.marketSources().find((s) => s.id === sourceId) || this.marketSources().find((s) => s.type === 'skillhub')
    const targetDir = defaultRootDir(this.roots(), 'global', 'agents')
    const result = await this.marketplace.installSkillhub(name, targetDir, source)
    this.store.log({ op: 'skillhub-install', skill: name, message: source.name, status: result.ok ? 'ok' : 'error' })
    if (result.ok) this.finishMutation(result)
    return result
  }

  /** Fill downloadable refs from `skills list` without writing skill content. */
  async enrichSources() {
    const listed = await this.cli.list('global')
    if (!listed.ok) return listed
    const byName = new Map(listed.rows.map((row) => [row.name, row]))
    const state = this.store.state()
    let changed = false
    const skills = state.skills.map((record) => {
      if (record.agent !== 'agents' || record.sourceRef) return record
      const row = byName.get(record.name)
      if (!row || !row.source || row.source === 'untracked') return record
      changed = true
      return { ...record, sourceRef: row.source + '@' + record.name }
    })
    if (changed) this.store.write({ ...state, skills })
    return listed
  }

  syncRemotesFile() { return path.join(managerDir(), 'sync-remotes.json') }
  syncCredentialsFile() { return path.join(managerDir(), 'sync-credentials.json') }

  readCredentials() {
    try { return JSON.parse(fs.readFileSync(this.syncCredentialsFile(), 'utf8')) } catch { return {} }
  }

  syncRemotes() {
    let remotes = []
    try { remotes = validateRemotes(JSON.parse(fs.readFileSync(this.syncRemotesFile(), 'utf8'))) } catch { remotes = [] }
    const credentials = this.readCredentials()
    return remotes.map((remote) => ({ ...remote, hasCredential: !!credentials[remote.id] }))
  }

  saveSyncRemotes(input) {
    const remotes = validateRemotes(input)
    const credentials = this.readCredentials()
    for (const raw of Array.isArray(input) ? input : []) {
      if (!raw || !raw.id) continue
      if (typeof raw.password === 'string' && raw.password) {
        credentials[raw.id] = { username: raw.username || '', password: raw.password }
      }
    }
    fs.mkdirSync(managerDir(), { recursive: true })
    const temp = this.syncRemotesFile() + '.tmp-' + process.pid
    fs.writeFileSync(temp, JSON.stringify(remotes, null, 2) + '\n', 'utf8')
    fs.renameSync(temp, this.syncRemotesFile())
    const credTemp = this.syncCredentialsFile() + '.tmp-' + process.pid
    fs.writeFileSync(credTemp, JSON.stringify(credentials, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(credTemp, this.syncCredentialsFile())
    try { fs.chmodSync(this.syncCredentialsFile(), 0o600) } catch { /* best effort */ }
    this.store.log({ op: 'sync-remotes', message: remotes.map((r) => r.id).join(',') })
    return { ok: true, remotes: this.syncRemotes() }
  }

  credentialFor(remote) {
    return this.readCredentials()[remote.id] || null
  }

  async syncTest(remoteId) {
    const remote = this.syncRemotes().find((r) => r.id === remoteId)
    if (!remote) return { ok: false, message: '远端不存在，请先保存配置' }
    return testRemote({ remote, credential: this.credentialFor(remote) })
  }

  selectedRemotes(remoteIds) {
    const enabled = this.syncRemotes().filter((r) => r.enabled)
    if (!Array.isArray(remoteIds) || remoteIds.length === 0) return enabled
    return enabled.filter((r) => remoteIds.includes(r.id))
  }

  /** Explicit user action: push manifests to every selected remote. */
  async syncPush(remoteIds) {
    const remotes = this.selectedRemotes(remoteIds)
    if (!remotes.length) return { ok: false, reason: '请先配置并选择至少一个远端', results: [] }
    await this.enrichSources()
    const records = this.records().filter((r) => r.agent === 'agents')
    const results = await Promise.all(remotes.map(async (remote) => {
      try {
        return await pushManifest({ cacheRoot: path.join(managerDir(), 'sync'), remote, credential: this.credentialFor(remote), records })
      } catch (error) {
        return { ok: false, remoteId: remote.id, error: error.message || String(error) }
      }
    }))
    this.store.log({ op: 'sync-push', message: results.map((r) => r.remoteId + ':' + (r.ok ? 'ok' : 'error')).join(',') })
    return { ok: results.every((r) => r.ok), results }
  }

  /** Pull and validate only; the user chooses what to install. */
  async syncPull(remoteIds) {
    const remotes = this.selectedRemotes(remoteIds)
    if (!remotes.length) return { ok: false, reason: '请先配置并选择至少一个远端', results: [] }
    const results = await Promise.all(remotes.map(async (remote) => {
      try {
        const manifest = await pullManifest({ cacheRoot: path.join(managerDir(), 'sync'), remote, credential: this.credentialFor(remote) })
        return { ok: true, remoteId: remote.id, manifest }
      } catch (error) {
        return { ok: false, remoteId: remote.id, error: error.message || String(error) }
      }
    }))
    this.store.log({ op: 'sync-pull', message: results.map((r) => r.remoteId + ':' + (r.ok ? 'ok' : 'error')).join(',') })
    return { ok: results.every((r) => r.ok), results }
  }

  dispose() {
    for (const dispose of this._tombstones.values()) { try { dispose() } catch { /* noop */ } }
    this._tombstones.clear()
    this.store.dispose()
  }
}

function previewFixSafe(record, issue) {
  try { return previewFix(record, issue) } catch { return { canFix: false, title: issue, diff: null, reason: 'preview-failed' } }
}

function safePeek(record) {
  try { return peekSkill(record.dir) } catch { return { mtime: 0, description: '' } }
}

function defaultRootDir(roots, scope, agent) {
  const root = roots.find((r) => r.scope === scope && r.agent === agent)
  if (root) return root.dir
  return path.join(os.homedir(), '.agents', 'skills')
}

function liveRootFor(roots, record) {
  return roots.find((r) => r.dir === path.dirname(record.dir) && r.kind === 'dir')?.dir || null
}
