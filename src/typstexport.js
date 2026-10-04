// ─── Typst WASM export — Phase 1 (compiler plumbing) ───────────────────────
// The Typst compiler/renderer ship as ordinary npm dependencies; their WASM
// binaries live in node_modules and are bundled same-origin by Vite via
// `?url` imports below — never fetched from an external CDN at runtime.
// Fonts: typst.ts's default behavior fetches its "text" font set
// (DejaVuSansMono/LibertinusSerif/NewCM10/NewCMMath — the last one is
// required: Typst errors with "no font could be found" when compiling ANY math
// without it) from a CDN on first compile. To keep this feature fully
// self-hosted, those 17 files (from github.com/typst/typst-assets@v0.13.1;
// licences in public/fonts/typst/NOTICE.md) live in public/fonts/typst/ and
// are served same-origin. For Traditional Chinese documents, Noto Serif TC
// (SIL OFL, from github.com/google/fonts) is loaded instead of Typst's own
// "cjk" bundle, which is tuned for Simplified Chinese. The Typst WASM compiler
// does not support variable fonts, so Noto Serif TC ships as two static
// instances (Regular/Bold) derived from the variable build with
// `fonttools varLib.instancer`.
import { $typst, initOptions } from '@myriaddreamin/typst.ts'
import compilerWasmUrl from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url'
import rendererWasmUrl from '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url'

let configured = false
function configure() {
  if (configured) return
  configured = true
  $typst.setCompilerInitOptions({
    getModule: () => compilerWasmUrl,
    beforeBuild: [initOptions.loadFonts(
      ['/fonts/typst/NotoSerifTC-Regular.ttf', '/fonts/typst/NotoSerifTC-Bold.ttf'],
      { assets: ['text'], assetUrlPrefix: '/fonts/typst/' }
    )]
  })
  $typst.setRendererInitOptions({
    getModule: () => rendererWasmUrl
  })
}

// Compiles Typst source to PDF bytes. Returns a Uint8Array.
export async function compileTypstToPdf(source) {
  configure()
  return $typst.pdf({ mainContent: source })
}

// Compiles Typst source to an SVG string (for in-app preview, not export).
export async function compileTypstToSvg(source) {
  configure()
  return $typst.svg({ mainContent: source })
}

// Compiles and also surfaces Typst's own compile diagnostics (warnings +
// errors) alongside the PDF bytes — the plain compileTypstToPdf() above
// discards these. Used to check font-coverage warnings (e.g. missing CJK
// glyphs) without guessing from rendered output.
export async function compileTypstToPdfWithDiagnostics(source) {
  configure()
  const path = `/tmp/${Math.random().toString(36).slice(2)}.typ`
  await $typst.addSource(path, source)
  const compiler = await $typst.getCompilerReset()
  return compiler.compile({
    mainFilePath: path,
    format: 1, // CompileFormatEnum.pdf
    diagnostics: 'full'
  })
}
