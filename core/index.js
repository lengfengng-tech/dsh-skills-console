// core/index.js — barrel for the DSH-free core. Import this from tests and
// from the DSH adapter; nothing here may touch cordis/DSH services.

export { discoverRoots, liveRoots, AGENT_CONVENTIONS } from './paths.js'
export { parseFrontmatter, serializeFrontmatter } from './frontmatter.js'
export { SkillStore, normalizeState, normalizeSkill, mergeStates, defaultState, SKILL_NAME_PATTERN } from './store.js'
export { scanRoot, scanDisabledRoot, reconcile, annotateCollisions, peekSkill, readSkillBody } from './inventory.js'
export { checkSkill, healthReport, previewFix } from './health.js'
export { disableSkill, enableSkill, removeSkill, linkSkill, unlinkSkill, materializeSkill, validateLinkTarget, stageExport, OpError } from './ops.js'
export { backupSkill, rollbackSkill, pruneBackups, listBackups, DEFAULT_RETENTION } from './backup.js'
export { SkillsCli, cliEnvironment, parseListOutput, parseFindOutput } from './skills-cli.js'
export { manifestFromRecords, parseManifest, mergeManifests, pushManifest, pullManifest, SyncError, MANIFEST_FILE, MANIFEST_VERSION, validateRemotes, testRemote, redact } from './sync.js'
export { Marketplace, DEFAULT_SOURCES, validateSources } from './market.js'
