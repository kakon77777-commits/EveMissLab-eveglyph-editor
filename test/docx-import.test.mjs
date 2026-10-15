import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import path from 'node:path'
import mammoth from 'mammoth'

const require = createRequire(import.meta.url)
// Use Mammoth's own ZIP dependency to construct a wholly synthetic DOCX fixture.
const Zip = createRequire(require.resolve('mammoth'))('jszip')

test('DOCX library import and Mammoth CLI work with the patched dependency tree', async () => {
  const zip = new Zip()
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX regression fixture 繁體中文</w:t></w:r></w:p></w:body></w:document>')
  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  const converted = await mammoth.convertToHtml({ buffer })
  assert.equal(converted.value, '<p>DOCX regression fixture 繁體中文</p>')
  const dir = await mkdtemp(path.join(os.tmpdir(), 'eveglyph-docx-import-'))
  try {
    const file = path.join(dir, 'synthetic.docx')
    await writeFile(file, buffer)
    const cli = path.join(path.dirname(require.resolve('mammoth/package.json')), 'bin', 'mammoth')
    const { stdout } = await promisify(execFile)(process.execPath, [cli, file])
    assert.equal(stdout.trim(), converted.value)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
