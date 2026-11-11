// core/sync.js — GitHub manifest sync. Zero DSH dependencies.
//
// Only a manifest of {name, install ref, URL, origin} crosses the network.
// Skill bodies, directory contents, credentials, and local-only links never do.
// Remote writes happen ONLY inside pushManifest(), called by the explicit
// "push manifest" button. Pull never installs anything by itself.

import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'

export const MANIFEST_FILE = 'skills.json'
export const MANIFEST_VERSION = 1

export class SyncError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function exec(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, {
      encoding: 'utf8',
      timeout: options.timeout || 90000,
      cwd: options.cwd,
      maxBuffer: 4 * 1024 * 1024,
      env: process.env
    }, (error, stdout, stderr) => {
      if (error) reject(new SyncError('command-failed', `${cmd} ${args.join(' ')}: ${String(stderr || stdout || error.message).slice(0, 500)}`))
      else resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') })
    })
  })
}

function sourceUrl(ref) {
  const match = /^([\w.-]+)\/([\w.-]+)@([\w.-]+)$/.exec(ref || '')
  return match ? `https://skills.sh/${match[1]}/${match[2]}/${match[3]}` : null
}

/**
 * Build a downloadable manifest. Local-only/external links are deliberately
 * excluded: another computer cannot install from this machine's path.
 */
export function manifestFromRecords(records, { source = 'dsh-skills-butler' } = {}) {
  const byName = new Map()
  for (const record of records || []) {
    const ref = typeof record.sourceRef === 'string' ? record.sourceRef : ''
    if (!ref || ref.startsWith('external:')) continue
    if (!/^[\w.-]+\/[\w.-]+@[\w.-]+$/.test(ref)) continue
    byName.set(record.name, {
      name: record.name,
      install: ref,
      url: sourceUrl(ref),
      origin: record.origin || 'marketplace'
    })
  }
  return {
    version: MANIFEST_VERSION,
    source,
    generatedAt: new Date().toISOString(),
    skills: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
  }
}

/** Validate an untrusted pulled manifest before showing install actions. */
export function parseManifest(text) {
  const data = JSON.parse(text)
  if (!data || data.version !== MANIFEST_VERSION || !Array.isArray(data.skills)) {
    throw new SyncError('bad-manifest', '清单格式或版本不受支持')
  }
  const skills = []
  const seen = new Set()
  for (const row of data.skills) {
    if (!row || typeof row.name !== 'string' || typeof row.install !== 'string') continue
    if (!/^[\w.-]+\/[\w.-]+@[\w.-]+$/.test(row.install)) continue
    if (seen.has(row.name)) continue
    seen.add(row.name)
    skills.push({ name: row.name, install: row.install, url: sourceUrl(row.install), origin: typeof row.origin === 'string' ? row.origin : 'marketplace' })
  }
  return { version: MANIFEST_VERSION, source: data.source || 'unknown', generatedAt: data.generatedAt || null, skills }
}

function cacheDirFor(cacheRoot, repo) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new SyncError('bad-repo', '仓库名必须是 owner/repo')
  return path.join(cacheRoot, repo.replace('/', '__'))
}

async function ensureCheckout(cacheRoot, repo) {
  const dir = cacheDirFor(cacheRoot, repo)
  if (fs.existsSync(path.join(dir, '.git'))) {
    await exec('git', ['-C', dir, 'pull', '--ff-only'])
    return dir
  }
  await fs.promises.mkdir(cacheRoot, { recursive: true })
  await exec('gh', ['repo', 'clone', repo, dir, '--', '--depth', '1'])
  return dir
}

/** Explicit remote write: clone, replace manifest, commit if changed, push. */
export async function pushManifest({ cacheRoot, repo, records }) {
  const dir = await ensureCheckout(cacheRoot, repo)
  const manifest = manifestFromRecords(records)
  const file = path.join(dir, MANIFEST_FILE)
  const text = JSON.stringify(manifest, null, 2) + '\n'
  const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
  if (previous === text) return { ok: true, changed: false, count: manifest.skills.length, repo }
  await fs.promises.writeFile(file, text, 'utf8')
  await exec('git', ['-C', dir, 'add', MANIFEST_FILE])
  await exec('git', ['-C', dir, 'commit', '-m', `Update DSH skill manifest (${manifest.skills.length} skills)`])
  await exec('git', ['-C', dir, 'push'])
  return { ok: true, changed: true, count: manifest.skills.length, repo }
}

/** Pull and validate only; installation remains a separate explicit action. */
export async function pullManifest({ cacheRoot, repo }) {
  const dir = await ensureCheckout(cacheRoot, repo)
  const file = path.join(dir, MANIFEST_FILE)
  if (!fs.existsSync(file)) throw new SyncError('not-found', '远端仓库还没有 skills.json 清单')
  return parseManifest(await fs.promises.readFile(file, 'utf8'))
}
