// Write the brand asset set: the two SVGs that define it, then every PNG.
//
// This closes the gap CLAUDE.md has now recorded across three brand
// generations: "a raster export is invisible to every pass this project knows
// how to run, so it does not drift a little, it stays exactly where it was
// until somebody goes and looks." Orange survived a rebrand inside these files
// because nothing here could re-render them; the shark swap replaced them by
// hand. Neither needs to happen again - the SVGs are the source, and this
// makes the PNGs a build product of them.
//
// DESIGN PACKAGE 02 MOVED THE SOURCE ONE STEP FURTHER BACK. The SVGs are no
// longer hand-authored either: they are derived here from juke-mark.js's own
// ART, which is the same artwork <juke-mark> draws in the cold-load splash and
// the draft room loader. That is the package's own stated intent - "the same
// shark as the splash with the shield removed and no animation, so the logo in
// your nav and the mark in the cold launch are the same object" - and derived
// is the only way that sentence stays true without somebody maintaining it.
//
// Checked before it was written this way: the package's own juke-icon-tile.svg
// is byte-identical to ART on every path, transform and fill. The two differ
// only in viewBox, the tile rect and the bloom opacity, which are the three
// parameters below.
//
// The package's SVGs carry a C2PA provenance manifest. That is deliberately
// NOT reproduced. It is a signature over their bytes, and re-emitting it over
// bytes this script generated would be a false provenance claim.
//
// Playwright is already a dev dependency for the end-to-end suite, so this
// adds no new tooling. Same argument as scripts/build_og.mjs: a headless
// browser has a filesystem, and a download link does not survive one.
//
//   node scripts/build_icons.mjs
//   py scripts/build_favicon_ico.py     <- run this afterwards; the .ico is
//                                          assembled from the PNGs this writes
//
// og-image.png is not in this list. It has its own generator,
// scripts/build_og.mjs, which draws the designed card's layout from the
// juke-shark-mark.svg this script writes - so run this first if the mark moves.

import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUB = join(ROOT, 'web', 'public')

// ---------------------------------------------------------------- the source
//
// Evaluate only juke-mark.js's constant declarations. Importing the module
// would try to define a custom element and there is no DOM here; a regex over
// the file would be a second parser for something JavaScript already parses.
function artFromMark() {
  const src = readFileSync(join(PUB, 'juke-mark.js'), 'utf8')
  const upto = src.indexOf('class JukeMark')
  if (upto < 0) throw new Error('juke-mark.js: no class JukeMark - has the file changed shape?')
  const ctx = {}
  vm.runInNewContext(src.slice(0, upto) + '\nthis.ART=ART;this.EYE_BLOOM=EYE_BLOOM;', ctx)
  if (!ctx.ART || !ctx.EYE_BLOOM) throw new Error('juke-mark.js: ART/EYE_BLOOM not found')
  return ctx
}
const { ART, EYE_BLOOM } = artFromMark()

// variant="static"'s own eye-glow opacity, so a rendered logo and a settled
// splash mark are the same picture and not merely the same geometry.
const BLOOM = 0.42
const TILE_INK = '#141C27'

function svg({ viewBox, width, height, tile }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}" role="img" aria-label="Juke">
<defs>
<linearGradient id="jukeGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#85B1F9"/><stop offset="100%" stop-color="#CC9BFA"/></linearGradient>
<filter id="eyeBloom" x="-300%" y="-300%" width="700%" height="700%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
${tile || ''}<g transform="matrix(1.9211538461538462 0 0 1.9211538461538462 640 389.8518668198408)">
<g opacity="${BLOOM}" filter="url(#eyeBloom)">${EYE_BLOOM}</g>
${ART}
</g>
</svg>
`
}

// The two crops, both the package's own numbers. The full mark is 564x352
// (1.60:1) and is the logo. The icon is a 380x380 crop of the SAME coordinate
// space, pulled in to the head and jaw: at 16px the full mark's fins swallow
// the head and it reads as a smudge, which is why there are two crops rather
// than one asset at two sizes. rx=84 is 22% of 380.
const SVGS = {
  'juke-shark-mark.svg': svg({ viewBox: '358 210 564 352', width: 564, height: 352 }),
  'juke-icon-tile.svg': svg({
    viewBox: '450 182 380 380', width: 380, height: 380,
    tile: `<rect x="450" y="182" width="380" height="380" rx="84" fill="${TILE_INK}"/>\n`,
  }),
  // The installed-app icon: the WHOLE mark, fins and all, centred on a
  // full-bleed navy square with no radius of its own. iOS and Android cut
  // their own corners, so a baked-in rx rounds twice, and the head crop above
  // cuts the fins off at the tile edge - which is what an iPhone home screen
  // showed. 640 units puts the 564-wide mark at 88% of the square, inside
  // the corner mask iOS applies. Centre is the full mark's own centre, 640,386.
  'juke-app-icon.svg': svg({
    viewBox: '320 66 640 640', width: 640, height: 640,
    tile: `<rect x="320" y="66" width="640" height="640" fill="${TILE_INK}"/>
`,
  }),
  // The transparent icon variant the package lists as optional: same head
  // crop, no tile, for anywhere the icon should float rather than sit on navy.
  'juke-favicon.svg': svg({ viewBox: '450 182 380 380', width: 380, height: 380 }),
}

for (const [name, body] of Object.entries(SVGS)) {
  writeFileSync(join(PUB, name), body)
  console.log(`  ${name.padEnd(30)} ${body.length}b   <- juke-mark.js`)
}

// --------------------------------------------------------------- the rasters
//
// [sourceSvg, [outputName, width, height], ...]. Height is explicit because
// the full mark is not square - an earlier version of this file took one
// `px` for both, which is fine for an icon and would silently letterbox a
// 1.60:1 logo.
const JOBS = [
  ['juke-shark-mark.svg', [
    ['juke-shark-mark-564w.png', 564, 352],
    ['juke-shark-mark-1128w.png', 1128, 704],
    ['juke-shark-mark-1692w.png', 1692, 1056],
  ]],
  ['juke-icon-tile.svg', [
    ['juke-icon-tile-16.png', 16, 16],
    ['juke-icon-tile-32.png', 32, 32],
    ['juke-icon-tile-48.png', 48, 48],
    ['juke-icon-tile-180.png', 180, 180],
    ['juke-icon-tile-192.png', 192, 192],
    ['juke-icon-tile-512.png', 512, 512],
  ]],
  ['juke-app-icon.svg', [
    ['juke-app-icon-180.png', 180, 180],
    // iOS asks for this path by name, whatever the page links; it 404'd.
    ['apple-touch-icon.png', 180, 180],
    ['juke-app-icon-192.png', 192, 192],
    ['juke-app-icon-512.png', 512, 512],
  ]],
  ['juke-favicon.svg', [
    ['juke-favicon-16.png', 16, 16],
    ['juke-favicon-32.png', 32, 32],
    ['juke-favicon-48.png', 48, 48],
    ['juke-favicon-64.png', 64, 64],
  ]],
]

// A byte count proves a file was written, not that it is an image. Read the
// PNG signature and the IHDR dimensions back off what we just wrote.
function verify(path, w0, h0) {
  const b = readFileSync(path)
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (!sig.every((v, i) => b[i] === v)) throw new Error(`${path}: not a PNG`)
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20)
  if (w !== w0 || h !== h0) throw new Error(`${path}: ${w}x${h}, expected ${w0}x${h0}`)
  return { w, h, bytes: b.length }
}

const browser = await chromium.launch()
let wrote = 0
for (const [src, outs] of JOBS) {
  const body = SVGS[src]
  for (const [name, w, h] of outs) {
    // deviceScaleFactor 1 and an exactly-sized viewport, so the screenshot is
    // the artwork at its own pixel count rather than a scaled crop of a page.
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
    await page.setContent(
      `<style>html,body{margin:0;padding:0;background:transparent}
       svg{display:block;width:${w}px;height:${h}px}</style>${body}`,
      { waitUntil: 'load' }
    )
    const out = join(PUB, name)
    // omitBackground, or Chromium composites onto opaque white and the
    // transparent variants ship a white square - the exact failure the
    // package's own acceptance criteria name for the installed icon.
    await page.locator('svg').screenshot({ path: out, omitBackground: true })
    await page.close()
    const v = verify(out, w, h)
    console.log(`  ${name.padEnd(30)} ${v.w}x${v.h}  ${v.bytes}b   <- ${src}`)
    wrote++
  }
}
await browser.close()

// The repo root keeps its own copy of the .ico's inputs and of the .ico. They
// reach nobody on their own (Pages builds from web/), but git has always held
// them there and build_favicon_ico.py reads and writes there.
for (const n of ['juke-icon-tile-16.png', 'juke-icon-tile-32.png']) {
  writeFileSync(join(ROOT, n), readFileSync(join(PUB, n)))
  console.log(`  ${n.padEnd(30)} copied to repo root`)
}

console.log(`\n${wrote} PNGs rendered. Now run: py scripts/build_favicon_ico.py`)
