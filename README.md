# dsh-skills-butler（技能管家）

[English](README.en.md) | 中文

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
[![](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

**DeepSeek Harness 设置页里的技能管家**：发现、安装、管理、体检本机的 Agent 技能。复用 [`npx skills`](https://skills.sh) CLI 与市场生态，不自建市场。

## 为什么做这个插件

Agent 技能（SKILL.md）现在散落在多处：`~/.agents/skills/`、`~/.claude/skills/`、`~/.codex/skills/`、项目级 `.agents/skills/`，有的来自 skills.sh 市场、有的是 git 克隆、有的是手工放置的软链。DSH 内置的技能注册表负责"加载给模型用"，但人不清楚：

- 机器上到底装了多少技能、都在哪、是谁装的；
- 哪些技能有问题（缺 SKILL.md、frontmatter 非法、软链失效、同名冲突）；
- 市场里的技能敢不敢装（安装量、来源声誉）；
- 更新/删除前先备份，出事能回滚。

本插件把这一层"人可见、可管、可恢复"的能力补进 DSH 设置页。

## 功能

| 能力 | 说明 |
|---|---|
| 无损盘点 | 自动探测 agents.md 标准（`~/.agents/skills`、项目级）与 Claude/Codex/Cursor 等约定目录；首次运行扫描建档，无法判定来源的一律标记 `foreign`，一条不丢、不改 |
| 列表管理 | 名称/来源/作用域/归属 agent/加载状态/置顶；组合过滤；全局启停对所有会话立即生效，项目启停只影响所属项目；均不移动技能文件，无需重启。加载状态按技能文件存在与启停状态判断，不随当前会话切换 |
| 清单同步 | 默认展示远端清单与操作，配置进入独立设置页；推送按名称做远端优先的增量合并，只新增缺失项、不覆盖同名来源；拉取只安装本地缺失项，已存在项明确跳过；无效远端清单拒绝覆盖 |
| 详情抽屉 | SKILL.md 预览（懒加载）、frontmatter 解析、健康报告、可用备份与一键回滚 |
| 市场安装 | `npx skills find` 搜索 skills.sh，显示安装量/来源；安装量 < 100 醒目提示"社区验证不足"；锁文件由官方 CLI 处理 |
| 软链管理 | 添加/断开/转正（materialize）软链；目标必须含 SKILL.md，拒绝 `..`/根目录/不存在目标；Windows 无权限时降级 junction/拷贝并明确提示 |
| 一键体检 | frontmatter 合法性、SKILL.md 缺失、空目录、失效软链分级报告；重名和项目覆盖仅作提示，不计警告；修复一律先预览 diff 再确认 |
| 更新与备份 | 更新前自动备份到 `~/.dsh/dsh-skills/backups/<name>@<ts>/`，保留策略默认每技能 10 份/30 天，可回滚 |
| 多语言界面 | 跟随 DSH 语言设置，支持中文、English、日本語、Español、Français、Deutsch、Русский、Português；区域代码自动归一化，动态切换无需重开面板 |
| 操作日志 | `logs.jsonl` 记录全部操作，面板可查，支持撤销最近一步（软移除/恢复/链接类） |
| CLI 降级 | node/npx 不可用时面板明确降级：市场安装/更新不可用，本地管理照常 |

共享目录纪律：`installedBy=foreign` 的技能真移除前加强提示"非本插件安装"；**任何情况下不擅自修改技能内容**。

## 安装

```sh
# 从 npm（发布后）
dsh plugin --profile desktop add dsh-skills-butler

# 从 GitHub
dsh plugin --profile desktop add github:lengfengng-tech/dsh-skills-butler

# 本地目录
dsh plugin --profile desktop add ./dsh-skills-butler
```

或 DSH 插件页「添加插件」粘贴地址。安装后打开 **设置 → 技能**。

## 前提条件

- 已安装 DSH（DeepSeek Harness）桌面端或 Web 端；
- 本机已安装 Node.js ≥ 22.13，且 `npm` / `npx` 可用；
- 市场搜索、安装与升级依赖 `npx skills`，git 来源技能依赖 `git`；
- 缺少 Node/npm 时本地盘点、启停、软链、体检仍可用，市场安装会明确提示降级。

## 架构

```
dsh-skills-butler/
├── core/                    # 零 DSH 依赖，可独立 npm test
│   ├── paths.js             #   目录发现（agents.md 标准 + 各 agent 约定 + 自定义）
│   ├── inventory.js         #   盘点/对账（身份=name+liveRoot，启停不丢不重）
│   ├── frontmatter.js       #   SKILL.md frontmatter 解析（无第三方依赖）
│   ├── health.js            #   体检与分级报告
│   ├── ops.js               #   启停/移除/软链/转正（含逃逸校验）
│   ├── backup.js            #   备份/回滚/保留策略
│   ├── store.js             #   state.json 原子写 + watcher + 并发合并
│   └── skills-cli.js        #   npx skills 封装（解析/降级/锁文件门禁）
├── dsh/                     # DSH 适配层
│   ├── index.js             #   cordis 入口（inject agents，首启盘点）
│   ├── manager.js           #   core 编排 + live Agent 单项技能启停
│   └── routes.js            #   /dsh-skills/api/*（connection 信任门）
└── client/client.js         # 设置页「技能」section（Codex 风格：筛选/搜索/列表/详情抽屉）
```

数据流：浏览器面板 → 同源 `/dsh-skills/api/*`（DSH Connection 认证）→ SkillsManager → core（文件系统）→ `~/.dsh/dsh-skills/state.json`。

## 配置

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `home` | `os.homedir()` | 家目录（测试注入用） |
| `projectRoot` | 跟随当前会话 cwd | 项目级技能根 |
| `customRoots` | `[]` | 额外自定义目录 |
| `retentionMaxPerSkill` | `10` | 每技能保留备份份数 |
| `retentionMaxAgeDays` | `30` | 备份保留天数 |

## 开发与测试

```sh
npm test            # core 层测试（不需要 DSH）
node scripts/host-smoke.mjs   # DSH 适配层冒烟（沙箱 DSH_HOME）
```

## 兼容

DSH 0.2.1-rc.5+。纯 JavaScript，无构建步骤；插件自身无运行时依赖，Node/npm 仅用于 DSH 与市场安装能力。

## 许可证

[MIT](LICENSE)。社区插件，非 DeepSeek 官方产品；命名遵循 [DSH 品牌指南](https://github.com/deepseek-ai/deepseek-harness/blob/main/BRAND_GUIDELINES.zh.md)。
