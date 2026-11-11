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
      zh: {
        'nav': '技能',
        'panel.title': '技能',
        'panel.subtitle': '只展示 DSH 可使用的本地技能；从其他 Agent 引入时通过软链接入，并标记来源。',
        'add.external': '从其他 Agent 引入', 'external.title': '从其他 Agent 引入到 DSH',
        'external.import': '引入', 'external.empty': '没有可引入的其他 Agent 技能',
        'source.externalPrefix': '来自 ',
        'action.refresh': '刷新', 'action.health': '体检', 'action.logs': '日志',
        'action.roots': '浏览目录', 'action.undo': '撤销上一步', 'action.add': '添加',
        'tab.all': '全部', 'tab.global': '全局', 'tab.project': '项目',
        'tab.disabled': '已停用', 'tab.warn': '有警告', 'status.enabled': '已启用',
        'search.placeholder': '搜索技能', 'list.empty': '没有匹配的技能', 'list.loading': '盘点中…', 'list.error': '加载失败',
        'filter.agent': '目录', 'filter.agent.all': '全部', 'filter.origin': '来源', 'filter.origin.all': '全部',
        'scope.global': '全局', 'scope.project': '项目',
        'origin.marketplace': '市场', 'origin.git': 'Git', 'origin.manual': '本地',
        'origin.symlink': '软链', 'origin.builtin': '内置',
        'loaded.yes': '已加载', 'loaded.no': '未加载',
        'foreign.badge': '非本插件安装',
        'foreign.warning': '该技能不是由本插件安装的（共享目录）。真移除会删除其目录，请先确认影响范围。',
        'disabled.badge': '已停用', 'shadowed.badge': '被项目级覆盖',
        'switch.enable': '启用', 'switch.disable': '停用',
        'drawer.uninstall': '卸载', 'drawer.pin': '置顶', 'drawer.unpin': '取消置顶',
        'drawer.materialize': '转正为实体目录', 'drawer.unlink': '断开软链', 'drawer.rollback': '回滚此备份',
        'drawer.export': '导出', 'drawer.update': '升级', 'drawer.updateUnsupported': '该来源不支持检查升级',
        'action.sync': 'GitHub 同步', 'sync.title': '同步技能清单',
        'sync.repo': '个人仓库（owner/repo）', 'sync.push': '推送清单', 'sync.pull': '拉取清单',
        'sync.note': '只同步名称、下载地址和来源，不上传技能文件内容；推送只在你点击时发生。',
        'sync.empty': '清单中没有可下载的技能', 'sync.install': '安装',
        'meta.scope': '作用域', 'meta.agent': '归属', 'meta.origin': '来源', 'meta.source': '来源引用',
        'meta.linked': '链接目标', 'meta.mtime': '更新时间', 'meta.installedBy': '安装者',
        'meta.dir': '目录', 'meta.status': '状态',
        'section.preview': 'SKILL.md 预览', 'section.health': '健康报告', 'section.backups': '可用备份', 'section.sources': '同名来源（全部地址）',
        'confirm.title': '确认操作',
        'confirm.remove': '真移除会删除目录 {{dir}}。此操作不可直接撤销。',
        'confirm.removeForeign': '⚠️ 非本插件安装的技能。{{warning}}',
        'confirm.ok': '确认执行', 'confirm.cancel': '取消',
        'add.market': '从市场安装', 'add.local': '链接本地目录', 'add.root': '添加自定义目录',
        'market.title': '市场搜索', 'market.query': '搜索技能（skills.sh）', 'market.search': '搜索',
        'market.install': '安装', 'market.installing': '安装中…', 'market.empty': '没有匹配结果',
        'market.lowTrust': '社区验证不足（安装量 < 100）：请确认来源可信后再安装。',
        'market.lockfile': '检测到 skills-lock.json：为尊重生态锁定，本次安装被拒绝。',
        'local.title': '链接本地技能目录', 'local.target': '目标目录（需包含 SKILL.md）',
        'local.name': '技能名（留空取目录名）', 'local.submit': '创建软链',
        'local.copyFallback': 'Windows 无软链权限时降级为拷贝，并在结果中提示。',
        'roots.title': '技能目录', 'roots.empty': '未探测到目录', 'roots.missing': '未找到',
        'roots.readonly': '只读', 'roots.custom': '自定义',
        'logs.title': '操作日志', 'logs.empty': '暂无操作记录',
        'health.title': '一键体检', 'health.ok': '正常', 'health.warn': '警告', 'health.error': '错误',
        'health.loadable': '可加载',
        'notice.undoOk': '已撤销。', 'notice.undoNone': '没有可撤销的操作。',
        'cli.unavailable': 'skills CLI 不可用：{{reason}}。市场安装/更新已降级，本地管理不受影响。',
        'issue.broken-symlink': '软链失效', 'issue.missing-skill-md': '缺少 SKILL.md',
        'issue.unreadable': '目录不可读', 'issue.invalid-name': '名称非法', 'issue.empty-dir': '空目录',
        'issue.frontmatter-missing-name': 'frontmatter 缺少 name',
        'issue.frontmatter-missing-description': 'frontmatter 缺少 description',
        'issue.frontmatter-name-mismatch': 'frontmatter name 与目录名不一致',
        'issue.shadowed-by-project': '被同名项目级技能覆盖', 'issue.name-conflict': '存在同名冲突',
        'issue.frontmatter': 'frontmatter 语法问题',
        'time.never': '—', 'busy': '处理中…'
      },
      en: {
        'nav': 'Skills',
        'panel.title': 'Skills',
        'panel.subtitle': 'Only DSH-usable local skills; imports from other agents use symlinks and keep their source.',
        'add.external': 'Import from another agent', 'external.title': 'Import another agent’s skills into DSH',
        'external.import': 'Import', 'external.empty': 'No importable skills from other agents',
        'source.externalPrefix': 'from ',
        'action.refresh': 'Refresh', 'action.health': 'Health check', 'action.logs': 'Logs',
        'action.roots': 'Browse roots', 'action.undo': 'Undo last', 'action.add': 'Add',
        'tab.all': 'All', 'tab.global': 'Global', 'tab.project': 'Project',
        'tab.disabled': 'Disabled', 'tab.warn': 'Warnings', 'status.enabled': 'Enabled',
        'search.placeholder': 'Search skills', 'list.empty': 'No matching skills', 'list.loading': 'Inventory…', 'list.error': 'Failed to load',
        'filter.agent': '目录', 'filter.agent.all': 'All', 'filter.origin': 'Origin', 'filter.origin.all': 'All',
        'scope.global': 'Global', 'scope.project': 'Project',
        'origin.marketplace': 'Market', 'origin.git': 'Git', 'origin.manual': 'Local',
        'origin.symlink': 'Symlink', 'origin.builtin': 'Builtin',
        'loaded.yes': 'Loaded', 'loaded.no': 'Not loaded',
        'foreign.badge': 'foreign',
        'foreign.warning': 'This skill was not installed by this plugin (shared directory). Real removal deletes its directory — confirm the impact first.',
        'disabled.badge': 'disabled', 'shadowed.badge': 'shadowed by project',
        'switch.enable': 'Enable', 'switch.disable': 'Disable',
        'drawer.uninstall': 'Uninstall', 'drawer.pin': 'Pin', 'drawer.unpin': 'Unpin',
        'drawer.materialize': 'Materialize copy', 'drawer.unlink': 'Unlink', 'drawer.rollback': 'Rollback to this',
        'drawer.export': 'Export', 'drawer.update': 'Upgrade', 'drawer.updateUnsupported': 'Updates unavailable for this origin',
        'action.sync': 'GitHub sync', 'sync.title': 'Sync skill manifest',
        'sync.repo': 'Personal repo (owner/repo)', 'sync.push': 'Push manifest', 'sync.pull': 'Pull manifest',
        'sync.note': 'Only names, download refs, and origins sync; skill files never upload. Push happens only when you click it.',
        'sync.empty': 'No downloadable skills in this manifest', 'sync.install': 'Install',
        'meta.scope': 'Scope', 'meta.agent': 'Agent', 'meta.origin': 'Origin', 'meta.source': 'Source ref',
        'meta.linked': 'Link target', 'meta.mtime': 'Updated', 'meta.installedBy': 'Installed by',
        'meta.dir': 'Directory', 'meta.status': 'Status',
        'section.preview': 'SKILL.md preview', 'section.health': 'Health report', 'section.backups': 'Backups', 'section.sources': 'Same-name sources (all paths)',
        'confirm.title': 'Confirm',
        'confirm.remove': 'Removal deletes {{dir}}. It cannot be undone directly.',
        'confirm.removeForeign': '⚠️ Not installed by this plugin. {{warning}}',
        'confirm.ok': 'Confirm', 'confirm.cancel': 'Cancel',
        'add.market': 'Install from market', 'add.local': 'Link local directory', 'add.root': 'Add custom root',
        'market.title': 'Market search', 'market.query': 'Search skills (skills.sh)', 'market.search': 'Search',
        'market.install': 'Install', 'market.installing': 'Installing…', 'market.empty': 'No results',
        'market.lowTrust': 'Weak community validation (< 100 installs): verify the source before installing.',
        'market.lockfile': 'skills-lock.json detected: install refused to respect the ecosystem lock.',
        'local.title': 'Link a local skill directory', 'local.target': 'Target directory (must contain SKILL.md)',
        'local.name': 'Skill name (defaults to directory name)', 'local.submit': 'Create link',
        'local.copyFallback': 'On Windows without link privilege this degrades to a copy, noted in the result.',
        'roots.title': 'Skill roots', 'roots.empty': 'No directories discovered', 'roots.missing': 'not found',
        'roots.readonly': 'read-only', 'roots.custom': 'custom',
        'logs.title': 'Operation log', 'logs.empty': 'No operations yet',
        'health.title': 'Health check', 'health.ok': 'OK', 'health.warn': 'Warnings', 'health.error': 'Errors',
        'health.loadable': 'Loadable',
        'notice.undoOk': 'Undone.', 'notice.undoNone': 'Nothing to undo.',
        'cli.unavailable': 'skills CLI unavailable: {{reason}}. Market install/update degraded; local management keeps working.',
        'issue.broken-symlink': 'Broken symlink', 'issue.missing-skill-md': 'Missing SKILL.md',
        'issue.unreadable': 'Unreadable directory', 'issue.invalid-name': 'Invalid name', 'issue.empty-dir': 'Empty directory',
        'issue.frontmatter-missing-name': 'frontmatter missing name',
        'issue.frontmatter-missing-description': 'frontmatter missing description',
        'issue.frontmatter-name-mismatch': 'frontmatter name differs from directory',
        'issue.shadowed-by-project': 'Shadowed by a project skill', 'issue.name-conflict': 'Name conflict',
        'issue.frontmatter': 'frontmatter syntax',
        'time.never': '—', 'busy': 'Working…'
      }
    }
    var currentLang = 'zh'
    function t(key) {
      var dict = DICT[currentLang] || DICT.zh
      return dict[key] || DICT.zh[key] || key
    }
    function issueText(code) {
      var text = String(code)
      var base = text.split(':')[0]
      var label = t('issue.' + base) !== 'issue.' + base ? t('issue.' + base) : base
      return text.indexOf(':') > 0 ? label + '：' + text.slice(text.indexOf(':') + 1) : label
    }

    // ------------------------------------------------------------------
    // API
    // ------------------------------------------------------------------
    function api(path, body) {
      return fetch(API + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      }).then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data || data.ok !== true) {
            var err = new Error(data && data.message ? data.message : 'HTTP ' + res.status)
            err.code = data && data.error
            throw err
          }
          return data
        })
      })
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
'.skb-modal h3{margin:0;font-size:15px}' +
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
            skill.sources && skill.sources.length > 1 ? el('span', { class: 'skb-badge', text: skill.sources.length + (currentLang === 'zh' ? ' 个来源' : ' sources') }) : null)),
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
          body.appendChild(el('pre', { class: 'skb-pre', text: d.record.sources.map(function (source) { return source.dir + (source.scope === 'project' ? ' [project]' : ' [global]') }).join('\n') }))
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
        var rows = (S.market.rows || []).map(function (row) {
          var low = (function () {
            var m = /([\d.]+)\s*([KM]?)\s*installs/i.exec(row.installs || '')
            if (!m) return true
            var n = parseFloat(m[1]); var unit = m[2].toUpperCase()
            var total = unit === 'M' ? n * 1000000 : unit === 'K' ? n * 1000 : n
            return total < 100
          })()
          return el('div', { class: 'skb-market-row' },
            el('div', { class: 'skb-market-main' },
              el('div', { class: 'skb-market-ref', text: row.ref }),
              el('div', { class: 'skb-market-meta', text: row.installs + (row.url ? ' · ' + row.url : '') }),
              low ? el('div', { class: 'skb-notice skb-notice--warn', style: { marginTop: '4px' }, text: t('market.lowTrust') }) : null),
            el('button', { class: 'skb-btn skb-btn--primary', type: 'button', disabled: S.market.installing !== null,
              text: S.market.installing === row.ref ? t('market.installing') : t('market.install'),
              onclick: function () {
                setState({ market: { query: S.market.query, rows: S.market.rows, searched: S.market.searched, installing: row.ref } })
                mutate('/cli/add', { pkg: row.ref, scope: 'global' }).then(function (r) {
                  setState({ market: { query: '', rows: [], searched: false, installing: null }, modal: null })
                })
              } }))
        })
        var searchRow = el('div', { style: { display: 'flex', gap: '8px' } },
          el('input', { class: 'skb-input', style: { flex: '1' }, value: S.market.query, placeholder: t('market.query'),
            oninput: function (e) { S.market.query = e.target.value } }),
          el('button', { class: 'skb-btn skb-btn--primary', type: 'button', text: t('market.search'), onclick: function () {
            api('/cli/find', { query: S.market.query }).then(function (data) {
              setState({ market: { query: S.market.query, rows: data.rows || [], searched: true, installing: null } })
            }).catch(function (e) {
              setState({ notice: { kind: 'error', text: e.message } })
            })
          } }))
        return modalShell(t('market.title'), el('div', null,
          searchRow,
          S.view && S.view.lockfiles && S.view.lockfiles.length > 0 ? el('div', { class: 'skb-notice skb-notice--warn', text: t('market.lockfile') }) : null,
          S.market.searched && S.market.rows.length === 0 ? el('div', { class: 'skb-empty', text: t('market.empty') }) : null,
          rows))
      }
      if (S.modal === 'local') {
        return modalShell(t('local.title'), el('div', null,
          el('label', { class: 'skb-field', text: t('local.target') },
            el('input', { class: 'skb-input', value: S.localForm.target, oninput: function (e) { S.localForm.target = e.target.value } })),
          el('label', { class: 'skb-field', text: t('local.name') },
            el('input', { class: 'skb-input', value: S.localForm.name, oninput: function (e) { S.localForm.name = e.target.value } })),
          el('div', { class: 'skb-notice', text: t('local.copyFallback') }),
          el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
            el('button', { class: 'skb-btn', type: 'button', text: t('confirm.cancel'), onclick: function () { setState({ modal: null }) } }),
            el('button', { class: 'skb-btn skb-btn--primary', type: 'button', text: t('local.submit'), onclick: function () {
              var name = S.localForm.name.trim() || S.localForm.target.split(/[\\/]/).filter(Boolean).pop() || ''
              setState({ modal: null })
              mutate('/ops/link', { name: name, target: S.localForm.target })
            } }))))
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
        var manifestRows = sync.manifest && sync.manifest.skills ? sync.manifest.skills : []
        return modalShell(t('sync.title'), el('div', null,
          el('div', { class: 'skb-notice', text: t('sync.note') }),
          el('label', { class: 'skb-field', text: t('sync.repo') },
            el('input', { class: 'skb-input', value: sync.repo, placeholder: 'owner/repo', oninput: function (e) { S.sync.repo = e.target.value } })),
          el('div', { style: { display: 'flex', gap: '8px' } },
            el('button', { class: 'skb-btn skb-btn--primary', type: 'button', text: t('sync.push'), disabled: sync.busy || !sync.repo.trim(), onclick: function () {
              S.sync.busy = true; render()
              api('/sync/push', { repo: S.sync.repo.trim() }).then(function (result) {
                setState({ sync: { repo: S.sync.repo, result: result, manifest: S.sync.manifest, busy: false } })
              }).catch(function (e) {
                setState({ sync: { repo: S.sync.repo, result: { error: e.message }, manifest: S.sync.manifest, busy: false } })
              })
            } }),
            el('button', { class: 'skb-btn', type: 'button', text: t('sync.pull'), disabled: sync.busy || !sync.repo.trim(), onclick: function () {
              S.sync.busy = true; render()
              api('/sync/pull', { repo: S.sync.repo.trim() }).then(function (result) {
                setState({ sync: { repo: S.sync.repo, result: null, manifest: result.manifest, busy: false } })
              }).catch(function (e) {
                setState({ sync: { repo: S.sync.repo, result: { error: e.message }, manifest: null, busy: false } })
              })
            } })),
          sync.result ? el('div', { class: 'skb-notice skb-notice--' + (sync.result.error ? 'error' : 'ok'), text: sync.result.error || (sync.result.repo + ' · ' + sync.result.count + ' skills') }) : null,
          sync.manifest ? el('div', null,
            manifestRows.length === 0 ? el('div', { class: 'skb-empty', text: t('sync.empty') }) : null,
            manifestRows.map(function (item) {
              return el('div', { class: 'skb-market-row' },
                el('div', { class: 'skb-market-main' },
                  el('div', { class: 'skb-market-ref', text: item.name }),
                  el('div', { class: 'skb-market-meta', text: item.install + (item.url ? ' · ' + item.url : '') })),
                el('button', { class: 'skb-btn skb-btn--primary', type: 'button', text: t('sync.install'), onclick: function () {
                  mutate('/cli/add', { pkg: item.install, scope: 'global' })
                } }))
            })) : null))
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
        el('button', { type: 'button', text: t('add.market'), onclick: function () { setState({ modal: 'market', market: { query: '', rows: [], searched: false, installing: null } }) } }),
        el('button', { type: 'button', text: t('add.local'), onclick: function () { setState({ modal: 'local', localForm: { target: '', name: '' } }) } }),
        el('button', { type: 'button', text: t('add.external'), onclick: function () { setState({ modal: 'external' }) } }),
        el('button', { type: 'button', text: t('add.root'), onclick: function () {
          var dir = window.prompt(t('add.root') + ' — path')
          if (dir) mutate('/roots/add', { dir: dir })
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
          el('button', { class: 'skb-btn', type: 'button', text: t('action.refresh'), onclick: function () { load() } }),
          el('button', { class: 'skb-btn', type: 'button', text: t('action.roots'), onclick: function () {
            setState({ modal: 'roots', rootsSnapshot: null })
            load().then(function (d) { if (d) setState({ rootsSnapshot: d.roots }) })
          } }),
          el('button', { class: 'skb-btn', type: 'button', text: t('action.undo'), onclick: function () {
            mutate('/ops/undo', {}).then(function (r) {
              setState({ notice: { kind: r ? 'ok' : 'warn', text: r ? t('notice.undoOk') : t('notice.undoNone') } })
            })
          } }),
          el('button', { class: 'skb-btn', type: 'button', text: t('action.sync'), onclick: function () { setState({ modal: 'sync' }) } }),
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
      injectStyles()
      if (ctx.effect && typeof ctx.effect === 'function') {
        ctx.effect(function () {
          if (ctx.locale && typeof ctx.locale.register === 'function') {
            try { ctx.locale.register(NS, { zh: DICT.zh, en: DICT.en }) } catch (e) { /* duplicate ns on HMR */ }
          }
          try {
            if (ctx.locale && typeof ctx.locale.bind === 'function' && ctx.locale.getLocale) {
              var loc = ctx.locale.getLocale()
              if (loc && loc.id === 'en') currentLang = 'en'
            }
          } catch (e) { /* keep zh */ }
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
              order: 25,
              locale: NS,
              label: function () { try { return t('nav') } catch (e) { return '技能' } },
              inject: function () { return {} }
            }, function SkillsSentinel() { return null })
          })
          diag('settings-sentinel-registered')
        } catch (e) {
          diag('settings-register-error', (e && e.message) || e)
        }
      }
    }

    exports.inject = ['slots', 'locale', 'sessions']
    exports.apply = apply
    return module.exports
  }
})
