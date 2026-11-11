// scripts/host-smoke.mjs — DSH adapter against a sandboxed DSH_HOME.
// The registry mock models the important production rule: an Agent-layer
// runtime entry shadows only its own name; preset filesystem entries remain.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-skills-host-'))
process.env.DSH_HOME = path.join(tmp, 'dsh-home')
const { SkillsManager } = await import('../dsh/manager.js')

const home = path.join(tmp, 'home')
const rootDir = path.join(home, '.agents', 'skills')
fs.mkdirSync(rootDir, { recursive: true })
function makeSkill(root, name, fm) {
  const dir = path.join(root, name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\n' + Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n') + '\n---\n\n# ' + name + '\n')
}
function candidate(name, rank, invocable = true) {
  return { name, rank, invocation: { modelInvocable: invocable, userInvocable: invocable } }
}
function within(root, cwd) {
  if (!cwd) return false
  const relative = path.relative(path.resolve(root), path.resolve(cwd))
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
}
function createRegistry(baseFor) {
  const runtime = new Map()
  let registrations = 0
  const api = {
    register(definition) {
      if (runtime.has(definition.name)) return () => {}
      runtime.set(definition.name, definition)
      registrations += 1
      return () => { runtime.delete(definition.name) }
    },
    async list(options = {}) {
      const winners = new Map((await baseFor(options)).map((row) => [row.name, row]))
      // Agent runtime is a later layer than preset filesystem: same-name
      // runtime wins by layer, while every unrelated filesystem row survives.
      for (const [name, definition] of runtime) winners.set(name, candidate(name, 250, definition.invocation.userInvocable))
      return [...winners.values()]
    }
  }
  return { api, runtime, registrations: () => registrations }
}
function makeAgent(id, cwd, registry) {
  return { id, session: { header: { cwd } }, ctx: { get: (key) => key === 'skills' ? registry.api : undefined } }
}

makeSkill(rootDir, 'alpha', { name: 'alpha', description: 'first' })
makeSkill(rootDir, 'beta', { name: 'beta', description: 'second' })
fs.mkdirSync(path.join(home, '.claude', 'skills'), { recursive: true })
makeSkill(path.join(home, '.claude', 'skills'), 'gamma', { name: 'gamma', description: 'external' })

const registry = createRegistry(async () => [candidate('alpha', 500), candidate('beta', 500)])
const ctx = { get: () => undefined, sessions: { list: () => [] } }
const manager = new SkillsManager(ctx, { home, projectRoot: null })
manager.onAgentCreated(makeAgent('global-agent', null, registry))

await manager.refresh()
let view = await manager.view()
assert.equal(view.ok, true)
assert.deepEqual(view.skills.map((s) => s.name).sort(), ['alpha', 'beta'])
assert.ok(view.skills.every((s) => s.loaded), 'global availability is file + toggle state, not a session catalog')
assert.equal(view.loadedDebug.source, 'filesystem-and-toggle-state')
assert.ok(view.externalSkills.some((s) => s.name === 'gamma' && s.sourceAgent === 'claude'))
assert.ok(view.skills.every((s) => s.installedBy === 'foreign'), 'census marks foreign')

await manager.opDisable('alpha', path.join(rootDir, 'alpha'))
view = await manager.view()
const alpha = view.skills.find((s) => s.name === 'alpha')
assert.equal(alpha.disabled, true)
assert.equal(alpha.loaded, false)
assert.ok(fs.existsSync(path.join(rootDir, 'alpha')), 'shared directory stays in place')
assert.ok(!fs.existsSync(path.join(rootDir + '-disabled', 'alpha')), 'no global shadow move')
assert.ok(registry.runtime.has('alpha'))
assert.deepEqual((await registry.api.list({})).map((row) => row.name).sort(), ['alpha', 'beta'], 'unrelated filesystem skill is not hidden')
assert.equal((await registry.api.list({})).find((row) => row.name === 'beta').invocation.userInvocable, true)
assert.equal((await registry.api.list({})).find((row) => row.name === 'alpha').invocation.userInvocable, false)

await manager.opUndo()
view = await manager.view()
assert.equal(view.skills.find((s) => s.name === 'alpha').disabled, false)
assert.equal(view.skills.find((s) => s.name === 'alpha').loaded, true)
assert.equal(registry.runtime.has('alpha'), false, 'enable disposes only the alpha runtime entry')

await manager.opRemove('beta', path.join(rootDir, 'beta'), { confirmed: true })
assert.ok(!fs.existsSync(path.join(rootDir, 'beta')))
const backups = await manager.backups()
assert.ok(backups.backups.some((b) => b.skill === 'beta'), 'remove took a backup')
const health = await manager.health()
assert.equal(health.ok, true)
assert.equal(health.report.total, 1)
const logs = manager.logs(50)
assert.ok(logs.logs.some((l) => l.op === 'disable'))
assert.ok(logs.logs.some((l) => l.op === 'remove'))

// Global and project rows are independent. A global disable leaves a project
// override callable in that project, while disabling it in other projects.
{
  const projectRoot = path.join(tmp, 'project')
  const projectSkills = path.join(projectRoot, '.agents', 'skills')
  makeSkill(projectSkills, 'alpha', { name: 'alpha', description: 'project override' })
  makeSkill(projectSkills, 'project-only', { name: 'project-only', description: 'project local' })
  const baseFor = async (options) => {
    const rows = [candidate('alpha', 500), candidate('beta', 500)]
    if (within(projectRoot, options.cwd)) rows.push(candidate('alpha', 200), candidate('project-only', 200))
    return rows
  }
  const projectRegistry = createRegistry(baseFor)
  const otherRegistry = createRegistry(baseFor)
  const scoped = new SkillsManager({ get: () => undefined, sessions: { list: () => [] } }, { home, projectRoot })
  scoped.onAgentCreated(makeAgent('project-agent', path.join(projectRoot, 'nested'), projectRegistry))
  scoped.onAgentCreated(makeAgent('other-agent', path.join(tmp, 'other-project'), otherRegistry))
  await scoped.refresh()
  let scopedView = await scoped.view()
  assert.equal(scopedView.skills.filter((row) => row.name === 'alpha').length, 2)
  assert.ok(scopedView.skills.filter((row) => row.name === 'alpha').every((row) => row.loaded))

  await scoped.opDisable('alpha', path.join(rootDir, 'alpha'))
  scopedView = await scoped.view()
  const globalAlpha = scopedView.skills.find((row) => row.name === 'alpha' && row.scope === 'global')
  const projectAlpha = scopedView.skills.find((row) => row.name === 'alpha' && row.scope === 'project')
  assert.equal(globalAlpha.disabled, true)
  assert.equal(globalAlpha.loaded, false)
  assert.equal(projectAlpha.disabled, false)
  assert.equal(projectAlpha.loaded, true)
  assert.equal(projectRegistry.runtime.has('alpha'), false, 'project override is not tombstoned by global disable')
  assert.equal(otherRegistry.runtime.has('alpha'), true, 'same global disable applies in other projects')
  assert.equal((await projectRegistry.api.list({ cwd: projectRoot })).find((row) => row.name === 'alpha').invocation.userInvocable, true)
  assert.equal((await otherRegistry.api.list({})).find((row) => row.name === 'alpha').invocation.userInvocable, false)

  await scoped.opDisable('project-only', path.join(projectSkills, 'project-only'))
  assert.equal(projectRegistry.runtime.has('project-only'), true)
  assert.equal(otherRegistry.runtime.has('project-only'), false, 'project disable never leaks to another cwd')
  assert.equal((await projectRegistry.api.list({ cwd: projectRoot })).find((row) => row.name === 'project-only').invocation.userInvocable, false)
  scopedView = await scoped.view()
  assert.equal(scopedView.skills.find((row) => row.name === 'project-only').loaded, false)
  assert.equal(scopedView.skills.find((row) => row.name === 'alpha' && row.scope === 'project').loaded, true)

  await scoped.opEnable('alpha', path.join(rootDir, 'alpha'))
  scopedView = await scoped.view()
  assert.equal(scopedView.skills.find((row) => row.name === 'alpha' && row.scope === 'global').loaded, true)
  assert.equal(scopedView.skills.find((row) => row.name === 'project-only').disabled, true)
  assert.equal(otherRegistry.runtime.has('alpha'), false)
  scoped.dispose()
  assert.equal(projectRegistry.runtime.size, 0, 'plugin disposal removes runtime entries')
  assert.equal(otherRegistry.runtime.size, 0)
}

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

assert.ok(fs.existsSync(path.join(process.env.DSH_HOME, 'dsh-skills', 'state.json')))
manager.dispose()
assert.equal(registry.runtime.size, 0)
await fsp.rm(tmp, { recursive: true, force: true })
console.log('host smoke: all assertions passed')
