import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createAgentInvocation, spawnAgentProcess } from '../agent-process.js'

async function run(invocation, { cwd, input = '', env } = {}) {
  const child = spawnAgentProcess(invocation, { cwd, env })
  let stdout = '', stderr = ''
  child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk })
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
  const closed = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`exit ${code}: ${stderr}`)))
  })
  child.stdin.on('error', () => {})
  child.stdin.end(input)
  return closed
}

const echoScript = `let input = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', chunk => input += chunk); process.stdin.on('end', () => console.log(JSON.stringify({ args: process.argv.slice(2), input })));`

test('native invocation preserves literal metacharacters in argv and prompt stdin', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'eveglyph-agent-process-'))
  try {
    const script = path.join(dir, 'echo arguments.mjs')
    await writeFile(script, echoScript)
    const args = ['space separated', 'a&b', 'a|b', '$(no-command)', '%EVEGLYPH_TEST_VALUE%', '繁體中文', '"quoted"']
    const prompt = 'User document: & | > < %PATH% $(no-command)\n繁體中文\n'
    const result = JSON.parse(await run(createAgentInvocation({ executable: process.execPath, args: [script, ...args] }), {
      cwd: dir, input: prompt, env: { ...process.env, EVEGLYPH_TEST_VALUE: 'must not expand' },
    }))
    assert.deepEqual(result, { args, input: prompt })
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('command overrides require Trusted and keep owner-provided shell syntax', async () => {
  for (const permission of [undefined, 'cautious', 'standard', 'unknown']) {
    assert.throws(() => createAgentInvocation({ override: 'echo one && echo two', permission }), /Trusted/)
  }
  const output = await run(createAgentInvocation({ override: 'echo one && echo two', permission: 'trusted' }))
  assert.match(output, /one\s+two/)
})

test('version probes run a native executable without shell interpretation', async () => {
  const output = await run(createAgentInvocation({ executable: process.execPath, args: ['--version'] }))
  assert.match(output.trim(), /^v\d+\.\d+\.\d+/)
})

test('Windows command shims work from paths containing spaces and ampersands', { skip: process.platform !== 'win32' }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'eveglyph-agent-shim-'))
  try {
    const bin = path.join(dir, 'tools & fixtures')
    await mkdir(bin)
    const script = path.join(bin, 'echo arguments.mjs')
    const shim = path.join(bin, 'synthetic agent.cmd')
    await writeFile(script, echoScript)
    await writeFile(shim, `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`)
    const prompt = '& echo this is document content, not a command\n繁體中文'
    const result = JSON.parse(await run(createAgentInvocation({ executable: shim, args: ['--permission-mode', 'acceptEdits'] }), { cwd: dir, input: prompt }))
    assert.deepEqual(result, { args: ['--permission-mode', 'acceptEdits'], input: prompt })
  } finally { await rm(dir, { recursive: true, force: true }) }
})
