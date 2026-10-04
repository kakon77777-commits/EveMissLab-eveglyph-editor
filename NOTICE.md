# Notices

EveGlyph Editor is Copyright (c) 2026 EVEMISS TECHNOLOGY CO., LTD. (一言諾科技有限公司) and is released under the [MIT License](LICENSE). This repository also contains, or depends on, third-party material that keeps its own license.

## Bundled fonts

19 font files for offline PDF export are redistributed under `public/fonts/typst/`. Their copyright notices, sources and license texts (SIL Open Font License 1.1, GUST Font License 1.0, Bitstream Vera / Arev) are in [`public/fonts/typst/NOTICE.md`](public/fonts/typst/NOTICE.md) and [`public/fonts/typst/LICENSES/`](public/fonts/typst/LICENSES/).

## npm dependencies

Dependencies are installed from the npm registry according to [`package-lock.json`](package-lock.json); they are not copied into this repository, and each stays under the license declared in its own package. Declared licenses of the locked packages:

- Runtime: MIT ×137, Apache-2.0 ×21, ISC ×8, BlueOak-1.0.0 ×7, BSD-2-Clause ×6, BSD-3-Clause ×3, (MPL-2.0 OR Apache-2.0) ×1, BSD ×1, Python-2.0 ×1, LGPL-2.1+ ×1, (MIT OR GPL-3.0-or-later) ×1, (MIT AND Zlib) ×1
- Development only: MIT ×61, ISC ×1, BSD-3-Clause ×1

Packages that need a word of explanation:

- **dompurify** (MPL-2.0 OR Apache-2.0) — dual-licensed MPL-2.0 OR Apache-2.0.
- **jschardet** (LGPL-2.1+) — LGPL-2.1-or-later. Used unmodified as a library for file-encoding detection and installed from npm. If you distribute a build that bundles it, the LGPL's conditions apply to that library (provide its license text and keep it replaceable by a modified version).
- **jszip** (MIT OR GPL-3.0-or-later) — dual-licensed MIT OR GPL-3.0-or-later; used under the MIT option.

The complete third-party license text of any dependency is available from its package on npm. A binary distribution that bundles dependencies ships with the corresponding license notices.

