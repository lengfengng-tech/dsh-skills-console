// core/inventory.js — scan discovered roots into skill records. Zero DSH deps.
//
// Census rules (prompt §3):
// - first run inventories every discovered directory, never drops or rewrites
//   anything it cannot classify: unknown origins become foreign+manual;
// - list view reads ONLY the SKILL.md frontmatter head (bounded read); full
//   bodies are lazy-loaded by the detail view;
// - project-scope entries shadow same-named global entries (annotated, both
//   rows kept).

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { parseFrontmatter } from './frontmatter.js'
import { normalizeSkill, SKILL_NAME_PATTERN } from './store.js'

const FRONTMATTER_HEAD_BYTES = 8192

function lstatSafe(target) {
  try { return fs.lstatSync(target) } catch { return null }
}

function readHead(file, bytes) {
  let fd = null
  try {
    fd = fs.openSync(file, 'r')
    const buffer = Buffer.alloc(bytes)
    const read = fs.readSync(fd, buffer, 0, bytes, 0)
    return buffer.toString('utf8', 0, read)
  } catch {
    return null
  } finally {
    if (fd !== null) { try { fs.closeSync(fd) } catch { /* noop */ } }
  }
}

/** Frontmatter summary without loading the whole body. */
export function peekSkill(dir) {
  const skillFile = path.join(dir, 'SKILL.md')
  const st = lstatSafe(skillFile)
  if (!st) return { hasSkillFile: false, name: null, description: null, fmErrors: ['missing-skill-md'], mtime: 0, bytes: 0 }
  const head = readHead(skillFile, FRONTMATTER_HEAD_BYTES)
  if (head === null) return { hasSkillFile: false, name: null, description: null, fmErrors: ['unreadable'], mtime: st.mtimeMs, bytes: st.size }
  const { data, errors } = parseFrontmatter(head)
  return {
    hasSkillFile: true,
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : null,
    description: typeof data.description === 'string' ? data.description.trim() : '',
    fmErrors: errors,
    mtime: st.mtimeMs,
    bytes: st.size
  }
}

/** Full SKILL.md body for the detail view. */
export async function readSkillBody(dir) {
  const skillFile = path.join(dir, 'SKILL.md')
  try {
    const text = await fsp.readFile(skillFile, 'utf8')
    const { data } = parseFrontmatter(text)
    return { ok: true, text, frontmatter: data }
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error) }
  }
}

function isMeaningfulDir(name) {
  return !name.startsWith('.') && name !== 'node_modules'
}

/**
 * Scan one root directory into raw skill rows (pre-state reconciliation).
 * @returns {Array<object>} raw rows with dir/probe info.
 */
export function scanRoot(root) {
  const rows = []
  if (root.kind !== 'dir' || !root.readable) return rows
  let entries = null
  try {
    entries = fs.readdirSync(root.dir, { withFileTypes: true })
  } catch {
    return rows
  }
  for (const entry of entries) {
    if (!isMeaningfulDir(entry.name)) continue
    const full = path.join(root.dir, entry.name)
    let lst = lstatSafe(full)
    if (!lst) continue
    let linkedFrom = null
    let origin = 'manual'
    if (lst.isSymbolicLink()) {
      try { linkedFrom = fs.realpathSync(full) } catch { linkedFrom = null }
      origin = 'symlink'
      try {
        const real = fs.statSync(full)
        if (!real.isDirectory()) continue // non-dir symlink: skip
        lst = { isDirectory: () => true, mtimeMs: real.mtimeMs, isSymbolicLink: () => true }
      } catch {
        rows.push({
          name: entry.name, dir: full, scope: root.scope, agent: root.agent,
          origin: 'symlink', linkedFrom: null, brokenLink: true, mtime: 0, disabled: false
        })
        continue
      }
    }
    if (!lst.isDirectory()) continue
    // Disabled skills live in a sibling `<root>-disabled/` dir; a plain marker
    // file is not touched. Re-enable moves the directory back.
    rows.push({
      name: entry.name,
      dir: full,
      scope: root.scope,
      agent: root.agent,
      origin,
      linkedFrom,
      brokenLink: false,
      mtime: lst.mtimeMs,
      disabled: false
    })
  }
  return rows
}

/** Scan the shadow directory holding soft-removed skills. */
export function scanDisabledRoot(root) {
  const disabledRoot = root.dir + '-disabled'
  const rows = []
  let entries = null
  try {
    entries = fs.readdirSync(disabledRoot, { withFileTypes: true })
  } catch {
    return rows
  }
  for (const entry of entries) {
    if (!isMeaningfulDir(entry.name)) continue
    const full = path.join(disabledRoot, entry.name)
    const lst = lstatSafe(full)
    if (!lst || !lst.isDirectory()) continue
    rows.push({
      name: entry.name,
      dir: full,
      scope: root.scope,
      agent: root.agent,
      origin: 'manual',
      linkedFrom: null,
      brokenLink: false,
      mtime: lst.mtimeMs,
      disabled: true
    })
  }
  return rows
}

/**
 * Reconcile a fresh scan with persisted state.
 *
 * Identity is (name, liveRoot): a live dir `<root>/<name>` and its disabled
 * shadow `<root>-disabled/<name>` are the SAME skill in two states, never two
 * skills. When both appear (mid-move), the live row wins; when only the shadow
 * appears the skill is disabled. State metadata (origin/sourceRef/
 * installedBy/pinned) is carried over by identity, so rescans never lose or
 * duplicate rows.
 */
export function reconcile(diskRows, knownRows) {
  const identityOf = (row) => {
    const parent = path.dirname(row.dir)
    const liveRoot = row.disabled && parent.endsWith('-disabled')
      ? parent.slice(0, -'-disabled'.length)
      : parent
    return row.name + '|' + liveRoot
  }
  const priorByIdentity = new Map()
  for (const row of knownRows || []) {
    if (row && row.name) priorByIdentity.set(identityOf(row), row)
  }
  const slots = new Map()
  for (const row of diskRows) {
    const key = identityOf(row)
    if (!slots.has(key)) slots.set(key, { live: null, disabled: null })
    const slot = slots.get(key)
    if (row.disabled) slot.disabled = row
    else slot.live = row
  }
  const out = []
  for (const [key, slot] of slots) {
    const row = slot.live || slot.disabled
    const prior = priorByIdentity.get(key)
    const record = normalizeSkill({
      name: row.name,
      dir: row.dir,
      scope: row.scope,
      agent: row.agent,
      origin: row.origin,
      linkedFrom: row.linkedFrom,
      disabled: !slot.live,
      installedAt: prior ? prior.installedAt : 0,
      installedBy: prior ? prior.installedBy : 'foreign',
      pinned: prior ? prior.pinned : false,
      sourceRef: prior ? prior.sourceRef : null,
      lastCheckedAt: prior ? prior.lastCheckedAt : 0,
      latestKnown: prior ? prior.latestKnown : ''
    }, prior)
    record.brokenLink = !!row.brokenLink
    out.push(record)
  }
  return out
}

/** Detect same-name collisions across scopes/agents for health annotation. */
export function annotateCollisions(records) {
  const byName = new Map()
  for (const record of records) {
    if (!byName.has(record.name)) byName.set(record.name, [])
    byName.get(record.name).push(record)
  }
  return records.map((record) => {
    const siblings = byName.get(record.name) || []
    const shadowed = siblings.some((other) => other.scope === 'project' && record.scope === 'global')
    const conflict = siblings.length > 1
    return { ...record, shadowed, conflict }
  })
}

export { SKILL_NAME_PATTERN }
