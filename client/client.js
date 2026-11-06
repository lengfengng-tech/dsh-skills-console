/**
 * Browser half of dsh-skills-butler.
 *
 * Renders the「技能」section inside DSH Settings (settings.section slot):
 * filter tabs + search over the skill list, row switches for soft
 * disable/enable, a right-hand detail drawer with SKILL.md preview and
 * actions, market install via `npx skills`, roots/logs/health views.
 * Styling follows the host theme tokens only.
 */
window.__ModuleLoader__.load({
  id: 'dsh-skills-butler',
  factory: (require) => {
    "use strict";
    var module = { exports: {} };
    var exports = module.exports;
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const NS = 'skillsButler'
    const SECTION_ID = 'skills-butler'
    const API = '/dsh-skills/api'

    const DICT = {
      zh: {
        'nav': '技能',
        'panel.title': '技能',
        'panel.subtitle': '发现、安装并管理本机的 Agent 技能，覆盖 ~/.agents/skills、~/.claude/skills 与项目级目录。',
        'action.refresh': '刷新',
        'action.health': '体检',
        'action.logs': '日志',
        'action.roots': '浏览目录',
        'action.add': '添加',
        'action.undo': '撤销上一步',
        'action.back': '返回',
        'tab.all': '全部',
        'tab.global': '全局',
        'tab.project': '项目',
        'tab.disabled': '已停用',
        'tab.warn': '有警告',
        'tab.unloaded': '未加载',
        'filter.agent': 'Agent',
        'filter.agent.all': '全部',
        'filter.origin': '来源',
        'filter.origin.all': '全部',
        'search.placeholder': '搜索技能',
        'list.empty': '没有匹配的技能',
        'list.loading': '盘点中…',
        'list.error': '加载失败',
        'scope.global': '全局',
        'scope.project': '项目',
        'origin.marketplace': '市场',
        'origin.git': 'Git',
        'origin.manual': '手动',
        'origin.symlink': '软链',
        'origin.builtin': '内置',
        'loaded.yes': '已加载',
        'loaded.no': '未加载',
        'foreign.badge': '非本插件安装',
        'foreign.warning': '该技能不是由本插件安装的（共享目录）。真移除会删除其目录，请先确认影响范围。',
        'disabled.badge': '已停用',
        'shadowed.badge': '被项目级覆盖',
        'switch.enable': '启用',
        'switch.disable': '停用',
        'drawer.uninstall': '卸载',
        'drawer.try': '立即试用',
        'drawer.pin': '置顶',
        'drawer.unpin': '取消置顶',
        'drawer.materialize': '转正为实体目录',
        'drawer.unlink': '断开软链',
        'drawer.rollback': '回滚此备份',
        'drawer.export': '导出',
        'meta.scope': '作用域',
        'meta.agent': '归属',
        'meta.origin': '来源',
        'meta.source': '来源引用',
        'meta.linked': '链接目标',
        'meta.mtime': '更新时间',
        'meta.installedBy': '安装者',
        'meta.dir': '目录',
        'meta.status': '状态',
        'section.frontmatter': 'Frontmatter',
        'section.preview': 'SKILL.md 预览',
        'section.health': '健康报告',
        'section.backups': '可用备份',
        'confirm.title': '确认操作',
        'confirm.remove': '真移除会删除目录 {{dir}}。此操作不可直接撤销{{backup}}。',
        'confirm.removeForeign': '⚠️ 非本插件安装的技能。{{warning}}',
        'confirm.ok': '确认执行',
        'confirm.cancel': '取消',
        'add.market': '从市场安装',
        'add.local': '链接本地目录',
        'add.root': '添加自定义目录',
        'market.title': '市场搜索',
        'market.query': '搜索技能（skills.sh）',
        'market.search': '搜索',
        'market.install': '安装',
        'market.installing': '安装中…',
        'market.empty': '没有匹配结果',
        'market.lowTrust': '社区验证不足（安装量 < 100）：请确认来源可信后再安装。',
        'market.installTo': '安装到',
        'market.global': '全局',
        'market.project': '当前项目',
        'market.lockfile': '检测到 skills-lock.json：为尊重生态锁定，本次安装被拒绝。请用 skills CLI 处理锁文件。',
        'local.title': '链接本地技能目录',
        'local.target': '目标目录（需包含 SKILL.md）',
        'local.name': '技能名（留空取目录名）',
        'local.submit': '创建软链',
        'local.copyFallback': 'Windows 无软链权限时降级为拷贝，并在结果中提示。',
        'roots.title': '技能目录',
        'roots.empty': '未探测到目录',
        'roots.missing': '未找到',
        'roots.readonly': '只读',
        'roots.custom': '自定义',
        'logs.title': '操作日志',
        'logs.empty': '暂无操作记录',
        'health.title': '一键体检',
        'health.run': '开始体检',
        'health.ok': '正常',
        'health.warn': '警告',
        'health.error': '错误',
        'health.loadable': '可加载',
        'health.fixPreview': '修复预览',
        'health.cannotFix': '该问题不支持自动修复，请手动处理。',
        'notice.undoOk': '已撤销。',
        'notice.undoNone': '没有可撤销的操作。',
        'cli.unavailable': 'skills CLI 不可用：{{reason}}。市场安装/更新已降级，本地管理不受影响。',
        'issue.broken-symlink': '软链失效',
        'issue.missing-skill-md': '缺少 SKILL.md',
        'issue.unreadable': '目录不可读',
        'issue.invalid-name': '名称非法',
        'issue.empty-dir': '空目录',
        'issue.frontmatter-missing-name': 'frontmatter 缺少 name',
        'issue.frontmatter-missing-description': 'frontmatter 缺少 description',
        'issue.frontmatter-name-mismatch': 'frontmatter name 与目录名不一致',
        'issue.shadowed-by-project': '被同名项目级技能覆盖',
        'issue.name-conflict': '存在同名冲突',
        'issue.frontmatter': 'frontmatter 语法问题',
        'time.never': '—'
      },
      en: {
        'nav': 'Skills',
        'panel.title': 'Skills',
        'panel.subtitle': 'Discover, install, and manage agent skills across ~/.agents/skills, ~/.claude/skills, and project scopes.',
        'action.refresh': 'Refresh',
        'action.health': 'Health check',
        'action.logs': 'Logs',
        'action.roots': 'Browse roots',
        'action.add': 'Add',
        'action.undo': 'Undo last',
        'action.back': 'Back',
        'tab.all': 'All',
        'tab.global': 'Global',
        'tab.project': 'Project',
        'tab.disabled': 'Disabled',
        'tab.warn': 'Warnings',
        'tab.unloaded': 'Unloaded',
        'filter.agent': 'Agent',
        'filter.agent.all': 'All',
        'filter.origin': 'Origin',
        'filter.origin.all': 'All',
        'search.placeholder': 'Search skills',
        'list.empty': 'No matching skills',
        'list.loading': 'Inventory…',
        'list.error': 'Failed to load',
        'scope.global': 'Global',
        'scope.project': 'Project',
        'origin.marketplace': 'Market',
        'origin.git': 'Git',
        'origin.manual': 'Manual',
        'origin.symlink': 'Symlink',
        'origin.builtin': 'Builtin',
        'loaded.yes': 'Loaded',
        'loaded.no': 'Not loaded',
        'foreign.badge': 'foreign',
        'foreign.warning': 'This skill was not installed by this plugin (shared directory). Real removal deletes its directory — confirm the impact first.',
        'disabled.badge': 'disabled',
        'shadowed.badge': 'shadowed by project',
        'switch.enable': 'Enable',
        'switch.disable': 'Disable',
        'drawer.uninstall': 'Uninstall',
        'drawer.try': 'Try now',
        'drawer.pin': 'Pin',
        'drawer.unpin': 'Unpin',
        'drawer.materialize': 'Materialize copy',
        'drawer.unlink': 'Unlink',
        'drawer.rollback': 'Rollback to this',
        'drawer.export': 'Export',
        'meta.scope': 'Scope',
        'meta.agent': 'Agent',
        'meta.origin': 'Origin',
        'meta.source': 'Source ref',
        'meta.linked': 'Link target',
        'meta.mtime': 'Updated',
        'meta.installedBy': 'Installed by',
        'meta.dir': 'Directory',
        'meta.status': 'Status',
        'section.frontmatter': 'Frontmatter',
        'section.preview': 'SKILL.md preview',
        'section.health': 'Health report',
        'section.backups': 'Backups',
        'confirm.title': 'Confirm',
        'confirm.remove': 'Removal deletes {{dir}}. It cannot be undone directly{{backup}}.',
        'confirm.removeForeign': '⚠️ Not installed by this plugin. {{warning}}',
        'confirm.ok': 'Confirm',
        'confirm.cancel': 'Cancel',
        'add.market': 'Install from market',
        'add.local': 'Link local directory',
        'add.root': 'Add custom root',
        'market.title': 'Market search',
        'market.query': 'Search skills (skills.sh)',
        'market.search': 'Search',
        'market.install': 'Install',
        'market.installing': 'Installing…',
        'market.empty': 'No results',
        'market.lowTrust': 'Weak community validation (< 100 installs): verify the source before installing.',
        'market.installTo': 'Install to',
        'market.global': 'Global',
        'market.project': 'Current project',
        'market.lockfile': 'skills-lock.json detected: install refused to respect the ecosystem lock. Use the skills CLI to manage the lockfile.',
        'local.title': 'Link a local skill directory',
        'local.target': 'Target directory (must contain SKILL.md)',
        'local.name': 'Skill name (defaults to directory name)',
        'local.submit': 'Create link',
        'local.copyFallback': 'On Windows without link privilege this degrades to a copy, noted in the result.',
        'roots.title': 'Skill roots',
        'roots.empty': 'No directories discovered',
        'roots.missing': 'not found',
        'roots.readonly': 'read-only',
        'roots.custom': 'custom',
        'logs.title': 'Operation log',
        'logs.empty': 'No operations yet',
        'health.title': 'Health check',
        'health.run': 'Run check',
        'health.ok': 'OK',
        'health.warn': 'Warnings',
        'health.error': 'Errors',
        'health.loadable': 'Loadable',
        'health.fixPreview': 'Fix preview',
        'health.cannotFix': 'No automatic fix for this issue.',
        'notice.undoOk': 'Undone.',
        'notice.undoNone': 'Nothing to undo.',
        'cli.unavailable': 'skills CLI unavailable: {{reason}}. Market install/update degraded; local management keeps working.',
        'issue.broken-symlink': 'Broken symlink',
        'issue.missing-skill-md': 'Missing SKILL.md',
        'issue.unreadable': 'Unreadable directory',
        'issue.invalid-name': 'Invalid name',
        'issue.empty-dir': 'Empty directory',
        'issue.frontmatter-missing-name': 'frontmatter missing name',
        'issue.frontmatter-missing-description': 'frontmatter missing description',
        'issue.frontmatter-name-mismatch': 'frontmatter name differs from directory',
        'issue.shadowed-by-project': 'Shadowed by a project skill',
        'issue.name-conflict': 'Name conflict',
        'issue.frontmatter': 'frontmatter syntax',
        'time.never': '—'
      }
    }

    const fallbackT = (key) => (DICT.zh && DICT.zh[key]) || key
    let currentT = fallbackT
    let heldEl = null
    try {
      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          if (!m.removedNodes || !m.removedNodes.length) continue
          for (const n of m.removedNodes) {
            try {
              if (heldEl && n && n.contains && (n === heldEl || n.contains(heldEl))) {
                diag('removed', JSON.stringify({
                  parentCls: (m.target.className || '').toString().slice(0, 60),
                  parentTag: m.target.tagName,
                  removedTag: n.tagName,
                  removedCls: (n.className || '').toString().slice(0, 60),
                  heldIsConnected: heldEl.isConnected
                }))
              }
            } catch (e) { /* noop */ }
          }
        }
      })
      mo.observe(document.documentElement, { childList: true, subtree: true })
    } catch (e) { /* diagnostics never break the panel */ }

    // Remote diagnostics: the harness page is unreachable from the agent, so
    // each lifecycle stage writes a breadcrumb into localStorage; the leveldb
    // backing store is read afterwards to see exactly how far startup got.
    const DIAG_KEY = 'skb.diag.v1'
    function diag(stage, extra) {
      try {
        const raw = window.localStorage.getItem(DIAG_KEY)
        const list = raw ? JSON.parse(raw) : []
        list.push({ stage, at: Date.now(), extra: extra === undefined ? null : String(extra).slice(0, 300) })
        window.localStorage.setItem(DIAG_KEY, JSON.stringify(list.slice(-50)))
      } catch (e) { /* diagnostics must never break the panel */ }
    }
    diag('factory')
    // Capture every page-level error channel: the slot renderer logs
    // "slot entry crashed in ..." via console.error before blanking an entry.
    try {
      window.addEventListener('error', (e) => {
        diag('window-error', (e.message || 'err') + ' @ ' + (e.filename || '').split('/').pop() + ':' + e.lineno)
      })
      window.addEventListener('unhandledrejection', (e) => {
        diag('unhandled-rejection', (e.reason && e.reason.message) || String(e.reason))
      })
      const origError = console.error.bind(console)
      console.error = (...args) => {
        try { diag('console-error', args.map((a) => (a && a.message) || String(a)).join(' | ').slice(0, 400)) } catch (e) { /* noop */ }
        origError(...args)
      }
    } catch (e) { /* diagnostics must never break the panel */ }

    async function api(path, options = {}) {
      const response = await fetch(API + path, {
        method: options.body === undefined ? 'GET' : 'POST',
        headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data || data.ok !== true) {
        const message = data && data.message ? data.message : 'HTTP ' + response.status
        const error = new Error(message)
        error.code = data && data.error
        throw error
      }
      return data
    }

    function formatTime(ts) {
      if (!ts) return null
      const d = new Date(ts)
      return Number.isNaN(d.getTime()) ? null : d.toLocaleString()
    }

    function formatBytes(n) {
      if (typeof n !== 'number' || !Number.isFinite(n)) return ''
      if (n < 1024) return n + ' B'
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
      return (n / 1024 / 1024).toFixed(1) + ' MB'
    }

    const CSS = `
.skb-root { display: flex; flex-direction: column; height: 100%; box-sizing: border-box; padding: 20px 24px; gap: 12px; overflow: hidden; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); font-size: 13px; line-height: 1.5; }
.skb-root *, .skb-root *::before, .skb-root *::after { box-sizing: border-box; }
.skb-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.skb-title { margin: 0; font-size: 18px; font-weight: 600; }
.skb-subtitle { margin: 4px 0 0; color: var(--dsw-alias-label-secondary); max-width: 640px; }
.skb-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.skb-btn { font: inherit; cursor: pointer; border-radius: 8px; padding: 5px 12px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); }
.skb-btn:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); }
.skb-btn:disabled { opacity: .5; cursor: default; }
.skb-btn--primary { background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary)); border-color: transparent; color: var(--dsw-alias-label-primary-foreground, var(--dsw-alias-bg-base)); }
.skb-btn--danger { color: var(--dsw-alias-state-error-primary); }
.skb-btn:focus-visible, .skb-row:focus-visible, .skb-switch:focus-visible, .skb-input:focus-visible, .skb-tab:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.skb-notice { border-radius: 8px; padding: 8px 12px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); }
.skb-notice--error { color: var(--dsw-alias-state-error-primary); }
.skb-notice--ok { color: var(--dsw-alias-state-success-primary); }
.skb-notice--warn { color: var(--dsw-alias-state-warn-primary); }
.skb-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.skb-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.skb-tab { font: inherit; cursor: pointer; border: none; background: transparent; color: var(--dsw-alias-label-secondary); padding: 5px 12px; border-radius: 8px; }
.skb-tab:hover { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
.skb-tab--active { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-weight: 500; }
.skb-tab .skb-count { opacity: .7; margin-left: 4px; font-size: 12px; }
.skb-select, .skb-input { font: inherit; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 5px 10px; }
.skb-search { flex: 1; min-width: 180px; max-width: 360px; margin-left: auto; }
.skb-list { flex: 1; overflow-y: auto; border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); }
.skb-row { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; font: inherit; cursor: pointer; border: none; border-bottom: 1px solid var(--dsw-alias-border-l1); padding: 12px 16px; color: var(--dsw-alias-label-primary); background: transparent; }
.skb-row:last-child { border-bottom: none; }
.skb-row:hover { background: var(--dsw-alias-bg-layer-2); }
.skb-row--active { background: var(--dsw-alias-bg-layer-2); }
.skb-row--disabled { opacity: .62; }
.skb-cube { flex: none; width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
.skb-row-main { flex: 1; min-width: 0; }
.skb-row-name { font-weight: 600; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.skb-row-desc { display: block; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.skb-badges { display: flex; gap: 4px; flex-wrap: wrap; }
.skb-badge { font-size: 11px; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); }
.skb-badge--warn { color: var(--dsw-alias-state-warn-primary); border-color: var(--dsw-alias-state-warn-primary); }
.skb-badge--error { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.skb-badge--foreign { color: var(--dsw-alias-state-warn-primary); }
.skb-row-side { flex: none; display: flex; align-items: center; gap: 8px; }
.skb-loaded { font-size: 12px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.skb-loaded--yes { color: var(--dsw-alias-state-success-primary); }
.skb-switch { position: relative; width: 40px; height: 22px; border-radius: 999px; border: none; cursor: pointer; background: var(--dsw-alias-border-l2); transition: background .15s; flex: none; }
.skb-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.skb-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform .15s; }
.skb-switch[aria-checked="true"]::after { transform: translateX(18px); }
.skb-empty { padding: 40px 16px; text-align: center; color: var(--dsw-alias-label-secondary); }
.skb-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 60; }
.skb-drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(560px, 92vw); background: var(--dsw-alias-bg-layer-1); border-left: 1px solid var(--dsw-alias-border-l1); z-index: 61; display: flex; flex-direction: column; box-shadow: -12px 0 32px rgba(0,0,0,.35); }
.skb-drawer-head { display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.skb-drawer-body { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 16px; }
.skb-drawer-foot { display: flex; gap: 8px; padding: 14px 20px; border-top: 1px solid var(--dsw-alias-border-l1); flex-wrap: wrap; }
.skb-drawer-title { margin: 0; font-size: 17px; font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.skb-meta { display: grid; grid-template-columns: 110px 1fr; gap: 6px 12px; font-size: 12.5px; }
.skb-meta dt { color: var(--dsw-alias-label-secondary); }
.skb-meta dd { margin: 0; overflow-wrap: anywhere; }
.skb-pre { margin: 0; padding: 12px; border-radius: 10px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 320px; overflow-y: auto; }
.skb-section-title { margin: 0 0 6px; font-size: 13px; font-weight: 600; }
.skb-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); width: min(640px, 94vw); max-height: 84vh; overflow-y: auto; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 14px; z-index: 62; padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 18px 48px rgba(0,0,0,.4); }
.skb-modal h3 { margin: 0; font-size: 15px; }
.skb-menu { position: absolute; top: calc(100% + 6px); right: 0; background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2)); border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; padding: 6px; z-index: 30; display: flex; flex-direction: column; min-width: 180px; box-shadow: 0 10px 30px rgba(0,0,0,.35); }
.skb-menu button { font: inherit; text-align: left; background: transparent; border: none; color: var(--dsw-alias-label-primary); padding: 8px 10px; border-radius: 6px; cursor: pointer; }
.skb-menu button:hover { background: var(--dsw-alias-bg-layer-1); }
.skb-relative { position: relative; }
.skb-market-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; }
.skb-market-main { flex: 1; min-width: 0; }
.skb-market-ref { font-weight: 600; overflow-wrap: anywhere; }
.skb-market-meta { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.skb-health-summary { display: flex; gap: 16px; flex-wrap: wrap; }
.skb-health-chip { display: flex; flex-direction: column; align-items: center; padding: 10px 16px; border-radius: 10px; border: 1px solid var(--dsw-alias-border-l1); }
.skb-health-chip .n { font-size: 20px; font-weight: 700; }
.skb-health-chip--ok .n { color: var(--dsw-alias-state-success-primary); }
.skb-health-chip--warn .n { color: var(--dsw-alias-state-warn-primary); }
.skb-health-chip--error .n { color: var(--dsw-alias-state-error-primary); }
.skb-log-row { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); font-size: 12.5px; }
.skb-log-row:last-child { border-bottom: none; }
.skb-log-time { color: var(--dsw-alias-label-secondary); flex: none; width: 150px; }
.skb-mutating { opacity: .55; pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .skb-switch, .skb-switch::after { transition: none; } }
`

    function CubeIcon() {
      return h('svg', { viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round' },
        h('path', { d: 'M12 2.7 21 7.5v9L12 21.3 3 16.5v-9L12 2.7z' }),
        h('path', { d: 'M3 7.5l9 4.8 9-4.8' }),
        h('path', { d: 'M12 21.3v-9' }))
    }

    function Drawer(props) {
      if (!props.open) return null
      return h(React.Fragment, null,
        h('div', { className: 'skb-overlay', onClick: props.onClose }),
        h('div', { className: 'skb-drawer', role: 'dialog', 'aria-label': props.title },
          h('div', { className: 'skb-drawer-head' },
            h('span', { className: 'skb-cube' }, h(CubeIcon)),
            h('h2', { className: 'skb-drawer-title' }, props.title),
            props.headExtra,
            h('button', { type: 'button', className: 'skb-btn', onClick: props.onClose, 'aria-label': 'close' }, '✕')),
          h('div', { className: 'skb-drawer-body' }, props.children),
          props.footer ? h('div', { className: 'skb-drawer-foot' }, props.footer) : null))
    }

    function Modal(props) {
      if (!props.open) return null
      return h(React.Fragment, null,
        h('div', { className: 'skb-overlay', onClick: props.onClose }),
        h('div', { className: 'skb-modal', role: 'dialog', 'aria-label': props.title },
          h('h3', null, props.title),
          props.children))
    }

    function Switch(props) {
      return h('button', {
        type: 'button',
        className: 'skb-switch',
        role: 'switch',
        'aria-checked': props.on ? 'true' : 'false',
        'aria-label': props.label,
        disabled: !!props.disabled,
        onClick: (e) => { e.stopPropagation(); props.onChange() }
      })
    }


    // Styles live in document.head, injected once at apply time — never inside
    // the component tree (the proven dsh-mcp-tools pattern).
    var stylesInjected = false
    function injectStyles() {
      if (stylesInjected) return
      try {
        if (typeof document === 'undefined' || !document.head) return
        if (document.querySelector('style[data-plugin-css="dsh-skills-butler/panel.css"]')) {
          stylesInjected = true
          return
        }
        var tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-skills-butler'
        tag.dataset.pluginCss = 'dsh-skills-butler/panel.css'
        tag.textContent = CSS
        document.head.appendChild(tag)
        stylesInjected = true
      } catch (error) { /* styling failure must never break the panel */ }
    }

    /** Error boundary: a render crash must show diagnostics, not a blank page. */
    class SectionBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }
      static getDerivedStateFromError(error) {
        return { error }
      }
      componentDidCatch(error, info) {
        try { console.error('[dsh-skills-butler] section crashed:', error, info) } catch (e) { /* noop */ }
        diag('crash', (error && error.message) || error)
      }
      render() {
        if (this.state.error) {
          diag('boundary-render', (this.state.error && this.state.error.message) || this.state.error)
          return h('div', { className: 'skb-root' },
            h('div', { className: 'skb-notice skb-notice--error', role: 'alert' },
              'Skills butler crashed: ' + String((this.state.error && this.state.error.message) || this.state.error)))
        }
        return this.props.children
      }
    }

    /** Registered component (direct, mirroring dsh-mcp-tools). */
    function SkillsSection(props) {
      const rootRefCb = useCallback((el) => {
        if (!el) return
        heldEl = el
        try {
          const rect = el.getBoundingClientRect()
          let ancestor = el.parentElement
          let depth = 0
          let disconnectedAt = null
          while (ancestor) { depth += 1; ancestor = ancestor.parentElement }
          if (!el.isConnected) {
            // walk the fragment to find where the chain breaks
            let node = el
            let prev = el
            while (node) { prev = node; node = node.parentElement }
            disconnectedAt = prev.tagName + '#' + (prev.id || '') + '.' + (prev.className || '').toString().slice(0, 40)
          }
          diag('ref', JSON.stringify({
            connected: el.isConnected,
            depth,
            rect: [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)],
            ownerUrl: el.ownerDocument === document ? 'same' : 'DIFFERENT:' + String(el.ownerDocument.URL).slice(0, 60),
            sameDoc: el.ownerDocument === document,
            breakAt: disconnectedAt,
            parentCls: el.parentElement ? el.parentElement.className.toString().slice(0, 60) : null
          }))
        } catch (e) { diag('ref-error', (e && e.message) || e) }
      }, [])
      diag('render', 'props.t=' + typeof props.t)
      const t = currentT || fallbackT
      const [view, setView] = useState(null)            // { roots, skills, env, lockfiles, paths }
      const [error, setError] = useState(null)
      const [notice, setNotice] = useState(null)
      const [search, setSearch] = useState('')
      const [tab, setTab] = useState('all')
      const [agentFilter, setAgentFilter] = useState('all')
      const [originFilter, setOriginFilter] = useState('all')
      const [selected, setSelected] = useState(null)    // { name, dir }
      const [detail, setDetail] = useState(null)
      const [busy, setBusy] = useState(false)
      const [menuOpen, setMenuOpen] = useState(false)
      const [modal, setModal] = useState(null)          // 'market' | 'local' | 'roots' | 'logs' | 'health' | 'confirm'
      const [confirmState, setConfirmState] = useState(null)
      const [market, setMarket] = useState({ query: '', rows: [], searched: false, installing: null })
      const [localForm, setLocalForm] = useState({ target: '', name: '' })
      const [health, setHealth] = useState(null)
      const [logs, setLogs] = useState(null)
      const [backups, setBackups] = useState([])
      const rootsRef = useRef(null)

      const load = useCallback(async () => {
        try {
          const data = await api('/view')
          diag('view-ok', 'skills=' + (data.skills ? data.skills.length : '?'))
          setView(data)
          setError(null)
          return data
        } catch (e) {
          diag('view-error', (e && e.message) || e)
          setError(e.message)
          return null
        }
      }, [])

      useEffect(() => { void load() }, [load])

  
    // DOM-removal forensics: intercept the removal primitives so the ACTOR's
    // call stack is captured at the moment my subtree is yanked. The stack
    // names the exact module/function responsible.
    function stackBrief() {
      try {
        return new Error().stack.split('\n').slice(2, 10).map((l) => l.trim().replace(/^at /, '')).join(' < ').slice(0, 600)
      } catch (e) { return 'no-stack' }
    }
    try {
      const origRemoveChild = Node.prototype.removeChild
      Node.prototype.removeChild = function (child) {
        try {
          if (heldEl && child && (child === heldEl || (child.contains && child.contains(heldEl)))) {
            diag('removeChild-CALLED', 'parent=' + (this.className || '').toString().slice(0, 40) + ' || ' + stackBrief())
          }
        } catch (e) { /* never break */ }
        return origRemoveChild.call(this, child)
      }
      const origReplaceChild = Node.prototype.replaceChild
      Node.prototype.replaceChild = function (next, child) {
        try {
          if (heldEl && child && (child === heldEl || (child.contains && child.contains(heldEl)))) {
            diag('replaceChild-CALLED', 'parent=' + (this.className || '').toString().slice(0, 40) + ' || ' + stackBrief())
          }
        } catch (e) { /* never break */ }
        return origReplaceChild.call(this, next, child)
      }
      const origRemove = Element.prototype.remove
      Element.prototype.remove = function () {
        try {
          if (heldEl && (this === heldEl || (this.contains && this.contains(heldEl)))) {
            diag('element.remove-CALLED', stackBrief())
          }
        } catch (e) { /* never break */ }
        return origRemove.call(this)
      }
    } catch (e) { /* forensics must never break the panel */ }

    // DOM probe: after data arrives, report the rendered box so visibility
      // bugs can be diagnosed offline from the leveldb breadcrumbs.
      useEffect(() => {
        if (!view) return
        const t = setTimeout(() => {
          try {
            const el = null
            const skbAll = []
            const plainText = document.body.innerText.indexOf('SKILLS') >= 0
            const styleTag = document.querySelector('[data-skb-style]')
            // walk shadow roots from the body for skb elements
            let shadowSkb = 0
            const walk = (root) => {
              try {
                if (root.querySelectorAll) shadowSkb += root.querySelectorAll('[class*="skb-"]').length
                const all = root.querySelectorAll ? root.querySelectorAll('*') : []
                for (const node of all) {
                  if (node.shadowRoot) walk(node.shadowRoot)
                }
              } catch (e) { /* noop */ }
            }
            walk(document)
            diag('dom', JSON.stringify({
              heldConnected: heldEl ? heldEl.isConnected : 'none',
              heldSame: heldEl ? heldEl.ownerDocument === document : 'none',
              plainTextVisible: plainText,
              rootFound: !!el,
              skbInDocument: skbAll.length,
              skbInShadow: shadowSkb,
              styleTag: !!styleTag,
              frames: window.frames.length,
              topIsSelf: window.top === window,
              bodyHtmlLen: document.body ? document.body.innerHTML.length : -1,
              iframes: Array.from(document.querySelectorAll('iframe')).map((f) => (f.src || 'about:blank').slice(0, 60)),
              optionsGuess: (() => {
                const cand = document.querySelector('[class*="options"]')
                return cand ? { cls: cand.className.slice(0, 40), kids: cand.childElementCount, html: cand.innerHTML.length } : null
              })()
            }))
          } catch (e) { diag('dom-error', (e && e.message) || e) }
        }, 600)
        return () => clearTimeout(t)
      }, [view])

      // lazy detail load
      useEffect(() => {
        if (!selected) { setDetail(null); return }
        let cancelled = false
        setDetail(null)
        const params = new URLSearchParams({ name: selected.name })
        if (selected.dir) params.set('dir', selected.dir)
        api('/detail?' + params.toString())
          .then((d) => { if (!cancelled) setDetail(d) })
          .catch((e) => { if (!cancelled) setDetail({ ok: false, error: e.message }) })
        return () => { cancelled = true }
      }, [selected])

      // lazy backups for drawer
      useEffect(() => {
        if (!selected) return
        api('/backups').then((b) => setBackups(b.backups.filter((x) => x.skill === selected.name))).catch(() => {})
      }, [selected])

      const mutate = useCallback(async (path, body, okText) => {
        setBusy(true)
        setNotice(null)
        try {
          const result = await api(path, { body })
          if (okText) setNotice({ kind: 'ok', text: okText })
          await load()
          return result
        } catch (e) {
          setNotice({ kind: 'error', text: e.message })
          return null
        } finally {
          setBusy(false)
        }
      }, [load])

      const filtered = useMemo(() => {
        if (!view) return []
        const q = search.trim().toLowerCase()
        return view.skills.filter((s) => {
          if (tab === 'global' && s.scope !== 'global') return false
          if (tab === 'project' && s.scope !== 'project') return false
          if (tab === 'disabled' && !s.disabled) return false
          if (tab === 'warn' && (!s.issues || s.issues.length === 0)) return false
          if (tab === 'unloaded' && s.loaded) return false
          if (agentFilter !== 'all' && s.agent !== agentFilter) return false
          if (originFilter !== 'all' && s.origin !== originFilter) return false
          if (q && !(s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q))) return false
          return true
        })
      }, [view, search, tab, agentFilter, originFilter])

      const counts = useMemo(() => {
        const skills = view ? view.skills : []
        return {
          all: skills.length,
          global: skills.filter((s) => s.scope === 'global').length,
          project: skills.filter((s) => s.scope === 'project').length,
          disabled: skills.filter((s) => s.disabled).length,
          warn: skills.filter((s) => s.issues && s.issues.length > 0).length,
          unloaded: skills.filter((s) => !s.loaded).length
        }
      }, [view])

      const agents = useMemo(() => view ? Array.from(new Set(view.skills.map((s) => s.agent))) : [], [view])
      const origins = ['marketplace', 'git', 'manual', 'symlink', 'builtin']

      const issueText = useCallback((code) => {
        const base = code.split(':')[0]
        return t('issue.' + base) !== 'issue.' + base ? t('issue.' + base) : code
      }, [t])

      // ---- row toggle ----
      const toggleSkill = useCallback(async (skill) => {
        if (skill.disabled) {
          await mutate('/ops/enable', { name: skill.name, dir: skill.dir })
        } else {
          await mutate('/ops/disable', { name: skill.name, dir: skill.dir })
        }
      }, [mutate])

      // ---- confirm-wrapped destructive ops ----
      const askRemove = useCallback((skill) => {
        setConfirmState({ skill })
        setModal('confirm')
      }, [])
      const doRemove = useCallback(async () => {
        const skill = confirmState && confirmState.skill
        if (!skill) return
        setModal(null)
        await mutate('/ops/remove', { name: skill.name, dir: skill.dir, confirmed: true })
      }, [confirmState, mutate])

      const undo = useCallback(async () => {
        const r = await mutate('/ops/undo', {})
        if (r) setNotice({ kind: 'ok', text: t('notice.undoOk') })
        else setNotice({ kind: 'warn', text: t('notice.undoNone') })
      }, [mutate, t])

      const runHealth = useCallback(async () => {
        setModal('health')
        setHealth(null)
        try {
          const data = await api('/health')
          setHealth(data.report)
        } catch (e) {
          setHealth({ error: e.message })
        }
      }, [])

      const openLogs = useCallback(async () => {
        setModal('logs')
        setLogs(null)
        try {
          const data = await api('/logs?limit=120')
          setLogs(data.logs)
        } catch (e) {
          setLogs([])
        }
      }, [])

      const openRoots = useCallback(async () => {
        setModal('roots')
        rootsRef.current = null
        const data = await load()
        rootsRef.current = data ? data.roots : []
        setView(data || view)
      }, [load, view])

      const marketSearch = useCallback(async () => {
        setMarket((m) => ({ ...m, rows: [], searched: false }))
        try {
          const data = await api('/cli/find', { body: { query: market.query } })
          setMarket((m) => ({ ...m, rows: data.rows || [], searched: true }))
        } catch (e) {
          setNotice({ kind: 'error', text: e.message })
          setMarket((m) => ({ ...m, searched: true }))
        }
      }, [market.query])

      const marketInstall = useCallback(async (ref) => {
        setMarket((m) => ({ ...m, installing: ref }))
        try {
          const data = await api('/cli/add', { body: { pkg: ref, scope: 'global' } })
          if (data.ok === false) {
            setNotice({ kind: 'error', text: (data.reason || 'install failed') + (data.code === 'lockfile-present' ? ' — ' + t('market.lockfile') : '') })
          } else {
            setNotice({ kind: 'ok', text: ref + ' ✓' })
            await load()
          }
        } catch (e) {
          setNotice({ kind: 'error', text: e.message })
        } finally {
          setMarket((m) => ({ ...m, installing: null }))
        }
      }, [load, t])

      const lowInstalls = useCallback((meta) => {
        const m = /([\d.]+)\s*([KM]?)\s*installs/i.exec(meta || '')
        if (!m) return true
        const n = parseFloat(m[1])
        const unit = m[2].toUpperCase()
        const installs = unit === 'M' ? n * 1000000 : unit === 'K' ? n * 1000 : n
        return installs < 100
      }, [])

      const openLocal = useCallback(() => {
        const name = localForm.name.trim() || (localForm.target.split(/[\\/]/).filter(Boolean).pop() || '')
        mutate('/ops/link', { name, target: localForm.target })
        setModal(null)
      }, [localForm, mutate])

      const addRoot = useCallback(async () => {
        const dir = window.prompt(t('add.root') + ' — path')
        if (!dir) return
        await mutate('/roots/add', { dir })
      }, [mutate])

      if (!view) {
        return h('div', { className: 'skb-root', ref: rootRefCb },
          h('h1', { className: 'skb-title' }, t('panel.title')),
          h('div', { className: 'skb-empty' }, error ? t('list.error') + '：' + error : t('list.loading')))
      }

      const cliDown = view.env && view.env.ok === false

      return h('div', { className: 'skb-root' + (busy ? ' skb-mutating' : ''), ref: rootRefCb },

        h('div', { className: 'skb-header' },
          h('div', null,
            h('h1', { className: 'skb-title' }, t('panel.title')),
            h('p', { className: 'skb-subtitle' }, t('panel.subtitle'))),
          h('div', { className: 'skb-actions' },
            h('button', { type: 'button', className: 'skb-btn', onClick: () => void load() }, t('action.refresh')),
            h('button', { type: 'button', className: 'skb-btn', onClick: runHealth }, t('action.health')),
            h('button', { type: 'button', className: 'skb-btn', onClick: openLogs }, t('action.logs')),
            h('button', { type: 'button', className: 'skb-btn', onClick: () => void openRoots() }, t('action.roots')),
            h('button', { type: 'button', className: 'skb-btn', onClick: undo }, t('action.undo')),
            h('div', { className: 'skb-relative' },
              h('button', {
                type: 'button', className: 'skb-btn skb-btn--primary', onClick: () => setMenuOpen((v) => !v),
                'aria-haspopup': 'menu', 'aria-expanded': menuOpen ? 'true' : 'false'
              }, t('action.add') + ' ▾'),
              menuOpen ? h('div', { className: 'skb-menu', role: 'menu' },
                h('button', { type: 'button', onClick: () => { setMenuOpen(false); setModal('market') } }, t('add.market')),
                h('button', { type: 'button', onClick: () => { setMenuOpen(false); setLocalForm({ target: '', name: '' }); setModal('local') } }, t('add.local')),
                h('button', { type: 'button', onClick: () => { setMenuOpen(false); void addRoot() } }, t('add.root'))
              ) : null))),

        cliDown ? h('div', { className: 'skb-notice skb-notice--warn' }, t('cli.unavailable').replace('{{reason}}', view.env.reason || 'unknown')) : null,
        notice ? h('div', { className: 'skb-notice skb-notice--' + notice.kind, role: 'status' }, notice.text) : null,
        error ? h('div', { className: 'skb-notice skb-notice--error' }, error) : null,

        h('div', { className: 'skb-toolbar' },
          h('div', { className: 'skb-tabs', role: 'tablist' },
            [['all', 'tab.all'], ['global', 'tab.global'], ['project', 'tab.project'], ['disabled', 'tab.disabled'], ['warn', 'tab.warn'], ['unloaded', 'tab.unloaded']].map(([key, label]) =>
              h('button', {
                key, type: 'button', role: 'tab', 'aria-selected': tab === key ? 'true' : 'false',
                className: 'skb-tab' + (tab === key ? ' skb-tab--active' : ''),
                onClick: () => setTab(key)
              }, t(label), h('span', { className: 'skb-count' }, counts[key] || 0)))),
          h('select', { className: 'skb-select', value: agentFilter, onChange: (e) => setAgentFilter(e.target.value), 'aria-label': t('filter.agent') },
            h('option', { value: 'all' }, t('filter.agent') + ': ' + t('filter.agent.all')),
            agents.map((a) => h('option', { key: a, value: a }, a))),
          h('select', { className: 'skb-select', value: originFilter, onChange: (e) => setOriginFilter(e.target.value), 'aria-label': t('filter.origin') },
            h('option', { value: 'all' }, t('filter.origin') + ': ' + t('filter.origin.all')),
            origins.map((o) => h('option', { key: o, value: o }, t('origin.' + o)))),
          h('input', {
            className: 'skb-input skb-search', value: search, onChange: (e) => setSearch(e.target.value),
            placeholder: t('search.placeholder'), type: 'search'
          })),

        // rows are div[role=button]: a real <button> may not contain the row's
        // switch <button> (invalid nesting; HTML parsers split nested buttons
        // and desync React from the DOM).
        h('div', { className: 'skb-list', role: 'list' },
          filtered.length === 0
            ? h('div', { className: 'skb-empty' }, t('list.empty'))
            : filtered.map((skill) => h('div', {
              key: skill.dir, role: 'listitem'
            },
              h('div', {
                className: 'skb-row'
                  + (selected && selected.dir === skill.dir ? ' skb-row--active' : '')
                  + (skill.disabled ? ' skb-row--disabled' : ''),
                role: 'button', tabIndex: 0,
                'aria-label': skill.name,
                onClick: () => setSelected({ name: skill.name, dir: skill.dir }),
                onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected({ name: skill.name, dir: skill.dir }) } }
              },
                h('span', { className: 'skb-cube' }, h(CubeIcon)),
                h('span', { className: 'skb-row-main' },
                  h('span', { className: 'skb-row-name' },
                    skill.name,
                    skill.pinned ? h('span', { className: 'skb-badge' }, '📌') : null,
                    skill.installedBy === 'foreign' ? h('span', { className: 'skb-badge skb-badge--foreign' }, t('foreign.badge')) : null,
                    skill.disabled ? h('span', { className: 'skb-badge' }, t('disabled.badge')) : null,
                    skill.shadowed ? h('span', { className: 'skb-badge skb-badge--warn' }, t('shadowed.badge')) : null,
                    skill.issues && skill.issues.length > 0 ? h('span', { className: 'skb-badge skb-badge--error' }, '⚠ ' + skill.issues.length) : null),
                  h('span', { className: 'skb-row-desc' }, skill.description || skill.dir),
                  h('span', { className: 'skb-badges' },
                    h('span', { className: 'skb-badge' }, t('scope.' + skill.scope)),
                    h('span', { className: 'skb-badge' }, skill.agent),
                    h('span', { className: 'skb-badge' }, t('origin.' + skill.origin)))),
              h('span', { className: 'skb-row-side' },
                h('span', { className: 'skb-loaded' + (skill.loaded ? ' skb-loaded--yes' : '') }, skill.loaded ? '● ' + t('loaded.yes') : '○ ' + t('loaded.no')),
                h(Switch, { on: !skill.disabled, label: skill.disabled ? t('switch.enable') : t('switch.disable'), onChange: () => void toggleSkill(skill) })))))),

        h(Drawer, {
          open: !!selected,
          title: selected ? selected.name : '',
          onClose: () => setSelected(null),
          footer: selected && detail && detail.record ? h(React.Fragment, null,
            h('button', { type: 'button', className: 'skb-btn skb-btn--danger', onClick: () => askRemove(detail.record) }, t('drawer.uninstall')),
            detail.record.origin === 'symlink' ? h('button', { type: 'button', className: 'skb-btn', onClick: () => void mutate('/ops/materialize', { name: selected.name, dir: selected.dir }).then(() => setSelected(null)) }, t('drawer.materialize')) : null,
            detail.record.origin === 'symlink' ? h('button', { type: 'button', className: 'skb-btn', onClick: () => void mutate('/ops/unlink', { name: selected.name, dir: selected.dir }).then(() => setSelected(null)) }, t('drawer.unlink')) : null,
            h('button', { type: 'button', className: 'skb-btn', onClick: () => void mutate('/ops/pin', { name: selected.name, dir: selected.dir, pinned: !detail.record.pinned }) }, detail.record.pinned ? t('drawer.unpin') : t('drawer.pin')),
            h('button', { type: 'button', className: 'skb-btn', onClick: () => setNotice({ kind: 'ok', text: detail.record.dir }) }, t('drawer.export'))
          ) : null
        },
          !detail ? h('div', { className: 'skb-empty' }, t('list.loading')) :
            detail.ok === false ? h('div', { className: 'skb-notice skb-notice--error' }, detail.error) :
              h(React.Fragment, null,
                h('dl', { className: 'skb-meta' },
                  h('dt', null, t('meta.scope')), h('dd', null, t('scope.' + detail.record.scope)),
                  h('dt', null, t('meta.agent')), h('dd', null, detail.record.agent),
                  h('dt', null, t('meta.origin')), h('dd', null, t('origin.' + detail.record.origin)),
                  detail.record.sourceRef ? h(React.Fragment, null, h('dt', null, t('meta.source')), h('dd', null, detail.record.sourceRef)) : null,
                  detail.record.linkedFrom ? h(React.Fragment, null, h('dt', null, t('meta.linked')), h('dd', null, detail.record.linkedFrom)) : null,
                  h('dt', null, t('meta.installedBy')), h('dd', null, detail.record.installedBy === 'foreign' ? t('foreign.badge') + ' (foreign)' : 'dsh-skills'),
                  h('dt', null, t('meta.mtime')), h('dd', null, formatTime(detail.record.mtime) || t('time.never')),
                  h('dt', null, t('meta.dir')), h('dd', null, detail.record.dir),
                  h('dt', null, t('meta.status')), h('dd', null, (detail.health.issues.length ? detail.health.issues.map(issueText).join('\uFF1B') : '\u2713 ' + t('health.ok')))),
                detail.health.issues.length > 0 ? h('div', null,
                  h('h3', { className: 'skb-section-title' }, t('section.health')),
                  h('div', { className: 'skb-pre' }, detail.health.issues.map((i) => '\u2022 ' + issueText(i)).join('\n'))) : null,
                detail.body && detail.body.ok ? h('div', null,
                  h('h3', { className: 'skb-section-title' }, t('section.preview')),
                  h('pre', { className: 'skb-pre' }, detail.body.text.length > 12000 ? detail.body.text.slice(0, 12000) + '\n\u2026 [truncated]' : detail.body.text)) :
                  detail.body && !detail.body.ok ? h('div', { className: 'skb-notice skb-notice--warn' }, detail.body.error) : null,
                backups.length > 0 ? h('div', null,
                  h('h3', { className: 'skb-section-title' }, t('section.backups')),
                  backups.slice(0, 5).map((b) => h('div', { key: b.entry, className: 'skb-market-row' },
                    h('span', { className: 'skb-market-main' },
                      h('div', { className: 'skb-market-ref' }, b.entry),
                      h('div', { className: 'skb-market-meta' }, formatTime(b.takenAt) + ' \u00B7 ' + b.reason)),
                    h('button', { type: 'button', className: 'skb-btn', onClick: () => void mutate('/ops/rollback', { name: selected.name, backupDir: b.dir }).then(() => setSelected(null)) }, t('drawer.rollback'))))) : null)),

        h(Modal, { open: modal === 'confirm', title: t('confirm.title'), onClose: () => setModal(null) },
          confirmState && confirmState.skill ? h(React.Fragment, null,
            confirmState.skill.installedBy === 'foreign' ? h('div', { className: 'skb-notice skb-notice--warn' }, t('confirm.removeForeign').replace('{{warning}}', t('foreign.warning'))) : null,
            h('div', null, t('confirm.remove').replace('{{dir}}', confirmState.skill.dir).replace('{{backup}}', '')),
            h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
              h('button', { type: 'button', className: 'skb-btn', onClick: () => setModal(null) }, t('confirm.cancel')),
              h('button', { type: 'button', className: 'skb-btn skb-btn--danger', onClick: () => void doRemove() }, t('confirm.ok')))) : null),

        h(Modal, { open: modal === 'market', title: t('market.title'), onClose: () => setModal(null) },
          h('div', { style: { display: 'flex', gap: 8 } },
            h('input', {
              className: 'skb-input', style: { flex: 1 }, value: market.query,
              placeholder: t('market.query'),
              onChange: (e) => setMarket((m) => ({ ...m, query: e.target.value })),
              onKeyDown: (e) => { if (e.key === 'Enter') void marketSearch() }
            }),
            h('button', { type: 'button', className: 'skb-btn skb-btn--primary', onClick: () => void marketSearch() }, t('market.search'))),
          view.lockfiles && view.lockfiles.length > 0 ? h('div', { className: 'skb-notice skb-notice--warn' }, t('market.lockfile')) : null,
          market.searched && market.rows.length === 0 ? h('div', { className: 'skb-empty' }, t('market.empty')) : null,
          (market.rows || []).map((row) => h('div', { key: row.ref, className: 'skb-market-row' },
            h('span', { className: 'skb-market-main' },
              h('div', { className: 'skb-market-ref' }, row.ref),
              h('div', { className: 'skb-market-meta' }, row.installs + (row.url ? ' \u00B7 ' + row.url : '')),
              lowInstalls(row.installs) ? h('div', { className: 'skb-notice skb-notice--warn', style: { marginTop: 4 } }, t('market.lowTrust')) : null),
            h('button', {
              type: 'button', className: 'skb-btn skb-btn--primary', disabled: market.installing !== null,
              onClick: () => void marketInstall(row.ref)
            }, market.installing === row.ref ? t('market.installing') : t('market.install'))))),

        h(Modal, { open: modal === 'local', title: t('local.title'), onClose: () => setModal(null) },
          h('label', null, t('local.target'),
            h('input', { className: 'skb-input', style: { display: 'block', width: '100%', marginTop: 4 }, value: localForm.target, onChange: (e) => setLocalForm((f) => ({ ...f, target: e.target.value })) })),
          h('label', null, t('local.name'),
            h('input', { className: 'skb-input', style: { display: 'block', width: '100%', marginTop: 4 }, value: localForm.name, onChange: (e) => setLocalForm((f) => ({ ...f, name: e.target.value })) })),
          h('div', { className: 'skb-notice' }, t('local.copyFallback')),
          h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
            h('button', { type: 'button', className: 'skb-btn', onClick: () => setModal(null) }, t('confirm.cancel')),
            h('button', { type: 'button', className: 'skb-btn skb-btn--primary', onClick: openLocal }, t('local.submit')))),

        h(Modal, { open: modal === 'roots', title: t('roots.title'), onClose: () => setModal(null) },
          (rootsRef.current || (view && view.roots) || []).map((root) => h('div', { key: root.dir, className: 'skb-market-row' },
            h('span', { className: 'skb-market-main' },
              h('div', { className: 'skb-market-ref' }, root.agent + ' \u00B7 ' + t('scope.' + root.scope) + (root.standard ? '' : ' \u00B7 ' + t('roots.custom'))),
              h('div', { className: 'skb-market-meta' }, root.dir)),
            !root.present ? h('span', { className: 'skb-badge' }, t('roots.missing')) :
              !root.writable ? h('span', { className: 'skb-badge skb-badge--warn' }, t('roots.readonly')) : null))),

        h(Modal, { open: modal === 'logs', title: t('logs.title'), onClose: () => setModal(null) },
          !logs ? h('div', { className: 'skb-empty' }, t('list.loading')) :
            logs.length === 0 ? h('div', { className: 'skb-empty' }, t('logs.empty')) :
              logs.slice().reverse().map((entry, i) => h('div', { key: i, className: 'skb-log-row' },
                h('span', { className: 'skb-log-time' }, formatTime(entry.at) || ''),
                h('span', null, entry.op + (entry.skill ? ' \u00B7 ' + entry.skill : '') + (entry.message ? ' \u2014 ' + entry.message : '')),
                entry.status === 'error' ? h('span', { className: 'skb-badge skb-badge--error' }, 'error') : null)))),

        h(Modal, { open: modal === 'health', title: t('health.title'), onClose: () => setModal(null) },
          !health ? h('div', { className: 'skb-empty' }, t('list.loading')) :
            health.error ? h('div', { className: 'skb-notice skb-notice--error' }, health.error) :
              h(React.Fragment, null,
                h('div', { className: 'skb-health-summary' },
                  h('div', { className: 'skb-health-chip' }, h('span', { className: 'n' }, health.total), h('span', null, '\u03A3')),
                  h('div', { className: 'skb-health-chip skb-health-chip--ok' }, h('span', { className: 'n' }, health.ok), h('span', null, t('health.ok'))),
                  h('div', { className: 'skb-health-chip skb-health-chip--warn' }, h('span', { className: 'n' }, health.warn), h('span', null, t('health.warn'))),
                  h('div', { className: 'skb-health-chip skb-health-chip--error' }, h('span', { className: 'n' }, health.error), h('span', null, t('health.error'))),
                  h('div', { className: 'skb-health-chip' }, h('span', { className: 'n' }, health.loadable), h('span', null, t('health.loadable')))),
                health.skills.filter((s) => s.level !== 'ok').map((s) =>
                  h('div', { key: s.dir, className: 'skb-market-row', style: { marginTop: 8 } },
                    h('span', { className: 'skb-market-main' },
                      h('div', { className: 'skb-market-ref' }, s.name),
                      h('div', { className: 'skb-market-meta' }, s.issues.map((i) => i.split(':')[0]).join(', '))),
                    h('span', { className: 'skb-badge' + (s.level === 'error' ? ' skb-badge--error' : ' skb-badge--warn') }, s.level))))
      )
    }

    /** Decorative cube glyph for the sidebar panel row. */
    function SkillsPanelIcon({ size }) {
      const edge = typeof size === 'number' ? size : 18
      return h('svg', {
        viewBox: '0 0 24 24', width: edge, height: edge, 'aria-hidden': true,
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round',
        style: { display: 'block' }
      },
        h('path', { d: 'M12 2.7 21 7.5v9L12 21.3 3 16.5v-9L12 2.7z' }),
        h('path', { d: 'M3 7.5l9 4.8 9-4.8' }),
        h('path', { d: 'M12 21.3v-9' }))
    }

    function apply(ctx) {
      injectStyles()
      if (ctx.effect && typeof ctx.effect === 'function') {
        ctx.effect(() => {
          if (ctx.locale && typeof ctx.locale.register === 'function') {
            return ctx.locale.register(NS, { zh: DICT.zh, en: DICT.en })
          }
          return undefined
        }, 'skills-butler: dictionaries')
      } else if (ctx.locale && typeof ctx.locale.register === 'function') {
        ctx.locale.register(NS, { zh: DICT.zh, en: DICT.en })
      }
      try {
        if (ctx.locale && typeof ctx.locale.bind === 'function') {
          const bound = ctx.locale.bind(NS)
          currentT = (key) => { try { return bound(key) } catch { return fallbackT(key) } }
        }
      } catch { /* locale unbound: fall back to zh */ }
      const t = currentT
      const slots = ctx && ctx.slots
      diag('apply', 'slots=' + typeof (slots && slots.inject) + ' locale=' + typeof (ctx && ctx.locale && ctx.locale.bind))
      if (slots && typeof slots.inject === 'function' && typeof slots.register === 'function') {
        // Bisection: ONE inject only. Multiple slots.inject registrations from
        // one bundle churn the ledger (each reinstall bumps the slot version
        // mid-commit and React discards the in-flight DOM — the exact
        // mount-then-vanish signature). dsh-mcp-tools registers exactly one.
        slots.inject('settings.section', () => {
          diag('reinstall', String(Date.now()))
          return slots.register({
            name: 'settings.section',
            id: SECTION_ID,
            order: 25,
            locale: NS,
            label: () => {
              try { return t('nav') } catch { return fallbackT('nav') }
            },
            inject: () => {
              diag('inject-called')
              return {}
            }
          }, SkillsSection)
        })
        diag('apply-settings-registered')
      }
    }

    return { inject: ['slots', 'locale'], apply }
  }
})
