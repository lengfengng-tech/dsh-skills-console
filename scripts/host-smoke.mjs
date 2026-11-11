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

const home = path.join(tmp, 'home')
fs.mkdirSync(path.join(home, '.agents', 'skills'), { recursive: true })
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
// Minimal model of DSH's lower-rank-wins registry. It exercises our real
// provider factory, invalidation control, candidates and invocation metadata.
function createRegistry(baseFor) {
  let provider = null
  let invalidations = 0
  let disposed = false
  const api = {
    registerProvider(create) {
      provider = create({ invalidate: () => { invalidations += 1 } })
      return () => { disposed = true; provider = null }
    },
    async list(options = {}) {
      const rows = [...await baseFor(options)]
      if (provider) rows.push(...await provider.list(options))
      const winners = new Map()
      for (const row of rows) {
        const current = winners.get(row.name)
        if (!current || row.rank < current.rank) winners.set(row.name, row)
      }
      return [...winners.values()].map(({ rank, locator, projectRoot, ...row }) => row)
    }
  }
  return { api, provider: () => provider, invalidations: () => invalidations, disposed: () => disposed }
}

makeSkill(path.join(home, '.agents', 'skills'), 'alpha', { name: 'alpha', description: 'first' })
makeSkill(path.join(home, '.agents', 'skills'), 'beta', { name: 'beta', description: 'second' })
fs.mkdirSync(path.join(home, '.claude', 'skills'), { recursive: true })
makeSkill(path.join(home, '.claude', 'skills'), 'gamma', { name: 'gamma', description: 'external' })

const globalRegistry = createRegistry(async () => [candidate('alpha', 500), candidate('beta', 500)])
const ctx = {
  get: (key) => key === 'skills' ? globalRegistry.api : undefined,
  sessions: { list: () => [] }
}
const manager = new SkillsManager(ctx, { home, projectRoot: null })

await manager.refresh()
let view = await manager.view()
assert.equal(view.ok, true)
assert.deepEqual(view.skills.map((s) => s.name).sort(), ['alpha', 'beta'])
assert.ok(view.skills.every((s) => s.loaded), 'global skills do not depend on a session catalog')
assert.ok(view.externalSkills.some((s) => s.name === 'gamma' && s.sourceAgent === 'claude'))
assert.ok(view.skills.every((s) => s.installedBy === 'foreign'), 'census marks foreign')

const rootDir = path.join(home, '.agents', 'skills')
await manager.opDisable('alpha', path.join(rootDir, 'alpha'))
view = await manager.view()
const alpha = view.skills.find((s) => s.name === 'alpha')
assert.equal(alpha.disabled, true)
assert.equal(alpha.loaded, false, 'global provider removes the skill immediately')
assert.ok(fs.existsSync(path.join(rootDir, 'alpha')), 'shared directory stays in place')
assert.ok(!fs.existsSync(path.join(rootDir + '-disabled', 'alpha')), 'no global shadow move')
const disabledCandidates = await globalRegistry.provider().list({})
assert.ok(disabledCandidates.some((row) => row.name === 'alpha' && row.rank === 250 && row.invocation.modelInvocable === false && row.invocation.userInvocable === false))
assert.ok(disabledCandidates.every((row) => row.provider === globalRegistry.provider().name), 'candidate provider matches the DSH registration name')
assert.ok(globalRegistry.invalidations() >= 1, 'toggle invalidates the global catalog cache')

await manager.opUndo()
view = await manager.view()
assert.equal(view.skills.find((s) => s.name === 'alpha').disabled, false)
assert.equal(view.skills.find((s) => s.name === 'alpha').loaded, true)
assert.equal((await globalRegistry.provider().list({})).length, 0, 'enable removes the global tombstone')

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

// Global status is session-independent; project status still uses the active
// or latest stored session's cwd/preset-aware catalog.
{
  const registry = createRegistry(async () => [candidate('alpha', 500), candidate('beta', 500)])
  const catalogCtx = {
    get: (key) => {
      if (key === 'skills') return registry.api
      if (key === 'sessionSkillCatalog') return {
        list: async ({ sessionId }) => ({ skills: sessionId === 's-current' ? [{ name: 'alpha' }, { name: 'gamma' }] : [] })
      }
      if (key === 'agents') return { currentInitiator: () => ({ id: 's-current' }) }
      return undefined
    },
    sessions: { list: () => [] }
  }
  const probe = new SkillsManager(catalogCtx, { home })
  let catalogs = await probe.loadedCatalogs('s-current')
  assert.equal(catalogs.global.has('alpha'), true)
  assert.equal(catalogs.project.has('gamma'), true)
  probe._loadedCache.at = 0
  catalogs = await probe.loadedCatalogs(undefined)
  assert.equal(catalogs.global.has('alpha'), true)
  assert.equal(catalogs.project.has('alpha'), true, 'active agent supplies the project session')
  const fallbackRegistry = createRegistry(async () => [candidate('alpha', 500)])
  const fallbackCtx = {
    get: (key) => {
      if (key === 'skills') return fallbackRegistry.api
      if (key === 'sessionSkillCatalog') return { list: async () => ({ skills: [{ name: 'alpha' }] }) }
      return undefined
    },
    sessionPersistence: { list: async () => [{ header: { id: 's-current', createdAt: 1 } }] },
    sessions: { list: () => [] }
  }
  const fallback = new SkillsManager(fallbackCtx, { home })
  assert.equal((await fallback.loadedCatalogs(undefined)).project.has('alpha'), true, 'persistence supplies latest project session')
  fallback.dispose()
  probe.dispose()
}

// Project skills are separate rows and outrank a global disable. A project
// disable is emitted only for that project cwd, never for other projects.
{
  const projectRoot = path.join(tmp, 'project')
  const projectSkills = path.join(projectRoot, '.agents', 'skills')
  makeSkill(projectSkills, 'alpha', { name: 'alpha', description: 'project override' })
  makeSkill(projectSkills, 'project-only', { name: 'project-only', description: 'project local' })
  const registry = createRegistry(async (options) => {
    const rows = [candidate('alpha', 500), candidate('beta', 500)]
    if (within(projectRoot, options.cwd)) rows.push(candidate('alpha', 200), candidate('project-only', 200))
    return rows
  })
  const scopedCtx = {
    get: (key) => {
      if (key === 'skills') return registry.api
      if (key === 'sessionSkillCatalog') return {
        list: async () => ({ skills: (await registry.api.list({ cwd: projectRoot })).filter((row) => row.invocation?.userInvocable !== false) })
      }
      if (key === 'agents') return { currentInitiator: () => ({ id: 'project-session' }) }
      return undefined
    },
    sessions: { list: () => [] }
  }
  const scoped = new SkillsManager(scopedCtx, { home, projectRoot })
  await scoped.refresh()
  let scopedView = await scoped.view('project-session')
  assert.equal(scopedView.skills.filter((row) => row.name === 'alpha').length, 2, 'global and project rows stay independent')
  assert.ok(scopedView.skills.filter((row) => row.name === 'alpha').every((row) => row.loaded))

  await scoped.opDisable('alpha', path.join(rootDir, 'alpha'))
  scopedView = await scoped.view('project-session')
  const globalAlpha = scopedView.skills.find((row) => row.name === 'alpha' && row.scope === 'global')
  const projectAlpha = scopedView.skills.find((row) => row.name === 'alpha' && row.scope === 'project')
  assert.equal(globalAlpha.disabled, true)
  assert.equal(globalAlpha.loaded, false)
  assert.equal(projectAlpha.disabled, false, 'global disable does not mark the project row disabled')
  assert.equal(projectAlpha.loaded, true, 'project rank 200 outranks global disable rank 250')

  await scoped.opDisable('project-only', path.join(projectSkills, 'project-only'))
  const otherProject = path.join(tmp, 'other-project')
  const otherCandidates = await registry.provider().list({ cwd: otherProject })
  assert.ok(!otherCandidates.some((row) => row.name === 'project-only'), 'project tombstone is absent elsewhere')
  const projectCandidates = await registry.provider().list({ cwd: path.join(projectRoot, 'nested') })
  assert.ok(projectCandidates.some((row) => row.name === 'project-only' && row.rank === 150), 'project tombstone outranks project files')
  scopedView = await scoped.view('project-session')
  assert.equal(scopedView.skills.find((row) => row.name === 'project-only').loaded, false)
  assert.equal(scopedView.skills.find((row) => row.name === 'alpha' && row.scope === 'project').loaded, true, 'unrelated project skill stays loaded')

  await scoped.opEnable('alpha', path.join(rootDir, 'alpha'))
  scopedView = await scoped.view('project-session')
  assert.equal(scopedView.skills.find((row) => row.name === 'alpha' && row.scope === 'global').loaded, true)
  assert.equal(scopedView.skills.find((row) => row.name === 'project-only').disabled, true, 'enabling global does not clear project disable')
  scoped.dispose()
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
assert.equal(globalRegistry.disposed(), true, 'provider is disposed with the plugin')
await fsp.rm(tmp, { recursive: true, force: true })
console.log('host smoke: all assertions passed')
