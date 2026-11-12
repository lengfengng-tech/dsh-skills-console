/**
 * Browser half of dsh-skills-butler — VANILLA DOM EDITION.
 *
 * Lesson learned the hard way: every React tree in this page (the settings
 * slot tree, and even our own createRoot) had its DOM yanked by the shell's
 * reconciler mid-commit. The panel therefore renders with direct DOM APIs
 * into a self-owned container. No React fibers above our nodes means nobody
 * can unmount us. React is still consumed for nothing here on purpose.
 *
 * Surfaces:
 *   - settings.section slot: an invisible sentinel keeps the nav entry alive.
 *   - The panel itself: self-owned fixed-position host, re-aligned over the
 *     settings content column every 500ms while settings is open.
 */
window.__ModuleLoader__.load({
  id: 'dsh-skills-butler',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports

    var NS = 'skillsButler'
    var SECTION_ID = 'skills-butler'
    var API = '/dsh-skills/api'
    var DIAG_KEY = 'skb.diag.v1'

    // ------------------------------------------------------------------
    // Diagnostics channel (localStorage -> leveldb, read offline).
    // ------------------------------------------------------------------
    function diag(stage, extra) {
      try {
        var raw = window.localStorage.getItem(DIAG_KEY)
        var list = raw ? JSON.parse(raw) : []
        list.push({ stage: stage, at: Date.now(), extra: extra === undefined ? null : String(extra).slice(0, 400) })
        window.localStorage.setItem(DIAG_KEY, JSON.stringify(list.slice(-80)))
      } catch (e) { /* diagnostics never break the panel */ }
    }
    diag('factory-vanilla')
    try {
      window.addEventListener('error', function (e) {
        diag('window-error', (e.message || 'err') + ' @ ' + (e.filename || '').split('/').pop() + ':' + e.lineno)
      })
      window.addEventListener('unhandledrejection', function (e) {
        diag('unhandled-rejection', (e.reason && e.reason.message) || String(e.reason))
      })
      var origErr = console.error.bind(console)
      console.error = function () {
        try {
          diag('console-error', Array.prototype.map.call(arguments, function (a) { return (a && a.message) || String(a) }).join(' | ').slice(0, 400))
        } catch (e) { /* noop */ }
        origErr.apply(null, arguments)
      }
      var origLog = console.log.bind(console)
      console.log = function () {
        try {
          var text = Array.prototype.map.call(arguments, function (a) { return (a && a.message) || String(a) }).join(' ')
          if (text.indexOf('[skills-butler]') >= 0) diag('console-log', text.slice(0, 300))
        } catch (e) { /* noop */ }
        origLog.apply(null, arguments)
      }
    } catch (e) { /* never break */ }

    // ------------------------------------------------------------------
    // i18n
    // ------------------------------------------------------------------
    var DICT = {
  "zh": {
    "action.add": "添加",
    "action.health": "体检",
    "action.logs": "日志",
    "action.pickDirectory": "选择文件夹",
    "action.refresh": "刷新",
    "action.roots": "浏览目录",
    "action.sync": "GitHub 同步",
    "action.undo": "撤销上一步",
    "add.external": "从其他 Agent 引入",
    "add.local": "链接本地目录",
    "add.market": "从市场安装",
    "add.root": "添加自定义目录",
    "b.add.github.source": "新增 GitHub 来源",
    "b.add.remote": "添加远端",
    "b.add.remote.2": "＋ 添加远端",
    "b.back.to.sync": "← 返回同步",
    "b.cancel": "取消",
    "b.configure.sources": "来源配置",
    "b.credentials.saved": "已配置凭据",
    "b.custom.git": "自定义 Git",
    "b.delete": "删除",
    "b.delete.this.remote.configuration": "删除这个远端配置？",
    "b.downloads": "按下载量",
    "b.edit.remote": "编辑远端",
    "b.enter.a.remote.url": "请填写远端地址",
    "b.enter.a.skill.keyword": "请输入技能关键词",
    "b.existing.skipped": "已存在 · 跳过",
    "b.filter.by.author": "作者筛选",
    "b.github.query.filter.e.g.topic.skills": "GitHub 搜索限定（如 topic:skills）",
    "b.gitlab.self.hosted": "GitLab/公司内网",
    "b.hide.sources": "收起来源配置",
    "b.install.all.missing": "安装全部新增",
    "b.install.failed": "安装失败",
    "b.installed.now": "本次已安装",
    "b.local.file": "本地 file://",
    "b.missing": "待安装",
    "b.name": "按名称",
    "b.new.source.name": "新来源名称",
    "b.no.additions": "无新增",
    "b.no.directory.selected.or.picker.unavailable": "未选择目录或当前环境不支持目录选择器",
    "b.no.remotes.yet.add.one.to.push.or.pull.your.skil": "还没有远端。添加后即可推送或拉取技能清单。",
    "b.password.token.stored.locally.only": "密码/Token（仅本机保存）",
    "b.pull.selected": "拉取所选",
    "b.push.selected": "推送所选",
    "b.pushed.additions": "已增量推送",
    "b.recently.updated": "按最近更新",
    "b.refreshing": "刷新中…",
    "b.remote.deleted": "远端已删除",
    "b.remote.name": "远端名称",
    "b.remote.settings.saved": "远端设置已保存",
    "b.save.settings": "保存设置",
    "b.save.sources": "保存来源配置",
    "b.search.skills.by.keyword.e.g.mcp.tests.browser": "输入技能关键词，如 mcp、测试、浏览器",
    "b.searching": "正在搜索，请稍候…",
    "b.settings": "设置",
    "b.skillhub.installation.guide": "SkillHub 安装说明（官方）",
    "b.skills": "技能",
    "b.skip.tls.verification.for.self.signed.certificat": " 内网自签名证书时跳过 TLS 校验（谨慎）",
    "b.sources.saved": "来源配置已保存",
    "b.stars": "按星标",
    "b.sync.remotes": "同步远端",
    "b.sync.settings": "同步设置",
    "b.test.connection": "测试连接",
    "b.unversioned": "未标注",
    "b.username.optional": "用户名（可选）",
    "b.using.local.git.ssh.credentials": "使用本机 git/SSH 凭据",
    "busy": "处理中…",
    "cli.unavailable": "skills CLI 不可用：{{reason}}。市场安装/更新已降级，本地管理不受影响。",
    "confirm.cancel": "取消",
    "confirm.ok": "确认执行",
    "confirm.remove": "真移除会删除目录 {{dir}}。此操作不可直接撤销。",
    "confirm.removeForeign": "⚠️ 非本插件安装的技能。{{warning}}",
    "confirm.title": "确认操作",
    "disabled.badge": "已停用",
    "drawer.export": "导出",
    "drawer.materialize": "转正为实体目录",
    "drawer.pin": "置顶",
    "drawer.rollback": "回滚此备份",
    "drawer.uninstall": "卸载",
    "drawer.unlink": "断开软链",
    "drawer.unpin": "取消置顶",
    "drawer.update": "升级",
    "drawer.updateUnsupported": "该来源不支持检查升级",
    "external.empty": "没有可引入的其他 Agent 技能",
    "external.import": "引入",
    "external.title": "从其他 Agent 引入到 DSH",
    "filter.agent": "目录",
    "filter.agent.all": "全部",
    "filter.origin": "来源",
    "filter.origin.all": "全部",
    "foreign.badge": "非本插件安装",
    "foreign.warning": "该技能不是由本插件安装的（共享目录）。真移除会删除其目录，请先确认影响范围。",
    "health.error": "错误",
    "health.loadable": "可加载",
    "health.ok": "正常",
    "health.title": "一键体检",
    "health.warn": "警告",
    "http.emptyResponse": "空响应",
    "issue.broken-symlink": "软链失效",
    "issue.empty-dir": "空目录",
    "issue.frontmatter": "frontmatter 语法问题",
    "issue.frontmatter-missing-description": "frontmatter 缺少 description",
    "issue.frontmatter-missing-name": "frontmatter 缺少 name",
    "issue.frontmatter-name-mismatch": "frontmatter name 与目录名不一致",
    "issue.invalid-name": "名称非法",
    "issue.missing-skill-md": "缺少 SKILL.md",
    "issue.name-conflict": "存在同名冲突",
    "issue.shadowed-by-project": "被同名项目级技能覆盖",
    "issue.unreadable": "目录不可读",
    "list.empty": "没有匹配的技能",
    "list.error": "加载失败",
    "list.loading": "盘点中…",
    "loaded.no": "未加载",
    "loaded.yes": "已加载",
    "local.copyFallback": "Windows 无软链权限时降级为拷贝，并在结果中提示。",
    "local.name": "技能名（留空取目录名）",
    "local.submit": "创建软链",
    "local.target": "目标目录（需包含 SKILL.md）",
    "local.title": "链接本地技能目录",
    "logs.empty": "暂无操作记录",
    "logs.title": "操作日志",
    "market.authorSource": "作者 {author} · 来源 {source}",
    "market.empty": "没有匹配结果",
    "market.install": "安装",
    "market.installFailed": "安装失败",
    "market.installed": "{ref} 已安装",
    "market.installing": "安装中…",
    "market.lockfile": "检测到 skills-lock.json：安装会通过 skills CLI 按锁定规则处理，不会绕过或手工修改锁文件。",
    "market.lowTrust": "社区验证不足（安装量 < 100）：请确认来源可信后再安装。",
    "market.officialSource": "skills.sh（官方）",
    "market.query": "搜索技能（skills.sh）",
    "market.search": "搜索",
    "market.searchFailed": "搜索失败",
    "market.title": "市场搜索",
    "market.versionUpdated": " · 版本 {version} · 更新 {updated}",
    "meta.agent": "归属",
    "meta.dir": "目录",
    "meta.installedBy": "安装者",
    "meta.linked": "链接目标",
    "meta.mtime": "更新时间",
    "meta.origin": "来源",
    "meta.scope": "作用域",
    "meta.source": "来源引用",
    "meta.status": "状态",
    "nav": "技能",
    "notice.undoNone": "没有可撤销的操作。",
    "notice.undoOk": "已撤销。",
    "origin.builtin": "内置",
    "origin.git": "Git",
    "origin.manual": "本地",
    "origin.marketplace": "市场",
    "origin.symlink": "软链",
    "panel.subtitle": "只展示 DSH 可使用的本地技能；从其他 Agent 引入时通过软链接入，并标记来源。",
    "panel.title": "技能",
    "refresh.failure": "刷新失败：{message}",
    "refresh.success": "刷新成功：扫描 {scanned} 条记录，DSH 可管理 {count} 个技能",
    "roots.custom": "自定义",
    "roots.empty": "未探测到目录",
    "roots.missing": "未找到",
    "roots.readonly": "只读",
    "roots.title": "技能目录",
    "scope.global": "全局",
    "scope.project": "项目",
    "search.placeholder": "搜索技能",
    "section.backups": "可用备份",
    "section.health": "健康报告",
    "section.preview": "SKILL.md 预览",
    "section.sources": "同名来源（全部地址）",
    "shadowed.badge": "被项目级覆盖",
    "source.externalPrefix": "来自 ",
    "sources.count": "{count} 个来源",
    "status.enabled": "已启用",
    "switch.disable": "停用",
    "switch.enable": "启用",
    "sync.empty": "清单中没有可下载的技能",
    "sync.install": "安装",
    "sync.installSummary": "增量安装：新增 {installed}，跳过 {skipped}，失败 {failed}",
    "sync.note": "只同步名称、下载地址和来源，不上传技能文件内容；推送只在你点击时发生。",
    "sync.pull": "拉取清单",
    "sync.pullSummary": "{name} · 新增 {missing} · 已存在跳过 {existing}",
    "sync.push": "推送清单",
    "sync.pushSummary": "{status} · 新增 {added} · 保留同名 {kept} · 共 {count}",
    "sync.repo": "个人仓库（owner/repo）",
    "sync.title": "同步技能清单",
    "tab.all": "全部",
    "tab.disabled": "已停用",
    "tab.global": "全局",
    "tab.project": "项目",
    "tab.warn": "有警告",
    "time.never": "—"
  },
  "en": {
    "action.add": "Add",
    "action.health": "Health check",
    "action.logs": "Logs",
    "action.pickDirectory": "Choose folder",
    "action.refresh": "Refresh",
    "action.roots": "Browse roots",
    "action.sync": "GitHub sync",
    "action.undo": "Undo last",
    "add.external": "Import from another agent",
    "add.local": "Link local directory",
    "add.market": "Install from market",
    "add.root": "Add custom root",
    "b.add.github.source": "Add GitHub source",
    "b.add.remote": "Add remote",
    "b.add.remote.2": "＋ Add remote",
    "b.back.to.sync": "← Back to sync",
    "b.cancel": "Cancel",
    "b.configure.sources": "Configure sources",
    "b.credentials.saved": "Credentials saved",
    "b.custom.git": "Custom Git",
    "b.delete": "Delete",
    "b.delete.this.remote.configuration": "Delete this remote configuration?",
    "b.downloads": "Downloads",
    "b.edit.remote": "Edit remote",
    "b.enter.a.remote.url": "Enter a remote URL",
    "b.enter.a.skill.keyword": "Enter a skill keyword",
    "b.existing.skipped": "Existing · skipped",
    "b.filter.by.author": "Filter by author",
    "b.github.query.filter.e.g.topic.skills": "GitHub query filter (e.g. topic:skills)",
    "b.gitlab.self.hosted": "GitLab / self-hosted",
    "b.hide.sources": "Hide sources",
    "b.install.all.missing": "Install all missing",
    "b.install.failed": "Install failed",
    "b.installed.now": "Installed now",
    "b.local.file": "Local file://",
    "b.missing": "Missing",
    "b.name": "Name",
    "b.new.source.name": "New source name",
    "b.no.additions": "No additions",
    "b.no.directory.selected.or.picker.unavailable": "No directory selected or picker unavailable",
    "b.no.remotes.yet.add.one.to.push.or.pull.your.skil": "No remotes yet. Add one to push or pull your skill manifest.",
    "b.password.token.stored.locally.only": "Password/token (stored locally only)",
    "b.pull.selected": "Pull selected",
    "b.push.selected": "Push selected",
    "b.pushed.additions": "Pushed additions",
    "b.recently.updated": "Recently updated",
    "b.refreshing": "Refreshing…",
    "b.remote.deleted": "Remote deleted",
    "b.remote.name": "Remote name",
    "b.remote.settings.saved": "Remote settings saved",
    "b.save.settings": "Save settings",
    "b.save.sources": "Save sources",
    "b.search.skills.by.keyword.e.g.mcp.tests.browser": "Search skills by keyword, e.g. mcp, tests, browser",
    "b.searching": "Searching…",
    "b.settings": "Settings",
    "b.skillhub.installation.guide": "SkillHub installation guide",
    "b.skills": "Skills",
    "b.skip.tls.verification.for.self.signed.certificat": " Skip TLS verification for self-signed certificates (careful)",
    "b.sources.saved": "Sources saved",
    "b.stars": "Stars",
    "b.sync.remotes": "Sync remotes",
    "b.sync.settings": "Sync settings",
    "b.test.connection": "Test connection",
    "b.unversioned": "unversioned",
    "b.username.optional": "Username (optional)",
    "b.using.local.git.ssh.credentials": "Using local git/SSH credentials",
    "busy": "Working…",
    "cli.unavailable": "skills CLI unavailable: {{reason}}. Market install/update degraded; local management keeps working.",
    "confirm.cancel": "Cancel",
    "confirm.ok": "Confirm",
    "confirm.remove": "Removal deletes {{dir}}. It cannot be undone directly.",
    "confirm.removeForeign": "⚠️ Not installed by this plugin. {{warning}}",
    "confirm.title": "Confirm",
    "disabled.badge": "disabled",
    "drawer.export": "Export",
    "drawer.materialize": "Materialize copy",
    "drawer.pin": "Pin",
    "drawer.rollback": "Rollback to this",
    "drawer.uninstall": "Uninstall",
    "drawer.unlink": "Unlink",
    "drawer.unpin": "Unpin",
    "drawer.update": "Upgrade",
    "drawer.updateUnsupported": "Updates unavailable for this origin",
    "external.empty": "No importable skills from other agents",
    "external.import": "Import",
    "external.title": "Import another agent’s skills into DSH",
    "filter.agent": "目录",
    "filter.agent.all": "All",
    "filter.origin": "Origin",
    "filter.origin.all": "All",
    "foreign.badge": "foreign",
    "foreign.warning": "This skill was not installed by this plugin (shared directory). Real removal deletes its directory — confirm the impact first.",
    "health.error": "Errors",
    "health.loadable": "Loadable",
    "health.ok": "OK",
    "health.title": "Health check",
    "health.warn": "Warnings",
    "http.emptyResponse": "Empty response",
    "issue.broken-symlink": "Broken symlink",
    "issue.empty-dir": "Empty directory",
    "issue.frontmatter": "frontmatter syntax",
    "issue.frontmatter-missing-description": "frontmatter missing description",
    "issue.frontmatter-missing-name": "frontmatter missing name",
    "issue.frontmatter-name-mismatch": "frontmatter name differs from directory",
    "issue.invalid-name": "Invalid name",
    "issue.missing-skill-md": "Missing SKILL.md",
    "issue.name-conflict": "Name conflict",
    "issue.shadowed-by-project": "Shadowed by a project skill",
    "issue.unreadable": "Unreadable directory",
    "list.empty": "No matching skills",
    "list.error": "Failed to load",
    "list.loading": "Inventory…",
    "loaded.no": "Not loaded",
    "loaded.yes": "Loaded",
    "local.copyFallback": "On Windows without link privilege this degrades to a copy, noted in the result.",
    "local.name": "Skill name (defaults to directory name)",
    "local.submit": "Create link",
    "local.target": "Target directory (must contain SKILL.md)",
    "local.title": "Link a local skill directory",
    "logs.empty": "No operations yet",
    "logs.title": "Operation log",
    "market.authorSource": "Author {author} · Source {source}",
    "market.empty": "No results",
    "market.install": "Install",
    "market.installFailed": "Install failed",
    "market.installed": "{ref} installed",
    "market.installing": "Installing…",
    "market.lockfile": "skills-lock.json detected: installs run through the official CLI, which honors and updates the lockfile; it is never edited or bypassed here.",
    "market.lowTrust": "Weak community validation (< 100 installs): verify the source before installing.",
    "market.officialSource": "skills.sh (official)",
    "market.query": "Search skills (skills.sh)",
    "market.search": "Search",
    "market.searchFailed": "Search failed",
    "market.title": "Market search",
    "market.versionUpdated": " · Version {version} · Updated {updated}",
    "meta.agent": "Agent",
    "meta.dir": "Directory",
    "meta.installedBy": "Installed by",
    "meta.linked": "Link target",
    "meta.mtime": "Updated",
    "meta.origin": "Origin",
    "meta.scope": "Scope",
    "meta.source": "Source ref",
    "meta.status": "Status",
    "nav": "Skills",
    "notice.undoNone": "Nothing to undo.",
    "notice.undoOk": "Undone.",
    "origin.builtin": "Builtin",
    "origin.git": "Git",
    "origin.manual": "Local",
    "origin.marketplace": "Market",
    "origin.symlink": "Symlink",
    "panel.subtitle": "Only DSH-usable local skills; imports from other agents use symlinks and keep their source.",
    "panel.title": "Skills",
    "refresh.failure": "Refresh failed: {message}",
    "refresh.success": "Refreshed: {scanned} records, {count} DSH skills",
    "roots.custom": "custom",
    "roots.empty": "No directories discovered",
    "roots.missing": "not found",
    "roots.readonly": "read-only",
    "roots.title": "Skill roots",
    "scope.global": "Global",
    "scope.project": "Project",
    "search.placeholder": "Search skills",
    "section.backups": "Backups",
    "section.health": "Health report",
    "section.preview": "SKILL.md preview",
    "section.sources": "Same-name sources (all paths)",
    "shadowed.badge": "shadowed by project",
    "source.externalPrefix": "from ",
    "sources.count": "{count} sources",
    "status.enabled": "Enabled",
    "switch.disable": "Disable",
    "switch.enable": "Enable",
    "sync.empty": "No downloadable skills in this manifest",
    "sync.install": "Install",
    "sync.installSummary": "Incremental install: added {installed}, skipped {skipped}, failed {failed}",
    "sync.note": "Only names, download refs, and origins sync; skill files never upload. Push happens only when you click it.",
    "sync.pull": "Pull manifest",
    "sync.pullSummary": "{name} · missing {missing} · existing skipped {existing}",
    "sync.push": "Push manifest",
    "sync.pushSummary": "{status} · added {added} · kept same-name {kept} · total {count}",
    "sync.repo": "Personal repo (owner/repo)",
    "sync.title": "Sync skill manifest",
    "tab.all": "All",
    "tab.disabled": "Disabled",
    "tab.global": "Global",
    "tab.project": "Project",
    "tab.warn": "Warnings",
    "time.never": "—"
  },
  "ja": {
    "action.add": "追加",
    "action.health": "ヘルスチェック",
    "action.logs": "ログ",
    "action.pickDirectory": "フォルダーを選択",
    "action.refresh": "更新",
    "action.roots": "ルートを参照",
    "action.sync": "GitHub 同期",
    "action.undo": "元に戻す",
    "add.external": "他の Agent からインポート",
    "add.local": "ローカルディレクトリをリンク",
    "add.market": "マーケットからインストール",
    "add.root": "カスタムルートを追加",
    "b.add.github.source": "GitHub ソースを追加",
    "b.add.remote": "リモートを追加",
    "b.add.remote.2": "＋ リモートを追加",
    "b.back.to.sync": "← 同期に戻る",
    "b.cancel": "キャンセル",
    "b.configure.sources": "ソースを設定",
    "b.credentials.saved": "認証情報を保存しました",
    "b.custom.git": "カスタム Git",
    "b.delete": "削除",
    "b.delete.this.remote.configuration": "このリモート設定を削除しますか？",
    "b.downloads": "ダウンロード数",
    "b.edit.remote": "リモートを編集",
    "b.enter.a.remote.url": "リモート URL を入力",
    "b.enter.a.skill.keyword": "スキルのキーワードを入力",
    "b.existing.skipped": "既存・スキップ",
    "b.filter.by.author": "作者で絞り込み",
    "b.github.query.filter.e.g.topic.skills": "GitHub 検索フィルター（例: topic:skills）",
    "b.gitlab.self.hosted": "GitLab / セルフホスト",
    "b.hide.sources": "ソース設定を隠す",
    "b.install.all.missing": "不足分をすべてインストール",
    "b.install.failed": "インストールに失敗しました",
    "b.installed.now": "今回インストール済み",
    "b.local.file": "ローカル file://",
    "b.missing": "未インストール",
    "b.name": "名前",
    "b.new.source.name": "新しいソース名",
    "b.no.additions": "追加なし",
    "b.no.directory.selected.or.picker.unavailable": "ディレクトリが未選択、または選択ツールを利用できません",
    "b.no.remotes.yet.add.one.to.push.or.pull.your.skil": "リモートはまだありません。追加すると、スキルマニフェストをプッシュまたはプルできます。",
    "b.password.token.stored.locally.only": "パスワード/Token（このデバイスにのみ保存）",
    "b.pull.selected": "選択項目をプル",
    "b.push.selected": "選択項目をプッシュ",
    "b.pushed.additions": "追加分をプッシュしました",
    "b.recently.updated": "最近の更新順",
    "b.refreshing": "更新中…",
    "b.remote.deleted": "リモートを削除しました",
    "b.remote.name": "リモート名",
    "b.remote.settings.saved": "リモート設定を保存しました",
    "b.save.settings": "設定を保存",
    "b.save.sources": "ソース設定を保存",
    "b.search.skills.by.keyword.e.g.mcp.tests.browser": "スキルをキーワードで検索（例: mcp、テスト、ブラウザー）",
    "b.searching": "検索中…",
    "b.settings": "設定",
    "b.skillhub.installation.guide": "SkillHub インストールガイド（公式）",
    "b.skills": "スキル",
    "b.skip.tls.verification.for.self.signed.certificat": " 自己署名証明書では TLS 検証をスキップ（注意）",
    "b.sources.saved": "ソース設定を保存しました",
    "b.stars": "スター数",
    "b.sync.remotes": "リモートを同期",
    "b.sync.settings": "同期設定",
    "b.test.connection": "接続をテスト",
    "b.unversioned": "バージョン未指定",
    "b.username.optional": "ユーザー名（任意）",
    "b.using.local.git.ssh.credentials": "ローカルの git/SSH 認証情報を使用中",
    "busy": "処理中…",
    "cli.unavailable": "skills CLI を利用できません: {{reason}}。マーケットからのインストール・更新は機能が制限されますが、ローカル管理は引き続き使用できます。",
    "confirm.cancel": "キャンセル",
    "confirm.ok": "確認",
    "confirm.remove": "{{dir}} を削除します。この操作は直接元に戻せません。",
    "confirm.removeForeign": "⚠️ このプラグインでインストールされたものではありません。{{warning}}",
    "confirm.title": "操作の確認",
    "disabled.badge": "無効",
    "drawer.export": "エクスポート",
    "drawer.materialize": "実体ディレクトリに変換",
    "drawer.pin": "ピン留め",
    "drawer.rollback": "このバックアップに戻す",
    "drawer.uninstall": "アンインストール",
    "drawer.unlink": "リンクを解除",
    "drawer.unpin": "ピン留めを解除",
    "drawer.update": "アップグレード",
    "drawer.updateUnsupported": "このソースでは更新を確認できません",
    "external.empty": "他の Agent からインポートできるスキルはありません",
    "external.import": "インポート",
    "external.title": "他の Agent のスキルを DSH にインポート",
    "filter.agent": "ディレクトリ",
    "filter.agent.all": "すべて",
    "filter.origin": "ソース",
    "filter.origin.all": "すべて",
    "foreign.badge": "外部",
    "foreign.warning": "このスキルはこのプラグインでインストールされたものではなく、ディレクトリを共有しています。完全に削除するとそのディレクトリも削除されるため、事前に影響を確認してください。",
    "health.error": "エラー",
    "health.loadable": "読み込み可能",
    "health.ok": "正常",
    "health.title": "ヘルスチェック",
    "health.warn": "警告",
    "http.emptyResponse": "空の応答",
    "issue.broken-symlink": "壊れたシンボリックリンク",
    "issue.empty-dir": "空のディレクトリ",
    "issue.frontmatter": "frontmatter の構文",
    "issue.frontmatter-missing-description": "frontmatter に description がありません",
    "issue.frontmatter-missing-name": "frontmatter に name がありません",
    "issue.frontmatter-name-mismatch": "frontmatter の name がディレクトリ名と一致しません",
    "issue.invalid-name": "無効な名前",
    "issue.missing-skill-md": "SKILL.md がありません",
    "issue.name-conflict": "名前の競合",
    "issue.shadowed-by-project": "同名のプロジェクトスキルに隠されています",
    "issue.unreadable": "ディレクトリを読み取れません",
    "list.empty": "一致するスキルはありません",
    "list.error": "読み込みに失敗しました",
    "list.loading": "読み込み中…",
    "loaded.no": "未読み込み",
    "loaded.yes": "読み込み済み",
    "local.copyFallback": "Windows でリンク権限がない場合はコピーにフォールバックし、結果にその旨を表示します。",
    "local.name": "スキル名（省略時はディレクトリ名）",
    "local.submit": "リンクを作成",
    "local.target": "対象ディレクトリ（SKILL.md が必要）",
    "local.title": "ローカルのスキルディレクトリをリンク",
    "logs.empty": "操作履歴はまだありません",
    "logs.title": "操作ログ",
    "market.authorSource": "作者 {author} · ソース {source}",
    "market.empty": "結果なし",
    "market.install": "インストール",
    "market.installFailed": "インストールに失敗しました",
    "market.installed": "{ref} をインストールしました",
    "market.installing": "インストール中…",
    "market.lockfile": "skills-lock.json を検出: インストールには公式 CLI を使用し、ロックファイルに従って更新します。このプラグインがロックファイルを編集・回避することはありません。",
    "market.lowTrust": "コミュニティによる検証が不十分（インストール数 < 100）: インストール前にソースを確認してください。",
    "market.officialSource": "skills.sh（公式）",
    "market.query": "スキルを検索（skills.sh）",
    "market.search": "検索",
    "market.searchFailed": "検索に失敗しました",
    "market.title": "マーケット検索",
    "market.versionUpdated": " · バージョン {version} · 更新日 {updated}",
    "meta.agent": "Agent",
    "meta.dir": "ディレクトリ",
    "meta.installedBy": "インストール元",
    "meta.linked": "リンク先",
    "meta.mtime": "更新日時",
    "meta.origin": "ソース",
    "meta.scope": "スコープ",
    "meta.source": "ソース参照",
    "meta.status": "状態",
    "nav": "スキル",
    "notice.undoNone": "元に戻す操作はありません。",
    "notice.undoOk": "元に戻しました。",
    "origin.builtin": "組み込み",
    "origin.git": "Git",
    "origin.manual": "ローカル",
    "origin.marketplace": "マーケット",
    "origin.symlink": "シンボリックリンク",
    "panel.subtitle": "DSH で使用できるローカルスキルのみを表示します。他の Agent からのインポートはシンボリックリンクを使用し、ソースを保持します。",
    "panel.title": "スキル",
    "refresh.failure": "更新に失敗しました: {message}",
    "refresh.success": "更新完了: {scanned} 件をスキャン、DSH スキル {count} 件",
    "roots.custom": "カスタム",
    "roots.empty": "ディレクトリが見つかりません",
    "roots.missing": "見つかりません",
    "roots.readonly": "読み取り専用",
    "roots.title": "スキルルート",
    "scope.global": "グローバル",
    "scope.project": "プロジェクト",
    "search.placeholder": "スキルを検索",
    "section.backups": "バックアップ",
    "section.health": "ヘルスレポート",
    "section.preview": "SKILL.md プレビュー",
    "section.sources": "同名のソース（すべてのパス）",
    "shadowed.badge": "プロジェクトスキルに隠蔽",
    "source.externalPrefix": "提供元: ",
    "sources.count": "{count} 個のソース",
    "status.enabled": "有効",
    "switch.disable": "無効化",
    "switch.enable": "有効化",
    "sync.empty": "このマニフェストにダウンロード可能なスキルはありません",
    "sync.install": "インストール",
    "sync.installSummary": "差分インストール: 追加 {installed}、スキップ {skipped}、失敗 {failed}",
    "sync.note": "同期されるのは名前、ダウンロード参照、ソースのみで、スキルファイルはアップロードされません。プッシュはクリックした場合にのみ実行されます。",
    "sync.pull": "マニフェストをプル",
    "sync.pullSummary": "{name} · 未インストール {missing} · 既存をスキップ {existing}",
    "sync.push": "マニフェストをプッシュ",
    "sync.pushSummary": "{status} · 追加 {added} · 同名を保持 {kept} · 合計 {count}",
    "sync.repo": "個人リポジトリ（owner/repo）",
    "sync.title": "スキルマニフェストを同期",
    "tab.all": "すべて",
    "tab.disabled": "無効",
    "tab.global": "グローバル",
    "tab.project": "プロジェクト",
    "tab.warn": "警告あり",
    "time.never": "—"
  },
  "es": {
    "action.add": "Añadir",
    "action.health": "Comprobar estado",
    "action.logs": "Registros",
    "action.pickDirectory": "Elegir carpeta",
    "action.refresh": "Actualizar",
    "action.roots": "Explorar directorios raíz",
    "action.sync": "Sincronizar con GitHub",
    "action.undo": "Deshacer última acción",
    "add.external": "Importar desde otro Agent",
    "add.local": "Vincular directorio local",
    "add.market": "Instalar desde el mercado",
    "add.root": "Añadir raíz personalizada",
    "b.add.github.source": "Añadir fuente de GitHub",
    "b.add.remote": "Añadir remoto",
    "b.add.remote.2": "＋ Añadir remoto",
    "b.back.to.sync": "← Volver a la sincronización",
    "b.cancel": "Cancelar",
    "b.configure.sources": "Configurar fuentes",
    "b.credentials.saved": "Credenciales guardadas",
    "b.custom.git": "Git personalizado",
    "b.delete": "Eliminar",
    "b.delete.this.remote.configuration": "¿Eliminar esta configuración remota?",
    "b.downloads": "Descargas",
    "b.edit.remote": "Editar remoto",
    "b.enter.a.remote.url": "Introduce una URL remota",
    "b.enter.a.skill.keyword": "Introduce una palabra clave de habilidad",
    "b.existing.skipped": "Existente · omitida",
    "b.filter.by.author": "Filtrar por autor",
    "b.github.query.filter.e.g.topic.skills": "Filtro de búsqueda de GitHub (p. ej., topic:skills)",
    "b.gitlab.self.hosted": "GitLab / autoalojado",
    "b.hide.sources": "Ocultar fuentes",
    "b.install.all.missing": "Instalar todas las que faltan",
    "b.install.failed": "Error al instalar",
    "b.installed.now": "Instaladas ahora",
    "b.local.file": "file:// local",
    "b.missing": "No instalada",
    "b.name": "Nombre",
    "b.new.source.name": "Nombre de la nueva fuente",
    "b.no.additions": "Sin novedades",
    "b.no.directory.selected.or.picker.unavailable": "No se seleccionó ningún directorio o el selector no está disponible",
    "b.no.remotes.yet.add.one.to.push.or.pull.your.skil": "Aún no hay remotos. Añade uno para enviar o recibir tu manifiesto de habilidades.",
    "b.password.token.stored.locally.only": "Contraseña/Token (solo se guarda localmente)",
    "b.pull.selected": "Hacer pull de lo seleccionado",
    "b.push.selected": "Hacer push de lo seleccionado",
    "b.pushed.additions": "Nuevas entradas enviadas",
    "b.recently.updated": "Actualizadas recientemente",
    "b.refreshing": "Actualizando…",
    "b.remote.deleted": "Remoto eliminado",
    "b.remote.name": "Nombre del remoto",
    "b.remote.settings.saved": "Configuración remota guardada",
    "b.save.settings": "Guardar configuración",
    "b.save.sources": "Guardar fuentes",
    "b.search.skills.by.keyword.e.g.mcp.tests.browser": "Busca habilidades por palabra clave, p. ej., mcp, pruebas, navegador",
    "b.searching": "Buscando…",
    "b.settings": "Configuración",
    "b.skillhub.installation.guide": "Guía de instalación de SkillHub (oficial)",
    "b.skills": "Habilidades",
    "b.skip.tls.verification.for.self.signed.certificat": " Omitir la verificación TLS para certificados autofirmados (con precaución)",
    "b.sources.saved": "Fuentes guardadas",
    "b.stars": "Estrellas",
    "b.sync.remotes": "Sincronizar remotos",
    "b.sync.settings": "Configuración de sincronización",
    "b.test.connection": "Probar conexión",
    "b.unversioned": "Sin versión",
    "b.username.optional": "Nombre de usuario (opcional)",
    "b.using.local.git.ssh.credentials": "Usando credenciales locales de git/SSH",
    "busy": "Trabajando…",
    "cli.unavailable": "skills CLI no está disponible: {{reason}}. La instalación y actualización desde el mercado tienen funcionalidad limitada; la gestión local sigue funcionando.",
    "confirm.cancel": "Cancelar",
    "confirm.ok": "Confirmar",
    "confirm.remove": "La eliminación borrará {{dir}} y no se puede deshacer directamente.",
    "confirm.removeForeign": "⚠️ No instalada por este plugin. {{warning}}",
    "confirm.title": "Confirmar",
    "disabled.badge": "Desactivada",
    "drawer.export": "Exportar",
    "drawer.materialize": "Convertir en directorio real",
    "drawer.pin": "Fijar",
    "drawer.rollback": "Restaurar esta copia",
    "drawer.uninstall": "Desinstalar",
    "drawer.unlink": "Desvincular",
    "drawer.unpin": "Dejar de fijar",
    "drawer.update": "Actualizar",
    "drawer.updateUnsupported": "Este origen no admite actualizaciones",
    "external.empty": "No hay habilidades importables de otro Agent",
    "external.import": "Importar",
    "external.title": "Importar habilidades de otro Agent a DSH",
    "filter.agent": "Directorio",
    "filter.agent.all": "Todas",
    "filter.origin": "Origen",
    "filter.origin.all": "Todos",
    "foreign.badge": "Externa",
    "foreign.warning": "Esta habilidad no fue instalada por este plugin (directorio compartido). Si la eliminas, se borrará su directorio; confirma primero las consecuencias.",
    "health.error": "Errores",
    "health.loadable": "Se puede cargar",
    "health.ok": "Correcto",
    "health.title": "Comprobación de estado",
    "health.warn": "Advertencias",
    "http.emptyResponse": "Respuesta vacía",
    "issue.broken-symlink": "Enlace simbólico roto",
    "issue.empty-dir": "Directorio vacío",
    "issue.frontmatter": "Sintaxis de frontmatter",
    "issue.frontmatter-missing-description": "Falta description en frontmatter",
    "issue.frontmatter-missing-name": "Falta name en frontmatter",
    "issue.frontmatter-name-mismatch": "El name de frontmatter no coincide con el directorio",
    "issue.invalid-name": "Nombre no válido",
    "issue.missing-skill-md": "Falta SKILL.md",
    "issue.name-conflict": "Conflicto de nombres",
    "issue.shadowed-by-project": "Oculta por una habilidad del proyecto",
    "issue.unreadable": "Directorio ilegible",
    "list.empty": "No hay habilidades coincidentes",
    "list.error": "Error al cargar",
    "list.loading": "Cargando inventario…",
    "loaded.no": "No cargada",
    "loaded.yes": "Cargada",
    "local.copyFallback": "En Windows, sin permiso para crear enlaces, se creará una copia y se indicará en el resultado.",
    "local.name": "Nombre de la habilidad (por defecto, el del directorio)",
    "local.submit": "Crear enlace",
    "local.target": "Directorio de destino (debe contener SKILL.md)",
    "local.title": "Vincular un directorio local de habilidades",
    "logs.empty": "Aún no hay operaciones",
    "logs.title": "Registro de operaciones",
    "market.authorSource": "Autor {author} · Fuente {source}",
    "market.empty": "Sin resultados",
    "market.install": "Instalar",
    "market.installFailed": "Error al instalar",
    "market.installed": "{ref} instalada",
    "market.installing": "Instalando…",
    "market.lockfile": "skills-lock.json detectado: las instalaciones se ejecutan con la CLI oficial, que respeta y actualiza el archivo de bloqueo; aquí nunca se edita ni se omite.",
    "market.lowTrust": "Validación de la comunidad insuficiente (< 100 instalaciones): comprueba la fuente antes de instalar.",
    "market.officialSource": "skills.sh (oficial)",
    "market.query": "Buscar habilidades (skills.sh)",
    "market.search": "Buscar",
    "market.searchFailed": "Error al buscar",
    "market.title": "Búsqueda en el mercado",
    "market.versionUpdated": " · Versión {version} · Actualizada {updated}",
    "meta.agent": "Agent",
    "meta.dir": "Directorio",
    "meta.installedBy": "Instalada por",
    "meta.linked": "Destino del enlace",
    "meta.mtime": "Actualizada",
    "meta.origin": "Origen",
    "meta.scope": "Ámbito",
    "meta.source": "Referencia de origen",
    "meta.status": "Estado",
    "nav": "Habilidades",
    "notice.undoNone": "No hay nada que deshacer.",
    "notice.undoOk": "Acción deshecha.",
    "origin.builtin": "Integrada",
    "origin.git": "Git",
    "origin.manual": "Local",
    "origin.marketplace": "Mercado",
    "origin.symlink": "Enlace simbólico",
    "panel.subtitle": "Solo habilidades locales compatibles con DSH; las importaciones de otros Agent usan enlaces simbólicos y conservan su origen.",
    "panel.title": "Habilidades",
    "refresh.failure": "Error al actualizar: {message}",
    "refresh.success": "Actualizado: {scanned} registros, {count} habilidades de DSH",
    "roots.custom": "Personalizada",
    "roots.empty": "No se encontraron directorios",
    "roots.missing": "No encontrado",
    "roots.readonly": "Solo lectura",
    "roots.title": "Directorios raíz de habilidades",
    "scope.global": "Global",
    "scope.project": "Proyecto",
    "search.placeholder": "Buscar habilidades",
    "section.backups": "Copias de seguridad",
    "section.health": "Informe de estado",
    "section.preview": "Vista previa de SKILL.md",
    "section.sources": "Fuentes con el mismo nombre (todas las rutas)",
    "shadowed.badge": "Oculta por el proyecto",
    "source.externalPrefix": "de ",
    "sources.count": "{count} fuentes",
    "status.enabled": "Activada",
    "switch.disable": "Desactivar",
    "switch.enable": "Activar",
    "sync.empty": "Este manifiesto no contiene habilidades descargables",
    "sync.install": "Instalar",
    "sync.installSummary": "Instalación incremental: {installed} añadidas, {skipped} omitidas, {failed} con errores",
    "sync.note": "Solo se sincronizan nombres, referencias de descarga y orígenes; los archivos de las habilidades nunca se suben. El envío solo se realiza al hacer clic.",
    "sync.pull": "Descargar manifiesto",
    "sync.pullSummary": "{name} · faltan {missing} · existentes omitidas {existing}",
    "sync.push": "Subir manifiesto",
    "sync.pushSummary": "{status} · añadidas {added} · homónimas conservadas {kept} · total {count}",
    "sync.repo": "Repositorio personal (owner/repo)",
    "sync.title": "Sincronizar manifiesto de habilidades",
    "tab.all": "Todas",
    "tab.disabled": "Desactivadas",
    "tab.global": "Globales",
    "tab.project": "Proyecto",
    "tab.warn": "Con advertencias",
    "time.never": "—"
  },
  "fr": {
    "action.add": "Ajouter",
    "action.health": "Diagnostic",
    "action.logs": "Journaux",
    "action.pickDirectory": "Choisir un dossier",
    "action.refresh": "Actualiser",
    "action.roots": "Parcourir les répertoires",
    "action.sync": "Synchronisation GitHub",
    "action.undo": "Annuler la dernière action",
    "add.external": "Importer depuis un autre Agent",
    "add.local": "Lier un dossier local",
    "add.market": "Installer depuis le catalogue",
    "add.root": "Ajouter un répertoire racine personnalisé",
    "b.add.github.source": "Ajouter une source GitHub",
    "b.add.remote": "Ajouter un dépôt distant",
    "b.add.remote.2": "＋ Ajouter un dépôt distant",
    "b.back.to.sync": "← Retour à la synchronisation",
    "b.cancel": "Annuler",
    "b.configure.sources": "Configurer les sources",
    "b.credentials.saved": "Identifiants enregistrés",
    "b.custom.git": "Git personnalisé",
    "b.delete": "Supprimer",
    "b.delete.this.remote.configuration": "Supprimer la configuration de ce dépôt distant ?",
    "b.downloads": "Téléchargements",
    "b.edit.remote": "Modifier le dépôt distant",
    "b.enter.a.remote.url": "Saisissez l’URL du dépôt distant",
    "b.enter.a.skill.keyword": "Saisissez un mot-clé de compétence",
    "b.existing.skipped": "Existantes · ignorées",
    "b.filter.by.author": "Filtrer par auteur",
    "b.github.query.filter.e.g.topic.skills": "Filtre de recherche GitHub (ex. : topic:skills)",
    "b.gitlab.self.hosted": "GitLab / instance auto-hébergée",
    "b.hide.sources": "Masquer les sources",
    "b.install.all.missing": "Installer toutes les compétences manquantes",
    "b.install.failed": "Échec de l’installation",
    "b.installed.now": "Nouvellement installées",
    "b.local.file": "Fichier local (file://)",
    "b.missing": "Manquantes",
    "b.name": "Nom",
    "b.new.source.name": "Nom de la nouvelle source",
    "b.no.additions": "Aucun ajout",
    "b.no.directory.selected.or.picker.unavailable": "Aucun dossier sélectionné ou sélecteur de dossiers indisponible",
    "b.no.remotes.yet.add.one.to.push.or.pull.your.skil": "Aucun dépôt distant. Ajoutez-en un pour envoyer ou récupérer votre manifeste de compétences.",
    "b.password.token.stored.locally.only": "Mot de passe/Token (stocké localement uniquement)",
    "b.pull.selected": "Récupérer la sélection",
    "b.push.selected": "Envoyer la sélection",
    "b.pushed.additions": "Ajouts envoyés",
    "b.recently.updated": "Récemment mises à jour",
    "b.refreshing": "Actualisation…",
    "b.remote.deleted": "Dépôt distant supprimé",
    "b.remote.name": "Nom du dépôt distant",
    "b.remote.settings.saved": "Paramètres du dépôt distant enregistrés",
    "b.save.settings": "Enregistrer les paramètres",
    "b.save.sources": "Enregistrer les sources",
    "b.search.skills.by.keyword.e.g.mcp.tests.browser": "Rechercher par mot-clé (ex. : mcp, tests, navigateur)",
    "b.searching": "Recherche en cours…",
    "b.settings": "Paramètres",
    "b.skillhub.installation.guide": "Guide d’installation officiel de SkillHub",
    "b.skills": "Compétences",
    "b.skip.tls.verification.for.self.signed.certificat": " Ignorer la vérification TLS pour les certificats auto-signés (avec prudence)",
    "b.sources.saved": "Sources enregistrées",
    "b.stars": "Étoiles",
    "b.sync.remotes": "Synchroniser les dépôts distants",
    "b.sync.settings": "Paramètres de synchronisation",
    "b.test.connection": "Tester la connexion",
    "b.unversioned": "sans version",
    "b.username.optional": "Nom d’utilisateur (facultatif)",
    "b.using.local.git.ssh.credentials": "Identifiants Git/SSH locaux utilisés",
    "busy": "Traitement…",
    "cli.unavailable": "CLI skills indisponible : {{reason}}. L’installation et les mises à jour depuis le catalogue fonctionnent en mode dégradé ; la gestion locale reste disponible.",
    "confirm.cancel": "Annuler",
    "confirm.ok": "Confirmer",
    "confirm.remove": "La suppression effacera {{dir}} et ne pourra pas être annulée directement.",
    "confirm.removeForeign": "⚠️ Non installée par ce plugin. {{warning}}",
    "confirm.title": "Confirmation",
    "disabled.badge": "désactivée",
    "drawer.export": "Exporter",
    "drawer.materialize": "Convertir en répertoire local",
    "drawer.pin": "Épingler",
    "drawer.rollback": "Restaurer cette sauvegarde",
    "drawer.uninstall": "Désinstaller",
    "drawer.unlink": "Supprimer le lien symbolique",
    "drawer.unpin": "Désépingler",
    "drawer.update": "Mettre à jour",
    "drawer.updateUnsupported": "Mises à jour indisponibles pour cette source",
    "external.empty": "Aucune compétence importable depuis d’autres Agents",
    "external.import": "Importer",
    "external.title": "Importer dans DSH les compétences d’un autre Agent",
    "filter.agent": "Répertoire",
    "filter.agent.all": "Tous",
    "filter.origin": "Source",
    "filter.origin.all": "Toutes",
    "foreign.badge": "externe",
    "foreign.warning": "Cette compétence n’a pas été installée par ce plugin (répertoire partagé). La suppression effective effacera son répertoire : vérifiez d’abord les conséquences.",
    "health.error": "Erreurs",
    "health.loadable": "Prêtes à charger",
    "health.ok": "OK",
    "health.title": "Diagnostic des compétences",
    "health.warn": "Avertissements",
    "http.emptyResponse": "Réponse vide",
    "issue.broken-symlink": "Lien symbolique brisé",
    "issue.empty-dir": "Dossier vide",
    "issue.frontmatter": "Syntaxe frontmatter",
    "issue.frontmatter-missing-description": "frontmatter : description manquante",
    "issue.frontmatter-missing-name": "frontmatter : name manquant",
    "issue.frontmatter-name-mismatch": "frontmatter : name différent du nom du répertoire",
    "issue.invalid-name": "Nom invalide",
    "issue.missing-skill-md": "SKILL.md manquant",
    "issue.name-conflict": "Conflit de noms",
    "issue.shadowed-by-project": "Masquée par une compétence du projet",
    "issue.unreadable": "Répertoire illisible",
    "list.empty": "Aucune compétence correspondante",
    "list.error": "Échec du chargement",
    "list.loading": "Inventaire en cours…",
    "loaded.no": "Non chargée",
    "loaded.yes": "Chargée",
    "local.copyFallback": "Sans privilège de lien sous Windows, une copie est créée à la place et signalée dans le résultat.",
    "local.name": "Nom de la compétence (par défaut, nom du dossier)",
    "local.submit": "Créer le lien symbolique",
    "local.target": "Répertoire cible (doit contenir SKILL.md)",
    "local.title": "Lier un répertoire de compétence local",
    "logs.empty": "Aucune opération pour le moment",
    "logs.title": "Journal des opérations",
    "market.authorSource": "Auteur {author} · Source {source}",
    "market.empty": "Aucun résultat",
    "market.install": "Installer",
    "market.installFailed": "Échec de l’installation",
    "market.installed": "Installation de {ref} terminée",
    "market.installing": "Installation…",
    "market.lockfile": "skills-lock.json détecté : les installations passent par la CLI officielle, qui respecte et met à jour le fichier de verrouillage. Ce plugin ne le modifie ni ne le contourne jamais.",
    "market.lowTrust": "Validation communautaire limitée (< 100 installations) : vérifiez la source avant l’installation.",
    "market.officialSource": "skills.sh (officiel)",
    "market.query": "Rechercher des compétences (skills.sh)",
    "market.search": "Rechercher",
    "market.searchFailed": "Échec de la recherche",
    "market.title": "Recherche dans le catalogue",
    "market.versionUpdated": " · Version {version} · Mise à jour : {updated}",
    "meta.agent": "Agent",
    "meta.dir": "Répertoire",
    "meta.installedBy": "Installation par",
    "meta.linked": "Cible du lien",
    "meta.mtime": "Mise à jour",
    "meta.origin": "Source",
    "meta.scope": "Portée",
    "meta.source": "Référence source",
    "meta.status": "État",
    "nav": "Compétences",
    "notice.undoNone": "Aucune action à annuler.",
    "notice.undoOk": "Action annulée.",
    "origin.builtin": "Intégré",
    "origin.git": "Git",
    "origin.manual": "Local",
    "origin.marketplace": "Catalogue",
    "origin.symlink": "Lien symbolique",
    "panel.subtitle": "Uniquement les compétences locales utilisables par DSH ; les imports depuis d’autres Agents utilisent des liens symboliques et conservent leur source.",
    "panel.title": "Compétences",
    "refresh.failure": "Échec de l’actualisation : {message}",
    "refresh.success": "Actualisation réussie : {scanned} enregistrements analysés, {count} compétences DSH",
    "roots.custom": "personnalisé",
    "roots.empty": "Aucun répertoire détecté",
    "roots.missing": "introuvable",
    "roots.readonly": "lecture seule",
    "roots.title": "Répertoires racines des compétences",
    "scope.global": "Global",
    "scope.project": "Projet",
    "search.placeholder": "Rechercher des compétences",
    "section.backups": "Sauvegardes",
    "section.health": "Rapport de diagnostic",
    "section.preview": "Aperçu de SKILL.md",
    "section.sources": "Sources homonymes (tous les chemins)",
    "shadowed.badge": "masquée par le projet",
    "source.externalPrefix": "de ",
    "sources.count": "{count} sources",
    "status.enabled": "Activée",
    "switch.disable": "Désactiver",
    "switch.enable": "Activer",
    "sync.empty": "Aucune compétence téléchargeable dans ce manifeste",
    "sync.install": "Installer",
    "sync.installSummary": "Installation incrémentielle : {installed} ajoutées, {skipped} ignorées, {failed} échouées",
    "sync.note": "Seuls les noms, références de téléchargement et sources sont synchronisés ; les fichiers des compétences ne sont jamais envoyés. L’envoi n’a lieu que lorsque vous cliquez sur le bouton.",
    "sync.pull": "Récupérer le manifeste",
    "sync.pullSummary": "{name} · Manquantes : {missing} · Existantes ignorées : {existing}",
    "sync.push": "Envoyer le manifeste",
    "sync.pushSummary": "{status} · Ajoutés : {added} · Homonymes conservés : {kept} · Total : {count}",
    "sync.repo": "Dépôt personnel (owner/repo)",
    "sync.title": "Synchroniser le manifeste de compétences",
    "tab.all": "Toutes",
    "tab.disabled": "Désactivées",
    "tab.global": "Global",
    "tab.project": "Projet",
    "tab.warn": "Avertissements",
    "time.never": "—"
  },
  "de": {
    "action.add": "Hinzufügen",
    "action.health": "Health-Check",
    "action.logs": "Protokolle",
    "action.pickDirectory": "Ordner auswählen",
    "action.refresh": "Aktualisieren",
    "action.roots": "Stammverzeichnisse durchsuchen",
    "action.sync": "GitHub-Synchronisierung",
    "action.undo": "Letzte Aktion rückgängig",
    "add.external": "Aus einem anderen Agenten importieren",
    "add.local": "Lokales Verzeichnis verknüpfen",
    "add.market": "Vom Marktplatz installieren",
    "add.root": "Benutzerdefiniertes Stammverzeichnis hinzufügen",
    "b.add.github.source": "GitHub-Quelle hinzufügen",
    "b.add.remote": "Remote hinzufügen",
    "b.add.remote.2": "＋ Remote hinzufügen",
    "b.back.to.sync": "← Zurück zur Synchronisierung",
    "b.cancel": "Abbrechen",
    "b.configure.sources": "Quellen konfigurieren",
    "b.credentials.saved": "Zugangsdaten gespeichert",
    "b.custom.git": "Benutzerdefiniertes Git",
    "b.delete": "Löschen",
    "b.delete.this.remote.configuration": "Diese Remote-Konfiguration löschen?",
    "b.downloads": "Downloads",
    "b.edit.remote": "Remote bearbeiten",
    "b.enter.a.remote.url": "Remote-URL eingeben",
    "b.enter.a.skill.keyword": "Skill-Stichwort eingeben",
    "b.existing.skipped": "Vorhanden · übersprungen",
    "b.filter.by.author": "Nach Autor filtern",
    "b.github.query.filter.e.g.topic.skills": "GitHub-Suchfilter (z. B. topic:skills)",
    "b.gitlab.self.hosted": "GitLab / selbst gehostet",
    "b.hide.sources": "Quellen ausblenden",
    "b.install.all.missing": "Alle fehlenden Skills installieren",
    "b.install.failed": "Installation fehlgeschlagen",
    "b.installed.now": "Jetzt installiert",
    "b.local.file": "Lokale Datei (file://)",
    "b.missing": "Fehlend",
    "b.name": "Name",
    "b.new.source.name": "Name der neuen Quelle",
    "b.no.additions": "Keine neuen Einträge",
    "b.no.directory.selected.or.picker.unavailable": "Kein Ordner ausgewählt oder Ordnerauswahl nicht verfügbar",
    "b.no.remotes.yet.add.one.to.push.or.pull.your.skil": "Noch keine Remotes. Füge eines hinzu, um dein Skill-Manifest zu pushen oder abzurufen.",
    "b.password.token.stored.locally.only": "Passwort/Token (nur lokal gespeichert)",
    "b.pull.selected": "Auswahl abrufen",
    "b.push.selected": "Auswahl pushen",
    "b.pushed.additions": "Neue Einträge gepusht",
    "b.recently.updated": "Zuletzt aktualisiert",
    "b.refreshing": "Wird aktualisiert…",
    "b.remote.deleted": "Remote gelöscht",
    "b.remote.name": "Remote-Name",
    "b.remote.settings.saved": "Remote-Einstellungen gespeichert",
    "b.save.settings": "Einstellungen speichern",
    "b.save.sources": "Quellen speichern",
    "b.search.skills.by.keyword.e.g.mcp.tests.browser": "Skills nach Stichwort suchen, z. B. mcp, Tests, Browser",
    "b.searching": "Suche läuft…",
    "b.settings": "Einstellungen",
    "b.skillhub.installation.guide": "Offizielle SkillHub-Installationsanleitung",
    "b.skills": "Skills",
    "b.skip.tls.verification.for.self.signed.certificat": " TLS-Zertifikatsprüfung für selbst signierte Zertifikate überspringen (mit Vorsicht)",
    "b.sources.saved": "Quellen gespeichert",
    "b.stars": "Sterne",
    "b.sync.remotes": "Remotes synchronisieren",
    "b.sync.settings": "Sync-Einstellungen",
    "b.test.connection": "Verbindung testen",
    "b.unversioned": "ohne Version",
    "b.username.optional": "Benutzername (optional)",
    "b.using.local.git.ssh.credentials": "Lokale Git-/SSH-Zugangsdaten werden verwendet",
    "busy": "Wird verarbeitet…",
    "cli.unavailable": "skills-CLI nicht verfügbar: {{reason}}. Installationen und Updates über den Marktplatz sind eingeschränkt; die lokale Verwaltung funktioniert weiterhin.",
    "confirm.cancel": "Abbrechen",
    "confirm.ok": "Bestätigen",
    "confirm.remove": "Beim Entfernen wird {{dir}} gelöscht. Das kann nicht direkt rückgängig gemacht werden.",
    "confirm.removeForeign": "⚠️ Nicht von diesem Plugin installiert. {{warning}}",
    "confirm.title": "Bestätigung",
    "disabled.badge": "deaktiviert",
    "drawer.export": "Exportieren",
    "drawer.materialize": "In lokales Verzeichnis umwandeln",
    "drawer.pin": "Anheften",
    "drawer.rollback": "Dieses Backup wiederherstellen",
    "drawer.uninstall": "Deinstallieren",
    "drawer.unlink": "Symlink entfernen",
    "drawer.unpin": "Loslösen",
    "drawer.update": "Aktualisieren",
    "drawer.updateUnsupported": "Für diese Quelle sind keine Updates verfügbar",
    "external.empty": "Keine importierbaren Skills von anderen Agenten",
    "external.import": "Importieren",
    "external.title": "Skills eines anderen Agenten in DSH importieren",
    "filter.agent": "Verzeichnis",
    "filter.agent.all": "Alle",
    "filter.origin": "Quelle",
    "filter.origin.all": "Alle",
    "foreign.badge": "fremd",
    "foreign.warning": "Dieser Skill wurde nicht von diesem Plugin installiert (gemeinsam genutztes Verzeichnis). Beim vollständigen Entfernen wird sein Verzeichnis gelöscht. Prüfe vorher die Auswirkungen.",
    "health.error": "Fehler",
    "health.loadable": "Ladbar",
    "health.ok": "OK",
    "health.title": "Skill-Health-Check",
    "health.warn": "Warnungen",
    "http.emptyResponse": "Leere Antwort",
    "issue.broken-symlink": "Defekter Symlink",
    "issue.empty-dir": "Leeres Verzeichnis",
    "issue.frontmatter": "frontmatter-Syntax",
    "issue.frontmatter-missing-description": "frontmatter: description fehlt",
    "issue.frontmatter-missing-name": "frontmatter: name fehlt",
    "issue.frontmatter-name-mismatch": "frontmatter: name weicht vom Verzeichnisnamen ab",
    "issue.invalid-name": "Ungültiger Name",
    "issue.missing-skill-md": "SKILL.md fehlt",
    "issue.name-conflict": "Namenskonflikt",
    "issue.shadowed-by-project": "Von einem Projekt-Skill verdeckt",
    "issue.unreadable": "Verzeichnis nicht lesbar",
    "list.empty": "Keine passenden Skills",
    "list.error": "Laden fehlgeschlagen",
    "list.loading": "Bestand wird erfasst…",
    "loaded.no": "Nicht geladen",
    "loaded.yes": "Geladen",
    "local.copyFallback": "Unter Windows wird ohne Link-Berechtigung stattdessen eine Kopie erstellt; dies wird im Ergebnis vermerkt.",
    "local.name": "Skill-Name (standardmäßig Verzeichnisname)",
    "local.submit": "Symlink erstellen",
    "local.target": "Zielverzeichnis (muss SKILL.md enthalten)",
    "local.title": "Lokales Skill-Verzeichnis verknüpfen",
    "logs.empty": "Noch keine Vorgänge",
    "logs.title": "Aktivitätsprotokoll",
    "market.authorSource": "Autor {author} · Quelle {source}",
    "market.empty": "Keine Ergebnisse",
    "market.install": "Installieren",
    "market.installFailed": "Installation fehlgeschlagen",
    "market.installed": "{ref} installiert",
    "market.installing": "Wird installiert…",
    "market.lockfile": "skills-lock.json erkannt: Installationen laufen über die offizielle CLI, die die Lockdatei berücksichtigt und aktualisiert. Das Plugin verändert oder umgeht sie nicht.",
    "market.lowTrust": "Wenig Community-Vertrauen (< 100 Installationen): Prüfe vor der Installation die Quelle.",
    "market.officialSource": "skills.sh (offiziell)",
    "market.query": "Skills suchen (skills.sh)",
    "market.search": "Suchen",
    "market.searchFailed": "Suche fehlgeschlagen",
    "market.title": "Marktplatzsuche",
    "market.versionUpdated": " · Version {version} · Aktualisiert: {updated}",
    "meta.agent": "Agent",
    "meta.dir": "Verzeichnis",
    "meta.installedBy": "Installiert von",
    "meta.linked": "Linkziel",
    "meta.mtime": "Aktualisiert",
    "meta.origin": "Quelle",
    "meta.scope": "Bereich",
    "meta.source": "Quellverweis",
    "meta.status": "Status",
    "nav": "Skills",
    "notice.undoNone": "Nichts rückgängig zu machen.",
    "notice.undoOk": "Rückgängig gemacht.",
    "origin.builtin": "Integriert",
    "origin.git": "Git",
    "origin.manual": "Lokal",
    "origin.marketplace": "Marktplatz",
    "origin.symlink": "Symlink",
    "panel.subtitle": "Nur lokale, von DSH nutzbare Skills; Importe aus anderen Agenten werden als Symlinks eingebunden und ihre Quelle bleibt erhalten.",
    "panel.title": "Skills",
    "refresh.failure": "Aktualisierung fehlgeschlagen: {message}",
    "refresh.success": "Aktualisierung erfolgreich: {scanned} Einträge geprüft, {count} DSH-Skills",
    "roots.custom": "benutzerdefiniert",
    "roots.empty": "Keine Verzeichnisse gefunden",
    "roots.missing": "nicht gefunden",
    "roots.readonly": "schreibgeschützt",
    "roots.title": "Skill-Stammverzeichnisse",
    "scope.global": "Global",
    "scope.project": "Projekt",
    "search.placeholder": "Skills suchen",
    "section.backups": "Backups",
    "section.health": "Health-Bericht",
    "section.preview": "SKILL.md-Vorschau",
    "section.sources": "Gleichnamige Quellen (alle Pfade)",
    "shadowed.badge": "durch Projekt verdeckt",
    "source.externalPrefix": "aus ",
    "sources.count": "{count} Quellen",
    "status.enabled": "Aktiviert",
    "switch.disable": "Deaktivieren",
    "switch.enable": "Aktivieren",
    "sync.empty": "Keine herunterladbaren Skills in diesem Manifest",
    "sync.install": "Installieren",
    "sync.installSummary": "Inkrementelle Installation: {installed} hinzugefügt, {skipped} übersprungen, {failed} fehlgeschlagen",
    "sync.note": "Es werden nur Namen, Download-Referenzen und Quellen synchronisiert; Skill-Dateien werden nie hochgeladen. Ein Push erfolgt nur, wenn du ihn auslöst.",
    "sync.pull": "Manifest abrufen",
    "sync.pullSummary": "{name} · Fehlend: {missing} · Vorhandene übersprungen: {existing}",
    "sync.push": "Manifest pushen",
    "sync.pushSummary": "{status} · Hinzugefügt: {added} · Gleichnamige behalten: {kept} · Gesamt: {count}",
    "sync.repo": "Persönliches Repository (owner/repo)",
    "sync.title": "Skill-Manifest synchronisieren",
    "tab.all": "Alle",
    "tab.disabled": "Deaktiviert",
    "tab.global": "Global",
    "tab.project": "Projekt",
    "tab.warn": "Warnungen",
    "time.never": "—"
  },
  "ru": {
    "action.add": "Добавить",
    "action.health": "Диагностика",
    "action.logs": "Журналы",
    "action.pickDirectory": "Выбрать папку",
    "action.refresh": "Обновить",
    "action.roots": "Обзор каталогов",
    "action.sync": "Синхронизация с GitHub",
    "action.undo": "Отменить последнее",
    "add.external": "Импортировать из другого Agent",
    "add.local": "Связать локальный каталог",
    "add.market": "Установить из маркета",
    "add.root": "Добавить свой каталог",
    "b.add.github.source": "Добавить источник GitHub",
    "b.add.remote": "Добавить удалённый репозиторий",
    "b.add.remote.2": "＋ Добавить удалённый репозиторий",
    "b.back.to.sync": "← Назад к синхронизации",
    "b.cancel": "Отмена",
    "b.configure.sources": "Настроить источники",
    "b.credentials.saved": "Учётные данные сохранены",
    "b.custom.git": "Пользовательский Git",
    "b.delete": "Удалить",
    "b.delete.this.remote.configuration": "Удалить конфигурацию этого удалённого репозитория?",
    "b.downloads": "По числу загрузок",
    "b.edit.remote": "Изменить удалённый репозиторий",
    "b.enter.a.remote.url": "Введите URL удалённого репозитория",
    "b.enter.a.skill.keyword": "Введите слово для поиска навыков",
    "b.existing.skipped": "Уже есть · пропущено",
    "b.filter.by.author": "Фильтр по автору",
    "b.github.query.filter.e.g.topic.skills": "Фильтр запроса GitHub (например, topic:skills)",
    "b.gitlab.self.hosted": "GitLab / на своём сервере",
    "b.hide.sources": "Скрыть источники",
    "b.install.all.missing": "Установить все отсутствующие",
    "b.install.failed": "Ошибка установки",
    "b.installed.now": "Установлено в этот раз",
    "b.local.file": "Локальный file://",
    "b.missing": "Отсутствуют",
    "b.name": "По имени",
    "b.new.source.name": "Имя нового источника",
    "b.no.additions": "Нет новых записей",
    "b.no.directory.selected.or.picker.unavailable": "Каталог не выбран или диалог выбора недоступен",
    "b.no.remotes.yet.add.one.to.push.or.pull.your.skil": "Пока нет удалённых репозиториев. Добавьте один, чтобы отправлять или получать манифест навыков.",
    "b.password.token.stored.locally.only": "Пароль/Token (хранятся только локально)",
    "b.pull.selected": "Получить выбранные",
    "b.push.selected": "Отправить выбранные",
    "b.pushed.additions": "Новые записи отправлены",
    "b.recently.updated": "Недавно обновлённые",
    "b.refreshing": "Обновление…",
    "b.remote.deleted": "Удалённый репозиторий удалён",
    "b.remote.name": "Имя удалённого репозитория",
    "b.remote.settings.saved": "Настройки удалённого репозитория сохранены",
    "b.save.settings": "Сохранить настройки",
    "b.save.sources": "Сохранить источники",
    "b.search.skills.by.keyword.e.g.mcp.tests.browser": "Поиск навыков по ключевому слову, например: mcp, тесты, браузер",
    "b.searching": "Поиск…",
    "b.settings": "Настройки",
    "b.skillhub.installation.guide": "Руководство по установке SkillHub",
    "b.skills": "Навыки",
    "b.skip.tls.verification.for.self.signed.certificat": " Пропускать проверку TLS для самоподписанных сертификатов (осторожно)",
    "b.sources.saved": "Источники сохранены",
    "b.stars": "По звёздам",
    "b.sync.remotes": "Синхронизировать удалённые репозитории",
    "b.sync.settings": "Настройки синхронизации",
    "b.test.connection": "Проверить соединение",
    "b.unversioned": "без версии",
    "b.username.optional": "Имя пользователя (необязательно)",
    "b.using.local.git.ssh.credentials": "Используются локальные учётные данные git/SSH",
    "busy": "Выполняется…",
    "cli.unavailable": "skills CLI недоступен: {{reason}}. Установка и обновление из маркета ограничены; локальное управление продолжает работать.",
    "confirm.cancel": "Отмена",
    "confirm.ok": "Подтвердить",
    "confirm.remove": "Будет удалён каталог {{dir}}. Это действие нельзя отменить напрямую.",
    "confirm.removeForeign": "⚠️ Навык установлен не этим плагином. {{warning}}",
    "confirm.title": "Подтверждение",
    "disabled.badge": "отключён",
    "drawer.export": "Экспортировать",
    "drawer.materialize": "Преобразовать в обычный каталог",
    "drawer.pin": "Закрепить",
    "drawer.rollback": "Восстановить эту копию",
    "drawer.uninstall": "Удалить",
    "drawer.unlink": "Отвязать",
    "drawer.unpin": "Открепить",
    "drawer.update": "Обновить",
    "drawer.updateUnsupported": "Обновления для этого источника недоступны",
    "external.empty": "Нет навыков, которые можно импортировать из других Agent",
    "external.import": "Импортировать",
    "external.title": "Импорт навыков другого Agent в DSH",
    "filter.agent": "Каталог",
    "filter.agent.all": "Все",
    "filter.origin": "Источник",
    "filter.origin.all": "Все",
    "foreign.badge": "внешний",
    "foreign.warning": "Этот навык установлен не этим плагином (общий каталог). При удалении его каталог будет стёрт — сначала оцените последствия.",
    "health.error": "Ошибки",
    "health.loadable": "Загружаемые",
    "health.ok": "OK",
    "health.title": "Диагностика",
    "health.warn": "Предупреждения",
    "http.emptyResponse": "Пустой ответ",
    "issue.broken-symlink": "Нерабочая символьная ссылка",
    "issue.empty-dir": "Пустой каталог",
    "issue.frontmatter": "Синтаксис frontmatter",
    "issue.frontmatter-missing-description": "В frontmatter нет description",
    "issue.frontmatter-missing-name": "В frontmatter нет name",
    "issue.frontmatter-name-mismatch": "name в frontmatter не совпадает с именем каталога",
    "issue.invalid-name": "Недопустимое имя",
    "issue.missing-skill-md": "Отсутствует SKILL.md",
    "issue.name-conflict": "Конфликт имён",
    "issue.shadowed-by-project": "Перекрыт одноимённым проектным навыком",
    "issue.unreadable": "Каталог недоступен для чтения",
    "list.empty": "Нет подходящих навыков",
    "list.error": "Не удалось загрузить",
    "list.loading": "Сканирование…",
    "loaded.no": "Не загружен",
    "loaded.yes": "Загружен",
    "local.copyFallback": "В Windows без права на создание ссылок будет создана копия; это будет указано в результате.",
    "local.name": "Имя навыка (по умолчанию — имя каталога)",
    "local.submit": "Создать ссылку",
    "local.target": "Целевой каталог (должен содержать SKILL.md)",
    "local.title": "Связать локальный каталог навыка",
    "logs.empty": "Операций ещё не было",
    "logs.title": "Журнал операций",
    "market.authorSource": "Автор {author} · Источник {source}",
    "market.empty": "Ничего не найдено",
    "market.install": "Установить",
    "market.installFailed": "Не удалось установить",
    "market.installed": "{ref} установлен",
    "market.installing": "Установка…",
    "market.lockfile": "Обнаружен skills-lock.json: установки выполняются через официальный skills CLI с учётом и обновлением файла блокировки; здесь он не редактируется и не обходится.",
    "market.lowTrust": "Мало подтверждений сообщества (< 100 установок): проверьте источник перед установкой.",
    "market.officialSource": "skills.sh (официальный)",
    "market.query": "Поиск навыков (skills.sh)",
    "market.search": "Найти",
    "market.searchFailed": "Поиск не удался",
    "market.title": "Поиск в маркете",
    "market.versionUpdated": " · Версия {version} · Обновлено {updated}",
    "meta.agent": "Agent",
    "meta.dir": "Каталог",
    "meta.installedBy": "Установлено",
    "meta.linked": "Цель ссылки",
    "meta.mtime": "Обновлено",
    "meta.origin": "Источник",
    "meta.scope": "Область",
    "meta.source": "Ссылка на источник",
    "meta.status": "Статус",
    "nav": "Навыки",
    "notice.undoNone": "Нет действий для отмены.",
    "notice.undoOk": "Действие отменено.",
    "origin.builtin": "Встроенный",
    "origin.git": "Git",
    "origin.manual": "Локальный",
    "origin.marketplace": "Маркет",
    "origin.symlink": "Символьная ссылка",
    "panel.subtitle": "Только локальные навыки, доступные в DSH; импорт из других Agent выполняется через символьные ссылки с сохранением источника.",
    "panel.title": "Навыки",
    "refresh.failure": "Не удалось обновить: {message}",
    "refresh.success": "Обновлено. Записей: {scanned}; навыков DSH: {count}.",
    "roots.custom": "пользовательский",
    "roots.empty": "Каталоги не найдены",
    "roots.missing": "не найден",
    "roots.readonly": "только чтение",
    "roots.title": "Корневые каталоги навыков",
    "scope.global": "Глобальная",
    "scope.project": "Проектная",
    "search.placeholder": "Поиск навыков",
    "section.backups": "Резервные копии",
    "section.health": "Отчёт о состоянии",
    "section.preview": "Предпросмотр SKILL.md",
    "section.sources": "Источники с тем же именем (все пути)",
    "shadowed.badge": "перекрыт проектом",
    "source.externalPrefix": "из ",
    "sources.count": "Источников: {count}",
    "status.enabled": "Включён",
    "switch.disable": "Отключить",
    "switch.enable": "Включить",
    "sync.empty": "В манифесте нет навыков, доступных для скачивания",
    "sync.install": "Установить",
    "sync.installSummary": "Инкрементальная установка: добавлено {installed}, пропущено {skipped}, ошибок {failed}",
    "sync.note": "Синхронизируются только имена, ссылки для скачивания и источники; файлы навыков никогда не загружаются. Отправка выполняется только по нажатию кнопки.",
    "sync.pull": "Получить манифест",
    "sync.pullSummary": "{name} · отсутствуют: {missing} · уже есть, пропущено: {existing}",
    "sync.push": "Отправить манифест",
    "sync.pushSummary": "{status} · добавлено: {added} · одноимённых сохранено: {kept} · всего: {count}",
    "sync.repo": "Личный репозиторий (owner/repo)",
    "sync.title": "Синхронизация манифеста навыков",
    "tab.all": "Все",
    "tab.disabled": "Отключённые",
    "tab.global": "Глобальные",
    "tab.project": "Проектные",
    "tab.warn": "С предупреждениями",
    "time.never": "—"
  },
  "pt": {
    "action.add": "Adicionar",
    "action.health": "Verificar integridade",
    "action.logs": "Registros",
    "action.pickDirectory": "Escolher pasta",
    "action.refresh": "Atualizar",
    "action.roots": "Explorar diretórios",
    "action.sync": "Sincronização com GitHub",
    "action.undo": "Desfazer última ação",
    "add.external": "Importar de outro Agent",
    "add.local": "Vincular diretório local",
    "add.market": "Instalar do marketplace",
    "add.root": "Adicionar diretório personalizado",
    "b.add.github.source": "Adicionar origem do GitHub",
    "b.add.remote": "Adicionar remoto",
    "b.add.remote.2": "＋ Adicionar remoto",
    "b.back.to.sync": "← Voltar à sincronização",
    "b.cancel": "Cancelar",
    "b.configure.sources": "Configurar origens",
    "b.credentials.saved": "Credenciais salvas",
    "b.custom.git": "Git personalizado",
    "b.delete": "Excluir",
    "b.delete.this.remote.configuration": "Excluir esta configuração de remoto?",
    "b.downloads": "Por downloads",
    "b.edit.remote": "Editar remoto",
    "b.enter.a.remote.url": "Digite a URL do remoto",
    "b.enter.a.skill.keyword": "Digite uma palavra-chave para buscar habilidades",
    "b.existing.skipped": "Existentes · ignoradas",
    "b.filter.by.author": "Filtrar por autor",
    "b.github.query.filter.e.g.topic.skills": "Filtro de consulta do GitHub (ex.: topic:skills)",
    "b.gitlab.self.hosted": "GitLab / hospedagem própria",
    "b.hide.sources": "Ocultar origens",
    "b.install.all.missing": "Instalar todas as ausentes",
    "b.install.failed": "Falha na instalação",
    "b.installed.now": "Instaladas agora",
    "b.local.file": "file:// local",
    "b.missing": "Ausentes",
    "b.name": "Por nome",
    "b.new.source.name": "Nome da nova origem",
    "b.no.additions": "Sem adições",
    "b.no.directory.selected.or.picker.unavailable": "Nenhum diretório selecionado ou seletor de diretórios indisponível",
    "b.no.remotes.yet.add.one.to.push.or.pull.your.skil": "Ainda não há remotos. Adicione um para enviar ou obter o manifesto de habilidades.",
    "b.password.token.stored.locally.only": "Senha/Token (armazenados apenas localmente)",
    "b.pull.selected": "Obter selecionadas",
    "b.push.selected": "Enviar selecionadas",
    "b.pushed.additions": "Adições enviadas",
    "b.recently.updated": "Atualizadas recentemente",
    "b.refreshing": "Atualizando…",
    "b.remote.deleted": "Remoto excluído",
    "b.remote.name": "Nome do remoto",
    "b.remote.settings.saved": "Configurações do remoto salvas",
    "b.save.settings": "Salvar configurações",
    "b.save.sources": "Salvar origens",
    "b.search.skills.by.keyword.e.g.mcp.tests.browser": "Buscar habilidades por palavra-chave, ex.: mcp, testes, navegador",
    "b.searching": "Pesquisando…",
    "b.settings": "Configurações",
    "b.skillhub.installation.guide": "Guia de instalação do SkillHub",
    "b.skills": "Habilidades",
    "b.skip.tls.verification.for.self.signed.certificat": " Ignorar verificação de TLS para certificados autoassinados (cuidado)",
    "b.sources.saved": "Origens salvas",
    "b.stars": "Por estrelas",
    "b.sync.remotes": "Sincronizar remotos",
    "b.sync.settings": "Configurações de sincronização",
    "b.test.connection": "Testar conexão",
    "b.unversioned": "sem versão",
    "b.username.optional": "Nome de usuário (opcional)",
    "b.using.local.git.ssh.credentials": "Usando credenciais locais do git/SSH",
    "busy": "Processando…",
    "cli.unavailable": "skills CLI indisponível: {{reason}}. A instalação e a atualização pelo marketplace estão limitadas; o gerenciamento local continua funcionando.",
    "confirm.cancel": "Cancelar",
    "confirm.ok": "Confirmar",
    "confirm.remove": "A remoção excluirá {{dir}}. Essa ação não pode ser desfeita diretamente.",
    "confirm.removeForeign": "⚠️ Não instalada por este plugin. {{warning}}",
    "confirm.title": "Confirmação",
    "disabled.badge": "desativada",
    "drawer.export": "Exportar",
    "drawer.materialize": "Converter em diretório local",
    "drawer.pin": "Fixar",
    "drawer.rollback": "Restaurar este backup",
    "drawer.uninstall": "Desinstalar",
    "drawer.unlink": "Desvincular",
    "drawer.unpin": "Desafixar",
    "drawer.update": "Atualizar",
    "drawer.updateUnsupported": "Atualizações indisponíveis para esta origem",
    "external.empty": "Não há habilidades para importar de outros Agent",
    "external.import": "Importar",
    "external.title": "Importar habilidades de outro Agent para o DSH",
    "filter.agent": "Diretório",
    "filter.agent.all": "Todos",
    "filter.origin": "Origem",
    "filter.origin.all": "Todas",
    "foreign.badge": "externa",
    "foreign.warning": "Esta habilidade não foi instalada por este plugin (diretório compartilhado). A remoção real excluirá seu diretório — confirme o impacto antes.",
    "health.error": "Erros",
    "health.loadable": "Carregáveis",
    "health.ok": "OK",
    "health.title": "Diagnóstico",
    "health.warn": "Avisos",
    "http.emptyResponse": "Resposta vazia",
    "issue.broken-symlink": "Link simbólico quebrado",
    "issue.empty-dir": "Diretório vazio",
    "issue.frontmatter": "Sintaxe do frontmatter",
    "issue.frontmatter-missing-description": "description ausente no frontmatter",
    "issue.frontmatter-missing-name": "name ausente no frontmatter",
    "issue.frontmatter-name-mismatch": "name no frontmatter difere do nome do diretório",
    "issue.invalid-name": "Nome inválido",
    "issue.missing-skill-md": "SKILL.md ausente",
    "issue.name-conflict": "Conflito de nomes",
    "issue.shadowed-by-project": "Sobreposta por uma habilidade do projeto com o mesmo nome",
    "issue.unreadable": "Diretório ilegível",
    "list.empty": "Nenhuma habilidade correspondente",
    "list.error": "Falha ao carregar",
    "list.loading": "Verificando…",
    "loaded.no": "Não carregada",
    "loaded.yes": "Carregada",
    "local.copyFallback": "No Windows, sem permissão para criar links, uma cópia será usada, conforme indicado no resultado.",
    "local.name": "Nome da habilidade (padrão: nome do diretório)",
    "local.submit": "Criar link",
    "local.target": "Diretório de destino (deve conter SKILL.md)",
    "local.title": "Vincular um diretório local de habilidades",
    "logs.empty": "Nenhuma operação ainda",
    "logs.title": "Registro de operações",
    "market.authorSource": "Autor {author} · Origem {source}",
    "market.empty": "Nenhum resultado",
    "market.install": "Instalar",
    "market.installFailed": "Falha ao instalar",
    "market.installed": "{ref} instalada",
    "market.installing": "Instalando…",
    "market.lockfile": "skills-lock.json detectado: as instalações usam a skills CLI oficial, que respeita e atualiza o arquivo de bloqueio; ele nunca é editado nem ignorado aqui.",
    "market.lowTrust": "Pouca validação da comunidade (< 100 instalações): verifique a origem antes de instalar.",
    "market.officialSource": "skills.sh (oficial)",
    "market.query": "Buscar habilidades (skills.sh)",
    "market.search": "Buscar",
    "market.searchFailed": "Falha ao pesquisar",
    "market.title": "Busca no marketplace",
    "market.versionUpdated": " · Versão {version} · Atualizado em {updated}",
    "meta.agent": "Agent",
    "meta.dir": "Diretório",
    "meta.installedBy": "Instalada por",
    "meta.linked": "Destino do link",
    "meta.mtime": "Atualizado",
    "meta.origin": "Origem",
    "meta.scope": "Escopo",
    "meta.source": "Referência da origem",
    "meta.status": "Status",
    "nav": "Habilidades",
    "notice.undoNone": "Nada para desfazer.",
    "notice.undoOk": "Desfeito.",
    "origin.builtin": "Integrada",
    "origin.git": "Git",
    "origin.manual": "Local",
    "origin.marketplace": "Marketplace",
    "origin.symlink": "Link simbólico",
    "panel.subtitle": "Somente habilidades locais compatíveis com DSH; importações de outros Agent usam links simbólicos e mantêm a origem.",
    "panel.title": "Habilidades",
    "refresh.failure": "Falha ao atualizar: {message}",
    "refresh.success": "Atualizado. Registros: {scanned}; habilidades do DSH: {count}.",
    "roots.custom": "personalizado",
    "roots.empty": "Nenhum diretório encontrado",
    "roots.missing": "não encontrado",
    "roots.readonly": "somente leitura",
    "roots.title": "Diretórios raiz das habilidades",
    "scope.global": "Global",
    "scope.project": "Projeto",
    "search.placeholder": "Buscar habilidades",
    "section.backups": "Backups",
    "section.health": "Relatório de integridade",
    "section.preview": "Prévia de SKILL.md",
    "section.sources": "Origens com o mesmo nome (todos os caminhos)",
    "shadowed.badge": "sobreposta pelo projeto",
    "source.externalPrefix": "de ",
    "sources.count": "Origens: {count}",
    "status.enabled": "Ativada",
    "switch.disable": "Desativar",
    "switch.enable": "Ativar",
    "sync.empty": "Nenhuma habilidade disponível para download neste manifesto",
    "sync.install": "Instalar",
    "sync.installSummary": "Instalação incremental: adicionadas {installed}, ignoradas {skipped}, com falha {failed}",
    "sync.note": "Somente nomes, referências de download e origens são sincronizados; os arquivos das habilidades nunca são enviados. O envio só acontece quando você clica no botão.",
    "sync.pull": "Obter manifesto",
    "sync.pullSummary": "{name} · ausentes: {missing} · existentes ignoradas: {existing}",
    "sync.push": "Enviar manifesto",
    "sync.pushSummary": "{status} · adicionadas: {added} · com mesmo nome mantidas: {kept} · total: {count}",
    "sync.repo": "Repositório pessoal (owner/repo)",
    "sync.title": "Sincronizar manifesto de habilidades",
    "tab.all": "Todas",
    "tab.disabled": "Desativadas",
    "tab.global": "Globais",
    "tab.project": "Projeto",
    "tab.warn": "Com avisos",
    "time.never": "—"
  }
}
    var currentLang = 'zh'
    function normalizeLocale(id) {
      var base = String(id || 'zh').toLowerCase().split('-')[0]
      return DICT[base] ? base : 'en'
    }
    function t(key, vars) {
      var dict = DICT[currentLang] || DICT.en
      var value = dict[key] || DICT.en[key] || DICT.zh[key] || key
      if (vars) {
        Object.keys(vars).forEach(function (name) {
          value = value.split('{{' + name + '}}').join(String(vars[name]))
          value = value.split('{' + name + '}').join(String(vars[name]))
        })
      }
      return value
    }

    function issueText(code) {
      var text = String(code)
      var base = text.split(':')[0]
      var label = t('issue.' + base) !== 'issue.' + base ? t('issue.' + base) : base
      return text.indexOf(':') > 0 ? label + ': ' + text.slice(text.indexOf(':') + 1) : label
    }

    // ------------------------------------------------------------------
    // API
    // ------------------------------------------------------------------
    function api(path, body) {
      return fetch(API + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      }).then(async function (res) {
        const text = await res.text()
        let data = null
        try { data = text ? JSON.parse(text) : null } catch { /* non-JSON upstream response */ }
        if (!res.ok || !data || data.ok !== true) {
          const detail = data && data.message ? data.message : ('HTTP ' + res.status + (text ? '' : ' · ' + t('http.emptyResponse')))
          const err = new Error(detail + ' · ' + path)
          err.code = data && data.error
          throw err
        }
        return data
      })
    }
    var pickerContext = null
    async function pickDirectory() {
      const ctx = pickerContext
      diag('pick-dir-start')
      try {
        const workspace = ctx && (ctx.uiWorkspace || (typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : null))
        if (workspace && typeof workspace.pickDirectory === 'function') {
          const dir = await workspace.pickDirectory()
          diag('pick-dir-done', dir || 'cancelled')
          return dir || null
        }
        const remote = ctx && ctx.remote
        if (remote && remote.directoryPicker && typeof remote.directoryPicker.pick === 'function') {
          const result = await remote.directoryPicker.pick()
          if (result && result.ok) {
            diag('pick-dir-done', result.value || 'cancelled')
            return result.value || null
          }
          if (result && result.error) throw result.error
        }
      } catch (e) {
        diag('pick-dir-error', (e && e.message) || e)
        throw e
      }
      diag('pick-dir-unavailable')
      return null
    }

    function formatTime(ts) {
      if (!ts) return null
      var d = new Date(ts)
      return Number.isNaN(d.getTime()) ? null : d.toLocaleString()
    }

    // ------------------------------------------------------------------
    // Tiny DOM helper (el('div', {class:'x', onclick:fn}, children...))
    // ------------------------------------------------------------------
    function el(tag, attrs) {
      var node = document.createElement(tag)
      if (attrs) {
        for (var k in attrs) {
          if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue
          var v = attrs[k]
          if (v === null || v === undefined || v === false) continue
          if (k === 'class') node.className = v
          else if (k === 'text') node.textContent = v
          else if (k === 'html') node.innerHTML = v
          else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v)
          else if (k === 'style' && typeof v === 'object') { for (var sk in v) node.style[sk] = v[sk] }
          else node.setAttribute(k, v === true ? '' : String(v))
        }
      }
      for (var i = 2; i < arguments.length; i++) append(node, arguments[i])
      return node
    }
    function append(node, child) {
      if (child === null || child === undefined || child === false) return
      if (Array.isArray(child)) { for (var i = 0; i < child.length; i++) append(node, child[i]); return }
      node.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child)
    }

    var toastSequence = 0
    function showToast(text, kind) {
      var id = ++toastSequence
      var toast = el('div', { class: 'skb-toast skb-toast--' + (kind || 'ok'), role: 'status', 'aria-live': 'polite', text: text, 'data-toast-id': id })
      document.body.appendChild(toast)
      requestAnimationFrame(function () { toast.classList.add('skb-toast--visible') })
      setTimeout(function () {
        toast.classList.remove('skb-toast--visible')
        setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast) }, 180)
      }, kind === 'error' ? 5000 : 3000)
    }

    // ------------------------------------------------------------------
    // Styles (head-injected once)
    // ------------------------------------------------------------------
    var CSS = '' +
'.skb-host-inner{pointer-events:auto;height:100%;overflow:hidden}' +
'.skb-root{display:flex;flex-direction:column;height:100%;box-sizing:border-box;padding:20px 24px;gap:12px;overflow:hidden;color:var(--dsw-alias-label-primary,#ddd);background:transparent;font:13px/1.5 -apple-system,"PingFang SC","Segoe UI",sans-serif}' +
'.skb-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}' +
'.skb-title{margin:0;font-size:18px;font-weight:600}.skb-subtitle{margin:4px 0 0;color:var(--dsw-alias-label-secondary,#999);max-width:640px}' +
'.skb-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}' +
'.skb-btn{font:inherit;cursor:pointer;border-radius:8px;padding:5px 12px;color:var(--dsw-alias-label-primary,#ddd);background:var(--dsw-alias-bg-layer-1,#222);border:1px solid var(--dsw-alias-border-l1,#333)}' +
'.skb-btn:hover:not(:disabled){border-color:var(--dsw-alias-border-l2,#444);background:var(--dsw-alias-bg-layer-2,#2a2a2a)}' +
'.skb-btn:disabled{opacity:.5;cursor:default}' +
'.skb-btn--primary{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#4D6BFE));border-color:transparent;color:var(--dsw-alias-label-primary-foreground,#1a1a1a)}' +
'.skb-btn--danger{color:var(--dsw-alias-state-error-primary,#e5534b)}' +
'.skb-notice{border-radius:8px;padding:8px 12px;border:1px solid var(--dsw-alias-border-l1,#333);background:var(--dsw-alias-bg-layer-1,#1c1c1c);color:var(--dsw-alias-label-secondary,#999)}' +
'.skb-notice--error{color:var(--dsw-alias-state-error-primary,#e5534b)}.skb-notice--ok{color:var(--dsw-alias-state-success-primary,#3fb950)}.skb-notice--warn{color:var(--dsw-alias-state-warn-primary,#d29922)}' +
'.skb-toast{position:fixed;top:18px;right:18px;z-index:1100;max-width:min(480px,calc(100vw - 36px));padding:10px 14px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1,#333);background:var(--dsw-alias-bg-layer-2,#242424);color:var(--dsw-alias-label-primary,#ddd);box-shadow:0 10px 32px rgba(0,0,0,.35);opacity:0;transform:translateY(-6px);transition:opacity .18s,transform .18s;pointer-events:none;font:13px/1.5 -apple-system,"PingFang SC","Segoe UI",sans-serif}' +
'.skb-toast--visible{opacity:1;transform:translateY(0)}.skb-toast--ok{border-color:var(--dsw-alias-state-success-primary,#3fb950)}.skb-toast--error{border-color:var(--dsw-alias-state-error-primary,#e5534b);color:var(--dsw-alias-state-error-primary,#e5534b)}' +
'.skb-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}' +
'.skb-tabs{display:flex;gap:4px;flex-wrap:wrap}' +
'.skb-tab{font:inherit;cursor:pointer;border:none;background:transparent;color:var(--dsw-alias-label-secondary,#999);padding:5px 12px;border-radius:8px}' +
'.skb-tab:hover{background:var(--dsw-alias-bg-layer-1,#222);color:var(--dsw-alias-label-primary,#ddd)}' +
'.skb-tab--active{background:var(--dsw-alias-bg-layer-2,#2a2a2a);color:var(--dsw-alias-label-primary,#ddd);font-weight:500}' +
'.skb-tab .skb-count{opacity:.7;margin-left:4px;font-size:12px}' +
'.skb-select,.skb-input{font:inherit;color:var(--dsw-alias-label-primary,#ddd);background:var(--dsw-alias-bg-layer-1,#222);border:1px solid var(--dsw-alias-border-l1,#333);border-radius:8px;padding:5px 10px}' +
'.skb-search{flex:1;min-width:180px;max-width:360px;margin-left:auto}' +
'.skb-list{flex:1;overflow-y:auto;background:transparent;border:none;border-radius:0}' +
'.skb-row{display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--dsw-alias-border-l1,#2a2a2a);padding:12px 4px;cursor:pointer}' +
'.skb-row:last-child{border-bottom:none}.skb-row:hover{background:var(--dsw-alias-bg-layer-2,#242424)}' +
'.skb-row--active{background:var(--dsw-alias-bg-layer-2,#242424)}.skb-row--disabled{opacity:.62}' +
'.skb-cube{flex:none;width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;border:1px solid var(--dsw-alias-border-l1,#333);background:var(--dsw-alias-bg-layer-2,#2a2a2a);color:var(--dsw-alias-label-secondary,#999)}' +
'.skb-row-main{flex:1;min-width:0}' +
'.skb-row-name{font-weight:600;display:flex;gap:6px;align-items:center;flex-wrap:wrap}' +
'.skb-row-desc{display:block;color:var(--dsw-alias-label-secondary,#999);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}' +
'.skb-badges{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}' +
'.skb-badge{font-size:11px;padding:1px 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1,#333);color:var(--dsw-alias-label-secondary,#999)}' +
'.skb-badge--warn{color:var(--dsw-alias-state-warn-primary,#d29922);border-color:var(--dsw-alias-state-warn-primary,#d29922)}' +
'.skb-badge--error{color:var(--dsw-alias-state-error-primary,#e5534b);border-color:var(--dsw-alias-state-error-primary,#e5534b)}' +
'.skb-badge--foreign{color:var(--dsw-alias-state-warn-primary,#d29922)}' +
'.skb-row-side{flex:none;display:flex;align-items:center;gap:8px}' +
'.skb-loaded{font-size:12px;color:var(--dsw-alias-label-secondary,#999);white-space:nowrap}' +
'.skb-loaded--yes{color:var(--dsw-alias-state-success-primary,#3fb950)}' +
'.skb-switch{position:relative;width:40px;height:22px;border-radius:999px;border:none;cursor:pointer;background:var(--dsw-alias-border-l2,#444);flex:none;padding:0}' +
'.skb-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary,#4D6BFE)}' +
'.skb-switch::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .15s}' +
'.skb-switch[aria-checked="true"]::after{transform:translateX(18px);background:var(--dsw-alias-label-primary-foreground,#1a1a1a)}' +
'.skb-empty{padding:40px 16px;text-align:center;color:var(--dsw-alias-label-secondary,#999)}' +
'.skb-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1002}' +
'.skb-drawer{position:fixed;top:0;right:0;bottom:0;width:min(560px,92vw);background:var(--dsw-alias-bg-layer-1,#1c1c1c);border-left:1px solid var(--dsw-alias-border-l1,#333);z-index:1003;display:flex;flex-direction:column;box-shadow:-12px 0 32px rgba(0,0,0,.35)}' +
'.skb-drawer-head{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--dsw-alias-border-l1,#2a2a2a)}' +
'.skb-drawer-body{flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:16px}' +
'.skb-drawer-foot{display:flex;gap:8px;padding:14px 20px;border-top:1px solid var(--dsw-alias-border-l1,#2a2a2a);flex-wrap:wrap}' +
'.skb-drawer-title{margin:0;font-size:17px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}' +
'.skb-meta{display:grid;grid-template-columns:110px 1fr;gap:6px 12px;font-size:12.5px;margin:0}' +
'.skb-meta dt{color:var(--dsw-alias-label-secondary,#999)}.skb-meta dd{margin:0;overflow-wrap:anywhere}' +
'.skb-pre{margin:0;padding:12px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1,#2a2a2a);background:var(--dsw-alias-bg-base,#111);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:320px;overflow-y:auto}' +
'.skb-section-title{margin:0 0 6px;font-size:13px;font-weight:600}' +
'.skb-modal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(640px,94vw);max-height:84vh;overflow-y:auto;background:var(--dsw-alias-bg-layer-1,#1c1c1c);border:1px solid var(--dsw-alias-border-l1,#333);border-radius:14px;z-index:1004;padding:18px 20px;display:flex;flex-direction:column;gap:12px;box-shadow:0 18px 48px rgba(0,0,0,.4);color:var(--dsw-alias-label-primary,#ddd)}' +
'.skb-modal h3{margin:0;font-size:15px}.skb-modal-close{position:absolute;top:12px;right:12px;width:28px;height:28px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#999);font-size:20px;line-height:1;cursor:pointer}.skb-modal-close:hover{background:var(--dsw-alias-bg-layer-2,#2a2a2a);color:var(--dsw-alias-label-primary,#fff)}' +
'.skb-menu{position:absolute;top:calc(100% + 6px);right:0;background:var(--dsw-alias-bg-layer-2,#242424);border:1px solid var(--dsw-alias-border-l1,#333);border-radius:10px;padding:6px;z-index:30;display:flex;flex-direction:column;min-width:180px;box-shadow:0 10px 30px rgba(0,0,0,.35)}' +
'.skb-menu button{font:inherit;text-align:left;background:transparent;border:none;color:var(--dsw-alias-label-primary,#ddd);padding:8px 10px;border-radius:6px;cursor:pointer}' +
'.skb-menu button:hover{background:var(--dsw-alias-bg-layer-1,#1c1c1c)}' +
'.skb-relative{position:relative}' +
'.skb-market-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1,#2a2a2a);border-radius:10px}' +
'.skb-market-main{flex:1;min-width:0}.skb-market-ref{font-weight:600;overflow-wrap:anywhere}.skb-market-meta{color:var(--dsw-alias-label-secondary,#999);font-size:12px}' +
'.skb-health-summary{display:flex;gap:16px;flex-wrap:wrap}' +
'.skb-health-chip{display:flex;flex-direction:column;align-items:center;padding:10px 16px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1,#2a2a2a)}' +
'.skb-health-chip .n{font-size:20px;font-weight:700}' +
'.skb-health-chip--ok .n{color:var(--dsw-alias-state-success-primary,#3fb950)}' +
'.skb-health-chip--warn .n{color:var(--dsw-alias-state-warn-primary,#d29922)}' +
'.skb-health-chip--error .n{color:var(--dsw-alias-state-error-primary,#e5534b)}' +
'.skb-log-row{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l1,#2a2a2a);font-size:12.5px}' +
'.skb-log-row:last-child{border-bottom:none}.skb-log-time{color:var(--dsw-alias-label-secondary,#999);flex:none;width:150px}' +
'.skb-mutating{opacity:.55;pointer-events:none}' +
'.skb-remotes{display:flex;flex-direction:column;gap:8px}.skb-remote-row{display:flex;gap:10px;align-items:flex-start;padding:12px;border:1px solid var(--dsw-alias-border-l1,#333);border-radius:10px}.skb-remote-main{flex:1;min-width:0}.skb-remote-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.skb-sync-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}.skb-sync-form .wide{grid-column:1/-1}.skb-sync-results{display:flex;flex-direction:column;gap:10px}.skb-test-result{font-size:12px}.skb-sync-toolbar,.skb-sync-settings-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:4px 0 12px}.skb-sync-settings-head{justify-content:flex-start}.skb-sync-settings-head .skb-section-title,.skb-sync-toolbar .skb-section-title{margin:0}.skb-sync-settings-actions{grid-column:1/-1;display:flex;gap:8px;margin-top:4px}' +
'.skb-market-search{display:flex;gap:8px}.skb-market-search .skb-input{flex:1}' +
'.skb-market-filters{display:flex;gap:8px;align-items:center;flex-wrap:wrap}' +
'.skb-author-filter{flex:1;min-width:120px}' +
'.skb-source-config{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--dsw-alias-border-l1,#333);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#1c1c1c)}' +
'.skb-source-row{display:flex;align-items:center;justify-content:space-between;gap:8px}' +
'.skb-source-row label{display:flex;align-items:center;gap:6px}' +
'.skb-source-new{display:grid;grid-template-columns:1fr 1fr auto;gap:8px}' +
'.skb-market-results{display:flex;flex-direction:column;gap:8px;overflow-y:auto}' +
'.skb-market-desc{color:var(--dsw-alias-label-secondary,#999);font-size:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
'.skb-loading{display:flex;align-items:center;justify-content:center;gap:10px;padding:32px;color:var(--dsw-alias-label-secondary,#999)}' +
'.skb-spinner{width:16px;height:16px;border-radius:50%;border:2px solid var(--dsw-alias-border-l2,#555);border-top-color:var(--dsw-alias-brand-primary,#4D6BFE);animation:skb-spin .8s linear infinite}' +
'@keyframes skb-spin{to{transform:rotate(360deg)}}' +
'@media (prefers-reduced-motion: reduce){.skb-spinner{animation:none}}' +
'.skb-field{display:block}.skb-field input{display:block;width:100%;margin-top:4px}'

    var stylesInjected = false
    function injectStyles() {
      if (stylesInjected) return
      try {
        if (typeof document === 'undefined' || !document.head) return
        if (document.querySelector('style[data-plugin-css="dsh-skills-butler/panel.css"]')) { stylesInjected = true; return }
        var tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-skills-butler'
        tag.dataset.pluginCss = 'dsh-skills-butler/panel.css'
        tag.textContent = CSS
        document.head.appendChild(tag)
        stylesInjected = true
      } catch (e) { /* never break */ }
    }

    function compactNumber(value) {
      if (value === null || value === undefined || value === '') return '—'
      if (typeof value === 'string') return value
      const n = Number(value)
      if (!Number.isFinite(n)) return '—'
      if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
      if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
      return String(n)
    }

    function installCount(value) {
      if (typeof value === 'number') return value
      const m = /([\d.]+)\s*([KM]?)/i.exec(String(value || ''))
      if (!m) return 0
      const n = parseFloat(m[1])
      return m[2].toUpperCase() === 'M' ? n * 1000000 : m[2].toUpperCase() === 'K' ? n * 1000 : n
    }

    function cubeSvg() {
      var span = el('span', { class: 'skb-cube' })
      span.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2.7 21 7.5v9L12 21.3 3 16.5v-9L12 2.7z"/><path d="M3 7.5l9 4.8 9-4.8"/><path d="M12 21.3v-9"/></svg>'
      return span
    }

    // ------------------------------------------------------------------
    // State + render (full re-render on change; the panel is small enough)
    // ------------------------------------------------------------------
    var S = {
      view: null, error: null, notice: null, busy: false,
      search: '', tab: 'all', agentFilter: 'all', originFilter: 'all',
      selected: null, detail: null, backups: [],
      modal: null, confirmSkill: null,
      market: { query: '', rows: [], searched: false, installing: null },
      localForm: { target: '', name: '' },
      health: null, logs: null, rootsSnapshot: null,
      sync: { repo: '', result: null, manifest: null, busy: false }
    }
    var rootEl = null
    var sessionIdProvider = function () { return null }

    function setState(patch) {
      for (var k in patch) S[k] = patch[k]
      render()
    }

    function mutate(path, body, okText) {
      setState({ busy: true, notice: null })
      return api(path, body).then(function (result) {
        if (okText) setState({ notice: { kind: 'ok', text: okText } })
        return load().then(function () { return result })
      }).catch(function (e) {
        setState({ notice: { kind: 'error', text: e.message } })
        return null
      }).finally(function () { setState({ busy: false }) })
    }

    function load() {
      var sid = sessionIdProvider()
      return api('/view' + (sid ? '?sessionId=' + encodeURIComponent(sid) : '')).then(function (data) {
        diag('view-ok', 'skills=' + (data.skills ? data.skills.length : '?') + ' loaded=' + (data.skills ? data.skills.filter(function (x) { return x.loaded }).length : '?') + ' dbg=' + JSON.stringify(data.loadedDebug || null).slice(0, 240))
        setState({ view: data, error: null })
        return data
      }).catch(function (e) {
        diag('view-error', e.message)
        setState({ error: e.message })
        return null
      })
    }

    function refreshAll() {
      if (S.busy) return
      setState({ busy: true, notice: null })
      api('/refresh', {}).then(function (result) {
        const count = typeof result.dsh === 'number' ? result.dsh : (result.skills ? result.skills.length : 0)
        return load().then(function () {
          showToast(t('refresh.success', { scanned: result.scanned || count, count }), 'ok')
        })
      }).catch(function (e) {
        showToast(t('refresh.failure', { message: e.message }), 'error')
      }).finally(function () { setState({ busy: false }) })
    }

    function filtered() {
      if (!S.view) return []
      var q = S.search.trim().toLowerCase()
      return S.view.skills.filter(function (s) {
        if (S.tab === 'global' && s.scope !== 'global') return false
        if (S.tab === 'project' && s.scope !== 'project') return false
        if (S.tab === 'disabled' && !s.disabled) return false
        if (S.tab === 'warn' && (!s.issues || s.issues.length === 0)) return false
        if (S.agentFilter !== 'all' && s.agent !== S.agentFilter) return false
        if (S.originFilter !== 'all' && s.origin !== S.originFilter) return false
        if (q && !(s.name.toLowerCase().indexOf(q) >= 0 || (s.description || '').toLowerCase().indexOf(q) >= 0)) return false
        return true
      })
    }

    function counts() {
      var skills = S.view ? S.view.skills : []
      return {
        all: skills.length,
        global: skills.filter(function (s) { return s.scope === 'global' }).length,
        project: skills.filter(function (s) { return s.scope === 'project' }).length,
        disabled: skills.filter(function (s) { return s.disabled }).length,
        warn: skills.filter(function (s) { return s.issues && s.issues.length > 0 }).length,
        unloaded: skills.filter(function (s) { return !s.loaded }).length
      }
    }

    function openDetail(skill) {
      setState({ selected: skill, detail: null })
      api('/detail?name=' + encodeURIComponent(skill.name) + (skill.dir ? '&dir=' + encodeURIComponent(skill.dir) : ''))
        .then(function (d) { if (S.selected && S.selected.dir === skill.dir) setState({ detail: d }) })
        .catch(function (e) { setState({ detail: { ok: false, error: e.message } }) })
      api('/backups').then(function (b) {
        setState({ backups: b.backups.filter(function (x) { return x.skill === skill.name }) })
      }).catch(function () {})
    }

    function switchEl(skill) {
      var sw = el('button', {
        class: 'skb-switch', type: 'button', role: 'switch',
        'aria-checked': (!skill.disabled).toString(),
        'aria-label': skill.disabled ? t('switch.enable') : t('switch.disable'),
        onclick: function (e) {
          e.stopPropagation()
          if (skill.disabled) mutate('/ops/enable', { name: skill.name, dir: skill.dir })
          else mutate('/ops/disable', { name: skill.name, dir: skill.dir })
        }
      })
      return sw
    }

    function rowEl(skill) {
      return el('div', {
        class: 'skb-row'
          + (S.selected && S.selected.dir === skill.dir ? ' skb-row--active' : '')
          + (skill.disabled ? ' skb-row--disabled' : ''),
        role: 'button', tabindex: '0', 'aria-label': skill.name,
        onclick: function () { openDetail(skill) },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(skill) } }
      },
        cubeSvg(),
        el('div', { class: 'skb-row-main' },
          el('div', { class: 'skb-row-name' },
            skill.name,
            skill.pinned ? el('span', { class: 'skb-badge', text: '📌' }) : null,
            skill.disabled ? el('span', { class: 'skb-badge', text: t('disabled.badge') }) : null,
            skill.shadowed ? el('span', { class: 'skb-badge skb-badge--warn', text: t('shadowed.badge') }) : null,
            skill.issues && skill.issues.length > 0 ? el('span', { class: 'skb-badge skb-badge--error', text: '⚠ ' + skill.issues.length }) : null),
          el('span', { class: 'skb-row-desc', text: skill.description || skill.dir }),
          el('div', { class: 'skb-badges' },
            el('span', { class: 'skb-badge', text: t('scope.' + skill.scope) }),
            /^external:(.+)$/.test(skill.sourceRef || '') ? el('span', { class: 'skb-badge', text: t('source.externalPrefix') + /^external:(.+)$/.exec(skill.sourceRef)[1] }) : null,
            el('span', { class: 'skb-badge', text: t('origin.' + skill.origin) }),
            skill.sources && skill.sources.length > 1 ? el('span', { class: 'skb-badge', text: t('sources.count', { count: skill.sources.length }) }) : null)),
        el('div', { class: 'skb-row-side' },
          el('span', { class: 'skb-loaded' + (skill.loaded ? ' skb-loaded--yes' : ''), text: (skill.loaded ? '● ' : '○ ') + (skill.loaded ? t('loaded.yes') : t('loaded.no')) }),
          switchEl(skill)))
    }

    function overlay(contentEl, onClose) {
      return el('div', { class: 'skb-overlay', onclick: function (e) {
        if (e.target === e.currentTarget) onClose()
      } }, contentEl)
    }

    function drawerEl() {
      if (!S.selected) return null
      var skill = S.selected
      var body
      if (!S.detail) body = el('div', { class: 'skb-empty', text: t('list.loading') })
      else if (S.detail.ok === false) body = el('div', { class: 'skb-notice skb-notice--error', text: S.detail.error })
      else {
        var d = S.detail
        var meta = el('dl', { class: 'skb-meta' },
          el('dt', { text: t('meta.scope') }), el('dd', { text: t('scope.' + d.record.scope) }),
          el('dt', { text: t('meta.agent') }), el('dd', { text: d.record.agent }),
          el('dt', { text: t('meta.origin') }), el('dd', { text: t('origin.' + d.record.origin) }))
        if (d.record.sourceRef) { meta.appendChild(el('dt', { text: t('meta.source') })); meta.appendChild(el('dd', { text: d.record.sourceRef })) }
        if (d.record.linkedFrom) { meta.appendChild(el('dt', { text: t('meta.linked') })); meta.appendChild(el('dd', { text: d.record.linkedFrom })) }
        meta.appendChild(el('dt', { text: t('meta.installedBy') }))
        meta.appendChild(el('dd', { text: d.record.installedBy === 'foreign' ? t('foreign.badge') + ' (foreign)' : 'dsh-skills' }))
        meta.appendChild(el('dt', { text: t('meta.mtime') }))
        meta.appendChild(el('dd', { text: formatTime(d.record.mtime) || t('time.never') }))
        meta.appendChild(el('dt', { text: t('meta.dir') }))
        meta.appendChild(el('dd', { text: d.record.dir }))
        meta.appendChild(el('dt', { text: t('meta.status') }))
        meta.appendChild(el('dd', { text: d.health.issues.length ? d.health.issues.map(issueText).join('；') : '✓ ' + t('health.ok') }))

        body = el('div', null)
        body.appendChild(meta)
        if (d.record.sources && d.record.sources.length > 1) {
          body.appendChild(el('h3', { class: 'skb-section-title', text: t('section.sources') }))
          body.appendChild(el('pre', { class: 'skb-pre', text: d.record.sources.map(function (source) { return source.dir + ' [' + (source.agent || source.scope) + ']' }).join('\n') }))
        }
        if (d.health.issues.length > 0) {
          body.appendChild(el('h3', { class: 'skb-section-title', text: t('section.health') }))
          body.appendChild(el('pre', { class: 'skb-pre', text: d.health.issues.map(function (i) { return '• ' + issueText(i) }).join('\n') }))
        }
        if (d.body && d.body.ok) {
          body.appendChild(el('h3', { class: 'skb-section-title', text: t('section.preview') }))
          body.appendChild(el('pre', { class: 'skb-pre', text: d.body.text.length > 12000 ? d.body.text.slice(0, 12000) + '\n… [truncated]' : d.body.text }))
        } else if (d.body && !d.body.ok) {
          body.appendChild(el('div', { class: 'skb-notice skb-notice--warn', text: d.body.error }))
        }
        if (S.backups.length > 0) {
          body.appendChild(el('h3', { class: 'skb-section-title', text: t('section.backups') }))
          var bl = el('div', null)
          S.backups.slice(0, 5).forEach(function (b) {
            bl.appendChild(el('div', { class: 'skb-market-row' },
              el('div', { class: 'skb-market-main' },
                el('div', { class: 'skb-market-ref', text: b.entry }),
                el('div', { class: 'skb-market-meta', text: (formatTime(b.takenAt) || '') + ' · ' + b.reason })),
              el('button', { class: 'skb-btn', type: 'button', text: t('drawer.rollback'), onclick: function () {
                mutate('/ops/rollback', { name: skill.name, backupDir: b.dir }).then(function () { setState({ selected: null }) })
              } })))
          })
          body.appendChild(bl)
        }
      }
      var foot = null
      if (S.detail && S.detail.record) {
        var r = S.detail.record
        foot = el('div', { class: 'skb-drawer-foot' },
          el('button', { class: 'skb-btn skb-btn--danger', type: 'button', text: t('drawer.uninstall'), onclick: function () { setState({ modal: 'confirm', confirmSkill: r }) } }),
          r.origin === 'symlink' ? el('button', { class: 'skb-btn', type: 'button', text: t('drawer.materialize'), onclick: function () { mutate('/ops/materialize', { name: skill.name, dir: skill.dir }).then(function () { setState({ selected: null }) }) } }) : null,
          r.origin === 'symlink' ? el('button', { class: 'skb-btn', type: 'button', text: t('drawer.unlink'), onclick: function () { mutate('/ops/unlink', { name: skill.name, dir: skill.dir }).then(function () { setState({ selected: null }) }) } }) : null,
          el('button', { class: 'skb-btn', type: 'button',
            text: t('drawer.update'),
            disabled: !(r.sourceRef && !String(r.sourceRef).startsWith('external:')) || (S.view && S.view.env && S.view.env.ok === false),
            title: t('drawer.updateUnsupported'),
            onclick: function () { mutate('/cli/update', { names: [skill.name], scope: skill.scope }) } }),
          el('button', { class: 'skb-btn', type: 'button', text: r.pinned ? t('drawer.unpin') : t('drawer.pin'), onclick: function () { mutate('/ops/pin', { name: skill.name, dir: skill.dir, pinned: !r.pinned }) } }))
      }
      var drawer = el('div', { class: 'skb-drawer', role: 'dialog' },
        el('div', { class: 'skb-drawer-head' }, cubeSvg(), el('h2', { class: 'skb-drawer-title', text: skill.name }),
          el('button', { class: 'skb-btn', type: 'button', text: '✕', onclick: function () { setState({ selected: null }) } })),
        el('div', { class: 'skb-drawer-body' }, body),
        foot)
      return overlay(drawer, function () { setState({ selected: null }) })
    }

    function modalShell(title, children, onClose) {
      return overlay(el('div', { class: 'skb-modal', role: 'dialog' },
        el('button', { class: 'skb-modal-close', type: 'button', 'aria-label': 'close', text: '×', onclick: onClose || function () { setState({ modal: null }) } }),
        el('h3', { text: title }),
        children), onClose || function () { setState({ modal: null }) })
    }

    function modalsEl() {
      if (!S.modal) return null
      if (S.modal === 'confirm') {
        var skill = S.confirmSkill
        return modalShell(t('confirm.title'), el('div', null,
          skill && skill.installedBy === 'foreign' ? el('div', { class: 'skb-notice skb-notice--warn', text: t('confirm.removeForeign').replace('{{warning}}', t('foreign.warning')) }) : null,
          el('div', { text: skill ? t('confirm.remove').replace('{{dir}}', skill.dir) : '' }),
          el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
            el('button', { class: 'skb-btn', type: 'button', text: t('confirm.cancel'), onclick: function () { setState({ modal: null }) } }),
            el('button', { class: 'skb-btn skb-btn--danger', type: 'button', text: t('confirm.ok'), onclick: function () {
              setState({ modal: null })
              mutate('/ops/remove', { name: skill.name, dir: skill.dir, confirmed: true })
            } }))))
      }
      if (S.modal === 'market') {
        var m = S.market
        if (!m.sourcesLoaded) {
          m.sourcesLoaded = true
          api('/market/sources').then(function (data) {
            setState({ market: { ...S.market, sources: data.sources } })
          }).catch(function () {
            setState({ market: { ...S.market, sources: [
              { id: 'skills', name: t('market.officialSource'), type: 'skills', enabled: true },
              { id: 'github', name: 'GitHub', type: 'github', enabled: true },
              { id: 'skillhub', name: 'SkillHub', type: 'skillhub', enabled: true, installGuide: 'https://skillhub.cn/install/skillhub.md' }
            ] } })
          })
        }
        var enabledSources = (m.sources || []).filter(function (src) { return src.enabled })
        var rows = (m.rows || []).filter(function (row) {
          if (!m.author) return true
          return String(row.author || '').toLowerCase().indexOf(m.author.toLowerCase()) >= 0
        })
        var sort = m.sort || 'installs'
        rows.sort(function (a, b) {
          if (sort === 'stars') return installCount(b.stars) - installCount(a.stars)
          if (sort === 'updated') return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
          if (sort === 'name') return a.name.localeCompare(b.name)
          return installCount(b.installs) - installCount(a.installs)
        })
        var searchRow = el('div', { class: 'skb-market-search' },
          el('input', { class: 'skb-input', value: m.query, placeholder: t('b.search.skills.by.keyword.e.g.mcp.tests.browser'),
            oninput: function (e) { m.query = e.target.value },
            onkeydown: function (e) { if (e.key === 'Enter') searchMarket() } }),
          el('button', { class: 'skb-btn skb-btn--primary', type: 'button', text: t('market.search'), disabled: !!m.loading, onclick: searchMarket }))
        function searchMarket() {
          if (!String(m.query || '').trim()) {
            setState({ market: { ...m, error: t('b.enter.a.skill.keyword') } })
            return
          }
          setState({ market: { ...m, loading: true, error: null, searched: false } })
          api('/market/search', { source: m.source || 'skills', query: m.query }).then(function (result) {
            if (result.ok === false) {
              setState({ market: { ...S.market, loading: false, searched: true, rows: [], error: result.reason || t('market.searchFailed'), installGuide: result.installGuide || null } })
            } else {
              setState({ market: { ...S.market, loading: false, searched: true, rows: result.rows || [], error: null } })
            }
          }).catch(function (e) {
            setState({ market: { ...S.market, loading: false, searched: true, rows: [], error: e.message } })
          })
        }
        function onSourceChange(e) {
          setState({ market: { ...m, source: e.target.value, rows: [], searched: false } })
        }
        function onSortChange(e) {
          setState({ market: { ...m, sort: e.target.value } })
        }
        function onConfigToggle() {
          setState({ market: { ...m, configOpen: !m.configOpen } })
        }
        var filterRow = el('div', { class: 'skb-market-filters' },
          el('select', { class: 'skb-select', value: m.source || 'skills', onchange: onSourceChange },
            enabledSources.map(function (src) { return el('option', { value: src.id, text: src.name, selected: (m.source || 'skills') === src.id || null }) })),
          el('select', { class: 'skb-select', value: sort, onchange: onSortChange },
            el('option', { value: 'installs', text: t('b.downloads') }),
            el('option', { value: 'stars', text: t('b.stars') }),
            el('option', { value: 'updated', text: t('b.recently.updated') }),
            el('option', { value: 'name', text: t('b.name') })),
          el('input', { class: 'skb-input skb-author-filter', value: m.author || '', placeholder: t('b.filter.by.author'), oninput: function (e) { m.author = e.target.value } }),
          el('button', { class: 'skb-btn', type: 'button', text: m.configOpen ? t('b.hide.sources') : t('b.configure.sources'), onclick: onConfigToggle }))
        var config = null
        if (m.configOpen) {
          config = el('div', { class: 'skb-source-config' },
            (m.sources || []).map(function (src) {
              return el('div', { class: 'skb-source-row' },
                el('label', null,
                  el('input', { type: 'checkbox', checked: !!src.enabled, onchange: function (e) {
                    const sources = m.sources.map((x) => x.id === src.id ? { ...x, enabled: e.target.checked } : x)
                    setState({ market: { ...m, sources } })
                  } }),
                  ' ' + src.name + '（' + src.type + '）'),
                ['skills', 'github', 'skillhub'].indexOf(src.id) < 0 ? el('button', { class: 'skb-btn skb-btn--danger', type: 'button', text: t('b.delete'), onclick: function () {
                  setState({ market: { ...m, sources: m.sources.filter((x) => x.id !== src.id) } })
                } }) : null)
            }),
            el('div', { class: 'skb-source-new' },
              el('input', { class: 'skb-input', value: m.newName || '', placeholder: t('b.new.source.name'), oninput: function (e) { m.newName = e.target.value } }),
              el('input', { class: 'skb-input', value: m.newSuffix || '', placeholder: t('b.github.query.filter.e.g.topic.skills'), oninput: function (e) { m.newSuffix = e.target.value } }),
              el('button', { class: 'skb-btn', type: 'button', text: t('b.add.github.source'), onclick: function () {
                if (!m.newName || !m.newName.trim()) return
                const source = { id: 'github-custom-' + Date.now(), name: m.newName.trim(), type: 'github', enabled: true, querySuffix: (m.newSuffix || '').trim() }
                setState({ market: { ...m, sources: [...m.sources, source], newName: '', newSuffix: '' } })
              } })),
            el('div', null,
              el('button', { class: 'skb-btn skb-btn--primary', type: 'button', text: t('b.save.sources'), onclick: function () {
                api('/market/sources', { sources: m.sources }).then(function () {
                  setState({ market: { ...m, configOpen: false }, notice: { kind: 'ok', text: t('b.sources.saved') } })
                }).catch(function (e) { setState({ notice: { kind: 'error', text: e.message } }) })
              } })))
        }
        var body = el('div', null, searchRow, filterRow, config)
        if (m.loading) {
          body.appendChild(el('div', { class: 'skb-loading', role: 'status' }, el('span', { class: 'skb-spinner' }), t('b.searching')))
        } else if (m.error) {
          body.appendChild(el('div', { class: 'skb-notice skb-notice--warn', text: m.error }))
          if (m.installGuide) body.appendChild(el('a', { href: m.installGuide, target: '_blank', rel: 'noreferrer', text: t('b.skillhub.installation.guide') }))
        } else if (m.searched && rows.length === 0) {
          body.appendChild(el('div', { class: 'skb-empty', text: t('market.empty') }))
        } else {
          body.appendChild(el('div', { class: 'skb-market-results' }, rows.map(function (row) {
            return el('div', { class: 'skb-market-row' },
              el('div', { class: 'skb-market-main' },
                el('div', { class: 'skb-market-ref', text: row.ref }),
                el('div', { class: 'skb-market-desc', text: row.description || '' }),
                el('div', { class: 'skb-market-meta' },
                  '⭐ ' + compactNumber(row.stars) + ' · ⬇ ' + (row.installs || '—') + t('market.versionUpdated', { version: row.version || t('b.unversioned'), updated: formatTime(row.updatedAt) || '—' })),
                el('div', { class: 'skb-market-meta' }, t('market.authorSource', { author: row.author || '—', source: row.sourceName || row.source }))),
              el('button', { class: 'skb-btn skb-btn--primary', type: 'button', disabled: m.installing !== null,
                text: m.installing === row.ref ? t('market.installing') : t('market.install'),
                onclick: function () {
                  const source = (m.sources || []).find((src) => src.id === row.source)
                  setState({ market: { ...m, installing: row.ref } })
                  const request = source && source.type === 'skillhub'
                    ? api('/skillhub/install', { name: row.install, source: row.source })
                    : api('/cli/add', { pkg: row.install, scope: 'global' })
                  request.then(function (result) {
                    if (result.ok === false) {
                      setState({ market: { ...m, installing: null, error: result.reason || t('market.installFailed'), installGuide: result.installGuide || null } })
                    } else {
                      setState({ market: { ...m, installing: null }, notice: { kind: 'ok', text: t('market.installed', { ref: row.ref }) }, modal: null })
                      load()
                    }
                  }).catch(function (e) {
                    setState({ market: { ...m, installing: null, error: e.message } })
                  })
                } }))
          })))
        }
        return modalShell(t('market.title'), body)
      }
      if (S.modal === 'external') {
        var external = (S.view && S.view.externalSkills) || []
        return modalShell(t('external.title'), el('div', null,
          external.length === 0 ? el('div', { class: 'skb-empty', text: t('external.empty') }) : null,
          external.map(function (item) {
            return el('div', { class: 'skb-market-row' },
              el('div', { class: 'skb-market-main' },
                el('div', { class: 'skb-market-ref', text: item.name }),
                el('div', { class: 'skb-market-meta', text: t('source.externalPrefix') + item.sourceAgent + ' · ' + (item.description || item.dir) })),
              el('button', { class: 'skb-btn skb-btn--primary', type: 'button', text: t('external.import'), onclick: function () {
                mutate('/ops/link', { name: item.name, target: item.dir, sourceAgent: item.sourceAgent }).then(function (r) {
                  if (r) setState({ modal: null })
                })
              } }))
          })))
      }
      if (S.modal === 'sync') {
        var sync = S.sync
        if (!sync.remotesLoaded) {
          sync.remotesLoaded = true
          api('/sync/remotes').then(function (data) {
            setState({ sync: { ...S.sync, remotes: data.remotes, selected: data.remotes.filter((r) => r.enabled).map((r) => r.id) } })
          }).catch(function (e) { setState({ sync: { ...S.sync, error: e.message } }) })
        }
        var form = sync.form || { name: '', type: 'github', url: '', username: '', password: '', insecureSkipTls: false }
        function updateForm(patch) { form = { ...form, ...patch }; S.sync.form = form }
        function openSettings(remote) {
          setState({ sync: { ...S.sync, screen: 'settings', editingId: remote ? remote.id : null,
            form: remote ? { ...remote, password: '' } : { name: '', type: 'github', url: '', username: '', password: '', insecureSkipTls: false }, error: null } })
        }
        function persistRemotes(remotes, message) {
          S.sync.busy = true; render()
          api('/sync/remotes', { remotes }).then(function (result) {
            setState({ sync: { ...S.sync, remotes: result.remotes, busy: false, screen: 'list', form: null, editingId: null,
              notice: { kind: 'ok', text: message } } })
          }).catch(function (e) { setState({ sync: { ...S.sync, busy: false, error: e.message } }) })
        }
        function saveRemote() {
          if (!form.url.trim()) { setState({ sync: { ...S.sync, error: t('b.enter.a.remote.url') } }); return }
          const remote = {
            id: sync.editingId || 'remote-' + Date.now().toString(36),
            name: form.name.trim() || form.url.trim(), type: form.type, url: form.url.trim(),
            username: form.username || '', password: form.password || '', insecureSkipTls: !!form.insecureSkipTls, enabled: true
          }
          const exists = sync.remotes.some((r) => r.id === remote.id)
          const remotes = exists ? sync.remotes.map((r) => r.id === remote.id ? { ...r, ...remote } : r) : [...sync.remotes, remote]
          S.sync.selected = Array.from(new Set([...sync.selected, remote.id]))
          persistRemotes(remotes, t('b.remote.settings.saved'))
        }
        var body = el('div', null,
          el('div', { class: 'skb-notice', text: t('sync.note') }),
          sync.screen === 'settings' ? el('div', null,
            el('div', { class: 'skb-sync-settings-head' },
              el('button', { class: 'skb-btn', type: 'button', text: t('b.back.to.sync'), onclick: function () {
                setState({ sync: { ...S.sync, screen: 'list', form: null, editingId: null, error: null } })
              } }),
              el('h3', { class: 'skb-section-title', text: sync.editingId ? t('b.edit.remote') : t('b.add.remote') })),
            el('div', { class: 'skb-sync-form' },
              el('input', { class: 'skb-input', value: form.name, placeholder: t('b.remote.name'), oninput: function (e) { updateForm({ name: e.target.value }) } }),
              el('select', { class: 'skb-select', value: form.type, onchange: function (e) { updateForm({ type: e.target.value }) } },
                el('option', { value: 'github', text: 'GitHub' }),
                el('option', { value: 'gitee', text: 'Gitee' }),
                el('option', { value: 'gitlab', text: t('b.gitlab.self.hosted') }),
                el('option', { value: 'custom', text: t('b.custom.git') }),
                el('option', { value: 'file', text: t('b.local.file') })),
              el('input', { class: 'skb-input wide', value: form.url, placeholder: 'https://github.com/owner/repo.git / git@host:team/repo.git', oninput: function (e) { updateForm({ url: e.target.value }) } }),
              el('input', { class: 'skb-input', value: form.username, placeholder: t('b.username.optional'), oninput: function (e) { updateForm({ username: e.target.value }) } }),
              el('input', { class: 'skb-input', type: 'password', value: form.password, placeholder: t('b.password.token.stored.locally.only'), oninput: function (e) { updateForm({ password: e.target.value }) } }),
              el('label', { class: 'wide' },
                el('input', { type: 'checkbox', checked: !!form.insecureSkipTls, onchange: function (e) { updateForm({ insecureSkipTls: e.target.checked }) } }),
                t('b.skip.tls.verification.for.self.signed.certificat')),
              el('div', { class: 'skb-sync-settings-actions' },
                el('button', { class: 'skb-btn skb-btn--primary', type: 'button', text: t('b.save.settings'), disabled: !!sync.busy, onclick: saveRemote }),
                el('button', { class: 'skb-btn', type: 'button', text: t('b.cancel'), onclick: function () {
                  setState({ sync: { ...S.sync, screen: 'list', form: null, editingId: null, error: null } })
                } })))) : el('div', null,
            el('div', { class: 'skb-sync-toolbar' },
              el('div', { class: 'skb-section-title', text: t('b.sync.remotes') }),
              el('button', { class: 'skb-btn', type: 'button', text: t('b.add.remote.2'), onclick: function () { openSettings(null) } })),
            el('div', { class: 'skb-remotes' },
              sync.remotes.length === 0 ? el('div', { class: 'skb-empty', text: t('b.no.remotes.yet.add.one.to.push.or.pull.your.skil') }) : null,
              sync.remotes.map(function (remote) {
                const selected = sync.selected.includes(remote.id)
                return el('div', { class: 'skb-remote-row' },
                  el('input', { type: 'checkbox', checked: selected, onchange: function (e) {
                    const selectedIds = e.target.checked ? [...sync.selected, remote.id] : sync.selected.filter((id) => id !== remote.id)
                    setState({ sync: { ...S.sync, selected: selectedIds } })
                  } }),
                  el('div', { class: 'skb-remote-main' },
                    el('div', { class: 'skb-market-ref', text: remote.name + ' · ' + remote.type }),
                    el('div', { class: 'skb-market-meta', text: remote.url }),
                    el('div', { class: 'skb-market-meta', text: remote.hasCredential ? t('b.credentials.saved') : t('b.using.local.git.ssh.credentials') }),
                    sync.testResults && sync.testResults[remote.id] ? el('div', { class: 'skb-test-result', text: sync.testResults[remote.id].message }) : null),
                  el('div', { class: 'skb-remote-actions' },
                    el('button', { class: 'skb-btn', type: 'button', text: t('b.test.connection'), onclick: function () {
                      api('/sync/test', { remoteId: remote.id }).then(function (result) {
                        setState({ sync: { ...S.sync, testResults: { ...(S.sync.testResults || {}), [remote.id]: result } } })
                      }).catch(function (e) { setState({ sync: { ...S.sync, error: e.message } }) })
                    } }),
                    el('button', { class: 'skb-btn', type: 'button', text: t('b.settings'), onclick: function () { openSettings(remote) } }),
                    el('button', { class: 'skb-btn skb-btn--danger', type: 'button', text: t('b.delete'), onclick: function () {
                      if (!window.confirm(t('b.delete.this.remote.configuration'))) return
                      const remotes = sync.remotes.filter((r) => r.id !== remote.id)
                      S.sync.selected = sync.selected.filter((id) => id !== remote.id)
                      persistRemotes(remotes, t('b.remote.deleted'))
                    } })))
              }))),
          sync.error ? el('div', { class: 'skb-notice skb-notice--error', text: sync.error }) : null,
          sync.notice ? el('div', { class: 'skb-notice skb-notice--' + sync.notice.kind, text: sync.notice.text }) : null,
          sync.screen !== 'settings' ? el('div', { style: { display: 'flex', gap: '8px' } },
            el('button', { class: 'skb-btn skb-btn--primary', type: 'button', text: t('b.push.selected'), disabled: !!sync.busy || sync.selected.length === 0, onclick: function () {
              S.sync.busy = true; render()
              api('/sync/push', { remoteIds: sync.selected }).then(function (result) {
                setState({ sync: { ...S.sync, busy: false, pushResults: result.results || [], error: result.ok === false && !result.results ? result.reason : null } })
              }).catch(function (e) { setState({ sync: { ...S.sync, busy: false, error: e.message } }) })
            } }),
            el('button', { class: 'skb-btn', type: 'button', text: t('b.pull.selected'), disabled: !!sync.busy || sync.selected.length === 0, onclick: function () {
              S.sync.busy = true; render()
              api('/sync/pull', { remoteIds: sync.selected }).then(function (result) {
                setState({ sync: { ...S.sync, busy: false, pullResults: result.results || [], error: result.ok === false && !result.results ? result.reason : null } })
              }).catch(function (e) { setState({ sync: { ...S.sync, busy: false, error: e.message } }) })
            } })) : null,
          sync.screen !== 'settings' && sync.pushResults && sync.pushResults.length ? el('div', { class: 'skb-sync-results' },
            sync.pushResults.map(function (result) {
              const remote = sync.remotes.find((r) => r.id === result.remoteId)
              const summary = result.ok
                ? t('sync.pushSummary', {
                    status: result.changed ? t('b.pushed.additions') : t('b.no.additions'),
                    added: result.added || 0,
                    kept: result.kept || 0,
                    count: result.count || 0
                  })
                : result.error
              return el('div', { class: 'skb-notice skb-notice--' + (result.ok ? 'ok' : 'error'), text: (remote ? remote.name : result.remoteId) + ' · ' + summary })
            })) : null,
          sync.screen !== 'settings' && sync.pullResults && sync.pullResults.length ? el('div', { class: 'skb-sync-results' },
            sync.pullResults.map(function (result) {
              const remote = sync.remotes.find((r) => r.id === result.remoteId)
              if (!result.ok) return el('div', { class: 'skb-notice skb-notice--error', text: (remote ? remote.name : result.remoteId) + ' · ' + result.error })
              const skills = result.manifest.skills || []
              const missing = skills.filter(function (item) { return item.localStatus === 'missing' })
              return el('div', null,
                el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' } },
                  el('h3', { class: 'skb-section-title', text: t('sync.pullSummary', { name: remote ? remote.name : result.remoteId, missing: missing.length, existing: skills.length - missing.length }) }),
                  el('button', { class: 'skb-btn skb-btn--primary', type: 'button', text: t('b.install.all.missing'), disabled: !!sync.busy || missing.length === 0, onclick: function () {
                    S.sync.busy = true; render()
                    api('/sync/install', { items: missing.map(function (item) { return { name: item.name, install: item.install } }) }).then(function (installed) {
                      const byName = new Map((installed.results || []).map(function (row) { return [row.name, row] }))
                      const nextResults = S.sync.pullResults.map(function (row) {
                        if (row.remoteId !== result.remoteId || !row.ok) return row
                        const nextSkills = row.manifest.skills.map(function (item) {
                          const outcome = byName.get(item.name)
                          if (!outcome) return item
                          return { ...item, localStatus: outcome.status === 'installed' || outcome.status === 'skipped' ? 'existing' : item.localStatus, installStatus: outcome.status, installError: outcome.error }
                        })
                        return { ...row, manifest: { ...row.manifest, skills: nextSkills }, installSummary: installed }
                      })
                      setState({ sync: { ...S.sync, busy: false, pullResults: nextResults } })
                      load()
                    }).catch(function (e) { setState({ sync: { ...S.sync, busy: false, error: e.message } }) })
                  } })),
                result.installSummary ? el('div', { class: 'skb-notice skb-notice--' + (result.installSummary.ok ? 'ok' : 'error'), text: t('sync.installSummary', { installed: result.installSummary.installed, skipped: result.installSummary.skipped, failed: result.installSummary.failed }) }) : null,
                skills.length === 0 ? el('div', { class: 'skb-empty', text: t('sync.empty') }) : null,
                skills.map(function (item) {
                  const label = item.installStatus === 'installed' ? t('b.installed.now')
                    : item.installStatus === 'error' ? t('b.install.failed')
                    : item.localStatus === 'existing' ? t('b.existing.skipped') : t('b.missing')
                  return el('div', { class: 'skb-market-row' },
                    el('div', { class: 'skb-market-main' },
                      el('div', { class: 'skb-market-ref', text: item.name }),
                      el('div', { class: 'skb-market-meta', text: item.install + (item.installError ? ' · ' + item.installError : '') })),
                    el('span', { class: 'skb-badge', text: label }))
                }))
            })) : null)
        return modalShell(sync.screen === 'settings' ? t('b.sync.settings') : t('sync.title'), body)
      }
      if (S.modal === 'roots') {
        var roots = S.rootsSnapshot || (S.view && S.view.roots) || []
        return modalShell(t('roots.title'), el('div', null,
          el('div', { style: { display: 'flex', gap: '8px' } },
            el('button', { class: 'skb-btn', type: 'button', text: t('action.health'), onclick: function () {
              setState({ modal: 'health', health: null })
              api('/health').then(function (d) { setState({ health: d.report }) }).catch(function (e) { setState({ health: { error: e.message } }) })
            } }),
            el('button', { class: 'skb-btn', type: 'button', text: t('action.logs'), onclick: function () {
              setState({ modal: 'logs', logs: null })
              api('/logs?limit=120').then(function (d) { setState({ logs: d.logs }) }).catch(function () { setState({ logs: [] }) })
            } })),
          roots.length === 0 ? el('div', { class: 'skb-empty', text: t('roots.empty') }) : null,
          roots.map(function (root) {
            return el('div', { class: 'skb-market-row' },
              el('div', { class: 'skb-market-main' },
                el('div', { class: 'skb-market-ref', text: root.agent + ' · ' + t('scope.' + root.scope) + (root.standard ? '' : ' · ' + t('roots.custom')) }),
                el('div', { class: 'skb-market-meta', text: root.dir })),
              !root.present ? el('span', { class: 'skb-badge', text: t('roots.missing') }) :
                !root.writable ? el('span', { class: 'skb-badge skb-badge--warn', text: t('roots.readonly') }) : null)
          })))
      }
      if (S.modal === 'logs') {
        var logs = S.logs || []
        return modalShell(t('logs.title'), el('div', null,
          !S.logs ? el('div', { class: 'skb-empty', text: t('list.loading') }) :
            logs.length === 0 ? el('div', { class: 'skb-empty', text: t('logs.empty') }) :
              logs.slice().reverse().map(function (entry) {
                return el('div', { class: 'skb-log-row' },
                  el('span', { class: 'skb-log-time', text: formatTime(entry.at) || '' }),
                  el('span', { text: entry.op + (entry.skill ? ' · ' + entry.skill : '') + (entry.message ? ' — ' + entry.message : '') }),
                  entry.status === 'error' ? el('span', { class: 'skb-badge skb-badge--error', text: 'error' }) : null)
              })))
      }
      if (S.modal === 'health') {
        var h = S.health
        return modalShell(t('health.title'), el('div', null,
          !h ? el('div', { class: 'skb-empty', text: t('list.loading') }) :
            h.error ? el('div', { class: 'skb-notice skb-notice--error', text: h.error }) :
              el('div', null,
                el('div', { class: 'skb-health-summary' },
                  el('div', { class: 'skb-health-chip' }, el('span', { class: 'n', text: h.total }), el('span', { text: 'Σ' })),
                  el('div', { class: 'skb-health-chip skb-health-chip--ok' }, el('span', { class: 'n', text: h.ok }), el('span', { text: t('health.ok') })),
                  el('div', { class: 'skb-health-chip skb-health-chip--warn' }, el('span', { class: 'n', text: h.warn }), el('span', { text: t('health.warn') })),
                  el('div', { class: 'skb-health-chip skb-health-chip--error' }, el('span', { class: 'n', text: h.error }), el('span', { text: t('health.error') })),
                  el('div', { class: 'skb-health-chip' }, el('span', { class: 'n', text: h.loadable }), el('span', { text: t('health.loadable') }))),
                h.skills.filter(function (s) { return s.level !== 'ok' }).map(function (s) {
                  return el('div', { class: 'skb-market-row', style: { marginTop: '8px' } },
                    el('div', { class: 'skb-market-main' },
                      el('div', { class: 'skb-market-ref', text: s.name }),
                      el('div', { class: 'skb-market-meta', text: s.issues.map(function (i) { return i.split(':')[0] }).join(', ') })),
                    el('span', { class: 'skb-badge' + (s.level === 'error' ? ' skb-badge--error' : ' skb-badge--warn'), text: s.level }))
                }))))
      }
      return null
    }

    function menuEl() {
      return el('div', { class: 'skb-menu', role: 'menu' },
        el('button', { type: 'button', text: t('add.market'), onclick: function () { setState({ modal: 'market', market: { query: '', rows: [], searched: false, installing: null, sources: [], sourcesLoaded: false, source: 'skills', sort: 'installs', author: '', loading: false, error: null, configOpen: false } }) } }),
        el('button', { type: 'button', text: t('add.local'), onclick: function () { setState({ modal: 'local', localForm: { target: '', name: '' } }) } }),
        el('button', { type: 'button', text: t('add.external'), onclick: function () { setState({ modal: 'external' }) } }),
        el('button', { type: 'button', text: t('add.root'), onclick: async function () {
          try {
            const dir = await pickDirectory()
            if (dir) await mutate('/roots/add', { dir: dir })
            else setState({ notice: { kind: 'warn', text: t('b.no.directory.selected.or.picker.unavailable') } })
          } catch (e) {
            setState({ notice: { kind: 'error', text: e.message || String(e) } })
          }
        } }))
    }

    function render() {
      if (!rootEl) return
      var frag = document.createDocumentFragment()
      var root = el('div', { class: 'skb-root' + (S.busy ? ' skb-mutating' : '') })
      frag.appendChild(root)

      // header
      root.appendChild(el('div', { class: 'skb-header' },
        el('div', null,
          el('h1', { class: 'skb-title', text: t('panel.title') }),
          el('p', { class: 'skb-subtitle', text: t('panel.subtitle') })),
        el('div', { class: 'skb-actions' },
          el('button', { class: 'skb-btn', type: 'button', text: S.busy ? t('b.refreshing') : t('action.refresh'), disabled: !!S.busy, onclick: refreshAll }),
          el('button', { class: 'skb-btn', type: 'button', text: t('action.roots'), onclick: function () {
            setState({ modal: 'roots', rootsSnapshot: null })
            load().then(function (d) { if (d) setState({ rootsSnapshot: d.roots }) })
          } }),
                      el('button', { class: 'skb-btn', type: 'button', text: t('action.sync'), onclick: function () { setState({ modal: 'sync', sync: { repo: '', result: null, manifest: null, busy: false, remotes: [], remotesLoaded: false, selected: [], testResults: {}, pushResults: [], pullResults: [], screen: 'list', form: null, editingId: null, error: null, notice: null } }) } }),
          el('div', { class: 'skb-relative' },
            el('button', { class: 'skb-btn skb-btn--primary', type: 'button', text: t('action.add') + ' ▾', onclick: function (e) {
              var menu = e.target.parentElement.querySelector('.skb-menu')
              if (menu) menu.remove()
              else e.target.parentElement.appendChild(menuEl())
            } })))))

      if (!S.view) {
        root.appendChild(el('div', { class: 'skb-empty', text: S.error ? t('list.error') + '：' + S.error : t('list.loading') }))
      } else {
        var view = S.view
        if (view.env && view.env.ok === false) root.appendChild(el('div', { class: 'skb-notice skb-notice--warn', text: t('cli.unavailable').replace('{{reason}}', view.env.reason || 'unknown') }))
        if (S.notice) root.appendChild(el('div', { class: 'skb-notice skb-notice--' + S.notice.kind, role: 'status', text: S.notice.text }))
        if (S.error) root.appendChild(el('div', { class: 'skb-notice skb-notice--error', text: S.error }))

        // toolbar
        var c = counts()
        var tabDefs = [['all', 'tab.all']]
        if (c.project > 0) tabDefs.push(['global', 'tab.global'], ['project', 'tab.project'])
        if (c.disabled > 0) tabDefs.push(['disabled', 'tab.disabled'])
        if (c.warn > 0) tabDefs.push(['warn', 'tab.warn'])
        if (S.tab !== 'all' && !tabDefs.some(function (pair) { return pair[0] === S.tab })) S.tab = 'all'
        var tabs = el('div', { class: 'skb-tabs', role: 'tablist' },
          tabDefs.map(function (pair) {
            return el('button', { class: 'skb-tab' + (S.tab === pair[0] ? ' skb-tab--active' : ''), type: 'button', role: 'tab', text: t(pair[1]) + ' ', onclick: function () { setState({ tab: pair[0] }) } },
              el('span', { class: 'skb-count', text: c[pair[0]] || 0 }))
          }))
        var search = el('input', { class: 'skb-input skb-search', type: 'search', value: S.search, placeholder: t('search.placeholder'),
          oninput: function (e) {
            S.search = e.target.value
            S.searchSelection = { start: e.target.selectionStart, end: e.target.selectionEnd }
            if (S.searchTimer) clearTimeout(S.searchTimer)
            S.searchTimer = setTimeout(function () {
              render()
              var next = document.querySelector('.skb-search')
              if (next && S.searchSelection) {
                next.focus()
                try { next.setSelectionRange(S.searchSelection.start, S.searchSelection.end) } catch (err) { /* noop */ }
              }
            }, 120)
          } })
        root.appendChild(el('div', { class: 'skb-toolbar' }, tabs, search))

        // list
        var list = filtered()
        root.appendChild(el('div', { class: 'skb-list', role: 'list' },
          list.length === 0 ? el('div', { class: 'skb-empty', text: t('list.empty') }) : list.map(rowEl)))
      }

      // drawer + modals live at body level for stable stacking; replace old ones
      var oldOverlays = document.querySelectorAll('[data-skb-overlay]')
      for (var oi = 0; oi < oldOverlays.length; oi++) oldOverlays[oi].remove()
      var drawer = drawerEl()
      if (drawer) { drawer.setAttribute('data-skb-overlay', '1'); document.body.appendChild(drawer) }
      var modals = modalsEl()
      if (modals) { modals.setAttribute('data-skb-overlay', '1'); document.body.appendChild(modals) }

      var oldList = rootEl.querySelector('.skb-list')
      var oldScrollTop = oldList ? oldList.scrollTop : 0
      rootEl.textContent = ''
      rootEl.appendChild(frag)
      var newList = rootEl.querySelector('.skb-list')
      if (newList) newList.scrollTop = oldScrollTop
      diag('rendered', 'skills=' + (S.view ? S.view.skills.length : '?') + ' tab=' + S.tab)
    }

    // ------------------------------------------------------------------
    // Self-owned host + alignment loop
    // ------------------------------------------------------------------
    var selfHost = null
    var alignTimer = null
    var lastAlignKey = null

    function align() {
      if (!selfHost) return
      try {
        var opts = null
        var dialog = null
        var dialogs = document.querySelectorAll('[role="dialog"]')
        for (var i = 0; i < dialogs.length; i++) {
          var cand = dialogs[i].querySelector('[class*="options"]')
          if (cand) { opts = cand; dialog = dialogs[i]; break }
        }
        // The options area is shared by every settings section: only show the
        // panel when OUR nav cell is the active one, otherwise we would cover
        // whatever section the user picked.
        var mine = false
        if (dialog) {
          var activeCell = dialog.querySelector('[aria-current="true"]')
          if (activeCell && activeCell.textContent.trim() === t('nav')) mine = true
        }
        if (!opts || !mine) {
          if (selfHost.style.display !== 'none') { selfHost.style.display = 'none'; diag('align', 'hidden mine=' + mine) }
          lastAlignKey = null
          return
        }
        var r = opts.getBoundingClientRect()
        var key = Math.round(r.left) + ':' + Math.round(r.top) + ':' + Math.round(r.width) + 'x' + Math.round(r.height)
        selfHost.style.display = 'block'
        selfHost.style.left = r.left + 'px'
        selfHost.style.top = r.top + 'px'
        selfHost.style.width = r.width + 'px'
        selfHost.style.height = r.height + 'px'
        if (key !== lastAlignKey) {
          lastAlignKey = key
          diag('align', key + ' innerLen=' + selfHost.innerHTML.length)
        }
      } catch (e) { /* never break */ }
    }

    function startSelfHost() {
      try {
        var stale = document.querySelectorAll('#skb-self-host')
        for (var i = 0; i < stale.length; i++) stale[i].remove()
        selfHost = document.createElement('div')
        selfHost.id = 'skb-self-host'
        selfHost.style.cssText = 'position:fixed;inset:0;z-index:1001;pointer-events:none;display:none;'
        rootEl = el('div', { class: 'skb-host-inner' })
        selfHost.appendChild(rootEl)
        document.body.appendChild(selfHost)
        if (alignTimer) clearInterval(alignTimer)
        alignTimer = setInterval(align, 500)
        // React to dialog open/close instantly instead of up to 500ms late.
        if (window.__skbAlignObserver) { try { window.__skbAlignObserver.disconnect() } catch (e) { /* noop */ } }
        var alignScheduled = false
        window.__skbAlignObserver = new MutationObserver(function () {
          if (alignScheduled) return
          alignScheduled = true
          setTimeout(function () { alignScheduled = false; align() }, 40)
        })
        window.__skbAlignObserver.observe(document.body, { childList: true, subtree: true })
        window.addEventListener('resize', align)
        diag('self-host-started')
      } catch (e) {
        diag('self-host-error', (e && e.message) || e)
      }
    }

    // ------------------------------------------------------------------
    // apply
    // ------------------------------------------------------------------
    function apply(ctx) {
      pickerContext = ctx
      injectStyles()
      if (ctx.effect && typeof ctx.effect === 'function') {
        ctx.effect(function () {
          if (ctx.locale && typeof ctx.locale.register === 'function') {
            try { ctx.locale.register(NS, DICT) } catch (e) { /* duplicate ns on HMR */ }
          }
          var followLocale = function () {
            try {
              var snapshot = ctx.locale && ctx.locale.getLocale ? ctx.locale.getLocale() : null
              var active = snapshot && snapshot.active ? snapshot.active : 'zh'
              var next = normalizeLocale(active)
              if (next !== currentLang) {
                currentLang = next
                render()
              }
            } catch (e) { /* keep current language */ }
          }
          followLocale()
          var localeDispose = ctx.locale && typeof ctx.locale.subscribe === 'function' ? ctx.locale.subscribe(followLocale) : null
          sessionIdProvider = function () {
            try {
              var store = ctx.sessions && ctx.sessions.list
              var snap = store && store.getSnapshot()
              var all = snap && snap.byId ? Object.values(snap.byId) : []
              var current = all.find(function (s) { return s && s.retainedBy && s.retainedBy.mainView > 0 })
              return current && current.id ? current.id : null
            } catch (e) { return null }
          }
          startSelfHost()
          load()
          return function () {
            if (localeDispose) localeDispose()
            if (alignTimer) clearInterval(alignTimer)
            if (window.__skbAlignObserver) { try { window.__skbAlignObserver.disconnect() } catch (e) { /* noop */ } window.__skbAlignObserver = null }
            window.removeEventListener('resize', align)
            if (selfHost) { try { selfHost.remove() } catch (e) { /* noop */ } selfHost = null }
          }
        }, 'skills-butler: panel lifecycle')
      }
      var slots = ctx && ctx.slots
      diag('apply', 'slots=' + typeof (slots && slots.inject))
      if (slots && typeof slots.inject === 'function' && typeof slots.register === 'function') {
        try {
          slots.inject('settings.section', function () {
            return slots.register({
              name: 'settings.section',
              id: SECTION_ID,
              order: 19,
              locale: NS,
              label: function () { try { return t('nav') } catch (e) { return t('b.skills') } },
              inject: function () { return {} }
            }, function SkillsSentinel() { return null })
          })
          diag('settings-sentinel-registered')
        } catch (e) {
          diag('settings-register-error', (e && e.message) || e)
        }
      }
    }

    exports.inject = ['slots', 'locale', 'sessions', 'uiWorkspace', 'remote']
    exports.apply = apply
    return module.exports
  }
})
