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
  SkillsCli, OpError
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
    this._roots = null
    this._rootsAt = 0
    this._loadedCache = { at: 0, names: new Set() }
  }

  /** (Re)scan the world: discover roots, census, reconcile, persist. */
  refresh() {
    const roots = this.roots()
    const disk = []
    for (const root of roots) {
      disk.push(...scanRoot(root), ...scanDisabledRoot(root))
    }
    const state = this.store.state()
    const records = annotateCollisions(reconcile(disk, state.skills))
    this.store.write({ ...state, skills: records })
    this._records = records
    return records
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

  /** Loaded status from the host skills registry (cached 2s). */
  async loadedNames() {
    const now = Date.now()
    if (now - this._loadedCache.at < 2000) return this._loadedCache.names
    const names = new Set()
    const debug = { service: false, cwds: [], results: [], total: 0 }
    try {
      const skills = this.ctx.get('skills')
      if (skills && typeof skills.list === 'function') {
        debug.service = true
        // The registry collects per cwd: a root-context read sees nothing.
        // Probe every project root plus each live session's cwd and union.
        const cwds = new Set()
        for (const root of this.roots()) {
          if (root.scope === 'project') cwds.add(path.dirname(root.dir))
        }
        // Registered workspaces are the real project directories whose agents
        // load skills; root-level session headers only name the profile dir.
        try {
          const registry = this.ctx.workspaceRegistry
          if (registry && typeof registry.list === 'function') {
            for (const w of registry.list()) {
              if (w && typeof w.path === 'string' && w.path) cwds.add(path.resolve(w.path))
            }
          }
        } catch { /* registry unavailable */ }
        try {
          const sessions = this.ctx.sessions && typeof this.ctx.sessions.list === 'function' ? this.ctx.sessions.list() : []
          for (const s of sessions) {
            if (s && s.header && typeof s.header.cwd === 'string' && s.header.cwd && !s.header.cwd.includes('.dsh/profiles')) cwds.add(s.header.cwd)
          }
        } catch { /* sessions unavailable */ }
        if (cwds.size === 0) cwds.add(process.cwd())
        debug.cwds = [...cwds]
        for (const cwd of cwds) {
          try {
            const listed = await skills.list({ cwd })
            const count = Array.isArray(listed) ? listed.length : -1
            debug.results.push(count)
            for (const item of listed || []) {
              if (item && typeof item.name === 'string') names.add(item.name)
            }
          } catch (error) {
            debug.results.push('ERR:' + String((error && error.message) || error).slice(0, 60))
          }
        }
        // Real session cwds: the persistence layer lists every stored session
        // with its header (the in-process store only shows the root session).
        try {
          const persistence = this.ctx.sessionPersistence
          if (persistence && typeof persistence.list === 'function') {
            const snapshots = await persistence.list()
            for (const snap of snapshots || []) {
              const cwd = snap && snap.header && snap.header.cwd
              if (typeof cwd === 'string' && cwd && !cwd.includes('/.dsh/')) cwds.add(cwd)
            }
          }
        } catch (error) {
          debug.persistenceErr = String((error && error.message) || error).slice(0, 80)
        }
        // Per-session catalog: the ONLY view that merges agent-preset skill
        // layers (where ~/.agents/skills skills actually live).
        try {
          const catalog = this.ctx.sessionSkillCatalog
          const sessions = this.ctx.sessions && typeof this.ctx.sessions.list === 'function' ? this.ctx.sessions.list() : []
          let probed = 0
          for (const session of sessions) {
            if (!session || !session.id || probed >= 8) continue
            probed += 1
            try {
              const value = await catalog.list({ sessionId: session.id })
              const list = value && Array.isArray(value.skills) ? value.skills : []
              debug.results.push('cat:' + list.length)
              for (const entry of list) {
                if (entry && typeof entry.name === 'string') names.add(entry.name)
              }
            } catch (error) {
              debug.results.push('catERR:' + String((error && error.message) || error).slice(0, 60))
            }
          }
          debug.probedSessions = probed
        } catch (error) {
          debug.catalogErr = String((error && error.message) || error).slice(0, 80)
        }
        debug.v = 3
        for (const cwd of cwds) {
          if (debug.cwds.includes(cwd)) continue
          try {
            const listed = await skills.list({ cwd })
            debug.results.push('late:' + (Array.isArray(listed) ? listed.length : -1))
            for (const item of listed || []) {
              if (item && typeof item.name === 'string') names.add(item.name)
            }
          } catch (error) {
            debug.results.push('lateERR:' + String((error && error.message) || error).slice(0, 60))
          }
        }
        debug.cwds = [...cwds]
        debug.total = names.size
      }
    } catch { /* registry unavailable: loaded column stays unknown */ }
    this._loadedDebug = debug
    this._loadedCache = { at: now, names }
    return names
  }

  /** Full panel payload: roots + enriched records + health + env + logs. */
  async view() {
    const records = this.records()
    const loaded = await this.loadedNames()
    const enriched = records.map((r) => {
      const probe = r.brokenLink ? { mtime: 0, description: '' } : safePeek(r)
      return {
        ...r,
        description: probe.description || '',
        mtime: probe.mtime || 0,
        loaded: loaded.has(r.name),
        issues: r.health && r.health.issues ? r.health.issues : []
      }
    })
    const roots = this.roots().map((r) => ({
      dir: r.dir, scope: r.scope, agent: r.agent, standard: r.standard,
      present: r.kind === 'dir', readable: r.readable, writable: r.writable
    }))
    return {
      ok: true,
      at: Date.now(),
      roots,
      skills: enriched,
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
    const record = this.records().find((r) => r.name === name && (!dir || r.dir === dir))
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
    return { ok: true, report: healthReport(this.records()) }
  }

  // ---- operations (each logs with an undo entry) ----

  async opDisable(name, dir) {
    const record = this.mustRecord(name, dir)
    const result = await disableSkill(path.dirname(record.dir), name)
    this.store.log({ op: 'disable', skill: name, undo: { op: 'enable', name, dir: record.dir } })
    return this.finishMutation(result)
  }

  async opEnable(name, dir) {
    const record = this.mustRecord(name, dir)
    const shadowDir = path.dirname(record.dir)
    const stripped = shadowDir.endsWith('-disabled') ? shadowDir.slice(0, -'-disabled'.length) : null
    const root = (stripped && stripped.length > 0) ? stripped : (liveRootFor(this.roots(), record) || shadowDir)
    const result = await enableSkill(root, name)
    this.store.log({ op: 'enable', skill: name, undo: { op: 'disable', name, dir: path.join(root, name) } })
    return this.finishMutation(result)
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

  async opLink(name, target, rootDir) {
    const root = rootDir || defaultRootDir(this.roots(), 'global', 'agents')
    const result = await linkSkill(root, name, target)
    this.store.updateSkill(name, (s) => ({ ...s, origin: 'symlink', linkedFrom: result.target, installedBy: 'dsh-skills', installedAt: Date.now() }))
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

  dispose() {
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
  const root = roots.find((r) => r.scope === scope && r.agent === agent && r.kind === 'dir')
  if (root) return root.dir
  const any = roots.find((r) => r.kind === 'dir' && r.scope === scope)
  if (any) return any.dir
  return path.join(os.homedir(), '.agents', 'skills')
}

function liveRootFor(roots, record) {
  return roots.find((r) => r.dir === path.dirname(record.dir) && r.kind === 'dir')?.dir || null
}
