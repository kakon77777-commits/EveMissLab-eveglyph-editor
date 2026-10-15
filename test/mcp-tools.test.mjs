import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import iconv from 'iconv-lite'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

let workspace, client

function textJson(result) {
  assert.notEqual(result.isError, true, JSON.stringify(result))
  return JSON.parse(result.content.find(item => item.type === 'text').text)
}

before(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), 'eveglyph-mcp-tools-'))
  await mkdir(path.join(workspace, 'notes'))
  await mkdir(path.join(workspace, 'node_modules'))
  await writeFile(path.join(workspace, '.private.md'), 'hidden fixture')
  await writeFile(path.join(workspace, 'node_modules', 'excluded.md'), 'excluded fixture')
  await writeFile(path.join(workspace, 'notes', 'legacy.txt'), iconv.encode('繁體中文測試資料', 'Big5'))
  await writeFile(path.join(workspace, 'notes', 'original.md'), '# Original\n')
  client = new Client({ name: 'eveglyph-tool-contract-test', version: '1.0.0' })
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve('mcp-server.js'), workspace],
  }))
})

after(async () => {
  await client?.close().catch(() => {})
  if (workspace) await rm(workspace, { recursive: true, force: true })
})

test('tools/list exposes explicit schemas and accurate safety hints for all eleven tools', async () => {
  const expected = {
    list_files: [true, false, true, false],
    read_file: [true, false, true, false],
    write_file: [false, true, true, false],
    evaluate_aimdc: [true, false, true, false],
    validate_world_ir: [true, false, true, false],
    get_publication_capabilities: [true, false, true, false],
    inspect_document: [true, false, true, false],
    validate_document: [true, false, true, false],
    render_document: [false, true, false, false],
    get_render_artifact: [true, false, true, false],
    get_render_report: [true, false, true, false],
  }
  const { tools } = await client.listTools()
  assert.deepEqual(tools.map(tool => tool.name).sort(), Object.keys(expected).sort())
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, 'object', tool.name)
    assert.equal(tool.inputSchema.additionalProperties, false, tool.name)
    assert.deepEqual(['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint']
      .map(key => tool.annotations?.[key]), expected[tool.name], tool.name)
  }
})

test('list_files and read_file use relative paths, exclude hidden/build files and decode Big5', async () => {
  const listed = textJson(await client.callTool({ name: 'list_files' }))
  assert.deepEqual(listed.files.sort(), ['notes/legacy.txt', 'notes/original.md'])
  const read = textJson(await client.callTool({ name: 'read_file', arguments: { path: 'notes/legacy.txt' } }))
  assert.equal(read.content, '繁體中文測試資料')
})

test('write_file creates nested UTF-8 files and repeated writes preserve the requested content', async () => {
  const args = { path: 'created/nested/中文.md', content: '# 新文件\n繁體中文\n' }
  for (let i = 0; i < 2; i++) {
    const written = textJson(await client.callTool({ name: 'write_file', arguments: args }))
    assert.equal(written.bytes, Buffer.byteLength(args.content))
    assert.equal(await readFile(path.join(workspace, args.path), 'utf8'), args.content)
  }
})

test('workspace tools deny traversal instead of reading or creating files outside the root', async () => {
  for (const name of ['read_file', 'write_file']) {
    const result = await client.callTool({ name, arguments: { path: '../outside.md', ...(name === 'write_file' ? { content: 'blocked' } : {}) } })
    assert.equal(result.isError, true)
    assert.match(result.content[0].text, /path escapes workspace/)
  }
})

test('validate_world_ir reports invalid YAML and real semantic errors', async () => {
  const valid = textJson(await client.callTool({ name: 'validate_world_ir', arguments: {
    content: 'kind: state_machine\ninitial: idle\nstates: [idle, done]\ntransitions:\n  - {from: idle, on: finish, to: done}\n',
  } }))
  assert.equal(valid.kind, 'state_machine')
  assert.deepEqual(valid.issues, [])
  const invalid = textJson(await client.callTool({ name: 'validate_world_ir', arguments: { content: 'kind: entity\ntype: item\n' } }))
  assert.ok(invalid.issues.some(issue => issue.code === 'missing_id'))
  const malformed = textJson(await client.callTool({ name: 'validate_world_ir', arguments: { content: 'kind: entity\nitems: [\n' } }))
  assert.equal(malformed.issues[0].code, 'parse_error')
})

test('inspect_document and validate_document return useful publication diagnostics over MCP', async () => {
  const source = '# Protocol fixture\n\n$$\nx^2\n'
  const inspected = textJson(await client.callTool({ name: 'inspect_document', arguments: { source } }))
  assert.equal(inspected.title, 'Protocol fixture')
  assert.deepEqual(inspected.headings, [{ depth: 1, text: 'Protocol fixture' }])
  const validated = textJson(await client.callTool({ name: 'validate_document', arguments: { source } }))
  assert.equal(validated.ok, false)
  assert.ok(validated.errors.some(error => error.code === 'unbalanced_display_math'))
})

test('invalid tool inputs are rejected before any file or render side effect', async () => {
  const original = await readFile(path.join(workspace, 'notes/original.md'), 'utf8')
  const files = await readdir(workspace, { recursive: true })
  const cases = [
    ['list_files', { unexpected: true }],
    ['get_publication_capabilities', { unexpected: true }],
    ['read_file', { path: 42 }],
    ['write_file', { path: 'notes/original.md', content: 42 }],
    ['write_file', { path: '', content: 'blocked' }],
    ['evaluate_aimdc', { content: [] }],
    ['validate_world_ir', {}],
    ['inspect_document', { source: null }],
    ['validate_document', { source: '# Test', profile: 42 }],
    ['render_document', { source: '# Test', output_format: 'html' }],
    ['get_render_artifact', { artifact_id: '' }],
    ['get_render_report', { artifact_id: 42 }],
  ]
  for (const [name, args] of cases) {
    const result = await client.callTool({ name, arguments: args })
    assert.equal(result.isError, true, name)
    assert.match(result.content[0].text, /Invalid arguments|Input validation error/, name)
  }
  assert.equal(await readFile(path.join(workspace, 'notes/original.md'), 'utf8'), original)
  assert.deepEqual(await readdir(workspace, { recursive: true }), files)
})
