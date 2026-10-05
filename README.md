# EveGlyph Editor

> A local-first, AI-native Markdown editor and agentic document workspace — humans write clean Markdown, local CLI agents edit on disk, every change lands as a reviewable git diff. Part of **EveMissLab**.

EveGlyph Editor is a Markdown editor built around one idea — the **workspace ↔ agent ↔ diff-review ↔ human loop**. You write clean Markdown; AI assists quietly; local CLI agents edit files on disk; and every agent change surfaces as a reviewable git diff you accept or reject. The front stage stays minimal; the capability lives backstage.

It is the editor half of **EveGlyph-MD**, a semantic-first Markdown format/protocol.

**Website:** [eveglypheditor.com](https://eveglypheditor.com) · **Status:** v0.5.0 preview · **License:** [MIT](LICENSE) · [Changelog](CHANGELOG.md) · [Security](SECURITY.md) · [Third-party notices](NOTICE.md)

> ⚠️ **Local-agent mode runs a CLI with auto-approve.** When you enable it, the selected agent can read, create, edit, and **delete** files in the workspace folder you point it at — without per-file confirmation; you review the changes afterward as a git diff (Accept / Reject). Point it only at a folder you trust, and read **[SECURITY.md](SECURITY.md)** first. (The Anthropic / OpenAI cloud providers never touch your filesystem.)

## Features

- **Editor** — CodeMirror 6 with Markdown syntax and built-in search & replace (`Ctrl+F`).
- **Live preview** — `marked` + KaTeX math + `:::` callout blocks, sanitized with DOMPurify. A formula KaTeX can't render is retried through MathJax (loaded lazily) and anything that still fails is reported in a diagnostics panel instead of disappearing.
- **Computable documents (AIMD-C)** — `aimd-value` / `aimd-function` / `aimd-compute` / `aimd-assert` / `aimd-table` / `aimd-view` blocks give a Markdown document typed values, pure functions, a real dependency graph and live-recomputed results, evaluated by a closed-grammar evaluator (no `eval`). Reference any result with `@id.field`, or inline as `{{ id.field }}`. See `examples/aimd-demo.md`.
- **Dynamic Logic** — `aimd-claim` / `aimd-evidence` / `aimd-judgment` / `aimd-history` blocks add replayable claim → evidence → judgment reasoning on top of AIMD-C, with a timeline and autoplay in the preview. See `examples/dynamic-logic-demo.md`.
- **Charts and plots** — `::: chart` (bar / line / pie) and `::: plot` blocks render as SVG in the preview. See `examples/visual-ir-demo.md`.
- **PDF export (Typst)** — one click compiles the active document to a typeset PDF with a client-side WebAssembly Typst compiler: named themes and layouts, bundled fonts, Traditional Chinese support, nothing uploaded. See `examples/typst-export-demo.md`.
- **Themes and languages** — Dark, Light, Studio, Paper and Midnight themes, a Custom CSS file, and an English / 繁體中文 interface.
- **Workspace** — file tree, tabs, and a folder browser; open via the browser File System Access API (picker) or the local bridge (absolute path).
- **Encoding-aware** — detects a file's encoding (`jschardet`) and preserves it on save (`iconv-lite`: Big5 / GBK / Shift-JIS / …). A per-file status-bar menu (for bridge-opened files) lets you re-read or convert; a **Settings → Default encoding** acts as the fallback when detection is uncertain and the encoding for new files.
- **AI providers** — Anthropic (Claude), any OpenAI-compatible endpoint, or a **local CLI agent** (Claude Code / Codex / Gemini).
- **Diff-first agent review (PatchMD)** — before an agent runs, the workspace is git-snapshotted; afterwards you review a real diff — grouped into **per-file cards with +/− counts** — and **Accept** (commit) or **Reject** (revert). A live activity panel shows the agent working.
- **Permission tiers** — *Cautious* / *Standard* / *Trusted* map to **real CLI enforcement** (Claude Code permission modes and tool allow-lists, Codex `--full-auto` or a sandbox bypass, Gemini approval modes), not just prompt text.
- **EveGlyph-MD frontmatter** — a lightweight `type` / `status` / `tags` classification with a status-bar chip and preview badges; the active document's class is handed to the agent as sanitized, non-instruction metadata.
- **World Studio draft generation** — opt in with **Settings → Enable World Studio**. The **Studio** tab asks the configured cloud AI for a bounded state-machine draft containing states, variables, optional controlled random ranges, events, language instructions, responses, and transitions. State Machine Preview provides direct visual buffer editing for those records and Runtime mapping review. The result is parsed and validated locally before it can be applied to the editor; **Check with Runtime** can send it to the Runtime's read-only World IR importer, edit the returned mapping draft, and validate it again. It never writes Runtime State or saves a file automatically.
- **Workspace memory (`.eveglyph/`)** — per-workspace `rules.md` / `glossary.md` / `memory/*` injected into every agent run; a back-stage **Monitor** tab reads the diagnostic stream.
- **Capability sandbox foundation** — AIMD-C entry points run through a deny-by-default `document-only` authority profile. Document computation receives only current-document read, bounded compute, and ephemeral-output capability; workspace, network, process, and host-environment authority are absent unless a caller supplies an explicit resource-scoped grant. Allow/deny decisions carry actor-aware audit evidence.
- **MCP server** (`mcp-server.js`) — a standalone stdio [MCP](https://modelcontextprotocol.io) server so any MCP-capable client (Claude Desktop, Claude Code, etc.) can read/write a workspace, run AIMD-C/World-IR logic, and inspect, validate and render documents to PDF directly, no browser needed. See [below](#mcp-server-for-ai-clients).

## Download

**Windows 10/11 (x64):** a per-user installer (no administrator rights needed) and a portable zip are attached to the [v0.5.0 release](https://github.com/kakon77777-commits/EveMissLab-eveglyph-editor/releases/tag/v0.5.0), together with `SHA256SUMS.txt`. They are **not code-signed**, so Windows SmartScreen may warn about an unknown publisher: compare the SHA-256 before you run them. `git` must be installed for diff review. The recipe for building the installer yourself is in [`desktop/`](desktop/README.md).

**Any platform:** run EveGlyph Editor from source as described below; it needs only [Node.js](https://nodejs.org/) 18+, and `git` for diff review.

## Quick start

### Windows — one double-click

Double-click **`start-eveglyph.bat`**. The first run installs dependencies, then starts the dev server and opens your browser automatically.

### Any platform

```sh
npm install
npm run dev
```

Then open <http://localhost:5173>.

> First time? **Open Folder → `examples/`** for a ready-made workspace — sample EveGlyph-MD docs plus a starter `.eveglyph/` operating manual.

> Requires [Node.js](https://nodejs.org/) (18+). The dev server binds to `localhost` only — **don't run it with `--host`** (which exposes the bridge to your LAN) on an untrusted network.

## Configuration (Settings ⚙ panel)

- **AI Provider** — Anthropic / OpenAI-compatible / Local Agent (CLI).
- Cloud providers: API key + model id.
- Local agent: choose the agent, set an **absolute workspace path** (the browser cannot expose the picked folder's real path to the agent), and an optional command override.
- **Default encoding** — fallback used when auto-detection is uncertain, and the encoding applied to newly created files.
- **Enable World Studio** — reveals the advanced Runtime, World, Studio, and editable World IR views. It is off by default so the normal surface remains an AI-native Markdown editor; source files remain plain YAML and disk Save is always explicit.

## How it works

- **Frontend** — vanilla ES modules + CodeMirror, with all mutable state in a single `S` singleton (`src/`).
- **Bridge** — a **dev-only** Vite plugin (`vite-agent-bridge.js`) exposing `/api/*` for filesystem I/O, encoding detection, git diff-review, and agent spawning. As a Vite plugin it runs only under `npm run dev` (`apply: 'serve'`); the Windows desktop app in [`desktop/`](desktop/README.md) mounts the same bridge on a loopback-only server. Every endpoint is gated to local requests.

```text
browser frontend  ⇄  Vite local bridge  ⇄  filesystem · git · CLI agent
```

## MCP server (for AI clients)

`mcp-server.js` is a separate, standalone [MCP](https://modelcontextprotocol.io) server — a stdio process any MCP-capable client (Claude Desktop, Claude Code, or any other MCP host) can connect to directly, without a browser tab or `npm run dev` running. It operates on a workspace folder you point it at and exposes:

- `list_files` — every text file in the workspace
- `read_file` / `write_file` — read/write a file by relative path (encoding-aware on read)
- `evaluate_aimdc` — parse and evaluate a document's AIMD-C blocks through the `document-only` capability profile; the result includes sandbox/audit evidence
- `validate_world_ir` — validate a World IR YAML document (state machine / entity / entity list)
- `get_publication_capabilities`, `inspect_document`, `validate_document`, `render_document`, `get_render_artifact`, `get_render_report` — the publication runtime: inspect and validate canonical EveGlyph/Markdown source and render it to a temporary PDF without touching the source or the workspace (see [docs/MCP-PUBLICATION-RUNTIME.md](docs/MCP-PUBLICATION-RUNTIME.md))

The capability control plane also defines transport-neutral mappings for these base tools and the publication tools. The mapping is groundwork for later identity-aware MCP authorization; **this capability layer does not silently put existing workspace MCP tools behind a new grant-acquisition flow**, and the remote HTTP transport still uses its existing bearer-token compatibility mode.

Run it directly:

```sh
node mcp-server.js /absolute/path/to/your/workspace
# or: npm run mcp -- /absolute/path/to/your/workspace
```

Point an MCP client at it — for example, in Claude Desktop's `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "eveglyph-editor": {
      "command": "node",
      "args": ["/absolute/path/to/eveglyph-editor/mcp-server.js", "/absolute/path/to/your/workspace"]
    }
  }
}
```

### Remote access (over a tunnel)

`mcp-server-remote.js` is the same tool set over HTTP + bearer-token auth, for a client that isn't on this machine (e.g. a remote MCP connector, or a chat client you're using away from your desk):

```sh
export EVEGLYPH_MCP_TOKEN=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
npm run mcp:remote -- /absolute/path/to/your/workspace
# listens on http://127.0.0.1:8787/mcp — set EVEGLYPH_MCP_PORT to change the port
```

It only ever binds to `127.0.0.1` — reach it from outside by tunneling a public hostname to that port yourself, e.g. with [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):

```sh
cloudflared tunnel --url http://127.0.0.1:8787
```

Then point a remote MCP client at the tunnel's `https://.../mcp` URL with header `Authorization: Bearer <your token>`. Keep the token secret — anyone who has it can read/write the workspace you pointed the server at. See [SECURITY.md](SECURITY.md) for the full trust model (no diff-review layer here either, and what a leaked token means).

### Or just flip the switch in Settings

Settings ⚙ → **Enable remote MCP server** does the same `mcp-server-remote.js` start/stop for you — the app's own bridge spawns and kills the process, generates a token (with a copy button), and shows the local URL once it's running. You still need to tunnel it yourself for real remote reachability; Settings also shows the ready-to-copy **Local MCP (stdio)** command for the current workspace, for an MCP client on this same machine. Off by default, and the checkbox always reflects whether the process is actually running — not a remembered preference, so a page reload never lies about it.

## Security

AIMD-C document computation in the live preview and MCP `evaluate_aimdc` enters through `src/capabilities/document-runtime.js`. Its default `document-only` profile grants only `document.read.self` on `document:self`, `document.compute` on `document:self`, and `ephemeral.output` on `execution:*`. It has no filesystem, network, process, or host-environment object to call. Any external access must be represented as an explicit capability request and authorized against a resource-scoped grant.

Local-agent mode is a separate, intentionally broader trust boundary: it runs a CLI **with auto-approve** and lets it read, create, edit, and delete files in the workspace folder. Every file, git, and agent operation is confined server-side to the one folder you opened. You stay in control through a per-workspace confirmation and a git-snapshot **diff review** (Accept / Reject).

If a workspace contains a **`.eveglyph/rules.md`**, EveGlyph Editor injects it into every agent run with elevated authority (plus `.eveglyph/glossary.md` and the `.eveglyph/memory/*` notes) — review it before running an agent in an unfamiliar workspace.

Read **[SECURITY.md](SECURITY.md)** for the full trust model — capability boundaries, localhost gating, the `--host` caveat, plaintext AI-provider API-key storage, and the `.eveglyph/` risk — before enabling local-agent mode or remote MCP.

## Status

**v0.5.0** — local prototype, pre-1.0. `EG-MD-2026`. Built by Neo.K under **EveMissLab**.

## 關於本專案 (About & License)

EveGlyph Editor is developed and maintained by **EVEMISS TECHNOLOGY CO., LTD. (一言諾科技有限公司)**, Taipei, Taiwan. System architect and author: Neo.K (許筌崴). Business and licensing contact: kakon77777@evemisslab.com. Released under the [MIT License](LICENSE); redistribution must keep the copyright and license notice. Third-party components keep their own licenses — see [NOTICE.md](NOTICE.md). This open-source release covers only the current code and logic structure; EVEMISS TECHNOLOGY reserves the right to file patents on future advanced algorithm modules and related architecture.

本專案由 **EVEMISS TECHNOLOGY CO., LTD. (一言諾科技有限公司)** 研發與維護。

- **系統架構師 / 作者：** Neo.K (許筌崴)
- **營運總部：** 台灣 台北市 (Taipei City, Taiwan)
- **商業與授權聯繫：** kakon77777@evemisslab.com
- **產品編號：** EveGlyph-MD · `EG-MD-2026`

本專案採用 [MIT License](LICENSE) 開源授權。我們鼓勵任何形式的學術探討、商業應用與代碼修改，但所有衍生版本與散佈行為，均必須保留原作者出處與授權聲明。

> **免責與專利保留聲明：** 本開源釋出僅針對當前代碼與邏輯結構。EVEMISS TECHNOLOGY 保留未來進階演算模組與相關架構之專利申請權利。
