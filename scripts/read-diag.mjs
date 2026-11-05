#!/usr/bin/env node
// scripts/read-diag.mjs — read skb.diag.v1 breadcrumbs from the DSH Desktop
// leveldb localStorage backing store (renderer console is unreachable).
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const roots = [
  path.join(os.homedir(), 'Library/Application Support/@deepseek-ai/dsh-desktop/Local Storage/leveldb'),
  path.join(os.homedir(), 'Library/Application Support/DeepSeek Harness/Local Storage/leveldb'),
  path.join(os.homedir(), 'Library/Application Support/@deepseek-ai/dsh/Local Storage/leveldb')
]

let dir = null
for (const candidate of roots) {
  if (fs.existsSync(candidate)) { dir = candidate; break }
}
if (!dir) {
  console.error('leveldb dir not found; tried:', roots.join(', '))
  process.exit(1)
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.log') || f.endsWith('.ldb'))
const candidates = []
for (const file of files) {
  const buf = fs.readFileSync(path.join(dir, file))
  const text = buf.toString('latin1')
  // Chromium localStorage values: \x01 + utf16le-ish payload; our JSON is ascii.
  // The same key is rewritten on every update: scan ALL occurrences and keep
  // every parseable value, then select the newest by timestamp.
  let idx = text.indexOf('skb.diag.v1')
  while (idx !== -1) {
    const after = text.slice(idx)
    const m = /skb\.diag\.v1.{0,64}?(\[\{.*?\}\])/.exec(after)
    if (m) {
      try {
        const parsed = JSON.parse(m[1])
        if (Array.isArray(parsed) && parsed.length) candidates.push({ file, parsed })
      } catch { /* torn write */ }
    }
    idx = text.indexOf('skb.diag.v1', idx + 1)
  }
}

if (!candidates.length) {
  console.log('NO DIAG FOUND — client never ran (bundle not loaded or factory never executed)')
  process.exit(0)
}
// newest by last entry timestamp
candidates.sort((a, b) => a.parsed[a.parsed.length - 1].at - b.parsed[b.parsed.length - 1].at)
const latest = candidates[candidates.length - 1]
console.log('source file:', latest.file, '| versions seen:', candidates.length)
for (const entry of latest.parsed) {
  console.log(new Date(entry.at).toISOString(), entry.stage, entry.extra === null ? '' : '— ' + entry.extra)
}
