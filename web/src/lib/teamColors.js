/* The two sides of a game in their own clubs' colours — the game page's
   chart line, its team-stat bars and its watermarks.

   ESPN's summary carries each club's primary and alternate colour. Two
   problems stand between those hexes and a line a reader can see, and this
   solves both, in order:

   1. A club colour can vanish on the ground. Buffalo's navy (#00338D) and
      Pittsburgh's black are near-invisible on the dark sheet, and Kansas
      City's gold on white. So each colour is moved toward white (dark
      theme) or black (light theme) just until it clears 3:1 against the
      sheet — WCAG 1.4.11's bar for a mark, which is what a chart line is.
      Hue is kept; only lightness moves.

   2. Two clubs can share a colour. Detroit and Buffalo are both blue. When
      the two chosen colours sit within HUE_CLOSE degrees of each other,
      the home side takes its alternate instead (Buffalo's red), provided
      the alternate is a real colour rather than white, black or grey.

   Imports nothing, so scripts/test_team_colors.mjs runs it in bare Node. */

const GROUND = { dark: [21, 28, 39], light: [255, 255, 255] }   // --v3-sheet
const MARK_BAR = 3
const HUE_CLOSE = 40

export function hexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function lum([r, g, b]) {
  const c = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
}
export function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

/* A colour a reader would call a colour, rather than white, black or grey. */
function chromatic(rgb) {
  const [, s, l] = hsl(rgb)
  return s >= 0.25 && l > 0.08 && l < 0.92
}

function hueGap(a, b) {
  const d = Math.abs(hsl(a)[0] - hsl(b)[0]) % 360
  return d > 180 ? 360 - d : d
}

/* Toward white on a dark ground, toward black on a light one, in small
   steps, until the mark clears the bar. */
export function legible(rgb, theme) {
  const ground = GROUND[theme] || GROUND.dark
  const toward = theme === 'light' ? [0, 0, 0] : [255, 255, 255]
  let c = rgb
  for (let t = 0; t <= 1 && contrast(c, ground) < MARK_BAR; t += 0.05) {
    c = rgb.map((v, i) => Math.round(v + (toward[i] - v) * t))
  }
  return c
}

const NEUTRAL = { away: [150, 160, 175], home: [200, 150, 60] }

/* { away, home } as "r g b" strings, ready for rgb(var(--x)). */
export function gameColors(away, home, theme = 'dark') {
  const pick = (team, side) => hexRgb(team && team.color) || NEUTRAL[side]
  let a = pick(away, 'away')
  let h = pick(home, 'home')
  if (hueGap(a, h) < HUE_CLOSE || !chromatic(a) === !chromatic(h) && !chromatic(a)) {
    const alt = hexRgb(home && home.alternateColor)
    if (alt && chromatic(alt) && hueGap(a, alt) >= HUE_CLOSE) h = alt
    else {
      const altA = hexRgb(away && away.alternateColor)
      if (altA && chromatic(altA) && hueGap(altA, h) >= HUE_CLOSE) a = altA
    }
  }
  let out = (c) => legible(c, theme).join(' ')
  /* Both clubs red and neither alternate a real colour (Tampa Bay and
     Arizona): the two sides are told apart by lightness instead, the away
     side taking a tint of its own hue. */
  if (hueGap(a, h) < HUE_CLOSE) {
    const toward = theme === 'light' ? [0, 0, 0] : [255, 255, 255]
    const tint = legible(a, theme).map((v, i) => Math.round(v + (toward[i] - v) * 0.45))
    return { away: tint.join(' '), home: out(h) }
  }
  return { away: out(a), home: out(h) }
}
