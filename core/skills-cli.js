// core/skills-cli.js — `npx skills` integration with graceful degradation.
//
// Research notes (prompt §0.2, verified 2026-11-05 against the live CLI):
//   supported: add <pkg> [-g|-p] [-a agents] [-s skill] [-y] [--copy],
//              remove [names] [-g|-p] [-y], list/ls, find [query] [--owner],
//              update [names] [-g|-p] [-y], init, experimental_install, sync
//   NOT present: there is no `skills check` command — update checks are
//              implemented with git ls-remote for git sources instead.
// Everything here degrades: node/npx absence, CLI failure, offline network —
// the panel shows a concrete reason and local management keeps working.

import { execFile, execFileSync } from 'node:child_process'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'

const CLI_TIMEOUT_MS = 60000

function probe(cmd, args) {
  try {
    return String(execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }) || '').trim() || null
  } catch {
    return null
  }
}

/** Probe the runtime once; result is cached for the process lifetime. */
let cachedEnv = null
export function cliEnvironment() {
  if (cachedEnv) return cachedEnv
  const node = probe('node', ['--version'])
  if (!node) {
    cachedEnv = { ok: false, node: null, npx: null, reason: 'node 不可用：请安装 Node.js 22+' }
    return cachedEnv
  }
  const npx = probe('npx', ['--version'])
  if (!npx) {
    cachedEnv = { ok: false, node, npx: null, reason: 'npx 不可用' }
    return cachedEnv
  }
  cachedEnv = { ok: true, node, npx, reason: null }
  return cachedEnv
}

function run(args, { timeout = CLI_TIMEOUT_MS, cwd } = {}) {
  return new Promise((resolve) => {
    const started = Date.now()
    execFile('npx', ['--yes', 'skills', ...args], {
      encoding: 'utf8',
      timeout,
      cwd: cwd || process.cwd(),
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, NO_COLOR: '1' }
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error && error.code,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        durationMs: Date.now() - started,
        killed: !!error && !!error.signal
      })
    })
  })
}

/** Strip ANSI color sequences for parsing. */
function clean(text) {
  return String(text || '').replace(/\[[0-9;]*m/g, '')
}

/**
 * Parse `skills list [-g|-p]` output into rows.
 * Line shapes (verified):
 *   <name padded> <dir>            (dir may be ~/.agents/skills/<name>)
 *     Agents: ...  Source: owner/repo   (second line, optional)
 */
export function parseListOutput(text) {
  const lines = clean(text).split('\n')
  const rows = []
  let current = null
  for (const raw of lines) {
    const trimmed = raw.trim()
    if (trimmed === '') continue
    if (/^Agents:/.test(trimmed)) {
      if (!current) continue
      const agents = /^Agents:\s*(.*?)\s*(?:Source:\s*(.*))?$/.exec(trimmed)
      if (agents) {
        current.agents = agents[1] || ''
        current.source = (agents[2] || '').trim()
      }
      continue
    }
    // Skill rows look like `<name padded> <dir>`; headers like "Global Skills"
    // have no dir column, so requiring a path-ish second column skips them.
    const m = /^([A-Za-z0-9][\w.-]*)\s{2,}(\S.*)$/.exec(trimmed)
    if (!m) continue
    if (current) rows.push(current)
    current = { name: m[1], dir: m[2].trim(), agents: '', source: '' }
  }
  if (current) rows.push(current)
  return rows
}

/**
 * Parse `skills find <query>` output.
 * Line shapes (verified):
 *   owner/repo@skill  1.2M installs
 *   └ https://skills.sh/owner/repo/skill
 */
export function parseFindOutput(text) {
  const lines = clean(text).split('\n')
  const rows = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\S+@\S+)\s+([\d.]+[KM]?\s+installs?)$/i.exec(lines[i].trim())
    if (!m) continue
    let url = ''
    const next = lines[i + 1] || ''
    const u = /^[└├]\s*(\S+)/.exec(next.trim())
    if (u) url = u[1]
    rows.push({ ref: m[1], installs: m[2], url })
  }
  return rows
}

export class SkillsCli {
  constructor({ cwd, onEvent } = {}) {
    this.cwd = cwd || process.cwd()
    this.onEvent = typeof onEvent === 'function' ? onEvent : () => {}
  }

  available() {
    const env = cliEnvironment()
    return { ok: env.ok, node: env.node, npx: env.npx, reason: env.reason }
  }

  /** skills-lock.json gate (prompt §5): when a lockfile exists, installs must not bypass it. */
  lockfileStatus(scopeDir) {
    const lock = path.join(scopeDir, 'skills-lock.json')
    if (!fs.existsSync(lock)) return { present: false, path: lock }
    try {
      const parsed = JSON.parse(fs.readFileSync(lock, 'utf8'))
      return { present: true, path: lock, skills: Array.isArray(parsed.skills) ? parsed.skills.length : null }
    } catch {
      return { present: true, path: lock, skills: null, unreadable: true }
    }
  }

  async list(scope = 'global') {
    const result = await run(['list', scope === 'global' ? '-g' : '-p'], { cwd: this.cwd })
    if (!result.ok) return { ok: false, reason: result.stderr || result.stdout || 'skills list 失败', rows: [] }
    return { ok: true, rows: parseListOutput(result.stdout) }
  }

  async find(query) {
    const result = await run(['find', String(query || '').trim()], { cwd: this.cwd, timeout: 45000 })
    if (!result.ok) {
      const reason = result.killed ? '网络超时' : (result.stderr || result.stdout || '搜索失败')
      return { ok: false, reason: clean(reason).slice(0, 300), rows: [] }
    }
    return { ok: true, rows: parseFindOutput(result.stdout) }
  }

  /**
   * Install through the official CLI. A lockfile is NOT a reason to refuse:
   * `skills add` itself is the supported way to add a skill while honoring
   * and updating the lock. We never edit or bypass skills-lock.json by hand.
   */
  async add(pkg, { scope = 'global', agents = ['agents'], yes = true } = {}) {
    const scopeDir = scope === 'global' ? osHome() : this.cwd
    const lock = this.lockfileStatus(scopeDir)
    const args = ['add', pkg, scope === 'global' ? '-g' : '-p', '-a', agents.join(','), '-y']
    const result = await run(args, { cwd: this.cwd, timeout: 120000 })
    const output = clean(result.stdout + '\n' + result.stderr)
    if (!result.ok) return { ok: false, reason: output.slice(0, 500) || '安装失败', lockfile: lock.present ? lock.path : null }
    return { ok: true, output: output.slice(0, 1000), lockfile: lock.present ? lock.path : null }
  }

  async remove(names, { scope = 'global' } = {}) {
    const list = Array.isArray(names) ? names : [names]
    if (!list.length) return { ok: false, reason: '未指定技能名' }
    const result = await run(['remove', ...list, scope === 'global' ? '-g' : '-p', '-y'], { cwd: this.cwd, timeout: 60000 })
    const output = clean(result.stdout + '\n' + result.stderr)
    if (!result.ok) return { ok: false, reason: output.slice(0, 500) || '移除失败' }
    return { ok: true, output: output.slice(0, 1000) }
  }

  async update(names, { scope = 'global' } = {}) {
    const args = ['update', ...(Array.isArray(names) ? names : names ? [names] : []), scope === 'global' ? '-g' : '-p', '-y']
    const result = await run(args, { cwd: this.cwd, timeout: 120000 })
    const output = clean(result.stdout + '\n' + result.stderr)
    if (!result.ok) return { ok: false, reason: output.slice(0, 500) || '更新失败' }
    return { ok: true, output: output.slice(0, 1000) }
  }
}

function osHome() {
  return os.homedir() || process.env.HOME || process.env.USERPROFILE || ''
}
