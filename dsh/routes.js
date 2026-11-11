// dsh/routes.js — same-origin JSON API under /dsh-skills/api/*.
//
// Auth model copied from dsh-mcp-tools: the webServer route is wrapped by the
// connection trust gate, so only the logged-in page can drive management.

const PREFIX = '/dsh-skills/api'
const MAX_BODY_BYTES = 256 * 1024

function sendJson(response, status, payload) {
  if (response.headersSent) { try { response.end() } catch { /* noop */ } return }
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(payload))
}

function errorPayload(error) {
  const code = error && error.code ? error.code : 'internal'
  const message = error && error.message ? error.message : String(error || '未知错误')
  return { ok: false, error: code, message }
}

async function readJsonBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('请求体过大（上限 256 KiB）')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (!text) return {}
  try { return JSON.parse(text) } catch { throw new Error('请求体不是合法 JSON') }
}

export function registerRoutes(webServer, connection, manager) {
  if (!webServer || typeof webServer.register !== 'function') throw new Error('webServer 服务不可用')
  const disposers = []

  function route(path, methods, handle) {
    const handler = async function (request, response) {
      if (connection && typeof connection.requestRejection === 'function') {
        let rejection
        try { rejection = connection.requestRejection(request) } catch { rejection = 403 }
        if (rejection !== undefined) {
          sendJson(response, rejection, { ok: false, error: rejection === 401 ? 'unauthorized' : 'forbidden', message: rejection === 401 ? '需要登录后再操作' : '请求来源不可信' })
          return
        }
      }
      const method = String(request.method || 'GET').toUpperCase()
      if (!methods.includes(method)) {
        sendJson(response, 405, { ok: false, error: 'method-not-allowed', message: '不支持的请求方法：' + method })
        return
      }
      try {
        const body = method === 'GET' || method === 'HEAD' ? {} : await readJsonBody(request)
        const url = new URL('http://local' + (request.url || '/'))
        const result = await handle({ method, body, url, request })
        sendJson(response, 200, result && result.ok !== undefined ? result : { ok: true, value: result })
      } catch (error) {
        sendJson(response, 400, errorPayload(error))
      }
    }
    try {
      const dispose = webServer.register({ kind: 'exact', path: PREFIX + path, handler })
      disposers.push(dispose)
    } catch (error) {
      // One duplicate or malformed route must not block every later route.
      try {
        manager.store.log({ op: 'route-error', message: path + ': ' + String((error && error.message) || error), status: 'error' })
      } catch { /* logging must never break route registration */ }
    }
  }

  route('/view', ['GET'], (ctx) => manager.view(ctx.url.searchParams.get('sessionId') || undefined))
  route('/refresh', ['POST'], () => manager.refreshSummary())
  route('/detail', ['GET'], (ctx) => manager.detail(ctx.url.searchParams.get('name'), ctx.url.searchParams.get('dir') || undefined))
  route('/health', ['GET'], () => manager.health())

  route('/ops/disable', ['POST'], (ctx) => manager.opDisable(ctx.body.name, ctx.body.dir))
  route('/ops/enable', ['POST'], (ctx) => manager.opEnable(ctx.body.name, ctx.body.dir))
  route('/ops/remove', ['POST'], (ctx) => manager.opRemove(ctx.body.name, ctx.body.dir, { confirmed: !!ctx.body.confirmed, backup: ctx.body.backup !== false }))
  route('/ops/link', ['POST'], (ctx) => manager.opLink(ctx.body.name, ctx.body.target, ctx.body.rootDir, ctx.body.sourceAgent))
  route('/ops/unlink', ['POST'], (ctx) => manager.opUnlink(ctx.body.name, ctx.body.dir))
  route('/ops/materialize', ['POST'], (ctx) => manager.opMaterialize(ctx.body.name, ctx.body.dir))
  route('/ops/pin', ['POST'], (ctx) => manager.opPin(ctx.body.name, ctx.body.dir, ctx.body.pinned))
  route('/ops/rollback', ['POST'], (ctx) => manager.opRollback(ctx.body.name, ctx.body.backupDir))
  route('/ops/undo', ['POST'], () => manager.opUndo())

  route('/roots/add', ['POST'], (ctx) => manager.opAddCustomRoot(ctx.body.dir))
  route('/roots/remove', ['POST'], (ctx) => manager.opRemoveCustomRoot(ctx.body.dir))

  route('/market/search', ['POST'], (ctx) => manager.marketSearch(ctx.body.source, ctx.body.query))
  route('/market/sources', ['GET', 'POST'], (ctx) => ctx.method === 'GET'
    ? { ok: true, sources: manager.marketSources() }
    : manager.saveMarketSources(ctx.body.sources))
  route('/skillhub/install', ['POST'], (ctx) => manager.skillhubInstall(ctx.body.name, ctx.body.source))

  route('/cli/find', ['POST'], (ctx) => manager.cliFind(ctx.body.query))
  route('/cli/add', ['POST'], (ctx) => manager.cliAdd(ctx.body.pkg, { scope: ctx.body.scope || 'global' }))
  route('/cli/update', ['POST'], (ctx) => manager.cliUpdate(ctx.body.names, { scope: ctx.body.scope || 'global' }))
  route('/cli/remove', ['POST'], (ctx) => manager.cliRemove(ctx.body.names, { scope: ctx.body.scope || 'global' }))

  route('/sync/remotes', ['GET', 'POST'], (ctx) => ctx.method === 'GET'
    ? { ok: true, remotes: manager.syncRemotes() }
    : manager.saveSyncRemotes(ctx.body.remotes))
  route('/sync/test', ['POST'], (ctx) => manager.syncTest(ctx.body.remoteId))
  route('/sync/push', ['POST'], (ctx) => manager.syncPush(ctx.body.remoteIds))
  route('/sync/pull', ['POST'], (ctx) => manager.syncPull(ctx.body.remoteIds))
  route('/sync/install', ['POST'], (ctx) => manager.syncInstall(ctx.body.items))

  route('/backups', ['GET'], () => manager.backups())
  route('/backups/prune', ['POST'], () => manager.prune())
  route('/logs', ['GET'], (ctx) => manager.logs(Number(ctx.url.searchParams.get('limit') || 100)))

  return function disposeRoutes() {
    for (const dispose of disposers) {
      try { if (typeof dispose === 'function') dispose() } catch { /* noop */ }
    }
  }
}
