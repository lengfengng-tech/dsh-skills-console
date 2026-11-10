// core/store.js — state.json + logs.jsonl persistence.
//
// Follows the dsh-mcp-tools store contract: atomic temp+rename writes, an
// external-change watcher with hash debounce, merge-before-write so concurrent
// processes do not silently drop each other's rows, and a bounded JSONL event
// log. Zero DSH dependencies.

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

export const STATE_VERSION = 1
export const SKILL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

export function defaultState() {
  return { version: STATE_VERSION, skills: [], customRoots: [], backups: [], pinned: [], logs: [], dshDisabled: [] }
}

function asString(value) { return typeof value === 'string' ? value : '' }
function asBool(value, fallback) { return typeof value === 'boolean' ? value : fallback }
function asNumber(value, fallback) { return Number.isFinite(Number(value)) ? Number(value) : fallback }

/** Normalize one skill record; unknown fields are dropped, nothing is invented. */
export function normalizeSkill(input, existing) {
  const base = existing || {}
  const record = {
    name: asString(input && input.name) || base.name || '',
    dir: asString(input && input.dir) || base.dir || '',
    scope: ['global', 'project'].includes(input && input.scope) ? input.scope : (base.scope || 'global'),
    agent: asString(input && input.agent) || base.agent || 'agents',
    origin: ['marketplace', 'git', 'manual', 'symlink', 'builtin'].includes(input && input.origin) ? input.origin : (base.origin || 'manual'),
    sourceRef: input && input.sourceRef !== undefined ? (input.sourceRef == null ? null : asString(input.sourceRef)) : (base.sourceRef ?? null),
    linkedFrom: input && input.linkedFrom !== undefined ? (input.linkedFrom == null ? null : asString(input.linkedFrom)) : (base.linkedFrom ?? null),
    installedAt: asNumber(input && input.installedAt, asNumber(base.installedAt, 0)),
    installedBy: ['dsh-skills', 'foreign'].includes(input && input.installedBy) ? input.installedBy : (base.installedBy || 'foreign'),
    pinned: asBool(input && input.pinned, asBool(base.pinned, false)),
    disabled: asBool(input && input.disabled, asBool(base.disabled, false)),
    lastCheckedAt: asNumber(input && input.lastCheckedAt, asNumber(base.lastCheckedAt, 0)),
    latestKnown: asString(input && input.latestKnown) || base.latestKnown || '',
    health: normalizeHealth(input && input.health !== undefined ? input.health : base.health)
  }
  return record
}

function normalizeHealth(raw) {
  const base = raw && typeof raw === 'object' ? raw : {}
  const issues = Array.isArray(base.issues) ? base.issues.filter((x) => typeof x === 'string') : []
  return { loadable: asBool(base.loadable, issues.length === 0), issues }
}

export function normalizeState(parsed) {
  const state = defaultState()
  if (!parsed || typeof parsed !== 'object') return state
  state.version = STATE_VERSION
  if (Array.isArray(parsed.skills)) state.skills = parsed.skills.map((s) => normalizeSkill(s, s))
  if (Array.isArray(parsed.customRoots)) {
    state.customRoots = parsed.customRoots.filter((x) => typeof x === 'string' && x.trim())
  }
  if (Array.isArray(parsed.backups)) {
    state.backups = parsed.backups.filter((b) => b && typeof b === 'object' && asString(b.dir)).map((b) => ({
      dir: asString(b.dir),
      skill: asString(b.skill),
      takenAt: asNumber(b.takenAt, 0),
      reason: asString(b.reason) || 'update'
    }))
  }
  if (Array.isArray(parsed.pinned)) state.pinned = parsed.pinned.filter((x) => typeof x === 'string')
  if (Array.isArray(parsed.dshDisabled)) state.dshDisabled = parsed.dshDisabled.filter((x) => typeof x === 'string')
  if (Array.isArray(parsed.logs)) {
    state.logs = parsed.logs.filter((e) => e && typeof e === 'object').map((e) => ({
      at: asNumber(e.at, 0),
      op: asString(e.op) || 'unknown',
      skill: e.skill == null ? null : asString(e.skill),
      status: e.status === 'error' ? 'error' : 'ok',
      message: asString(e.message),
      undo: e.undo && typeof e.undo === 'object' ? e.undo : null
    })).slice(-300)
  }
  return state
}

export class SkillStore {
  constructor(dir) {
    this.dir = dir
    this.file = path.join(dir, 'state.json')
    this.logFile = path.join(dir, 'logs.jsonl')
    this._state = null
    this._hash = null
    this._watcher = null
    this._watchers = new Set()
  }

  ensure() {
    fs.mkdirSync(this.dir, { recursive: true })
  }

  /** Read from disk (no cache) and normalize. Broken files are quarantined. */
  read() {
    this.ensure()
    let text = null
    try {
      text = fs.readFileSync(this.file, 'utf8')
    } catch (error) {
      if (error && error.code !== 'ENOENT') {
        try { fs.renameSync(this.file, this.file + '.broken-' + Date.now()) } catch { /* best effort */ }
      }
      return defaultState()
    }
    try {
      return normalizeState(JSON.parse(text))
    } catch {
      try { fs.renameSync(this.file, this.file + '.broken-' + Date.now()) } catch { /* best effort */ }
      return defaultState()
    }
  }

  /** Cached state; first call reads from disk. */
  state() {
    if (this._state === null) {
      this._state = this.read()
      this._hash = hashState(this._state)
    }
    return this._state
  }

  /**
   * Persist state atomically. Re-reads the file first and merges by skill name
   * so a concurrent process does not lose rows: remote rows we do not know
   * about are preserved; for shared names the fresher `installedAt` wins.
   */
  write(next) {
    this.ensure()
    const incoming = normalizeState(next)
    let base = defaultState()
    try {
      base = normalizeState(JSON.parse(fs.readFileSync(this.file, 'utf8')))
    } catch { /* missing or unreadable: start from defaults */ }
    const merged = mergeStates(base, incoming)
    const text = JSON.stringify(merged, null, 2) + '\n'
    const temp = this.file + '.tmp-' + process.pid + '-' + crypto.randomUUID().slice(0, 8)
    fs.writeFileSync(temp, text, 'utf8')
    fs.renameSync(temp, this.file)
    this._state = merged
    this._hash = hashText(text)
    for (const listener of this._watchers) listener(merged)
    return merged
  }

  /** Update one skill by name, preserving everything else. */
  updateSkill(name, mutate) {
    const state = this.state()
    const skills = state.skills.map((skill) => (skill.name === name ? normalizeSkill(mutate({ ...skill }), skill) : skill))
    return this.write({ ...state, skills })
  }

  /** Watch state.json for external edits; debounced, hash-deduped. */
  watch(listener) {
    this.ensure()
    let timer = null
    let closed = false
    const fire = () => {
      let text = null
      try { text = fs.readFileSync(this.file, 'utf8') } catch { return }
      const hash = hashText(text)
      if (hash === this._hash) return
      this._hash = hash
      try {
        this._state = normalizeState(JSON.parse(text))
        listener(this._state)
      } catch { /* torn write; next change retries */ }
    }
    try {
      this._watcher = fs.watch(this.dir, { persistent: false }, (_event, filename) => {
        if (closed) return
        if (filename && filename !== 'state.json') return
        if (timer) clearTimeout(timer)
        timer = setTimeout(fire, 250)
        if (timer.unref) timer.unref()
      })
      if (this._watcher.unref) this._watcher.unref()
      if (this._watcher.on) this._watcher.on('error', () => {})
    } catch { /* watcher unavailable: polling falls back to manual refresh */ }
    const entry = (state) => listener(state)
    this._watchers.add(entry)
    return () => {
      closed = true
      this._watchers.delete(entry)
      if (timer) clearTimeout(timer)
      if (this._watcher) { try { this._watcher.close() } catch { /* noop */ } this._watcher = null }
    }
  }

  /** Append one operation to logs.jsonl and the in-memory ring. */
  log(entry) {
    const record = {
      at: Date.now(),
      op: asString(entry.op) || 'unknown',
      skill: entry.skill == null ? null : asString(entry.skill),
      status: entry.status === 'error' ? 'error' : 'ok',
      message: asString(entry.message),
      undo: entry.undo && typeof entry.undo === 'object' ? entry.undo : null
    }
    try {
      this.ensure()
      fs.appendFileSync(this.logFile, JSON.stringify(record) + '\n', 'utf8')
    } catch { /* logging must never break operations */ }
    const state = this.state()
    const logs = [...(state.logs || []), record].slice(-300)
    this._state = { ...state, logs }
    return record
  }

  dispose() {
    if (this._watcher) { try { this._watcher.close() } catch { /* noop */ } this._watcher = null }
    this._watchers.clear()
  }
}

function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex')
}

function hashState(state) {
  return hashText(JSON.stringify(state))
}

/** Merge two normalized states without dropping unknown remote rows. */
export function mergeStates(base, incoming) {
  const byName = new Map()
  for (const skill of base.skills) byName.set(skill.name, skill)
  for (const skill of incoming.skills) {
    const existing = byName.get(skill.name)
    if (!existing) {
      byName.set(skill.name, skill)
      continue
    }
    byName.set(skill.name, (existing.installedAt || 0) >= (skill.installedAt || 0) ? { ...skill, ...pickFresher(existing, skill) } : { ...existing, ...pickFresher(skill, existing) })
  }
  const customRoots = Array.from(new Set([...base.customRoots, ...incoming.customRoots]))
  const backups = incoming.backups.length ? incoming.backups : base.backups
  const pinned = Array.from(new Set([...base.pinned, ...incoming.pinned]))
  return { version: STATE_VERSION, skills: [...byName.values()], customRoots, backups, pinned, logs: incoming.logs || base.logs || [], dshDisabled: Array.isArray(incoming.dshDisabled) ? incoming.dshDisabled : (base.dshDisabled || []) }
}

function pickFresher(primary, secondary) {
  // Keep primary's scalar fields but adopt health/unknown metadata from either.
  return {
    health: primary.health.issues.length <= secondary.health.issues.length ? primary.health : secondary.health,
    latestKnown: primary.latestKnown || secondary.latestKnown,
    lastCheckedAt: Math.max(primary.lastCheckedAt || 0, secondary.lastCheckedAt || 0)
  }
}
