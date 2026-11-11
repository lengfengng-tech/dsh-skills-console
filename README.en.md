# dsh-skills-butler

[中文](README.md) | English

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
[![](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

**A skill butler inside DeepSeek Harness settings**: discover, install, manage, and health-check the agent skills on this machine. Built on the [`npx skills`](https://skills.sh) CLI and market ecosystem — no self-hosted marketplace.

## Why

Agent skills (SKILL.md) live scattered across `~/.agents/skills/`, `~/.claude/skills/`, `~/.codex/skills/`, and project-level `.agents/skills/` — some from the skills.sh market, some git clones, some hand-placed symlinks. The built-in DSH skill registry loads skills for models, but a human cannot see:

- how many skills exist, where, and who installed them;
- which are broken (missing SKILL.md, invalid frontmatter, dead symlinks, name conflicts);
- whether a market skill is trustworthy (install counts, source reputation);
- backups and rollback before updates/removals.

This plugin adds the human-facing layer: visible, manageable, recoverable.

## Features

- **Adaptive root discovery** — agents.md standard + Claude/Codex/Cursor conventions + custom roots; missing dirs show "not found" instead of erroring.
- **Lossless census** — first run archives every discovered skill; unknown origins are marked `foreign`; nothing dropped or rewritten.
- **List management** — name/origin/scope/agent/loaded/pinned; combined filters. Global toggles apply to every session immediately; project toggles affect only their owning project. Neither moves skill files nor requires a restart. Loaded status reflects the skill file and toggle state, not the selected session.
- **Manifest sync** — a clean remote list with push/pull by default; adding or editing a remote opens a dedicated settings view. Supports GitHub/Gitee/GitLab/self-hosted Git/local repositories and connection testing.
- **Detail drawer** — lazy SKILL.md preview, frontmatter parse, health report, backups with one-click rollback.
- **Market install** — `npx skills find` against skills.sh with install counts; < 100 installs triggers a weak-validation warning; lockfiles are handled by the official CLI.
- **Symlinks** — add/detach/materialize; targets must contain SKILL.md; `..`/root/missing rejected; Windows degrades to junction/copy with an explicit note.
- **Health check** — frontmatter validity, missing SKILL.md, empty dirs and dead symlinks are graded; duplicate names and project shadowing are informational, not warnings. Every fix is previewed before applying.
- **Update & backup** — pre-update backups to `~/.dsh/dsh-skills/backups/<name>@<ts>/`; retention 10 per skill / 30 days (configurable); rollback supported.
- **Operation log** — `logs.jsonl` for every op, viewable in the panel, with undo for the latest reversible step.
- **Graceful CLI degradation** — without node/npx the panel says so; local management keeps working.

Shared-directory discipline: real removal of `installedBy=foreign` skills shows an extra warning; **skill content is never modified without a confirmed preview**.

## Install

```sh
dsh plugin --profile desktop add dsh-skills-butler
# or
dsh plugin --profile desktop add github:lengfengng-tech/dsh-skills-butler
# or local
dsh plugin --profile desktop add ./dsh-skills-butler
```

Then open **Settings → Skills**.

## Architecture

```
dsh-skills-butler/
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

Research conclusions (verified 2026-11-05 against DSH 0.2.1-rc.5):

- `npx skills` supports `add/remove/list/find/update/init/sync`; **there is no `check` command** — update checks compare git remotes instead;
- the reference plugin [dsh-mcp-tools](https://github.com/hxlog/dsh-mcp-tools) validated the `webServer.register` route + connection trust gate + atomic store pattern reused here;
- DSH host APIs used: `webServer.register`, `connection.requestRejection`, per-Agent `ctx.skills.register` (individual toggles with immediate cache invalidation on register/dispose), `agents.list`, `agent/created`/`agent/disposed`, `ctx.effect`/`ctx.inject`, `settings.section` slot. Loaded status comes from the filesystem inventory and toggle state rather than a session catalog.

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

Milestones: M1 core+census → M2 panel → M3 operations → M4 health/backup/CLI → M5 polish.

## Compatibility

DSH 0.2.1-rc.5+ (Node ≥ 22.13). Plain JavaScript, no build step.

## License

[MIT](LICENSE). Community plugin, not an official DeepSeek product; naming follows the [DSH brand guidelines](https://github.com/deepseek-ai/deepseek-harness/blob/main/BRAND_GUIDELINES.md).
