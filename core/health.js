// core/health.js — health checks and graded reports. Zero DSH deps.

import fs from 'node:fs'
import path from 'node:path'
import { peekSkill } from './inventory.js'
import { SKILL_NAME_PATTERN } from './store.js'

/**
 * Compute health for one reconciled record.
 * @param {object} record reconciled skill record (with brokenLink/shadowed/conflict flags)
 * @returns {{ loadable: boolean, issues: string[], level: 'ok'|'warn'|'error' }}
 */
export function checkSkill(record) {
  const issues = []
  let level = 'ok'

  function warn(code) { issues.push(code); if (level === 'ok') level = 'warn' }
  function error(code) { issues.push(code); level = 'error' }

  if (record.brokenLink) error('broken-symlink')
  if (!SKILL_NAME_PATTERN.test(record.name)) error('invalid-name')

  const probe = record.brokenLink ? null : peekSkill(record.dir)
  if (!probe) {
    error('unreadable')
  } else {
    if (!probe.hasSkillFile) error('missing-skill-md')
    else {
      if (probe.fmErrors.length > 0) warn('frontmatter:' + probe.fmErrors.join(','))
      if (!probe.name) warn('frontmatter-missing-name')
      else if (probe.name !== record.name) warn('frontmatter-name-mismatch')
      if (!probe.description) warn('frontmatter-missing-description')
    }
    if (isEmptyDir(record.dir)) warn('empty-dir')
  }

  if (record.shadowed) warn('shadowed-by-project')
  if (record.conflict) {
    const paths = Array.isArray(record.sources) ? record.sources.map((s) => s.dir).filter(Boolean) : []
    warn(paths.length > 1 ? 'name-conflict: ' + paths.join(' | ') : 'name-conflict')
  }

  return { loadable: level !== 'error', issues, level }
}

function isEmptyDir(dir) {
  try {
    const entries = fs.readdirSync(dir)
    return entries.filter((e) => !e.startsWith('.')).length === 0
  } catch {
    return false
  }
}

/**
 * One-click体检：aggregate per-skill health into a graded report.
 * @param {Array<object>} records reconciled + collision-annotated records
 * @returns report with counts and per-level grouping
 */
export function healthReport(records) {
  const perSkill = records.map((record) => ({ name: record.name, dir: record.dir, scope: record.scope, agent: record.agent, ...checkSkill(record) }))
  const ok = perSkill.filter((s) => s.level === 'ok')
  const warn = perSkill.filter((s) => s.level === 'warn')
  const error = perSkill.filter((s) => s.level === 'error')
  return {
    at: Date.now(),
    total: perSkill.length,
    ok: ok.length,
    warn: warn.length,
    error: error.length,
    loadable: perSkill.filter((s) => s.loadable).length,
    skills: perSkill
  }
}

/**
 * Build a human-readable fix preview for one issue category. The prompt
 * forbids touching skill content without a confirmed preview: this function
 * only READS and returns before/after text; applying is a separate, confirmed
 * step.
 * @returns {{ canFix: boolean, title: string, diff: string|null, reason: string|null }}
 */
export function previewFix(record, issue) {
  if (issue === 'frontmatter-name-mismatch' || issue.startsWith('frontmatter:')) {
    return { canFix: false, title: issue, diff: null, reason: 'content-fix-requires-review' }
  }
  if (issue === 'missing-skill-md') {
    const skeleton = [
      '---',
      `name: ${record.name}`,
      `description: Describe what ${record.name} does and when to use it.`,
      '---',
      '',
      `# ${record.name}`,
      '',
      '<!-- Describe the skill: purpose, workflow, key commands. -->',
      ''
    ].join('\n')
    return { canFix: true, title: issue, diff: `--- SKILL.md (missing)\n+++ SKILL.md (create)\n${skeleton}`, reason: null }
  }
  return { canFix: false, title: issue, diff: null, reason: 'no-safe-auto-fix' }
}
