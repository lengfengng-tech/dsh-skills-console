// scripts/host-smoke.mjs — exercise the DSH adapter against a sandboxed
// DSH_HOME (real machine data is never touched) with a mocked cordis ctx.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-skills-host-'))
process.env.DSH_HOME = path.join(tmp, 'dsh-home')

const { SkillsManager } = await import('../dsh/manager.js')

// sandbox home conventions
const home = path.join(tmp, 'home')
fs.mkdirSync(path.join(home, '.agents', 'skills'), { recursive: true })
function makeSkill(root, name, fm) {
  const dir = path.join(root, name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\n' + Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n') + '\n---\n\n# ' + name + '\n')
}
makeSkill(path.join(home, '.agents', 'skills'), 'alpha', { name: 'alpha', description: 'first' })
makeSkill(path.join(home, '.agents', 'skills'), 'beta', { name: 'beta', description: 'second' })
// An external agent skill is importable but does not enter the DSH main list.
fs.mkdirSync(path.join(home, '.claude', 'skills'), { recursive: true })
makeSkill(path.join(home, '.claude', 'skills'), 'gamma', { name: 'gamma', description: 'external' })

const registrations = []
const agent = {
  id: 'agent-1',
  ctx: {
    get: (key) => key === 'skills' ? {
      register(skill) {
        registrations.push(skill)
        return () => { skill.disposed = true }
      }
    } : undefined
  }
}
const ctx = {
  get: (key) => key === 'agents' ? { list: () => [agent] } : undefined,
  sessions: { list: () => [] }
}
const manager = new SkillsManager(ctx, { home, projectRoot: null })

await manager.refresh()
let view = await manager.view()
assert.equal(view.ok, true)
const names = view.skills.map((s) => s.name).sort()
assert.deepEqual(names, ['alpha', 'beta'])
assert.ok(view.externalSkills.some((s) => s.name === 'gamma' && s.sourceAgent === 'claude'), 'external skill is importable')
assert.ok(view.skills.every((s) => s.installedBy === 'foreign'), 'census marks foreign')

// DSH-only disable/enable: shared directories never move; the agent receives
// an uninvocable tombstone, and undo disposes it.
const rootDir = path.join(home, '.agents', 'skills')
await manager.opDisable('alpha', path.join(rootDir, 'alpha'))
view = await manager.view()
const alpha = view.skills.find((s) => s.name === 'alpha')
assert.equal(alpha.disabled, true)
assert.ok(fs.existsSync(path.join(rootDir, 'alpha')), 'shared directory stays in place')
assert.ok(!fs.existsSync(path.join(rootDir + '-disabled', 'alpha')), 'no global shadow move')
assert.ok(registrations.some((r) => r.name === 'alpha' && r.invocation.modelInvocable === false && r.invocation.userInvocable === false))

// undo re-enables in DSH only
await manager.opUndo()
view = await manager.view()
assert.equal(view.skills.find((s) => s.name === 'alpha').disabled, false)
assert.ok(registrations.find((r) => r.name === 'alpha').disposed, 'tombstone disposed on enable')

// remove with confirm + backup, then rollback via logged undo
await manager.opRemove('beta', path.join(rootDir, 'beta'), { confirmed: true })
assert.ok(!fs.existsSync(path.join(rootDir, 'beta')))
const backups = await manager.backups()
assert.ok(backups.backups.some((b) => b.skill === 'beta'), 'remove took a backup')

// health report
const health = await manager.health()
assert.equal(health.ok, true)
assert.equal(health.report.total, 1)

// logs recorded
const logs = manager.logs(50)
assert.ok(logs.logs.some((l) => l.op === 'disable'))
assert.ok(logs.logs.some((l) => l.op === 'remove'))

// Regression: loaded status is read from the CURRENT session's catalog, not
// from a root-context/cwd enumeration (which cannot see preset skill layers).
{
  const catalogCtx = {
    get: (key) => {
      if (key === 'sessionSkillCatalog') return {
        list: async ({ sessionId }) => ({ skills: sessionId === 's-current' ? [{ name: 'alpha' }, { name: 'gamma' }] : [] })
      }
      if (key === 'agents') return { currentInitiator: () => ({ id: 's-current' }) }
      return undefined
    },
    sessions: { list: () => [] }
  }
  const probe = new SkillsManager(catalogCtx, { home })
  assert.equal((await probe.loadedNames('s-current')).has('alpha'), true)
  assert.equal((await probe.loadedNames('s-current')).has('gamma'), true)
  probe._loadedCache.at = 0 // defeat cache for the active-agent fallback case
  assert.equal((await probe.loadedNames(undefined)).has('alpha'), true, 'active agent supplies the session')
  probe.dispose()
}

// Importing an external skill creates a DSH symlink and preserves provenance.
{
  const target = path.join(home, '.claude', 'skills', 'gamma')
  await manager.opLink('gamma', target, undefined, 'claude')
  view = await manager.view()
  const imported = view.skills.find((s) => s.name === 'gamma')
  assert.ok(imported, 'imported skill joins the DSH list')
  assert.equal(imported.sourceRef, 'external:claude')
  assert.equal(imported.linkedFrom, fs.realpathSync(target))
  assert.ok(fs.lstatSync(path.join(rootDir, 'gamma')).isSymbolicLink())
  assert.ok(!view.externalSkills.some((s) => s.name === 'gamma'), 'imported skill no longer external')
}

// state persisted under DSH_HOME
assert.ok(fs.existsSync(path.join(process.env.DSH_HOME, 'dsh-skills', 'state.json')))

manager.dispose()
await fsp.rm(tmp, { recursive: true, force: true })
console.log('host smoke: all assertions passed')
