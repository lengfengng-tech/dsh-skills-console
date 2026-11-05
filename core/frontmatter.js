// core/frontmatter.js — minimal SKILL.md frontmatter reader. Zero dependencies.
//
// Supports the subset every SKILL.md uses: a --- fenced block of flat
// `key: value` pairs. Values may be plain, single- or double-quoted. Multi-line
// folded scalars are read as their first line plus continuation lines joined
// with spaces (enough for name/description linting).

export function parseFrontmatter(text) {
  if (typeof text !== 'string') return { data: {}, raw: '', errors: ['not-text'] }
  const normalized = text.replace(/^﻿/, '')
  if (!normalized.startsWith('---')) return { data: {}, raw: '', errors: [] }
  const lines = normalized.split(/\r?\n/)
  // Find closing fence.
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break }
  }
  if (end === -1) return { data: {}, raw: '', errors: ['unclosed-frontmatter'] }
  const body = lines.slice(1, end)
  const data = {}
  const errors = []
  let currentKey = null
  for (const rawLine of body) {
    const line = rawLine.replace(/#.*$/, '')
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (kv) {
      currentKey = kv[1]
      data[currentKey] = unquote(kv[2].trim())
      continue
    }
    // Continuation (indented content under the previous key).
    const cont = /^\s+(.+)$/.exec(rawLine)
    if (cont && currentKey) {
      const prev = String(data[currentKey] || '')
      data[currentKey] = (prev ? prev + ' ' : '') + unquote(cont[1].trim())
      continue
    }
    if (rawLine.trim() !== '') errors.push('bad-line: ' + rawLine.trim().slice(0, 40))
  }
  return { data, raw: body.join('\n'), errors }
}

function unquote(value) {
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1)
    }
  }
  return value
}

/** Render a normalized frontmatter block (used by health-fix previews). */
export function serializeFrontmatter(data) {
  const lines = ['---']
  for (const [key, value] of Object.entries(data)) {
    const text = String(value == null ? '' : value)
    lines.push(/[:#\n]/.test(text) ? `${key}: "${text.replace(/"/g, '\\"')}"` : `${key}: ${text}`)
  }
  lines.push('---')
  return lines.join('\n') + '\n'
}
