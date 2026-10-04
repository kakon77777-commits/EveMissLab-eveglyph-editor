#!/usr/bin/env node
// Builds the Windows desktop package (NSIS installer + zip) from this repository.
//
//   node build.mjs                    frontend build → stage → installer + zip → self-test of the unpacked app
//   node build.mjs --skip-frontend    reuse an existing ../dist
//   node build.mjs --stage-only       stop after staging (no electron-builder)
//   node build.mjs --smoke-only       run the self-test against release/win-unpacked
//   node build.mjs --installer-test   silent install → self-test of the installed app → uninstall → check nothing is left
//
// "Staging" copies only what the Node side really imports (found by following the import graph from the bridge, the MCP
// servers and the desktop shell), the built frontend, the bundled fonts and the examples, then installs just those
// packages' production dependencies — so the installer carries ~10 npm packages, not the whole development tree.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const STAGE = path.join(HERE, 'stage')
const OUT = path.join(HERE, 'release')
const argv = new Set(process.argv.slice(2))
const NODE_ENTRIES = ['vite-agent-bridge.js', 'mcp-server.js', 'mcp-server-remote.js', 'desktop/host.mjs', 'desktop/main.mjs']
const PROVIDED_BY_ELECTRON = new Set(['electron'])
const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const deskPkg = JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8'))
const VERSION = rootPkg.version
const EXE_NAME = 'EveGlyph Editor.exe'

const log = (...a) => console.log('[desktop]', ...a)
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

// npm is a .cmd shim on Windows; run its JavaScript entry point with this same Node instead (no shell involved)
function npmCli() {
  const candidates = [process.env.npm_execpath, path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')]
  return candidates.find(c => c && /npm-cli\.js$/.test(c) && fs.existsSync(c))
}

function run(cmd, args, opts = {}) {
  let file = cmd
  let argv = args
  if (cmd === 'npm') {
    const cli = npmCli()
    if (!cli) throw new Error('could not find npm-cli.js next to this Node installation')
    file = process.execPath
    argv = [cli, ...args]
  }
  const r = spawnSync(file, argv, { stdio: 'inherit', ...opts })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited with ${r.status ?? r.error}`)
}

// The web bundle (../dist) is compiled from the root node_modules, so those must be exactly what package-lock.json says: a stale
// install would silently ship old (possibly vulnerable) library versions inside the app.
function assertInstalledMatchesLock() {
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8')).packages
  const bad = []
  for (const [key, meta] of Object.entries(lock)) {
    if (!key) continue
    const pj = path.join(ROOT, ...key.split('/'), 'package.json')
    const name = key.replace(/node_modules\//g, '')
    if (!fs.existsSync(pj)) {
      if (!meta.optional && !meta.devOptional && !meta.os && !meta.cpu) bad.push(`${name} (not installed)`)
      continue
    }
    const got = JSON.parse(fs.readFileSync(pj, 'utf8')).version
    if (got !== meta.version) bad.push(`${name} ${got} (locked ${meta.version})`)
  }
  if (bad.length) throw new Error(`node_modules does not match package-lock.json: ${bad.length} difference(s), e.g. ${bad.slice(0, 4).join('; ')}. Run \`npm ci\` in the repository root and build again.`)
  log(`node_modules matches package-lock.json (${Object.keys(lock).length - 1} entries checked)`)
}

// ── 1. which files and packages does the Node side need? ─────────────────────────────────────────────────────────
const IMPORT = /(?:import\s+(?:[^'"()]*?\s+from\s+)?|import\(\s*|require\(\s*|export\s+[^'"]*?\s+from\s+)['"]([^'"]+)['"]/g

function reachable() {
  const files = new Set()
  const packages = new Set()
  const queue = [...NODE_ENTRIES]
  const isFile = c => fs.existsSync(path.join(ROOT, c)) && fs.statSync(path.join(ROOT, c)).isFile()
  while (queue.length) {
    const f = queue.pop()
    if (files.has(f)) continue
    if (!isFile(f)) throw new Error(`missing source file: ${f}`)
    files.add(f)
    if (!/\.m?js$/.test(f)) continue
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8')
    for (const m of text.matchAll(IMPORT)) {
      const spec = m[1]
      if (spec.startsWith('node:')) continue
      if (spec.startsWith('.')) {
        const base = path.posix.normalize(path.posix.join(path.posix.dirname(f), spec))
        const hit = ['', '.js', '.mjs', '.json', '/index.js'].map(e => base + e).find(isFile)
        if (!hit) throw new Error(`cannot resolve "${spec}" imported by ${f}`)
        queue.push(hit)
      } else {
        const parts = spec.split('/')
        packages.add(spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0])
      }
    }
  }
  return { files: [...files].sort(), packages: [...packages].filter(p => !PROVIDED_BY_ELECTRON.has(p)).sort() }
}

// ── 2. staging ───────────────────────────────────────────────────────────────────────────────────────────────────
function copyFile(rel, destRel = rel) {
  const dst = path.join(STAGE, destRel)
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.copyFileSync(path.join(ROOT, rel), dst)
}

function thirdPartyLicenses() {
  const nm = path.join(STAGE, 'node_modules')
  const dirs = []
  const scan = dir => {
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith('.')) continue
      const p = path.join(dir, name)
      if (name.startsWith('@')) scan(p)
      else if (fs.existsSync(path.join(p, 'package.json'))) dirs.push(p)
    }
  }
  scan(nm)
  const parts = [
    `EveGlyph Editor ${VERSION} — third-party notices for the Windows desktop build\n\n` +
    'EveGlyph Editor itself is released under the MIT License (see LICENSE). This application bundles the Electron runtime\n' +
    '(its own license and the Chromium licenses are in LICENSE.electron.txt and LICENSES.chromium.html next to the executable),\n' +
    'the npm packages listed below, and fonts (see public/fonts/typst/NOTICE.md and public/fonts/typst/LICENSES/).\n\n' +
    'jschardet is licensed under the LGPL-2.1-or-later. It is shipped here as plain, unmodified files in node_modules/jschardet\n' +
    '(no archive, no bundling), so you can replace it with a modified version of the library.\n',
  ]
  for (const p of dirs.sort()) {
    const pkg = JSON.parse(fs.readFileSync(path.join(p, 'package.json'), 'utf8'))
    const lic = typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type || (pkg.licenses ? JSON.stringify(pkg.licenses) : 'UNKNOWN'))
    const file = fs.readdirSync(p).find(n => /^(licen[cs]e|copying)([.-].*)?$/i.test(n) && fs.statSync(path.join(p, n)).isFile())
    const text = file ? fs.readFileSync(path.join(p, file), 'utf8').slice(0, 80000) : '(this package ships no separate license file; license: ' + lic + ')'
    const url = pkg.homepage || (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url) || ''
    parts.push('='.repeat(78) + `\n${pkg.name} ${pkg.version}   [${lic}]\n${url}\n` + '-'.repeat(78) + '\n' + text.trim() + '\n')
  }
  fs.writeFileSync(path.join(STAGE, 'THIRD-PARTY-LICENSES.txt'), parts.join('\n'))
  return dirs.length
}

function stage() {
  const { files, packages } = reachable()
  log(`Node side: ${files.length} source files, ${packages.length} npm packages: ${packages.join(', ')}`)
  fs.rmSync(STAGE, { recursive: true, force: true })
  fs.mkdirSync(STAGE, { recursive: true })
  for (const f of files) copyFile(f)
  for (const dir of ['dist', 'public/fonts/typst', 'examples']) {
    if (!fs.existsSync(path.join(ROOT, dir))) throw new Error(`missing ${dir} — run the frontend build first`)
    fs.cpSync(path.join(ROOT, dir), path.join(STAGE, dir), { recursive: true })
  }
  fs.rmSync(path.join(STAGE, 'dist', 'fonts', 'typst'), { recursive: true, force: true })   // served from public/fonts/typst instead (host.mjs)
  for (const f of ['LICENSE', 'NOTICE.md', 'README.md', 'CHANGELOG.md', 'SECURITY.md', 'USER-GUIDE.md']) copyFile(f)
  fs.mkdirSync(path.join(STAGE, 'build'), { recursive: true })
  fs.copyFileSync(path.join(HERE, 'icon.ico'), path.join(STAGE, 'build', 'icon.ico'))
  fs.copyFileSync(path.join(HERE, 'icon.png'), path.join(STAGE, 'build', 'icon.png'))
  fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(STAGE, 'build', 'license.txt'))   // shown on the installer's license page

  const dependencies = {}
  for (const name of packages) {
    const range = rootPkg.dependencies?.[name] ?? deskPkg.dependencies?.[name]
    if (!range) throw new Error(`"${name}" is imported on the Node side but is not a declared dependency`)
    dependencies[name] = range
  }
  fs.writeFileSync(path.join(STAGE, 'package.json'), JSON.stringify({
    name: 'eveglyph-editor', productName: 'EveGlyph Editor', version: VERSION, description: rootPkg.description,
    author: { name: 'EVEMISS TECHNOLOGY CO., LTD.', email: 'kakon77777@evemisslab.com' },
    license: rootPkg.license, homepage: rootPkg.homepage, repository: rootPkg.repository,
    private: true, type: 'module', main: 'desktop/main.mjs', dependencies,
  }, null, 2) + '\n')
  fs.copyFileSync(path.join(ROOT, 'package-lock.json'), path.join(STAGE, 'package-lock.json'))   // base: keep the locked versions
  run('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: STAGE })

  // the staged packages must be exactly the versions the project locks
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8')).packages
  for (const name of packages) {
    const locked = lock[`node_modules/${name}`]?.version
    const got = JSON.parse(fs.readFileSync(path.join(STAGE, 'node_modules', ...name.split('/'), 'package.json'), 'utf8')).version
    if (locked && locked !== got) throw new Error(`${name}: staged ${got} differs from the locked ${locked}`)
  }
  log(`license notices written for ${thirdPartyLicenses()} packages`)
  const size = d => { let n = 0; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); n += e.isDirectory() ? size(p) : fs.statSync(p).size } return n }
  log(`stage ready: ${(size(STAGE) / 1048576).toFixed(1)} MB in ${STAGE}`)
}

// ── 3. electron-builder ──────────────────────────────────────────────────────────────────────────────────────────
function buildInstaller() {
  const cli = path.join(HERE, 'node_modules', 'electron-builder', 'cli.js')
  if (!fs.existsSync(cli)) throw new Error('electron-builder is not installed — run `npm ci` inside desktop/ first')
  fs.rmSync(OUT, { recursive: true, force: true })
  run(process.execPath, [cli, '--projectDir', STAGE, '--config', path.join(HERE, 'electron-builder.yml'), `--config.directories.output=${OUT}`,
    '--win', 'nsis', 'zip', '--x64', '--publish', 'never'], { cwd: HERE, env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } })
}

function checksums() {
  const rows = fs.readdirSync(OUT).filter(n => /\.(exe|zip)$/i.test(n)).sort().map(n => ({ file: n, bytes: fs.statSync(path.join(OUT, n)).size, sha256: sha256(path.join(OUT, n)) }))
  fs.writeFileSync(path.join(OUT, 'SHA256SUMS.txt'), rows.map(r => `${r.sha256} *${r.file}`).join('\n') + '\n')
  fs.writeFileSync(path.join(OUT, 'build-info.json'), JSON.stringify({ version: VERSION, builtAt: new Date().toISOString(), artifacts: rows }, null, 2) + '\n')
  for (const r of rows) log(`${r.file}  ${(r.bytes / 1048576).toFixed(1)} MB  sha256 ${r.sha256}`)
  return rows
}

// ── 4. self-test of a built app (see runSmoke in main.mjs) ────────────────────────────────────────────────────────
function smoke(exe, label) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eveglyph-desktop-smoke-'))
  const env = { ...process.env, EVEGLYPH_DESKTOP_SMOKE: '1', EVEGLYPH_DESKTOP_USER_DATA: path.join(tmp, 'profile'), EVEGLYPH_DESKTOP_SMOKE_OUT: tmp }
  delete env.ELECTRON_RUN_AS_NODE            // inherited from another Electron app, it would make this exe behave as plain Node
  const r = spawnSync(exe, [], { env, timeout: 180000, stdio: 'ignore' })
  let report = null
  try { report = JSON.parse(fs.readFileSync(path.join(tmp, 'smoke.json'), 'utf8')) } catch { /* reported below */ }
  fs.mkdirSync(OUT, { recursive: true })
  if (fs.existsSync(path.join(tmp, 'smoke.png'))) fs.copyFileSync(path.join(tmp, 'smoke.png'), path.join(OUT, `smoke-${label}.png`))
  if (report) fs.writeFileSync(path.join(OUT, `smoke-${label}.json`), JSON.stringify(report, null, 2) + '\n')
  log(`self-test (${label}): exit ${r.status ?? r.signal}, ok=${report?.ok}`)
  if (report) log(JSON.stringify({ ...report, page: { ...report.page, text: undefined }, screenshot: undefined }))
  return { code: r.status, report }
}

// ── 5. silent install → test → uninstall ─────────────────────────────────────────────────────────────────────────
function shortcutsAndRegistry() {
  const ps = spawnSync('powershell.exe', ['-NoProfile', '-Command',
    "$w = New-Object -ComObject WScript.Shell; $dirs = @($w.SpecialFolders('Desktop'), $w.SpecialFolders('Programs')); " +
    "($dirs | ForEach-Object { Get-ChildItem -LiteralPath $_ -Recurse -Filter '*EveGlyph*' -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName } }) -join [Environment]::NewLine"], { encoding: 'utf8' })
  const reg = spawnSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', '/s', '/f', 'EveGlyph Editor', '/d'], { encoding: 'utf8' })
  return { shortcuts: (ps.stdout || '').split(/\r?\n/).filter(Boolean), registryHits: (reg.stdout.match(/EveGlyph Editor/g) || []).length }
}

function installerTest() {
  const installer = path.join(OUT, `EveGlyph-Editor-Setup-${VERSION}.exe`)
  if (!fs.existsSync(installer)) throw new Error(`build the installer first (${installer})`)
  const dir = path.join(os.tmpdir(), 'eveglyph-install-test')            // no spaces: NSIS wants /D= unquoted
  fs.rmSync(dir, { recursive: true, force: true })
  const before = shortcutsAndRegistry()
  const inst = spawnSync(installer, ['/S', `/D=${dir}`], { windowsVerbatimArguments: true, timeout: 600000 })
  const exe = path.join(dir, EXE_NAME)
  const installed = fs.existsSync(exe)
  const during = shortcutsAndRegistry()
  const result = { installerExit: inst.status, installed, filesInstalled: installed ? fs.readdirSync(dir).length : 0 }
  let test = { code: null, report: null }
  if (installed) test = smoke(exe, 'installed')
  // `_?=` keeps the uninstaller in place so the call is synchronous; it cannot delete itself, so finish by hand
  const un = path.join(dir, `Uninstall ${path.basename(EXE_NAME, '.exe')}.exe`)
  let uninstallExit = null
  if (fs.existsSync(un)) uninstallExit = spawnSync(un, ['/S', `_?=${dir}`], { windowsVerbatimArguments: true, timeout: 300000 }).status
  fs.rmSync(dir, { recursive: true, force: true })
  const after = shortcutsAndRegistry()
  Object.assign(result, { smokeOk: test.report?.ok === true, uninstallExit, dirGone: !fs.existsSync(dir),
    shortcuts: { before: before.shortcuts.length, during: during.shortcuts.length, after: after.shortcuts.length },
    registryEntries: { before: before.registryHits, during: during.registryHits, after: after.registryHits } })
  result.ok = result.installerExit === 0 && installed && result.smokeOk && uninstallExit === 0 && result.dirGone &&
    after.shortcuts.length === before.shortcuts.length && after.registryHits === before.registryHits
  fs.writeFileSync(path.join(OUT, 'installer-test.json'), JSON.stringify(result, null, 2) + '\n')
  log('installer test: ' + JSON.stringify(result))
  if (!result.ok) process.exitCode = 1
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────────────────────────
if (process.platform !== 'win32') throw new Error('this build script targets Windows')
if (argv.has('--smoke-only')) {
  const r = smoke(path.join(OUT, 'win-unpacked', EXE_NAME), 'unpacked')
  process.exitCode = r.report?.ok ? 0 : 1
} else if (argv.has('--installer-test')) {
  installerTest()
} else {
  if (!argv.has('--skip-frontend')) {
    assertInstalledMatchesLock()
    run('npm', ['run', 'build'], { cwd: ROOT })
  }
  stage()
  if (!argv.has('--stage-only')) {
    buildInstaller()
    checksums()
    const r = smoke(path.join(OUT, 'win-unpacked', EXE_NAME), 'unpacked')
    process.exitCode = r.report?.ok ? 0 : 1
  }
}
