// core/backup.js — backup, retention, rollback. Zero DSH deps.
//
// Backups live under <managerDir>/backups/<name>@<ts>/ so a broken update or a
// mistaken remove can be rolled back from the panel. Retention defaults to the
// newest 10 backups per skill and a 30-day global window; both are
// configurable through the plugin config.

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { OpError } from './ops.js'

export const DEFAULT_RETENTION = { maxPerSkill: 10, maxAgeDays: 30 }

function stamp(date = new Date()) {
  // Millisecond precision + random suffix: two backups of the same skill taken
  // within one second (e.g. a pre-rollback snapshot) must never collide.
  // No '@' inside the stamp: '@' is the name/stamp separator for parsers.
  return date.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 23) + '-' + cryptoRandom(4)
}

function cryptoRandom(bytes) {
  return crypto.randomBytes(bytes).toString('hex')
}

/**
 * Back up one skill directory before a destructive operation.
 * @returns {{ dir: string, skill: string, takenAt: number }}
 */
export async function backupSkill(backupsRoot, root, name, reason = 'update') {
  const source = path.join(root, name)
  let stat = null
  try { stat = fs.statSync(source) } catch { /* missing */ }
  if (!stat || !stat.isDirectory()) {
    // A broken symlink still records an (empty) backup entry so rollback can
    // recreate the link shape from state.
  }
  const dir = path.join(backupsRoot, `${name}@${stamp()}`)
  await fsp.mkdir(dir, { recursive: true })
  if (stat && stat.isDirectory()) {
    const lst = fs.lstatSync(source)
    if (lst.isSymbolicLink()) {
      await fsp.symlink(fs.realpathSync(source), path.join(dir, '__link__'), 'dir')
    } else {
      await fsp.cp(source, path.join(dir, 'content'), { recursive: true })
    }
  }
  const meta = { skill: name, reason, takenAt: Date.now(), source: source }
  await fsp.writeFile(path.join(dir, 'backup.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8')
  return { dir, skill: name, takenAt: meta.takenAt }
}

/**
 * Roll back: copy the backup content over `<root>/<name>` (after backing up
 * the current state once more, so rollback itself is reversible).
 */
export async function rollbackSkill(backupsRoot, root, name, backupDir) {
  const safeRoot = path.resolve(root)
  const dir = path.resolve(backupDir)
  if (!dir.startsWith(path.resolve(backupsRoot) + path.sep)) {
    throw new OpError('bad-backup', '备份路径越界')
  }
  const content = path.join(dir, 'content')
  const link = path.join(dir, '__link__')
  const target = path.join(safeRoot, name)
  if (!fs.existsSync(content) && !fs.existsSync(link)) {
    throw new OpError('bad-backup', '备份内容缺失')
  }
  // Snapshot current state so the rollback is itself undoable.
  let prior = null
  if (fs.existsSync(target)) {
    prior = await backupSkill(backupsRoot, safeRoot, name, 'pre-rollback')
  }
  await fsp.rm(target, { recursive: true, force: true })
  if (fs.existsSync(link)) {
    const realTarget = fs.realpathSync(link)
    await fsp.symlink(realTarget, target, process.platform === 'win32' ? 'junction' : 'dir')
  } else {
    await fsp.cp(content, target, { recursive: true })
  }
  return { restored: target, priorBackup: prior ? prior.dir : null }
}

/**
 * Enforce retention. Removes whole backup dirs beyond maxPerSkill per skill
 * and older than maxAgeDays; never touches entries newer than either bound.
 * @returns {Array<string>} removed backup dir names
 */
export async function pruneBackups(backupsRoot, retention = DEFAULT_RETENTION) {
  let entries = []
  try {
    entries = await fsp.readdir(backupsRoot)
  } catch {
    return []
  }
  const groups = new Map()
  const now = Date.now()
  const maxAgeMs = (retention.maxAgeDays || 30) * 24 * 3600 * 1000
  for (const entry of entries) {
    const at = entry.lastIndexOf('@')
    if (at <= 0) continue
    const skill = entry.slice(0, at)
    const dir = path.join(backupsRoot, entry)
    let takenAt = 0
    try {
      takenAt = JSON.parse(await fsp.readFile(path.join(dir, 'backup.json'), 'utf8')).takenAt || 0
    } catch { /* keep */ }
    if (!groups.has(skill)) groups.set(skill, [])
    groups.get(skill).push({ entry, dir, takenAt })
  }
  const removed = []
  for (const list of groups.values()) {
    list.sort((a, b) => b.takenAt - a.takenAt)
    const cap = Math.max(1, retention.maxPerSkill || 10)
    list.forEach((item, index) => {
      const tooMany = index >= cap
      const tooOld = item.takenAt > 0 && now - item.takenAt > maxAgeMs
      if (tooMany || tooOld) {
        removed.push(item.entry)
      }
    })
  }
  for (const entry of removed) {
    await fsp.rm(path.join(backupsRoot, entry), { recursive: true, force: true }).catch(() => {})
  }
  return removed
}

/** List available backups (newest first). */
export async function listBackups(backupsRoot) {
  let entries = []
  try {
    entries = await fsp.readdir(backupsRoot)
  } catch {
    return []
  }
  const out = []
  for (const entry of entries) {
    const dir = path.join(backupsRoot, entry)
    try {
      const meta = JSON.parse(await fsp.readFile(path.join(dir, 'backup.json'), 'utf8'))
      out.push({ entry, dir, ...meta })
    } catch {
      out.push({ entry, dir, skill: entry.split('@')[0], reason: 'unknown', takenAt: 0 })
    }
  }
  return out.sort((a, b) => b.takenAt - a.takenAt)
}
