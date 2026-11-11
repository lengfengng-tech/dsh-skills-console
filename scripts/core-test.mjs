// scripts/core-test.mjs — core-layer tests, runnable without DSH: `npm test`.
// Uses a sandboxed fake home + project so the real machine is never touched.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'

const core = await import('../core/index.js')

const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-skills-core-'))
const home = path.join(tmp, 'home')
const project = path.join(tmp, 'project')
fs.mkdirSync(path.join(home, '.agents', 'skills'), { recursive: true })
fs.mkdirSync(path.join(home, '.claude', 'skills'), { recursive: true })
fs.mkdirSync(path.join(project, '.agents', 'skills'), { recursive: true })

function makeSkill(root, name, { withSkillMd = true, fm = {}, body = '# x\n' } = {}) {
  const dir = path.join(root, name)
  fs.mkdirSync(dir, { recursive: true })
  if (withSkillMd) {
    const front = Object.keys(fm).length
      ? '---\n' + Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n') + '\n---\n\n'
      : ''
    fs.writeFileSync(path.join(dir, 'SKILL.md'), front + body)
  }
  return dir
}

// --- paths.js ---
{
  const roots = core.discoverRoots({ home, projectRoot: project })
  const byAgent = new Map(roots.filter((r) => r.scope === 'global').map((r) => [r.agent, r]))
  assert.equal(byAgent.get('agents').dir, path.join(home, '.agents', 'skills'))
  assert.equal(byAgent.get('agents').scope, 'global')
  assert.equal(byAgent.get('claude').dir, path.join(home, '.claude', 'skills'))
  const projRoot = roots.find((r) => r.scope === 'project')
  assert.equal(projRoot.dir, path.join(project, '.agents', 'skills'))
  assert.equal(projRoot.agent, 'agents')
  // missing dirs report missing, not an error
  const missing = roots.find((r) => r.agent === 'codex')
  assert.equal(missing.kind, 'missing')
  // custom roots
  const custom = path.join(tmp, 'custom-root')
  fs.mkdirSync(custom, { recursive: true })
  const roots2 = core.discoverRoots({ home, customRoots: [custom] })
  assert.ok(roots2.some((r) => r.origin === 'custom' && r.dir === path.resolve(custom)))
}

// --- frontmatter.js ---
{
  const good = core.parseFrontmatter('---\nname: tdd\ndescription: "Use when: tests"\n---\n\n# body')
  assert.equal(good.data.name, 'tdd')
  assert.equal(good.errors.length, 0)
  const unclosed = core.parseFrontmatter('---\nname: x')
  assert.ok(unclosed.errors.includes('unclosed-frontmatter'))
}

// --- inventory.js: census on a dirty mixed directory, nothing lost ---
{
  const root = path.join(home, '.agents', 'skills')
  makeSkill(root, 'good-skill', { fm: { name: 'good-skill', description: 'A good one' } })
  makeSkill(root, 'no-frontmatter', { fm: {} })
  makeSkill(root, 'missing-md', { withSkillMd: false })
  fs.mkdirSync(path.join(root, 'empty-dir'))
  // broken symlink
  fs.symlinkSync(path.join(tmp, 'does-not-exist'), path.join(root, 'broken-link'))
  // valid symlink into a foreign location
  const foreign = makeSkill(path.join(tmp, 'foreign-store'), 'linked-skill', { fm: { name: 'linked-skill', description: 'x' } })
  fs.symlinkSync(foreign, path.join(root, 'linked-skill'))

  const scanned = core.scanRoot({ dir: root, kind: 'dir', readable: true, scope: 'global', agent: 'agents' })
  const names = scanned.map((r) => r.name).sort()
  assert.deepEqual(names, ['broken-link', 'empty-dir', 'good-skill', 'linked-skill', 'missing-md', 'no-frontmatter'])

  const reconciled = core.reconcile(scanned, [])
  assert.equal(reconciled.length, 6)
  const linked = reconciled.find((r) => r.name === 'linked-skill')
  assert.equal(linked.origin, 'symlink')
  assert.equal(linked.linkedFrom, fs.realpathSync(foreign))
  assert.equal(linked.installedBy, 'foreign') // census default
  const broken = reconciled.find((r) => r.name === 'broken-link')
  assert.equal(broken.brokenLink, true)

  // second run preserves state metadata (installedBy/pinned survive rescans)
  const prior = reconciled.map((r) => r.name === 'good-skill' ? { ...r, installedBy: 'dsh-skills', pinned: true } : r)
  const again = core.reconcile(scanned, prior)
  const good = again.find((r) => r.name === 'good-skill')
  assert.equal(good.installedBy, 'dsh-skills')
  assert.equal(good.pinned, true)

  // health
  const annotated = core.annotateCollisions(again)
  const report = core.healthReport(annotated)
  const byName = new Map(report.skills.map((s) => [s.name, s]))
  assert.equal(byName.get('good-skill').level, 'ok')
  assert.equal(byName.get('missing-md').level, 'error')
  assert.ok(byName.get('no-frontmatter').issues.some((i) => i.startsWith('frontmatter')))
  assert.equal(byName.get('broken-link').level, 'error')
  assert.equal(byName.get('empty-dir').level, 'error') // no SKILL.md + empty
  assert.ok(byName.get('empty-dir').issues.includes('empty-dir'))
  assert.ok(report.error >= 3)

  // project shadow annotation
  const projRoot = path.join(project, '.agents', 'skills')
  makeSkill(projRoot, 'good-skill', { fm: { name: 'good-skill', description: 'project override' } })
  const projScanned = core.scanRoot({ dir: projRoot, kind: 'dir', readable: true, scope: 'project', agent: 'agents' })
  const merged = core.annotateCollisions(core.reconcile([...scanned, ...projScanned], []))
  const globalRow = merged.find((r) => r.name === 'good-skill' && r.scope === 'global')
  assert.equal(globalRow.shadowed, true)
  const withPaths = core.checkSkill({
    ...globalRow,
    conflict: true,
    sources: [{ dir: '/tmp/one' }, { dir: '/tmp/two' }]
  })
  assert.ok(withPaths.infos.some((i) => i.includes('/tmp/one') && i.includes('/tmp/two')), 'conflict lists every path as info')
  assert.ok(!withPaths.issues.some((i) => i.startsWith('name-conflict')), 'same-name sources are not warnings')
}

// --- store.js: atomic write, merge, watcher ---
{
  const dir = path.join(tmp, 'store')
  const store = new core.SkillStore(dir)
  const state = store.state()
  assert.equal(state.version, 1)
  store.write({ ...state, skills: [{ name: 'a', dir: '/x/a', installedBy: 'dsh-skills' }] })
  // external edit then merge: unknown remote rows survive
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'))
  onDisk.skills.push({ name: 'remote-row', dir: '/y/remote-row', installedAt: 5 })
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(onDisk))
  store.write({ ...store.read(), skills: store.read().skills.map((s) => s.name === 'a' ? { ...s, pinned: true } : s) })
  const merged = store.read()
  assert.ok(merged.skills.some((s) => s.name === 'remote-row'), 'concurrent row preserved')
  assert.ok(merged.skills.find((s) => s.name === 'a').pinned)
  store.write({ ...merged, dshProjectDisabled: [{ name: 'a', projectRoot: '/project-a' }] })
  assert.deepEqual(store.read().dshProjectDisabled, [{ name: 'a', projectRoot: '/project-a' }])
  store.write({ ...store.read(), dshProjectDisabled: [] })
  assert.equal(store.read().dshProjectDisabled.length, 0, 'project enable is not resurrected by merge')

  // watcher fires on external change
  let watched = null
  const close = store.watch((next) => { watched = next })
  const externalStore = new core.SkillStore(dir)
  const external = externalStore.read()
  externalStore.write({ ...external, customRoots: [path.join(tmp, 'watched-root')] })
  const watchDeadline = Date.now() + 3000
  while (!watched && Date.now() < watchDeadline) await new Promise((r) => setTimeout(r, 50))
  assert.ok(watched && watched.customRoots.includes(path.join(tmp, 'watched-root')))
  close()
  externalStore.dispose()
  store.dispose()

  // broken state quarantined (renamed away, fresh defaults returned)
  fs.writeFileSync(path.join(dir, 'state.json'), '{not json')
  const recovered = new core.SkillStore(dir).read()
  assert.equal(recovered.skills.length, 0)
  assert.ok(!fs.existsSync(path.join(dir, 'state.json')), 'broken file renamed away')
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('state.json.broken-')), 'quarantine copy kept')
}

// --- ops.js: disable/enable round-trip, link validation, materialize ---
{
  const root = path.join(home, '.agents', 'skills')
  await core.disableSkill(root, 'good-skill')
  assert.ok(fs.existsSync(path.join(root + '-disabled', 'good-skill')))
  assert.ok(!fs.existsSync(path.join(root, 'good-skill')))
  await core.enableSkill(root, 'good-skill')
  assert.ok(fs.existsSync(path.join(root, 'good-skill')))

  // escape rules
  assert.equal(core.validateLinkTarget('/').ok, false)
  assert.equal(core.validateLinkTarget(path.join(tmp, 'nope')).ok, false)
  const noMd = path.join(tmp, 'no-md')
  fs.mkdirSync(noMd, { recursive: true })
  assert.equal(core.validateLinkTarget(noMd).ok, false)
  const okTarget = makeSkill(path.join(tmp, 'link-targets'), 'linky', { fm: { name: 'linky', description: 'x' } })
  assert.equal(core.validateLinkTarget(okTarget).ok, true)

  const linkResult = await core.linkSkill(root, 'linked-now', okTarget)
  assert.ok(['symlink', 'junction', 'copy'].includes(linkResult.via))
  const mat = await core.materializeSkill(root, 'linked-now')
  assert.ok(fs.existsSync(path.join(root, 'linked-now', 'SKILL.md')))
  assert.equal(fs.lstatSync(path.join(root, 'linked-now')).isSymbolicLink(), false)
  await core.removeSkill(root, 'linked-now', { confirmed: true })
  assert.ok(!fs.existsSync(path.join(root, 'linked-now')))

  await assert.rejects(() => core.removeSkill(root, 'good-skill'), /二次确认/)
  await assert.rejects(() => core.linkSkill(root, 'bad-name!', okTarget), /非法技能名/)
}

// --- backup.js: backup + rollback + retention ---
{
  const backupsRoot = path.join(tmp, 'backups')
  const root = path.join(home, '.agents', 'skills')
  const b1 = await core.backupSkill(backupsRoot, root, 'good-skill', 'test')
  // mutate then roll back
  fs.writeFileSync(path.join(root, 'good-skill', 'SKILL.md'), '# mutated\n')
  const rb = await core.rollbackSkill(backupsRoot, root, 'good-skill', b1.dir)
  assert.ok(fs.existsSync(rb.restored))
  assert.match(fs.readFileSync(path.join(root, 'good-skill', 'SKILL.md'), 'utf8'), /A good one|# x/)
  assert.ok(rb.priorBackup)

  // retention: create 12 backups, keep 10
  for (let i = 0; i < 11; i++) {
    await core.backupSkill(backupsRoot, root, 'good-skill', 'fill')
    await new Promise((r) => setTimeout(r, 5))
  }
  const removed = await core.pruneBackups(backupsRoot, { maxPerSkill: 10, maxAgeDays: 30 })
  const remaining = await core.listBackups(backupsRoot)
  assert.ok(remaining.filter((b) => b.skill === 'good-skill').length <= 10)
}

// --- skills-cli.js parsers ---
{
  const sampleList = [
    'Global Skills',
    '',
    'Browser Skills',
    '  ego-browser  ~/.agents/skills/ego-browser',
    '    Agents: Claude Code, Codex  Source: citrolabs/ego-lite',
    '  tdd          ~/.agents/skills/tdd',
    '    Agents: Claude Code  Source: mattpocock/skills'
  ].join('\n')
  const rows = core.parseListOutput(sampleList)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].name, 'ego-browser')
  assert.equal(rows[0].source, 'citrolabs/ego-lite')
  assert.equal(rows[1].name, 'tdd')

  const sampleFind = [
    'Install with npx skills add <owner/repo@skill>',
    '',
    'mattpocock/skills@tdd  1.2M installs',
    '└ https://skills.sh/mattpocock/skills/tdd',
    'backnotprop/pstack@tdd  7.2K installs',
    '└ https://skills.sh/backnotprop/pstack/tdd'
  ].join('\n')
  const found = core.parseFindOutput(sampleFind)
  assert.equal(found.length, 2)
  assert.equal(found[0].ref, 'mattpocock/skills@tdd')
  assert.equal(found[0].installs, '1.2M installs')
  assert.equal(found[1].url, 'https://skills.sh/backnotprop/pstack/tdd')
}

// --- Windows path shapes (path.win32 mock, prompt §9.4) ---
{
  const win = (await import('node:path')).win32
  const winHome = 'C:\\Users\\tester'
  const roots = core.discoverRoots({ home: winHome, projectRoot: 'D:\\proj', pathImpl: win })
  const agents = roots.find((r) => r.agent === 'agents' && r.scope === 'global')
  assert.equal(agents.dir, 'C:\\Users\\tester\\.agents\\skills')
  const proj = roots.find((r) => r.scope === 'project')
  assert.equal(proj.dir, 'D:\\proj\\.agents\\skills')
}

// --- sync.js: manifests contain refs only, never skill content ---
{
  const manifest = core.manifestFromRecords([
    { name: 'tdd', sourceRef: 'mattpocock/skills@tdd', origin: 'marketplace' },
    { name: 'local-only', sourceRef: 'external:claude', origin: 'symlink' },
    { name: 'broken-ref', sourceRef: 'not-a-download-ref', origin: 'manual' }
  ])
  assert.equal(manifest.skills.length, 1)
  assert.equal(manifest.skills[0].install, 'mattpocock/skills@tdd')
  assert.equal(manifest.skills[0].url, 'https://skills.sh/mattpocock/skills/tdd')
  assert.ok(!JSON.stringify(manifest).includes('SKILL.md content'), 'no bodies cross the manifest')

  const parsed = core.parseManifest(JSON.stringify(manifest))
  assert.equal(parsed.skills.length, 1)
  assert.throws(() => core.parseManifest('{"version":99,"skills":[]}'), /不受支持/)
  const withBad = core.parseManifest(JSON.stringify({ version: 1, skills: [
    { name: 'ok', install: 'a/b@ok' },
    { name: 'bad', install: '../../etc' },
    { name: 'ok', install: 'a/b@ok' }
  ] }))
  assert.deepEqual(withBad.skills.map((s) => s.name), ['ok'])
}

// --- market source configuration ---
{
  const defaults = core.validateSources([])
  assert.ok(defaults.some((s) => s.id === 'skills' && s.enabled))
  assert.ok(defaults.some((s) => s.id === 'github' && s.enabled))
  assert.ok(defaults.some((s) => s.id === 'skillhub' && s.installGuide))
  const custom = core.validateSources([
    ...defaults,
    { id: 'github-security', name: 'Security skills', type: 'github', enabled: true, querySuffix: 'topic:security' },
    { id: 'bad type', name: 'bad', type: 'unknown' }
  ])
  const added = custom.find((s) => s.id === 'github-security')
  assert.equal(added.querySuffix, 'topic:security')
  assert.ok(!custom.some((s) => s.id === 'bad type'))
}

// --- multi-remote sync against real local bare repositories ---
{
  const remotes = core.validateRemotes([
    { id: 'local', name: 'Local', type: 'file', url: 'file:///tmp/local.git' },
    { id: 'local', name: 'Duplicate ignored', type: 'file', url: 'file:///tmp/other.git' },
    { id: 'corp', name: 'Corp', type: 'gitlab', url: 'https://git.internal/team/skills.git', insecureSkipTls: true }
  ])
  assert.equal(remotes.length, 2)
  assert.equal(remotes[1].insecureSkipTls, true)
  const hidden = core.redact('https://user:secret@example.com/repo.git Authorization: Basic c2VjcmV0', ['secret'])
  assert.ok(!hidden.includes('secret'))

  const bare = path.join(tmp, 'bare.git')
  await new Promise((resolve, reject) => {
    execFile('git', ['init', '--bare', bare], (error, stdout, stderr) => error ? reject(stderr || error) : resolve(stdout))
  })
  const remote = { id: 'local', name: 'Local', type: 'file', url: 'file://' + bare, enabled: true }
  const pushed = await core.pushManifest({ cacheRoot: path.join(tmp, 'sync-a'), remote, records: [
    { name: 'tdd', sourceRef: 'mattpocock/skills@tdd', origin: 'marketplace' }
  ] })
  assert.equal(pushed.ok, true)
  assert.equal(pushed.count, 1)
  const pulled = await core.pullManifest({ cacheRoot: path.join(tmp, 'sync-b'), remote })
  assert.equal(pulled.skills[0].install, 'mattpocock/skills@tdd')
  const connected = await core.testRemote({ remote })
  assert.equal(connected.ok, true)
}

await fsp.rm(tmp, { recursive: true, force: true })
console.log('core tests: all assertions passed')
