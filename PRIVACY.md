# Privacy

This notice describes data handling in the EveGlyph Editor source, desktop app,
and standalone MCP servers. It does not cover third-party AI providers, tunnels,
MCP clients, GitHub, or the separately hosted project website.

## Workspace documents

Editing, previewing, encoding conversion, AIMD-C computation, World IR validation,
and local PDF rendering run on your device. The editor reads and writes the
workspace you open. Git snapshots and accepted changes remain in that workspace's
local repository; EveGlyph does not automatically push them to a remote.

The standalone MCP servers expose workspace paths, requested file contents,
computation results, and rendered artifacts to the MCP client that calls them.
`write_file` can overwrite files without the editor's diff-review step. Your MCP
client may send tool results to its own service or model. Choose the workspace and
client accordingly; see [SECURITY.md](SECURITY.md).

PDF artifacts created through MCP are held in process memory, expire after
30 minutes, and are limited to 64 MiB each and 256 MiB total. They disappear when
that MCP process stops. Copies a client has already downloaded are under that
client's control. Browser/desktop PDF exports are saved where you choose.

## Optional network features

- **Cloud AI:** when you request AI assistance, the prompt and relevant document
  or selected text are sent to Anthropic or your configured OpenAI-compatible
  endpoint with your API credential. AI search and World Studio generation use
  that configured provider too. Provider retention and training policies apply.
- **Local CLI agents:** tasks and workspace context are passed to the CLI you
  select. A locally running CLI can still contact its own cloud provider; "local
  agent" does not mean offline AI. Command overrides require the Trusted tier.
- **Remote MCP:** the optional server listens on loopback. If you expose it
  through a tunnel, requests and tool results travel through your chosen tunnel
  and client. Its bearer token grants access to the selected workspace.
- **Runtime preview:** pressing the Runtime check/validation controls sends the
  draft or mapping to the Runtime URL you configured.
- **External content:** document images or other embedded remote resources can
  contact their hosts when displayed. The optional AMEP action downloads runtime
  code and assets from `evemisstechnology.com`; those requests expose normal
  connection metadata to that host.

## Settings and credentials

Preferences are stored in local browser storage under `eveglyph_cfg`, or in the
desktop app's local profile. API keys are remembered by default. You can disable
"Remember on this device" to keep a provider key only in memory for the current
session. Remote MCP tokens are persisted only when their remember option is on.
All settings writes honor these choices, including theme, pane, and workspace
changes. Remembered credentials are **plaintext**, not OS-keychain encrypted.
Do not remember them on a shared device.

## Local diagnostics

The bridge writes a diagnostic JSONL file in an `eveglyph-editor` subfolder of the
OS temporary directory, or the path set by `EVEGLYPH_MONITOR_FILE`. It records
workspace/file paths, events, byte counts, errors, and short agent-output samples.
Samples may contain document text or other sensitive output. The stream is local;
the editor has no built-in analytics upload. Files rotate at 5 MiB, retaining a
previous file as well. Review and redact diagnostics before sharing them.

## Clearing local data and contacting us

Clear the app/site's local storage to remove remembered settings and credentials;
close the app to discard in-memory values. Stop the bridge before deleting its
diagnostic file and rotated copy. Workspace files, `.eveglyph/` context files,
downloaded PDFs, and Git history must be managed separately. Removing a key from
local storage does not revoke it at its provider.

For privacy questions or private reports, use the maintainer contact in
[package.json](package.json), or GitHub's private vulnerability reporting for
security issues. Do not include API keys, MCP tokens, or private documents in a
public issue.
