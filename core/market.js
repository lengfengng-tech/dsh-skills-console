// core/market.js — marketplace source adapters and metadata enrichment.
// No DSH imports. Network is read-only here; installs stay with their CLIs.

import { execFile } from 'node:child_process'

export const DEFAULT_SOURCES = [
  { id: 'skills', name: 'skills.sh（官方）', type: 'skills', enabled: true },
  { id: 'github', name: 'GitHub', type: 'github', enabled: true },
  { id: 'skillhub', name: 'SkillHub', type: 'skillhub', enabled: true, installGuide: 'https://skillhub.cn/install/skillhub.md' }
]

function exec(cmd, args, { timeout = 60000 } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024, env: process.env }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: String(stdout || ''), stderr: String(stderr || '') })
    })
  })
}

async function githubJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-skills-butler' },
    signal: AbortSignal.timeout(15000)
  })
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`)
  return response.json()
}

function repoOf(ref) {
  const match = /^([\w.-]+)\/([\w.-]+)(?:@[\w.-]+)?$/.exec(ref || '')
  return match ? `${match[1]}/${match[2]}` : null
}

async function githubDetails(repo) {
  const [info, release] = await Promise.all([
    githubJson(`https://api.github.com/repos/${repo}`),
    githubJson(`https://api.github.com/repos/${repo}/releases/latest`).catch(() => null)
  ])
  return {
    stars: typeof info.stargazers_count === 'number' ? info.stargazers_count : null,
    author: info.owner && info.owner.login ? info.owner.login : repo.split('/')[0],
    updatedAt: info.pushed_at || info.updated_at || null,
    version: release && release.tag_name ? release.tag_name : null,
    publishedAt: release && release.published_at ? release.published_at : null,
    url: info.html_url || `https://github.com/${repo}`,
    description: info.description || ''
  }
}

function normalizeSource(id, fallbackName) {
  return { source: id, sourceName: fallbackName }
}

function withConfig(source, fallbackName) {
  return normalizeSource(source.id, source.name || fallbackName)
}

/** Official skills.sh search + GitHub metadata enrichment. */
async function searchOfficial(cli, query, sourceConfig, { limit = 10 } = {}) {
  const found = await cli.find(query)
  if (!found.ok) return { ok: false, reason: found.reason || 'skills.sh 搜索失败', rows: [] }
  const rows = found.rows.slice(0, limit).map((row) => ({
    name: row.ref.split('@').pop(),
    ref: row.ref,
    install: row.ref,
    installs: row.installs || null,
    stars: null,
    version: null,
    updatedAt: null,
    publishedAt: null,
    author: row.ref.split('/')[0] || '—',
    url: row.url || null,
    description: '',
    ...withConfig(sourceConfig, 'skills.sh（官方）')
  }))
  await Promise.all(rows.map(async (row) => {
    const repo = repoOf(row.ref)
    if (!repo) return
    try {
      const details = await githubDetails(repo)
      Object.assign(row, details, withConfig(sourceConfig, 'skills.sh（官方）'))
    } catch { /* enrichment is optional; base row remains useful */ }
  }))
  return { ok: true, rows }
}

/** GitHub repository search; no repo is claimed to be a valid skill by itself. */
async function searchGithub(query, sourceConfig, { limit = 10 } = {}) {
  const suffix = sourceConfig.querySuffix ? ' ' + sourceConfig.querySuffix : ''
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query + suffix)}&per_page=${limit}`
  const data = await githubJson(url)
  const rows = (data.items || []).map((repo) => ({
    name: repo.name,
    ref: repo.full_name,
    install: repo.full_name,
    installs: null,
    stars: typeof repo.stargazers_count === 'number' ? repo.stargazers_count : null,
    version: null,
    updatedAt: repo.pushed_at || repo.updated_at || null,
    publishedAt: null,
    author: repo.owner && repo.owner.login ? repo.owner.login : repo.full_name.split('/')[0],
    url: repo.html_url,
    description: repo.description || '',
    ...withConfig(sourceConfig, 'GitHub')
  }))
  await Promise.all(rows.map(async (row) => {
    try {
      const details = await githubDetails(row.ref)
      Object.assign(row, details)
    } catch { /* keep base fields */ }
  }))
  return { ok: true, rows }
}

async function skillhubVersion(cliPath = 'skillhub') {
  const result = await exec(cliPath, ['--version'], { timeout: 12000 })
  return result.ok ? result.stdout.trim() : null
}

/** SkillHub CLI search (available only when the user installed it). */
async function searchSkillhub(query, sourceConfig, { limit = 10 } = {}) {
  const version = await skillhubVersion(sourceConfig.cliPath || 'skillhub')
  if (!version) {
    return {
      ok: false,
      code: 'skillhub-unavailable',
      reason: '未安装 SkillHub CLI，请先按官方文档安装后再搜索。',
      installGuide: DEFAULT_SOURCES.find((s) => s.id === 'skillhub').installGuide,
      rows: []
    }
  }
  const result = await exec(sourceConfig.cliPath || 'skillhub', ['search', query])
  if (!result.ok) return { ok: false, reason: result.stderr || result.stdout || 'SkillHub 搜索失败', rows: [] }
  const rows = []
  for (const raw of result.stdout.split('\n')) {
    const line = raw.trim()
    if (!line || /^(#|└|─|搜索|结果|找到)/.test(line)) continue
    const match = /^([A-Za-z0-9][\w.-]*)(?:\s+(.+))?$/.exec(line)
    if (!match) continue
    rows.push({
      name: match[1], ref: match[1], install: match[1], installs: null, stars: null,
      version: null, updatedAt: null, publishedAt: null, author: 'SkillHub',
      url: null, description: match[2] || '', ...withConfig(sourceConfig, 'SkillHub')
    })
    if (rows.length >= limit) break
  }
  return { ok: true, rows }
}

export class Marketplace {
  constructor(cli) {
    this.cli = cli
  }

  sources() {
    return DEFAULT_SOURCES.map((source) => ({ ...source }))
  }

  async search(source, query) {
    const text = String(query || '').trim()
    if (!text) return { ok: false, reason: '请输入技能关键词', rows: [] }
    try {
      if (source.type === 'github') return await searchGithub(text, source)
      if (source.type === 'skillhub') return await searchSkillhub(text, source)
      return await searchOfficial(this.cli, text, source)
    } catch (error) {
      return { ok: false, reason: error && error.message ? error.message : String(error), rows: [] }
    }
  }

  async installSkillhub(name, targetDir, source = DEFAULT_SOURCES.find((s) => s.id === 'skillhub')) {
    const cliPath = source.cliPath || 'skillhub'
    const version = await skillhubVersion(cliPath)
    if (!version) return { ok: false, code: 'skillhub-unavailable', reason: '未安装 SkillHub CLI', installGuide: source.installGuide || DEFAULT_SOURCES.find((s) => s.id === 'skillhub').installGuide }
    const result = await exec(cliPath, ['install', name, '--dir', targetDir], { timeout: 120000 })
    if (!result.ok) return { ok: false, reason: result.stderr || result.stdout || 'SkillHub 安装失败' }
    return { ok: true, output: (result.stdout + '\n' + result.stderr).slice(0, 1000) }
  }
}


/** Merge user source config with defaults; custom sources are allowed. */
export function validateSources(input) {
  const defaults = new Map(DEFAULT_SOURCES.map((s) => [s.id, s]))
  const merged = []
  const seen = new Set()
  for (const raw of Array.isArray(input) ? input : DEFAULT_SOURCES) {
    if (!raw || typeof raw.id !== 'string' || !/^[a-z0-9-]+$/.test(raw.id)) continue
    if (seen.has(raw.id)) continue
    const base = defaults.get(raw.id) || {}
    const type = ['skills', 'github', 'skillhub'].includes(raw.type) ? raw.type : base.type
    if (!type) continue
    seen.add(raw.id)
    merged.push({
      ...base,
      id: raw.id,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : base.name || raw.id,
      type,
      enabled: raw.enabled !== false,
      ...(raw.querySuffix ? { querySuffix: String(raw.querySuffix).slice(0, 200) } : {}),
      ...(raw.cliPath ? { cliPath: String(raw.cliPath).slice(0, 500) } : {}),
      ...(raw.installGuide || base.installGuide ? { installGuide: raw.installGuide || base.installGuide } : {})
    })
  }
  return merged.length ? merged : DEFAULT_SOURCES.map((s) => ({ ...s }))
}
