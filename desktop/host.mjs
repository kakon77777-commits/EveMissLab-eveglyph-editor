// The desktop app's local server: the SAME bridge middlewares that `npm run dev` mounts on Vite's dev server
// (vite-agent-bridge.js), plus the built frontend (dist/) served statically. Binds to 127.0.0.1 only.
//
// The bridge plugin only touches two members of the Vite server object — `middlewares` (a connect app) and
// `httpServer` — so a plain connect app + http.Server is a faithful stand-in; no bridge code is duplicated.
import http from 'node:http'
import crypto from 'node:crypto'
import connect from 'connect'
import sirv from 'sirv'
import { agentBridge } from '../vite-agent-bridge.js'

export const TOKEN_HEADER = 'x-eveglyph-desktop'

function tokenMatches(received, expected) {
  if (typeof received !== 'string') return false
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/**
 * @param {object}  o
 * @param {string}  o.distDir    folder with the built frontend (index.html …)
 * @param {number} [o.port]      0 = let the OS choose
 * @param {string} [o.host]      defaults to 127.0.0.1 — do not change this
 * @param {{prefix: string, dir: string}[]} [o.staticMounts]  extra read-only folders served before dist/ (the bundled fonts)
 * @param {string} [o.apiToken]  when set, every /api request must carry it in the X-EveGlyph-Desktop header. The Electron
 *                               window adds it to its own requests; other local web pages and browsers cannot.
 */
export async function startHost({ distDir, port = 0, host = '127.0.0.1', apiToken = null, staticMounts = [] } = {}) {
  const app = connect()
  const server = http.createServer(app)

  // 1. desktop token gate — runs before the bridge's own Host/Origin gate
  if (apiToken) {
    app.use('/api', (req, res, next) => {
      if (tokenMatches(req.headers[TOKEN_HEADER], apiToken)) return next()
      res.statusCode = 403
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'forbidden: this server only answers the EveGlyph Editor desktop window' }))
    })
  }

  // 2. the bridge — identical endpoints and gates as in `npm run dev`
  agentBridge().configureServer({ middlewares: app, httpServer: server })

  // 3. static files: extra mounts first (the fonts live once, in public/fonts/typst), then the built frontend
  const staticOptions = {
    dev: false,
    etag: true,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('X-Content-Type-Options', 'nosniff')
    },
  }
  for (const { prefix, dir } of staticMounts) app.use(prefix, sirv(dir, staticOptions))
  app.use(sirv(distDir, staticOptions))

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => { server.off('error', reject); resolve() })
  })

  return {
    server,
    host,
    port: server.address().port,
    // 'close' on the http server is what makes the bridge stop its MCP child process
    close: () => new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections?.() }),
  }
}
