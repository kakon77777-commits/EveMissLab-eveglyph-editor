import test from 'node:test'
import assert from 'node:assert/strict'
import { CFG_KEY, S, persistConfig } from '../src/state.js'

test('quick settings writes never persist session-only credentials', () => {
  const original = S.cfg
  const values = new Map()
  const storage = { setItem: (key, value) => values.set(key, value) }
  try {
    S.cfg = { ...original, key: 'synthetic-provider-credential', keyPersist: false,
      mcpToken: 'synthetic-mcp-credential', mcpTokenPersist: false }
    persistConfig(storage)
    S.cfg.theme = 'paper'
    S.cfg.workspace = 'synthetic-workspace'
    persistConfig(storage)
    const saved = JSON.parse(values.get(CFG_KEY))
    assert.equal(saved.key, '')
    assert.equal(saved.mcpToken, '')
    assert.equal(saved.theme, 'paper')
    assert.equal(saved.workspace, 'synthetic-workspace')
    assert.equal(S.cfg.key, 'synthetic-provider-credential')
    assert.equal(S.cfg.mcpToken, 'synthetic-mcp-credential')
  } finally { S.cfg = original }
})

test('remembered credentials persist only with their respective opt-in', () => {
  const original = S.cfg
  let saved
  const storage = { setItem: (_key, value) => { saved = JSON.parse(value) } }
  try {
    S.cfg = { ...original, key: 'synthetic-provider-credential', keyPersist: true,
      mcpToken: 'synthetic-mcp-credential', mcpTokenPersist: false }
    persistConfig(storage)
    assert.equal(saved.key, S.cfg.key)
    assert.equal(saved.mcpToken, '')
    S.cfg.mcpTokenPersist = true
    persistConfig(storage)
    assert.equal(saved.mcpToken, S.cfg.mcpToken)
    S.cfg.keyPersist = false
    S.cfg.mcpTokenPersist = false
    persistConfig(storage)
    assert.equal(saved.key, '')
    assert.equal(saved.mcpToken, '')
  } finally { S.cfg = original }
})
