// dsh/index.js — cordis host entry for dsh-skills-console.
// Wires the SkillsManager into DSH: first census on boot, routes behind the
// connection trust gate, cleanup on unload.
import { SkillsManager } from './manager.js'
import { registerRoutes } from './routes.js'

export const name = 'skills-console'
export const inject = ['skills', 'agents', 'sessions', 'workspaceRegistry', 'sessionSkillCatalog', 'sessionPersistence']

export function apply(ctx, config = {}) {
  const manager = new SkillsManager(ctx, config)

  // First-run census: scan everything, archive nothing, modify nothing.
  try {
    manager.refresh()
  } catch (error) {
    ctx.logger && ctx.logger.warn && ctx.logger.warn('[dsh-skills] 初始盘点失败: ' + String((error && error.message) || error))
  }

  ctx.on('agent/created', ({ agent }) => manager.onAgentCreated(agent))
  ctx.on('agent/disposed', ({ agent }) => manager.onAgentDisposed(agent))
  manager.installExistingAgentTombstones()

  ctx.effect(() => () => {
    manager.dispose()
  }, 'skills-console: dispose')

  ctx.inject(['webServer'], (webCtx) => {
    ctx.inject(['connection'], (connCtx) => {
      try {
        const disposeRoutes = registerRoutes(webCtx.webServer, connCtx.connection, manager)
        ctx.effect(() => disposeRoutes, 'skills-console: routes')
      } catch (error) {
        ctx.logger && ctx.logger.warn && ctx.logger.warn('[dsh-skills] 管理接口注册失败: ' + String((error && error.message) || error))
      }
    })
  })

  return { manager }
}
