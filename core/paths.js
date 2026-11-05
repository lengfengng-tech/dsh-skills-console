// core/paths.js — skill directory discovery. Zero DSH dependencies.
//
// Discovery is adaptive and never hard-codes a single layout:
//   1. agents.md standard:  $HOME/.agents/skills (global), <project>/.agents/skills (project)
//   2. per-agent conventions when present: ~/.claude/skills, ~/.codex/skills, …
//   3. user-configured custom roots (state.customRoots)
//
// Everything is joined with path.join and resolved from os.homedir(); tests
// can inject a fake home/platform to exercise Windows shapes via path.win32.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Well-known per-agent skill directory conventions, relative to home. */
export const AGENT_CONVENTIONS = [
  { agent: 'agents', rel: ['.agents', 'skills'], standard: true },
  { agent: 'claude', rel: ['.claude', 'skills'], standard: false },
  { agent: 'codex', rel: ['.codex', 'skills'], standard: false },
  { agent: 'cursor', rel: ['.cursor', 'skills'], standard: false },
  { agent: 'gemini', rel: ['.gemini', 'skills'], standard: false },
  { agent: 'opencode', rel: ['.config', 'opencode', 'skills'], standard: false }
]

export function defaultHome() {
  return os.homedir()
}

function statKind(target) {
  try {
    const st = fs.lstatSync(target)
    if (st.isSymbolicLink()) {
      try {
        const real = fs.statSync(target)
        return real.isDirectory() ? 'dir' : 'other'
      } catch {
        return 'broken-link'
      }
    }
    return st.isDirectory() ? 'dir' : 'other'
  } catch {
    return 'missing'
  }
}

function probeDir(dir) {
  const kind = statKind(dir)
  let readable = false
  let writable = false
  if (kind === 'dir') {
    try {
      fs.accessSync(dir, fs.constants.R_OK)
      readable = true
    } catch { /* unreadable */ }
    try {
      fs.accessSync(dir, fs.constants.W_OK)
      writable = true
    } catch { /* read-only */ }
  }
  return { kind, readable, writable }
}

/**
 * Discover every skill root worth showing.
 * @param {{ home?: string, projectRoot?: string|null, customRoots?: string[],
 *           pathImpl?: object }} input - pathImpl allows path.win32 injection
 *   for cross-platform tests; defaults to the host path module.
 * @returns discovered roots with probe results; missing dirs are included as 'missing'.
 */
export function discoverRoots(input = {}) {
  const p = input.pathImpl || path
  const home = input.home || defaultHome()
  const customRoots = Array.isArray(input.customRoots) ? input.customRoots : []
  const roots = []
  const seen = new Set()

  function push(dir, scope, agent, standard, origin) {
    const key = p.resolve(dir)
    if (seen.has(key)) return
    seen.add(key)
    const probe = probeDir(dir)
    roots.push({ dir: key, scope, agent, standard, origin, ...probe })
  }

  // 1+2. home-level conventions (agents.md standard first, then per-agent).
  for (const conv of AGENT_CONVENTIONS) {
    push(p.join(home, ...conv.rel), 'global', conv.agent, conv.standard, 'convention')
  }

  // 1. project-level agents.md standard.
  if (typeof input.projectRoot === 'string' && input.projectRoot) {
    push(p.join(input.projectRoot, '.agents', 'skills'), 'project', 'agents', true, 'convention')
  }

  // 3. user-configured custom roots (scope inferred from location).
  for (const raw of customRoots) {
    if (typeof raw !== 'string' || !raw.trim()) continue
    const dir = p.resolve(raw.trim())
    const scope = dir.startsWith(p.resolve(home)) ? 'global' : 'project'
    push(dir, scope, 'custom', false, 'custom')
  }

  return roots
}

/** Roots that physically exist (dir or broken-link parent still counts when readable). */
export function liveRoots(roots) {
  return roots.filter((root) => root.kind === 'dir' && root.readable)
}
