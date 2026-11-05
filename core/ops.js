// core/ops.js — filesystem operations with safety rails. Zero DSH deps.
//
// Shared-directory discipline (prompt §4):
// - this module never edits skill CONTENT; only moves/links/unlinks whole dirs;
// - soft-remove moves a dir into the sibling `<root>-disabled/` shadow dir;
// - real remove refuses without the caller passing the confirmed impact note;
// - symlink targets are validated against escape rules before creation.

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

export class OpError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function exists(target) {
  try { fs.lstatSync(target); return true } catch { return false }
}

/** Cross-device-safe rename (EXDEV fallback to copy+remove). */
async function moveDir(from, to) {
  await fsp.mkdir(path.dirname(to), { recursive: true })
  try {
    await fsp.rename(from, to)
  } catch (error) {
    if (error && error.code !== 'EXDEV') throw error
    await fsp.cp(from, to, { recursive: true })
    await fsp.rm(from, { recursive: true, force: true })
  }
}

async function copyDir(from, to) {
  await fsp.mkdir(path.dirname(to), { recursive: true })
  await fsp.cp(from, to, { recursive: true })
}

/**
 * Soft-remove: move `<root>/<name>` into `<root>-disabled/<name>`.
 * @returns {{ from: string, to: string }}
 */
export async function disableSkill(root, name) {
  assertSafeName(name)
  const from = path.join(root, name)
  const to = path.join(root + '-disabled', name)
  if (!exists(from)) throw new OpError('not-found', '技能目录不存在：' + from)
  if (exists(to)) throw new OpError('already-disabled', '该技能已在停用区：' + name)
  await moveDir(from, to)
  return { from, to }
}

/** Restore from the shadow dir back to the live root. */
export async function enableSkill(root, name) {
  assertSafeName(name)
  const from = path.join(root + '-disabled', name)
  const to = path.join(root, name)
  if (!exists(from)) throw new OpError('not-disabled', '停用区中没有该技能：' + name)
  if (exists(to)) throw new OpError('name-taken', '原目录已存在同名技能：' + name)
  await moveDir(from, to)
  return { from, to }
}

/**
 * Real remove (unlink the directory entry). Symlinks are unlinked, not
 * followed. Content under a real directory is removed with it — the caller
 * must have shown the impact note and (optionally) taken a backup first.
 */
export async function removeSkill(root, name, { confirmed = false, backupTaken = false } = {}) {
  assertSafeName(name)
  if (!confirmed) throw new OpError('needs-confirmation', '真移除需要二次确认')
  const target = path.join(root, name)
  if (!exists(target)) throw new OpError('not-found', '技能目录不存在：' + target)
  const lst = fs.lstatSync(target)
  if (lst.isSymbolicLink()) {
    await fsp.unlink(target)
    return { removed: target, wasSymlink: true, backupTaken }
  }
  await fsp.rm(target, { recursive: true, force: true })
  return { removed: target, wasSymlink: false, backupTaken }
}

/**
 * Validate a symlink target (prompt §4 escape rules).
 * @returns {{ ok: true, realTarget: string } | { ok: false, reason: string }}
 */
export function validateLinkTarget(rawTarget) {
  if (typeof rawTarget !== 'string' || !rawTarget.trim()) {
    return { ok: false, reason: '目标路径不能为空' }
  }
  let realTarget
  try {
    realTarget = fs.realpathSync(rawTarget.trim())
  } catch {
    return { ok: false, reason: '目标不存在或不可访问' }
  }
  if (realTarget === path.parse(realTarget).root) {
    return { ok: false, reason: '不允许链接文件系统根目录' }
  }
  if (realTarget.split(path.sep).includes('..')) {
    return { ok: false, reason: '目标路径不允许包含 ..' }
  }
  if (!exists(path.join(realTarget, 'SKILL.md'))) {
    return { ok: false, reason: '目标目录必须包含 SKILL.md' }
  }
  return { ok: true, realTarget }
}

/**
 * Create a symlink `<root>/<name>` → target. Windows falls back to a junction
 * (directory links do not need developer mode); the caller surfaces the
 * fallback in the UI.
 * @returns {{ link: string, target: string, via: 'symlink'|'junction'|'copy' }}
 */
export async function linkSkill(root, name, target, { preferCopy = false } = {}) {
  assertSafeName(name)
  const check = validateLinkTarget(target)
  if (!check.ok) throw new OpError('bad-target', check.reason)
  const link = path.join(root, name)
  if (exists(link)) throw new OpError('name-taken', '已存在同名条目：' + name)
  await fsp.mkdir(root, { recursive: true })
  if (preferCopy) {
    await copyDir(check.realTarget, link)
    return { link, target: check.realTarget, via: 'copy' }
  }
  const isWindows = process.platform === 'win32'
  try {
    await fsp.symlink(check.realTarget, link, isWindows ? 'junction' : 'dir')
    return { link, target: check.realTarget, via: isWindows ? 'junction' : 'symlink' }
  } catch (error) {
    if (isWindows) {
      // EPERM/EACCES on Windows without privilege: degrade to a full copy and
      // say so — the UI must show the explicit downgrade notice.
      await copyDir(check.realTarget, link)
      return { link, target: check.realTarget, via: 'copy' }
    }
    throw error
  }
}

/** 转正 (materialize): replace a symlink with a real copy of its target. */
export async function materializeSkill(root, name) {
  assertSafeName(name)
  const link = path.join(root, name)
  if (!exists(link)) throw new OpError('not-found', '技能目录不存在：' + link)
  const lst = fs.lstatSync(link)
  if (!lst.isSymbolicLink()) throw new OpError('not-a-link', '该技能不是软链，无需转正')
  const realTarget = fs.realpathSync(link)
  const temp = link + '.materialize-' + Date.now()
  await moveDir(link, temp)
  try {
    await copyDir(realTarget, link)
  } catch (error) {
    await moveDir(temp, link) // roll back
    throw error
  }
  await fsp.rm(temp, { recursive: true, force: true })
  return { dir: link, materializedFrom: realTarget }
}

/** Disconnect (unlink) a symlink without touching its target. */
export async function unlinkSkill(root, name) {
  assertSafeName(name)
  const link = path.join(root, name)
  if (!exists(link)) throw new OpError('not-found', '技能目录不存在：' + link)
  const lst = fs.lstatSync(link)
  if (!lst.isSymbolicLink()) throw new OpError('not-a-link', '该条目不是软链')
  await fsp.unlink(link)
  return { unlinked: link }
}

export function assertSafeName(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) {
    throw new OpError('bad-name', '非法技能名：' + String(name))
  }
}

/** Export a skill dir into a zip-ready staging copy (zip assembly is UI-side). */
export async function stageExport(root, name, stagingDir) {
  assertSafeName(name)
  const source = path.join(root, name)
  if (!exists(source)) throw new OpError('not-found', '技能目录不存在：' + source)
  await fsp.rm(stagingDir, { recursive: true, force: true })
  await copyDir(source, stagingDir)
  return { staged: stagingDir, source }
}
