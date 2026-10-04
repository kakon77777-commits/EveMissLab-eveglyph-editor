// ─── EveGlyph Editor — MCP server (local, stdio) ───────────────────────────
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createMcpServer, resolveWorkspaceRootOrExit } from './mcp-server-factory.js'

const WORKSPACE_ROOT = await resolveWorkspaceRootOrExit(process.argv, 'usage: node mcp-server.js <workspace-root>')

const server = createMcpServer(WORKSPACE_ROOT)
const transport = new StdioServerTransport()
await server.connect(transport)
