# dsh-skills-console

[中文](README.zh.md) | English

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
[![npm version](https://img.shields.io/npm/v/dsh-skills-console?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/dsh-skills-console)
[![](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

**A skill console inside DeepSeek Harness settings**: discover, install, manage, and health-check the agent skills on this machine. Built on the [`npx skills`](https://skills.sh) CLI and market ecosystem — no self-hosted marketplace.

## Why

Agent skills (SKILL.md) live scattered across `~/.agents/skills/`, `~/.claude/skills/`, `~/.codex/skills/`, and project-level `.agents/skills/` — some from the skills.sh market, some git clones, some hand-placed symlinks. The built-in DSH skill registry loads skills for models, but a human cannot see:

- how many skills exist, where, and who installed them;
- which are broken (missing SKILL.md, invalid frontmatter, dead symlinks, name conflicts);
- whether a market skill is trustworthy (install counts, source reputation);
- backups and rollback before updates/removals.

This plugin adds the human-facing layer: visible, manageable, recoverable.

## Features

- **Lossless census** — discovers the agents.md standard plus Claude/Codex/Cursor conventions, then archives every skill on first run; unknown origins are marked `foreign`; nothing dropped or rewritten.
- **List management** — name/origin/scope/agent/loaded/pinned; combined filters. Global toggles apply to every session immediately; project toggles affect only their owning project. Neither moves skill files nor requires a restart. Loaded status reflects the skill file and toggle state, not the selected session.
- **Manifest sync** — a clean remote list with a separate settings view. Push merges incrementally by name, keeps the remote source for duplicates, and only adds missing entries. Pull installs only locally missing skills and explicitly skips existing ones. Invalid remote manifests are never overwritten.
- **Detail drawer** — lazy SKILL.md preview, frontmatter parse, health report, backups with one-click rollback.
- **Market install** — `npx skills find` against skills.sh with install counts; < 100 installs triggers a weak-validation warning; lockfiles are handled by the official CLI.
- **Symlinks** — add/detach/materialize; targets must contain SKILL.md; `..`/root/missing rejected; Windows degrades to junction/copy with an explicit note.
- **Health check** — frontmatter validity, missing SKILL.md, empty dirs and dead symlinks are graded; duplicate names and project shadowing are informational, not warnings. Every fix is previewed before applying.
- **Update & backup** — pre-update backups to `~/.dsh/dsh-skills/backups/<name>@<ts>/`; retention 10 per skill / 30 days (configurable); rollback supported.
- **Eight-language UI** — follows the DSH language setting: Chinese, English, Japanese, Spanish, French, German, Russian, and Portuguese; regional locale normalization and live switching without reopening the panel.
- **Operation log** — `logs.jsonl` for every op, viewable in the panel, with undo for the latest reversible step.
- **Graceful CLI degradation** — without node/npx the panel says so; local management keeps working.

Shared-directory discipline: real removal of `installedBy=foreign` skills shows an extra warning; **skill content is never modified without a confirmed preview**.

## Install

```sh
dsh plugin --profile desktop add dsh-skills-console
# or
dsh plugin --profile desktop add github:lengfengng-tech/dsh-skills-console
# or local
dsh plugin --profile desktop add ./dsh-skills-console
```

Then open **Settings → Skills**.

## Prerequisites

- DSH (DeepSeek Harness) desktop or web is installed;
- Node.js ≥ 22.13 with `npm` / `npx` on PATH;
- `npx skills` powers market search/install/update, and git-backed skills need `git`;
- without Node/npm the local census, toggles, symlinks, and health checks still work; market installs degrade with an explicit notice.

## Architecture

```
dsh-skills-console/
├── core/                    # zero DSH deps, independently testable (npm test)
│   ├── paths.js             #   root discovery (agents.md + agent conventions + custom)
│   ├── inventory.js         #   census/reconcile (identity=name+liveRoot)
│   ├── frontmatter.js       #   SKILL.md frontmatter parser (no dependencies)
│   ├── health.js            #   health checks + graded report
│   ├── ops.js               #   enable/disable/remove/link/materialize (escape-safe)
│   ├── backup.js            #   backup/rollback/retention
│   ├── store.js             #   state.json atomic writes + watcher + merge-on-write
│   └── skills-cli.js        #   npx skills wrapper (parsers/degradation/lockfile gate)
├── dsh/                     # DSH adapter
│   ├── index.js             #   cordis entry (first-run census on boot)
│   ├── manager.js           #   orchestrates core; per-Agent runtime skill toggles
│   └── routes.js            #   /dsh-skills/api/* behind the connection trust gate
└── client/client.js         # settings「Skills」section (filters/search/list/drawer)
```

Data flow: panel → same-origin `/dsh-skills/api/*` (DSH-authenticated) → SkillsManager → core (filesystem) → `~/.dsh/dsh-skills/state.json`.

## Config

| Field | Default | Meaning |
|---|---|---|
| `home` | `os.homedir()` | home directory (tests inject a sandbox) |
| `projectRoot` | follows session cwd | project-level skill root |
| `customRoots` | `[]` | extra discovery roots |
| `retentionMaxPerSkill` | `10` | backups kept per skill |
| `retentionMaxAgeDays` | `30` | backup age cap |

## Development

```sh
npm test                      # core tests (no DSH required)
node scripts/host-smoke.mjs   # adapter smoke with sandboxed DSH_HOME
```

## Compatibility

DSH 0.2.1-rc.5+. Plain JavaScript, no build step; the plugin has no runtime dependencies, while Node/npm are required by DSH itself and by market installs.

## License

[MIT](LICENSE). Community plugin, not an official DeepSeek product; naming follows the [DSH brand guidelines](https://github.com/deepseek-ai/deepseek-harness/blob/main/BRAND_GUIDELINES.md).
