import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

test('local bridge runs built-in argv and prompt stdin through a synthetic CLI', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'eveglyph-bridge-contract-'))
  const saved = { exe: process.env.EVEGLYPH_CLAUDE_EXE, monitor: process.env.EVEGLYPH_MONITOR_FILE }
  let server
  try {
    const workspace = path.join(dir, 'workspace')
    const bin = path.join(dir, 'tools & fixtures')
    await mkdir(workspace)
    await mkdir(bin)
    const script = path.join(bin, 'echo.mjs')
    await writeFile(script, `let prompt = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', text => prompt += text); process.stdin.on('end', () => console.log(JSON.stringify({ args: process.argv.slice(2), prompt })));`)
    const executable = path.join(bin, process.platform === 'win32' ? 'synthetic-cli.cmd' : 'synthetic-cli')
    await writeFile(executable, process.platform === 'win32'
      ? `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`
      : `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`, { mode: 0o755 })
    process.env.EVEGLYPH_CLAUDE_EXE = executable
    process.env.EVEGLYPH_MONITOR_FILE = path.join(dir, 'synthetic-monitor.jsonl')
    const { agentBridge } = await import('../vite-agent-bridge.js')
    server = await createServer({ configFile: false, logLevel: 'silent', plugins: [agentBridge()], server: { host: '127.0.0.1', port: 0 } })
    await server.listen()
    const base = `http://127.0.0.1:${server.httpServer.address().port}`
    const opened = await fetch(`${base}/api/workspace?${new URLSearchParams({ cwd: workspace })}`)
    assert.equal(opened.status, 200)
    const prompt = 'Synthetic document & | %PATH% $(not-a-command)\n繁體中文'
    const response = await fetch(`${base}/api/agent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'claude', cwd: workspace, permission: 'standard', prompt }),
    })
    assert.equal(response.status, 200)
    const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line))
    assert.equal(events.find(event => event.type === 'done')?.code, 0)
    assert.equal(events.some(event => event.type === 'error'), false)
    const output = JSON.parse(events.filter(event => event.type === 'stdout').map(event => event.data).join(''))
    assert.deepEqual(output, { args: ['-p', '--permission-mode', 'acceptEdits'], prompt })
    const rejected = await fetch(`${base}/api/agent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'claude', cwd: workspace, permission: 'standard', command: 'echo forbidden-override' }),
    })
    assert.equal(rejected.status, 400)
    assert.match(await rejected.text(), /Trusted/)
  } finally {
    await server?.close()
    if (saved.exe === undefined) delete process.env.EVEGLYPH_CLAUDE_EXE
    else process.env.EVEGLYPH_CLAUDE_EXE = saved.exe
    if (saved.monitor === undefined) delete process.env.EVEGLYPH_MONITOR_FILE
    else process.env.EVEGLYPH_MONITOR_FILE = saved.monitor
    await rm(dir, { recursive: true, force: true })
  }
})
