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
    // Individual runtime registrations shadow only their own skill name in the
    // Agent layer; unlike a provider, they never hide the preset filesystem.
    this._agentTombstones = new Map()
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
    const records = annotateCollisions(reconcile(disk, state.skills)).map((record) => ({
      ...record,
      disabled: this.isRecordDisabled(record, state)
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

  projectRootFor(record) {
    if (record.scope !== 'project') return null
    const resolved = path.resolve(record.dir)
    const marker = path.sep + '.agents' + path.sep + 'skills' + path.sep
    const index = resolved.lastIndexOf(marker)
    if (index > 0) return resolved.slice(0, index)
    const current = this.resolveProjectRoot()
    if (current) {
      const relative = path.relative(path.resolve(current), resolved)
      if (relative && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) return path.resolve(current)
    }
    return null
  }

  isRecordDisabled(record, state = this.store.state()) {
    if (record.scope !== 'project') return (state.dshDisabled || []).includes(record.name)
    const projectRoot = this.projectRootFor(record)
    return !!projectRoot && (state.dshProjectDisabled || []).some((entry) =>
      entry.name === record.name && path.resolve(entry.projectRoot) === path.resolve(projectRoot))
  }

  /**
   * Availability is global/project file presence plus the user's toggle state.
   * It deliberately does not depend on whichever session happens to be open.
   * Agent-scoped registries control actual invocation; they are not used as a
   * per-session substitute for these stable global/project states.
   */
  loadedCatalogs() {
    const global = new Set()
    const project = new Set()
    for (const record of this.records()) {
      if (record.agent !== 'agents' || record.disabled || record.brokenLink) continue
      if (record.scope === 'project') project.add(record.name)
      else global.add(record.name)
    }
    const debug = {
      source: 'filesystem-and-toggle-state', sessionId: null, effectiveId: null,
      globalCatalogPresent: true, catalogPresent: true,
      globalCount: global.size, count: project.size, error: null
    }
    this._loadedDebug = debug
    return { global, project, debug }
  }

  /** Group DSH-local records by name; newest mtime is the preferred source. */
  dshGroups() {
    const byName = new Map()
    for (const record of this.records()) {
      if (record.agent !== 'agents') continue
      const key = record.name + '|' + record.scope
      if (!byName.has(key)) byName.set(key, [])
      byName.get(key).push(record)
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
        shadowed: this.records().some((s) => s.name === preferred.name && s.scope === 'project') && preferred.scope === 'global',
        sources
      }
    })
  }

  /** Full panel payload: DSH-local skills + importable external skills. */
  async view() {
    const records = this.records()
    const catalogs = this.loadedCatalogs()
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
        loaded: !preferred.disabled && (preferred.scope === 'project' ? catalogs.project : catalogs.global).has(preferred.name),
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
    const isProject = record.scope === 'project'
    const projectRoot = isProject ? this.projectRootFor(record) : null
    if (isProject && !projectRoot) throw new OpError('project-root-required', '无法确定该技能所属项目')
    const dshDisabled = isProject ? (state.dshDisabled || []) : Array.from(new Set([...(state.dshDisabled || []), name]))
    const dshProjectDisabled = isProject && !(state.dshProjectDisabled || []).some((entry) => entry.name === name && path.resolve(entry.projectRoot) === path.resolve(projectRoot))
      ? [...(state.dshProjectDisabled || []), { name, projectRoot: path.resolve(projectRoot) }]
      : (state.dshProjectDisabled || [])
    const skills = state.skills.map((s) => isProject
      ? (s.dir === record.dir ? { ...s, disabled: true } : s)
      : (s.name === name && s.scope !== 'project' ? { ...s, disabled: true } : s))
    this.store.write({ ...state, dshDisabled, dshProjectDisabled, skills })
    this.syncTombstones()
    this.store.log({ op: 'disable', skill: name, message: isProject ? '仅当前项目停用' : '全局停用，对所有会话立即生效', undo: { op: 'enable', name, dir: record.dir } })
    return this.finishMutation({ name, disabled: true, scope: isProject ? 'dsh-project' : 'dsh-global' })
  }

  async opEnable(name, dir) {
    const record = this.mustRecord(name, dir)
    const state = this.store.state()
    const isProject = record.scope === 'project'
    const projectRoot = isProject ? this.projectRootFor(record) : null
    const dshDisabled = isProject ? (state.dshDisabled || []) : (state.dshDisabled || []).filter((n) => n !== name)
    const dshProjectDisabled = isProject
      ? (state.dshProjectDisabled || []).filter((entry) => !(entry.name === name && projectRoot && path.resolve(entry.projectRoot) === path.resolve(projectRoot)))
      : (state.dshProjectDisabled || [])
    const skills = state.skills.map((s) => isProject
      ? (s.dir === record.dir ? { ...s, disabled: false } : s)
      : (s.name === name && s.scope !== 'project' ? { ...s, disabled: false } : s))
    this.store.write({ ...state, dshDisabled, dshProjectDisabled, skills })
    this.syncTombstones()
    this.store.log({ op: 'enable', skill: name, message: isProject ? '仅当前项目启用' : '全局启用，对所有会话立即生效', undo: { op: 'disable', name, dir: record.dir } })
    return this.finishMutation({ name, disabled: false, scope: isProject ? 'dsh-project' : 'dsh-global' })
  }

  /** Reconcile only same-named runtime entries in each live Agent layer. */
  syncTombstones() {
    for (const entry of this._agentTombstones.values()) this.syncAgentTombstones(entry)
  }

  syncAgentTombstones(entry) {
    const state = this.store.state()
    const cwd = agentCwd(entry.agent)
    const projectNames = new Set()
    if (cwd) {
      for (const record of this.records()) {
        if (record.agent !== 'agents' || record.scope !== 'project' || record.brokenLink) continue
        const root = this.projectRootFor(record)
        if (root && withinRoot(cwd, root)) projectNames.add(record.name)
      }
    }
    const desired = new Set()
    for (const name of state.dshDisabled || []) {
      // A same-named project skill remains the explicit project override.
      if (!projectNames.has(name)) desired.add(name)
    }
    for (const item of state.dshProjectDisabled || []) {
      if (cwd && withinRoot(cwd, item.projectRoot)) desired.add(item.name)
    }
    for (const [name, dispose] of entry.disposers) {
      if (desired.has(name)) continue
      try { dispose() } catch { /* already disposed */ }
      entry.disposers.delete(name)
    }
    for (const name of desired) {
      if (entry.disposers.has(name)) continue
      const dispose = entry.registry.register({
        name,
        description: 'Disabled in DeepSeek Harness by Skills Butler',
        content: 'This skill is disabled in DeepSeek Harness by Skills Butler.',
        source: 'runtime',
        invocation: { modelInvocable: false, userInvocable: false }
      })
      entry.disposers.set(name, dispose)
    }
  }

  onAgentCreated(agent) {
    if (!agent || !agent.id || this._agentTombstones.has(agent.id)) return
    const registry = agent.ctx && typeof agent.ctx.get === 'function' ? agent.ctx.get('skills') : null
    if (!registry || typeof registry.register !== 'function') return
    const entry = { agent, registry, disposers: new Map() }
    this._agentTombstones.set(agent.id, entry)
    try { this.syncAgentTombstones(entry) } catch (error) {
      this.store.log({ op: 'tombstone-error', message: String(error && error.message || error) })
    }
  }

  installExistingAgentTombstones() {
    try {
      const agents = this.ctx.get('agents')
      for (const agent of agents && typeof agents.list === 'function' ? agents.list() : []) this.onAgentCreated(agent)
    } catch { /* no live agents */ }
  }

  onAgentDisposed(agent) {
    const id = agent && agent.id
    if (id) this._agentTombstones.delete(id)
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
    if (!record) throw new OpError('not-found', '未找到技能：' + String(name))
    return record
  }

  finishMutation(extra) {
    this.refresh()
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
    for (const entry of this._agentTombstones.values()) {
      for (const dispose of entry.disposers.values()) {
        try { dispose() } catch { /* noop */ }
      }
    }
    this._agentTombstones.clear()
    this.store.dispose()
  }
}

function agentCwd(agent) {
  const cwd = agent && (agent.cwd || (agent.session && agent.session.header && agent.session.header.cwd))
  return cwd ? path.resolve(cwd) : null
}

function withinRoot(cwd, projectRoot) {
  if (!cwd || !projectRoot) return false
  const relative = path.relative(path.resolve(projectRoot), path.resolve(cwd))
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
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
