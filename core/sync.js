// core/sync.js — multi-remote manifest sync. Zero DSH dependencies.
//
// Only {name, install ref, URL, origin} crosses a remote. Skill bodies never do.
// The local git CLI and its credential helpers/SSH agent are preferred. Basic
// credentials are optional, read per call from the local credential file, and
// are never written into manifests, git remotes, or returned errors.
// Remote writes happen ONLY inside pushManifest(), via an explicit button.

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

export const DEFAULT_REMOTE_TYPES = ['github', 'gitee', 'gitlab', 'custom', 'file']

function run(cmd, args, { cwd, env, timeout = 60000 } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, {
      encoding: 'utf8', timeout, cwd, env: env || process.env,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true
    }, (error, stdout, stderr) => {
      resolve({ ok: !error, code: error && error.code, stdout: String(stdout || ''), stderr: String(stderr || '') })
    })
  })
}

async function hasCommand(command) {
  const result = await run(command, ['--version'], { timeout: 12000 })
  return result.ok
}

export function redact(text, secrets = []) {
  let out = String(text || '')
  for (const secret of secrets) {
    if (!secret) continue
    out = out.split(String(secret)).join('***')
    try { out = out.split(Buffer.from(String(secret)).toString('base64')).join('***') } catch { /* noop */ }
  }
  return out.replace(/(https?:\/\/)([^/\s:@]+):([^/\s@]+)@/g, '$1***:***@')
}

/** Validate and normalize user-managed remote definitions. */
export function validateRemotes(input) {
  const out = []
  const seen = new Set()
  for (const raw of Array.isArray(input) ? input : []) {
    if (!raw || typeof raw.url !== 'string' || !raw.url.trim()) continue
    const id = typeof raw.id === 'string' && /^[a-z0-9-]+$/.test(raw.id) ? raw.id : 'remote-' + Date.now().toString(36)
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : id,
      type: DEFAULT_REMOTE_TYPES.includes(raw.type) ? raw.type : 'custom',
      url: raw.url.trim(),
      enabled: raw.enabled !== false,
      username: typeof raw.username === 'string' ? raw.username : '',
      insecureSkipTls: raw.insecureSkipTls === true
    })
  }
  return out
}

function remoteCacheDir(cacheRoot, remote) {
  return path.join(cacheRoot, remote.id.replace(/[^a-z0-9-]/g, '_'))
}

function gitOptions(remote, credential) {
  const args = []
  const secrets = []
  if (remote.insecureSkipTls) args.push('-c', 'http.sslVerify=false')
  if (credential && credential.username && credential.password) {
    const basic = Buffer.from(`${credential.username}:${credential.password}`).toString('base64')
    args.push('-c', `http.extraHeader=Authorization: Basic ${basic}`)
    secrets.push(credential.password, basic)
  }
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_SSH_COMMAND: 'ssh -oBatchMode=yes -oConnectTimeout=8'
  }
  return { args, env, secrets }
}

async function ensureCheckout(cacheRoot, remote, credential) {
  const dir = remoteCacheDir(cacheRoot, remote)
  const { args, env, secrets } = gitOptions(remote, credential)
  if (fs.existsSync(path.join(dir, '.git'))) {
    const set = await run('git', ['-C', dir, 'remote', 'set-url', 'origin', remote.url], { env })
    if (!set.ok) throw new SyncError('remote-write-failed', redact(set.stderr, secrets))
    const pulled = await run('git', ['-C', dir, ...args, 'pull', '--ff-only'], { env })
    if (!pulled.ok) throw new SyncError('pull-failed', redact(pulled.stderr || pulled.stdout, secrets))
    return dir
  }
  if (!(await hasCommand('git'))) {
    throw new SyncError('git-unavailable', '本机没有 git 命令，请先安装 Git；仅拉取 GitHub 时也可使用 gh。')
  }
  await fs.promises.mkdir(cacheRoot, { recursive: true })
  const cloned = await run('git', [...args, 'clone', '--depth', '1', remote.url, dir], { env, timeout: 120000 })
  if (!cloned.ok) throw new SyncError('clone-failed', redact(cloned.stderr || cloned.stdout, secrets))
  return dir
}

/** Test one remote without writing anything. */
export async function testRemote({ remote, credential }) {
  const { args, env, secrets } = gitOptions(remote, credential)
  if (await hasCommand('git')) {
    const result = await run('git', [...args, 'ls-remote', '--heads', remote.url], { env, timeout: 20000 })
    if (result.ok) return { ok: true, message: '连接成功（git ls-remote）' }
    const message = redact(result.stderr || result.stdout, secrets)
    // gh is a useful fallback diagnostic for GitHub when git credentials differ.
    if (remote.type === 'github' && (await hasCommand('gh'))) {
      const repo = remote.url.match(/github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/)
      if (repo) {
        const viaGh = await run('gh', ['repo', 'view', repo[1]], { timeout: 20000 })
        if (viaGh.ok) return { ok: true, message: '连接成功（gh）' }
      }
    }
    return { ok: false, message: message || '无法连接远端，请检查地址、网络和凭据' }
  }
  if (remote.type === 'github' && (await hasCommand('gh'))) {
    const repo = remote.url.match(/github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/)
    if (repo) {
      const viaGh = await run('gh', ['repo', 'view', repo[1]], { timeout: 20000 })
      if (viaGh.ok) return { ok: true, message: '连接成功（gh）' }
      return { ok: false, message: redact(viaGh.stderr || viaGh.stdout, secrets) }
    }
  }
  return { ok: false, message: '本机没有 git；请安装 Git，或提供可用的 GitHub/gh 环境' }
}

function sourceUrl(ref) {
  const match = /^([\w.-]+)\/([\w.-]+)@([\w.-]+)$/.exec(ref || '')
  return match ? `https://skills.sh/${match[1]}/${match[2]}/${match[3]}` : null
}

/** Build a downloadable manifest. Local-only/external links are excluded. */
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

/** Explicit remote write: clone, replace manifest, commit if changed, push. */
export async function pushManifest({ cacheRoot, remote, credential, records }) {
  const dir = await ensureCheckout(cacheRoot, remote, credential)
  const { args, env, secrets } = gitOptions(remote, credential)
  const manifest = manifestFromRecords(records)
  const file = path.join(dir, MANIFEST_FILE)
  const text = JSON.stringify(manifest, null, 2) + '\n'
  const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
  if (previous === text) return { ok: true, changed: false, count: manifest.skills.length, remoteId: remote.id }
  await fs.promises.writeFile(file, text, 'utf8')
  const add = await run('git', ['-C', dir, 'add', MANIFEST_FILE], { env })
  if (!add.ok) throw new SyncError('stage-failed', redact(add.stderr, secrets))
  const commit = await run('git', ['-C', dir, 'commit', '-m', `Update DSH skill manifest (${manifest.skills.length} skills)`], { env })
  if (!commit.ok) throw new SyncError('commit-failed', redact(commit.stderr || commit.stdout, secrets))
  const pushed = await run('git', ['-C', dir, ...args, 'push'], { env, timeout: 120000 })
  if (!pushed.ok) throw new SyncError('push-failed', redact(pushed.stderr || pushed.stdout, secrets))
  return { ok: true, changed: true, count: manifest.skills.length, remoteId: remote.id }
}

/** Pull and validate only; installation remains a separate explicit action. */
export async function pullManifest({ cacheRoot, remote, credential }) {
  const dir = await ensureCheckout(cacheRoot, remote, credential)
  const file = path.join(dir, MANIFEST_FILE)
  if (!fs.existsSync(file)) throw new SyncError('not-found', '远端仓库还没有 skills.json 清单')
  return parseManifest(await fs.promises.readFile(file, 'utf8'))
}
