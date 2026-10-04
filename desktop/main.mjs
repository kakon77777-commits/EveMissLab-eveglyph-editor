// EveGlyph Editor — desktop shell (Electron main process).
//
// What it does: starts the local bridge + built frontend on 127.0.0.1 (host.mjs) and shows it in a window. Nothing is
// served beyond loopback, and every /api request must carry a per-launch token that only this window's session adds, so
// other local web pages cannot talk to the bridge (see SECURITY.md, "Desktop app").
import { app, BrowserWindow, Menu, session, shell, dialog } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startHost, TOKEN_HEADER } from './host.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = path.resolve(HERE, '..')               // the staged app (installed) or the repo root (development)
const DIST = path.join(APP_ROOT, 'dist')
const FONTS = path.join(APP_ROOT, 'public', 'fonts', 'typst')   // served at /fonts/typst/ (and read directly by the PDF renderer)
const ICON = [path.join(APP_ROOT, 'build', 'icon.png'), path.join(HERE, 'icon.png')].find(p => fs.existsSync(p))
const PREFERRED_PORT = 47831                              // fixed so the page origin — and with it localStorage — stays stable
const SMOKE = process.env.EVEGLYPH_DESKTOP_SMOKE === '1'  // self-test: start, probe, screenshot, exit (used by build.mjs)
const DEVTOOLS = !app.isPackaged || process.env.EVEGLYPH_DESKTOP_DEVTOOLS === '1'
const HOMEPAGE = 'https://eveglypheditor.com'
const REPO = 'https://github.com/kakon77777-commits/EveMissLab-eveglyph-editor'   // filled in when the public edition is exported
const MOUNTS = fs.existsSync(FONTS) ? [{ prefix: '/fonts/typst', dir: FONTS }] : []
const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write', 'fullscreen', 'fileSystem'])

app.setName('EveGlyph Editor')
if (process.env.EVEGLYPH_DESKTOP_USER_DATA) app.setPath('userData', process.env.EVEGLYPH_DESKTOP_USER_DATA)

let mainWindow = null
let host = null

function portFile() { return path.join(app.getPath('userData'), 'host-port.json') }
function readPreferredPort() {
  try {
    const p = JSON.parse(fs.readFileSync(portFile(), 'utf8')).port
    if (Number.isInteger(p) && p >= 1024 && p <= 65535) return p
  } catch { /* first run */ }
  return PREFERRED_PORT
}

async function startServer(token) {
  const want = SMOKE ? 0 : readPreferredPort()
  try {
    return await startHost({ distDir: DIST, port: want, apiToken: token, staticMounts: MOUNTS })
  } catch (error) {
    if (error?.code !== 'EADDRINUSE') throw error
    return await startHost({ distDir: DIST, port: 0, apiToken: token, staticMounts: MOUNTS })   // busy: fall back (saved settings will look empty)
  }
}

function buildMenu() {
  const view = [{ role: 'reload' }, { role: 'forceReload' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
    { type: 'separator' }, { role: 'togglefullscreen' }]
  if (DEVTOOLS) view.push({ type: 'separator' }, { role: 'toggleDevTools' })
  return Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: view },
    { label: 'Help', submenu: [
      { label: 'EveGlyph Editor website', click: () => shell.openExternal(HOMEPAGE) },
      { label: 'Source code on GitHub', click: () => shell.openExternal(REPO) },
      { label: 'Third-party notices', click: () => shell.openPath(path.join(APP_ROOT, 'THIRD-PARTY-LICENSES.txt')) },
    ] },
  ])
}

function lockDownSession(origin, token) {
  const ses = session.defaultSession
  // the token is added to this window's requests only
  ses.webRequest.onBeforeSendHeaders({ urls: [`${origin}/*`] }, (details, callback) => {
    details.requestHeaders[TOKEN_HEADER] = token
    callback({ requestHeaders: details.requestHeaders })
  })
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)))
  ses.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission))
}

function createWindow(origin) {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    show: false, autoHideMenuBar: true, backgroundColor: '#0f172a', title: 'EveGlyph Editor', icon: ICON,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, devTools: DEVTOOLS },
  })
  win.once('ready-to-show', () => win.show())
  // links to other sites open in the default browser, never inside this window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== origin) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    }
  })
  win.loadURL(`${origin}/`)
  return win
}

// ---------------------------------------------------------------------------------------------------------------
// Self-test (EVEGLYPH_DESKTOP_SMOKE=1): proves the packaged app works end to end, writes a JSON report + screenshot.
// ---------------------------------------------------------------------------------------------------------------
function get(port, urlPath, headers = {}, method = 'GET', body = null) {
  return new Promise(resolve => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers }, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', error => resolve({ status: 0, body: String(error) }))
    if (body) req.write(body)
    req.end()
  })
}

async function runSmoke(win, port, token) {
  const out = { ok: false, versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node }, packaged: app.isPackaged }
  const auth = { [TOKEN_HEADER]: token }
  await new Promise(resolve => win.webContents.once('did-finish-load', resolve))
  await new Promise(resolve => setTimeout(resolve, 2500))                      // let the app mount
  out.index = (await get(port, '/')).status
  out.fontServed = (await get(port, '/fonts/typst/NotoSerifTC-Regular.ttf', {}, 'HEAD')).headers['content-length']
  out.apiWithToken = (await get(port, '/api/agents', auth)).status
  out.apiWithoutToken = (await get(port, '/api/agents')).status
  out.apiWrongToken = (await get(port, '/api/agents', { [TOKEN_HEADER]: 'x'.repeat(token.length) })).status
  out.apiForeignHostWithToken = (await get(port, '/api/agents', { ...auth, Host: 'evil.example' })).status
  const page = await win.webContents.executeJavaScript(`({
    title: document.title,
    elements: document.querySelectorAll('*').length,
    ui: /Open Folder/.test(document.body.innerText) && document.querySelectorAll('button').length > 3,
    nodeLeak: typeof require + '|' + typeof process + '|' + typeof module,
    text: document.body.innerText.slice(0, 120)
  })`)
  Object.assign(out, { page })
  // the optional remote-MCP child must start through the Electron binary running as plain Node
  const ws = process.env.EVEGLYPH_DESKTOP_SMOKE_WORKSPACE || path.join(APP_ROOT, 'examples')
  const open = await get(port, `/api/workspace?cwd=${encodeURIComponent(ws)}`, auth)
  out.workspaceOpen = open.status
  const mcpPort = 48765
  const mcpToken = crypto.randomBytes(16).toString('hex')
  const start = await get(port, '/api/mcp/start', { ...auth, 'Content-Type': 'application/json' }, 'POST', JSON.stringify({ cwd: ws, port: mcpPort, token: mcpToken }))
  out.mcpStart = start.status
  out.mcpStartBody = start.body.slice(0, 160)
  if (start.status === 200) {
    out.mcpRejectsNoToken = (await get(mcpPort, '/mcp', { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' }, 'POST', '{}')).status
    out.mcpStatus = JSON.parse((await get(port, '/api/mcp/status', auth)).body || '{}').running === true
    await get(port, '/api/mcp/stop', auth, 'POST')
  }
  const image = await win.webContents.capturePage()
  const outDir = process.env.EVEGLYPH_DESKTOP_SMOKE_OUT || app.getPath('temp')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'smoke.png'), image.toPNG())
  out.screenshot = path.join(outDir, 'smoke.png')
  out.ok = out.index === 200 && out.apiWithToken === 200 && out.apiWithoutToken === 403 && out.apiWrongToken === 403 && out.apiForeignHostWithToken === 403 &&
    out.page.ui && out.page.nodeLeak === 'undefined|undefined|undefined' && Number(out.fontServed) > 1000000 && out.workspaceOpen === 200 && out.mcpStart === 200 && out.mcpRejectsNoToken >= 400 && out.mcpStatus === true
  fs.writeFileSync(path.join(outDir, 'smoke.json'), JSON.stringify(out, null, 2))
  return out
}

// ---------------------------------------------------------------------------------------------------------------
async function main() {
  const token = crypto.randomBytes(24).toString('hex')
  try {
    host = await startServer(token)
  } catch (error) {
    dialog.showErrorBox('EveGlyph Editor could not start', String(error?.message || error))
    return app.exit(1)
  }
  if (!SMOKE) { try { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(portFile(), JSON.stringify({ port: host.port })) } catch { /* not fatal */ } }
  const origin = `http://127.0.0.1:${host.port}`
  lockDownSession(origin, token)
  Menu.setApplicationMenu(buildMenu())
  mainWindow = createWindow(origin)
  if (SMOKE) {
    mainWindow.show()
    let code = 1
    try { code = (await runSmoke(mainWindow, host.port, token)).ok ? 0 : 1 } catch (error) { console.error('smoke failed', error) }
    await host.close().catch(() => {})
    app.exit(code)
  }
}

if (!SMOKE && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus() } })
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => { host?.close().catch(() => {}) })
  app.whenReady().then(main)
}
