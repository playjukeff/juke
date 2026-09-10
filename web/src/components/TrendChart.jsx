import { useRef, useState } from 'react'

// Catmull-Rom through the real points, converted to the cubic-bezier
// segments SVG paths actually take — so the trend reads as a curve rather
// than the straight polyline segments a sharp zig-zag used to draw between
// every pair of values.
function splinePath(points) {
  if (points.length < 2) return ''
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1]
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return d
}

const fmtChartDate = (ms) =>
  typeof ms === 'number' ? new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' }) : null

/* A real chart, not a row of solid blocks — gridlines at 0/50/100 so the
   axis a reader needs to judge "is 63 good" is on screen, not implied.
   Built from however many entries there actually are.

   Was GradeTrendChart.jsx, one shape (a letter-grade timeline) shared by
   two now-retired cards. Generalised rather than duplicated for the Draft
   Lobby rebuild's Projected Win % Trend panel, which draws the identical
   spline/gridline/hover machinery over a different value and has no grade
   letter to show — the same "one copy of the spline math" rule this file's
   own history already learned once, just carried into a second value
   rather than relearned for it.

   The axis labels are plain HTML text, not SVG <text> — the chart below is
   preserveAspectRatio="none" against a fluid-width container, so anything
   drawn inside its own coordinate space stretches non-uniformly with it. A
   straight gridline stretched that way is still a straight line; a "100"
   stretched that way is a visibly flattened glyph. Text sitting outside the
   SVG is never subject to that scale at all. The viewBox height also
   matches the rendered CSS height exactly, for the same reason from the
   other direction — the two disagreeing is what did the stretching in the
   first place. */
export default function TrendChart({
  entries,
  height = 84,
  area = false,
  compact = false,
  suffix = '',
  formatValue = (v) => Math.round(v),
  // The denominator the x-axis spaces points against. Defaults to the real
  // count (a line stretching to fill whatever it's given), but a caller
  // windowing to a fixed number of slots (WinPctTrendCard's ten) passes
  // that instead, so a user on their third mock gets a line occupying the
  // first three-tenths of the chart rather than one stretched to fill the
  // whole width — the same "still fills the space, but only draws where
  // there's real data" rule the bar and heatmap cards apply with ghost
  // slots, just expressed as unfilled width instead of transparent cells.
  slotCount,
  // Off by default (the 0-100 scale below), and only meant for a sparkline
  // with no axis at all — the header KPI card's win-rate trend. That chart
  // is 16px tall: a realistic run of mocks swinging 44% to 52% is 8 points
  // out of a 0-100 range, which lands in an 8px-tall drawing area as well
  // under a single pixel of vertical movement — a flat-looking line even
  // though the numbers behind it are real and moving. Autoscaling to the
  // data's own min/max (with a little padding) is the standard fix for a
  // sparkline specifically, because unlike a full chart it draws no "50"
  // for a reader to anchor a percentage against — its only job is showing
  // whether the last several points went up, down, or held, and a fixed
  // scale that can't show that isn't doing that job. The full-size
  // Projected Win % Trend card deliberately does NOT use this: it prints
  // real 0/50/100 labels, so autoscaling there would make an identical 50%
  // draw at a different height depending which other mocks happen to be
  // in the window, which is a worse failure than a flat line.
  scaleToData = false,
}) {
  const w = 300, h = height, padTop = Math.max(4, height * 0.06), innerH = h - padTop * 2
  const n = entries.length
  const slots = slotCount || n
  const stepX = slots > 1 ? (w - 20) / (slots - 1) : 0

  const values = entries.map((e) => e.value)
  const dataMin = values.length ? Math.min(...values) : 0
  const dataMax = values.length ? Math.max(...values) : 100
  const span = Math.max(1, dataMax - dataMin)
  // Even genuinely flat data (every mock the same) still gets a nonzero
  // window, or the line would sit pinned to one edge rather than centred.
  const lo = scaleToData ? dataMin - Math.max(1, span * 0.15) : 0
  const hi = scaleToData ? dataMax + Math.max(1, span * 0.15) : 100
  const valueSpan = hi - lo

  const points = entries.map((e, i) => ({
    ...e,
    x: 10 + i * stepX,
    y: padTop + innerH * (1 - (Math.max(lo, Math.min(hi, e.value)) - lo) / valueSpan),
  }))
  const path = splinePath(points)
  // The area fill closes the spline down to the chart's own floor rather
  // than to 0 on the value axis — a win % of 30 should shade down to the
  // bottom of the box it's drawn in, not to some fixed baseline the box
  // doesn't show.
  const areaPath = area && n > 1 ? `${path} L ${points[n - 1].x.toFixed(1)} ${(padTop + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padTop + innerH).toFixed(1)} Z` : ''

  const [hoverIdx, setHoverIdx] = useState(null)
  const svgRef = useRef(null)

  const nearestIndex = (clientX) => {
    const rect = svgRef.current.getBoundingClientRect()
    const relX = ((clientX - rect.left) / rect.width) * w
    let idx = 0, best = Infinity
    points.forEach((p, i) => { const d = Math.abs(p.x - relX); if (d < best) { best = d; idx = i } })
    return idx
  }
  const handleMove = (e) => { if (n > 1) setHoverIdx(nearestIndex(e.clientX)) }
  const handleLeave = () => setHoverIdx(null)
  const handleTouch = (e) => {
    const t = e.touches[0]
    if (n > 1 && t) setHoverIdx(nearestIndex(t.clientX))
  }

  const hovered = hoverIdx != null ? points[hoverIdx] : null
  const hoveredDate = hovered ? fmtChartDate(hovered.completedAt) : null

  return (
    <div className="relative mt-1">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="block w-full touch-none"
        style={{ height }}
        aria-hidden="true"
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
      >
        <line x1="10" y1={padTop} x2={w - 10} y2={padTop} stroke="rgba(255,255,255,0.08)" strokeWidth="0.7" />
        <line x1="10" y1={padTop + innerH / 2} x2={w - 10} y2={padTop + innerH / 2} stroke="rgba(255,255,255,0.08)" strokeWidth="0.7" />
        <line x1="10" y1={padTop + innerH} x2={w - 10} y2={padTop + innerH} stroke="rgba(255,255,255,0.18)" strokeWidth="0.7" />
        {area && n > 1 && (
          <path d={areaPath} fill="url(#trendFill)" stroke="none" />
        )}
        {area && (
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#00E5FF" stopOpacity="0" />
            </linearGradient>
          </defs>
        )}
        {n > 1 && <path d={path} fill="none" stroke="#00E5FF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
        {/* Point markers — always drawn, not only on hover: the spec this
            chart was built against asks for them explicitly, and unlike the
            single-entry fallback below they read as data density along a
            real timeline rather than as a single "nothing to compare yet"
            dot. */}
        {!compact && points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === hoverIdx ? 3 : 1.6} fill="#00E5FF" stroke="#151b26" strokeWidth={i === hoverIdx ? 1.3 : 0.8} />
        ))}
        {n === 1 && <circle cx={points[0].x} cy={points[0].y} r={3} fill="#00E5FF" stroke="#151b26" strokeWidth="1.2" />}
      </svg>
      {!compact && (
        <>
          <span className="pointer-events-none absolute left-0 top-0 text-[9px] text-white/45">100{suffix}</span>
          <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-[9px] text-white/45">50{suffix}</span>
          <span className="pointer-events-none absolute bottom-0 left-0 text-[9px] text-white/45">0{suffix}</span>
        </>
      )}
      {hovered && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+7px)] whitespace-nowrap rounded-md border border-white/10 bg-slate-panel px-2 py-1 text-[11px] shadow-lg"
          style={{ left: `${(hovered.x / w) * 100}%`, top: `${(hovered.y / h) * 100}%` }}
        >
          <span className="font-display text-meta font-bold text-teal-300">{formatValue(hovered.value)}{suffix}</span>
          {hoveredDate && <span className="ml-1.5 text-white/35">{hoveredDate}</span>}
        </div>
      )}
    </div>
  )
}
