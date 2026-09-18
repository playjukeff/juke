// Write og-image.png, the 1200x630 card behind og:image.
//
//   node scripts/build_og.mjs            writes web/public/og-image.png and the
//                                        repo-root copy git has always held
//   node scripts/build_og.mjs <out.png>  writes only <out.png>, for a look first
//
// THE LAYOUT IS THE DESIGNED CARD'S, MEASURED OFF IT RATHER THAN REMEMBERED.
// The card that arrived with the shark handoff was a PNG with no source, so the
// only way to change a word on it was to redraw it. Every position and colour
// below was read off that PNG's pixels on 18 September 2026: the mark's ink box,
// the wordmark's cap height, the tagline's line pitch and colour, the URL's cap
// height, the 2px frame and both background glows. Change the design here, not
// by hand-editing the PNG, or the next person to change the tagline redraws the
// old design from scratch again.
//
// Three things are deliberately NOT what the old PNG shows, and each is the
// site's own asset rather than a new choice:
//
// - The mark is web/public/juke-shark-mark.svg, the one the header draws.
//   The old card carried the teal-linework shark from design package A, which
//   the app stopped drawing when package 02 landed. A link preview showing a
//   different logo from the page it links to is the raster drift CLAUDE.md has
//   recorded for three brand generations.
// - The faces are the self-hosted ones in web/public/fonts. The old card was set
//   in Segoe UI Black, Segoe UI and Consolas: the Windows system fallbacks for
//   Archivo, a body face and a mono, which is what a design tool draws when the
//   intended face did not load. A generated card cannot lean on whatever the
//   machine running it happens to have, so every face is inlined from the
//   repository and the run refuses if any of them did not load.
// - The wordmark is Archivo 900 at -0.045em, JukeLogo.jsx's own setting, so the
//   card and the header spell "JUKE" the same way.
//
// It replaces scripts/build_og.html, a canvas page with a download link that a
// headless browser cannot follow and that drew a different, plainer layout. One
// generator, same rule as scripts/build_icons.mjs.

import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUB = join(ROOT, 'web', 'public')

// The one sentence on the card. It is the manifest's description, which is the
// short form of the homepage's meta description: say the same thing everywhere
// a link to Juke gets summarised.
const TAGLINE = 'Fantasy football mock drafts and weekly calls for your league, with the math shown.'
const URL_TEXT = 'JUKEFF.COM'

// Read off the designed card. Coordinates are its canvas pixels.
const SPEC = {
  w: 1200, h: 630,
  base: '#0B0E14',                                   // obsidian, bottom centre
  // A slate glow from the top-left corner and a brand-purple (#7B1FA2) one from
  // the bottom-right, both elliptical: the purple reaches the top-right corner
  // at about 6% and is gone by the bottom centre.
  slate: { rgb: [40, 46, 63], alpha: 0.35, cx: 0, cy: 0, rx: 900, ry: 1500 },
  purple: { rgb: [123, 31, 162], alpha: 0.134, cx: 1200, cy: 630, rx: 600, ry: 1000 },
  frame: { inset: 39, width: 2, color: 'rgba(0, 229, 255, 0.16)' },
  // The mark's INK box, not its image box: the SVG has margin around the shark.
  mark: { cx: 289.5, cy: 263, inkWidth: 294 },
  textLeft: 472,                                     // ink left of every line
  textRight: 1090,                                   // wrap width for the tagline
  word: { capHeight: 74, baseline: 272, color: '#F2F5FA', tracking: -0.045 },
  tagline: { size: 30, weight: 400, pitch: 42, gapFromWord: 63, color: '#A2B0BE' },
  url: { size: 20, weight: 600, gapFromTagline: 58, color: '#00E5FF' },
}

const font = (file) => readFileSync(join(PUB, 'fonts', file)).toString('base64')
const FONTS = [
  // [family, descriptors, base64]
  ['Archivo', { weight: '400 900' }, font('archivo-variable-latin.woff2')],
  ['IBM Plex Mono', { weight: '600' }, font('ibm-plex-mono-600-latin.woff2')],
]
const MARK_SVG = readFileSync(join(PUB, 'juke-shark-mark.svg'), 'utf8')

// A byte count proves a file was written, not that it is an image.
function verify(path) {
  const b = readFileSync(path)
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (!sig.every((v, i) => b[i] === v)) throw new Error(`${path}: not a PNG`)
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20)
  if (w !== SPEC.w || h !== SPEC.h) throw new Error(`${path}: ${w}x${h}, expected ${SPEC.w}x${SPEC.h}`)
  return b.length
}

const browser = await chromium.launch()
const page = await browser.newPage()
const result = await page.evaluate(async ({ SPEC, FONTS, MARK_SVG, TAGLINE, URL_TEXT }) => {
  // ------------------------------------------------------------------ faces
  // Refuse rather than fall back. A card drawn in a substitute face looks
  // finished here and fails in somebody else's link preview, which is the one
  // place nobody on this side ever looks. The old card is what that produces.
  //
  // The face's own status is the test, NOT document.fonts.check(): that answers
  // true for a family nobody registered at all, because there is then nothing
  // left to load, so it would wave through exactly the failure it looks like it
  // catches.
  for (const [family, desc, b64] of FONTS) {
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))
    const face = new FontFace(family, bytes.buffer, desc)
    try { await face.load() } catch (e) { return { error: `${family} did not load (${e.message || e})` } }
    if (face.status !== 'loaded') return { error: `${family} is ${face.status}, not loaded` }
    document.fonts.add(face)
  }
  await document.fonts.ready

  // ------------------------------------------------------------------- mark
  const mark = await new Promise((ok, fail) => {
    const i = new Image()
    i.onload = () => ok(i)
    i.onerror = () => fail(new Error('juke-shark-mark.svg did not decode'))
    i.src = URL.createObjectURL(new Blob([MARK_SVG], { type: 'image/svg+xml' }))
  })
  // Find the shark's own bounding box inside the SVG's margin, at a large size
  // so the measurement is not at the mercy of one antialiased pixel.
  const probeW = mark.naturalWidth * 4, probeH = mark.naturalHeight * 4
  const probe = document.createElement('canvas')
  probe.width = probeW; probe.height = probeH
  const pc = probe.getContext('2d')
  pc.drawImage(mark, 0, 0, probeW, probeH)
  const a = pc.getImageData(0, 0, probeW, probeH).data
  let x0 = probeW, y0 = probeH, x1 = -1, y1 = -1
  for (let y = 0; y < probeH; y++) for (let x = 0; x < probeW; x++) {
    if (a[(y * probeW + x) * 4 + 3] > 24) {
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
    }
  }
  if (x1 < 0) return { error: 'the mark drew nothing' }
  const ink = { x: x0 / 4, y: y0 / 4, w: (x1 - x0 + 1) / 4, h: (y1 - y0 + 1) / 4 }

  // ------------------------------------------------------------ the canvas
  const c = document.createElement('canvas')
  c.width = SPEC.w; c.height = SPEC.h
  const x = c.getContext('2d')

  x.fillStyle = SPEC.base
  x.fillRect(0, 0, SPEC.w, SPEC.h)
  for (const g of [SPEC.slate, SPEC.purple]) {
    // An elliptical glow is a circular gradient under a vertical scale.
    x.save()
    x.translate(g.cx, g.cy)
    x.scale(1, g.ry / g.rx)
    const grad = x.createRadialGradient(0, 0, 0, 0, 0, g.rx)
    grad.addColorStop(0, `rgba(${g.rgb.join(',')},${g.alpha})`)
    grad.addColorStop(1, `rgba(${g.rgb.join(',')},0)`)
    x.fillStyle = grad
    x.fillRect(-g.cx - 10, (-g.cy - 10) * (g.rx / g.ry), SPEC.w + 20, (SPEC.h + 20) * (g.rx / g.ry))
    x.restore()
  }

  const f = SPEC.frame
  x.strokeStyle = f.color
  x.lineWidth = f.width
  x.strokeRect(f.inset + f.width / 2, f.inset + f.width / 2,
    SPEC.w - 2 * f.inset - f.width, SPEC.h - 2 * f.inset - f.width)

  // ------------------------------------------------------------ the words
  x.textBaseline = 'alphabetic'
  x.textAlign = 'left'

  // Wordmark: sized by cap height, which is what the designed card fixes.
  x.font = `900 100px "Archivo"`
  x.letterSpacing = `${SPEC.word.tracking * 100}px`
  const capAt100 = x.measureText('JUKE').actualBoundingBoxAscent
  const wordSize = Math.round((SPEC.word.capHeight / capAt100) * 100 * 10) / 10

  // Tagline: wrapped to the column, and the whole block moves up half a line
  // for every line past two, so the composition stays where the design put it.
  const t = SPEC.tagline
  x.font = `${t.weight} ${t.size}px "Archivo"`
  x.letterSpacing = '0px'
  const maxW = SPEC.textRight - SPEC.textLeft
  const lines = []
  for (const word of TAGLINE.split(' ')) {
    const trial = lines.length ? lines[lines.length - 1] + ' ' + word : word
    if (lines.length && x.measureText(trial).width <= maxW) lines[lines.length - 1] = trial
    else if (!lines.length) lines.push(word)
    else lines.push(word)
  }
  const shift = -Math.round(((lines.length - 2) * t.pitch) / 2)

  const drawLeft = (text, baseline) => {
    const m = x.measureText(text)
    x.fillText(text, SPEC.textLeft + m.actualBoundingBoxLeft, baseline)
    return m
  }

  const wordBase = SPEC.word.baseline + shift
  x.font = `900 ${wordSize}px "Archivo"`
  x.letterSpacing = `${SPEC.word.tracking * wordSize}px`
  x.fillStyle = SPEC.word.color
  drawLeft('JUKE', wordBase)

  x.font = `${t.weight} ${t.size}px "Archivo"`
  x.letterSpacing = '0px'
  x.fillStyle = t.color
  let lineBase = wordBase + t.gapFromWord
  lines.forEach((line, i) => { if (i) lineBase += t.pitch; drawLeft(line, lineBase) })

  const u = SPEC.url
  x.font = `${u.weight} ${u.size}px "IBM Plex Mono"`
  x.fillStyle = u.color
  drawLeft(URL_TEXT, lineBase + u.gapFromTagline)

  // --------------------------------------------------------------- the mark
  const scale = SPEC.mark.inkWidth / ink.w
  const cy = SPEC.mark.cy + shift
  const dx = SPEC.mark.cx - (ink.x + ink.w / 2) * scale
  const dy = cy - (ink.y + ink.h / 2) * scale
  x.drawImage(mark, dx, dy, mark.naturalWidth * scale, mark.naturalHeight * scale)

  return {
    png: c.toDataURL('image/png').split(',')[1],
    lines, wordSize, shift,
    markInk: { x: Math.round(dx + ink.x * scale), y: Math.round(dy + ink.y * scale),
               w: Math.round(ink.w * scale), h: Math.round(ink.h * scale) },
  }
}, { SPEC, FONTS, MARK_SVG, TAGLINE, URL_TEXT })
await browser.close()

if (result.error) {
  console.error(`Refusing to write: ${result.error}.`)
  process.exitCode = 1
} else {
  const outs = process.argv[2]
    ? [resolve(process.argv[2])]
    : [join(PUB, 'og-image.png'), join(ROOT, 'og-image.png')]
  const bytes = Buffer.from(result.png, 'base64')
  for (const out of outs) {
    writeFileSync(out, bytes)
    console.log(`  ${out}  ${SPEC.w}x${SPEC.h}  ${verify(out)}b`)
  }
  console.log(`  wordmark ${result.wordSize}px, tagline in ${result.lines.length} lines, block shifted ${result.shift}px`)
  result.lines.forEach((l) => console.log(`    | ${l}`))
  console.log(`  mark ink box`, result.markInk)
}
