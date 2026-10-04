# EveGlyph Editor — Windows desktop build

An [Electron](https://www.electronjs.org/) wrapper around the same local bridge and built frontend you get from
`npm run dev`. It is a thin shell: [`host.mjs`](host.mjs) mounts the bridge (`../vite-agent-bridge.js`) and the built
`dist/` on `127.0.0.1`, and [`main.mjs`](main.mjs) opens a window on it. This folder has its own `package.json` so the
project's normal `npm ci` never downloads Electron.

## Build

Requirements: Windows 10/11 x64, Node.js 22.12 or newer (Electron's own requirement), `git`.

```powershell
npm ci                       # in the repository root (builds the frontend)
cd desktop
npm ci                       # Electron + electron-builder, pinned in desktop/package-lock.json (the install step also fetches the Electron runtime)
npm run dist                 # frontend build → stage → installer + zip → self-test
```

Results are in `desktop/release/`:

| File | What it is |
|---|---|
| `EveGlyph-Editor-Setup-<version>.exe` | per-user NSIS installer (no administrator rights needed) |
| `EveGlyph-Editor-<version>-win-x64.zip` | the same app as a plain folder — unzip and run `EveGlyph Editor.exe` |
| `SHA256SUMS.txt`, `build-info.json` | checksums and sizes of the files above |
| `smoke-unpacked.json` / `.png` | output of the self-test and a screenshot of the running app |

Other scripts: `npm run stage` (only assemble `desktop/stage/`), `npm run smoke` (self-test the unpacked app),
`npm run installer-test` (silent install → self-test → uninstall → check nothing is left behind),
`npm start` (run the shell from the repository against `../dist`, for development).

## What goes into the package

`build.mjs` follows the import graph from the bridge, the two MCP servers and the desktop shell, and copies only those
files, plus `dist/`, `public/fonts/typst/` (the bundled fonts and their license texts), `examples/` and the notice files.
It then installs just the production dependencies of the packages that graph needs, at the versions the project locks.
`THIRD-PARTY-LICENSES.txt` is generated from the installed packages. The app is not packed into an `asar` archive: the
optional remote-MCP server runs from these files as a child process, and `jschardet` (LGPL) stays replaceable.

## Security model of the desktop app

- The server binds to `127.0.0.1` only (preferred port 47831, kept stable so the page origin — and its saved settings —
  does not change between launches).
- Every `/api` request must carry a random per-launch token that only the app's own window adds. Other local web pages,
  browsers and programs cannot use the bridge, even from a `localhost` origin (which the bridge's header check alone
  would accept).
- The window runs with `contextIsolation`, `sandbox`, no Node integration and no preload script; other sites open in
  your default browser; only the clipboard-write, fullscreen and file-system-access permissions are granted.
- The optional remote-MCP child process is started from the Electron binary with `ELECTRON_RUN_AS_NODE=1`.
- Everything in the main [SECURITY.md](../SECURITY.md) still applies (local-agent mode runs a CLI with auto-approve, API
  keys live in the app profile's local storage in plaintext, …).

## Not signed

The installer is **not code-signed**. Windows SmartScreen may show "Windows protected your PC / Unknown publisher" the
first time you run it: choose *More info → Run anyway*, but only after comparing the file's SHA-256 with the value
published next to the download:

```powershell
Get-FileHash .\EveGlyph-Editor-Setup-<version>.exe -Algorithm SHA256
```
