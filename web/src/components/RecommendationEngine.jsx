import AnalyticsCard from './AnalyticsCard.jsx'
import { describeRecommendation, runRecommendation } from './recommendation.js'

// Steel / oxblood / graphite — cool, low-chroma series that hold up against the
// slate ground. Still deliberately outside the position vocabulary
// (draftRoomPositions.js), same rule the previous cyan/magenta set followed.
const FORMAT_COLORS = ['#8AA6BE', '#BE6153', '#9AA8B4']
const HIGHLIGHT_COLOR = '#D9A03C'
// gradeScore's own real range (see analyseDraft() in app.js) — not the
// mockup's 0-1000 axis, which doesn't correspond to any number this app
// actually computes.
const GRID_VALUES = [0, 25, 50, 75, 100]
// Floor width per seat before the row scrolls horizontally instead of
// crushing every bar. 14px, not a rounder number: measured against the
// default league (10 teams, three formats side by side in this card's own
// 2-column share of the grid) at 18px, which needed 180px of the roughly
// 161px actually available and put the single most common case behind an
// unnecessary scrollbar. 14px fits ten seats in 140px with room to spare;
// a 20-24 team room still scrolls, which is the case this floor exists for.
const MIN_BAR_TRACK = 14

function Bar({ seatInfo, color, highlighted }) {
  const height = seatInfo.avg !== null ? Math.max(2, seatInfo.avg) : 2
  // Confidence, not value: a seat backed by one mock or none is drawn at
  // reduced opacity so its bar never reads as equal to a seat with a real
  // sample behind it. This is the honest half of showing every seat instead
  // of bucketing them away — the chart covers all of them, but a coin flip
  // never gets to look like a trend.
  const opacity = seatInfo.count === 0 ? 0.12 : seatInfo.count === 1 ? 0.45 : 1
  return (
    <div
      className="flex h-full min-w-[6px] flex-1 items-end"
      title={
        `Seat ${seatInfo.seat}: ` +
        (seatInfo.avg !== null
          ? `${Math.round(seatInfo.avg)} (${seatInfo.count} mock${seatInfo.count === 1 ? '' : 's'})`
          : 'no mocks yet')
      }
    >
      <div
        className="w-full rounded-t-[2px] transition-opacity"
        style={{ height: `${height}%`, background: highlighted ? HIGHLIGHT_COLOR : color, opacity }}
      />
    </div>
  )
}

function FormatChart({ format, color, recommendation }) {
  const seatCount = format.seats.length
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <p className="mb-2 truncate text-[11px] font-semibold uppercase tracking-wide text-white/70">{format.label}</p>
      {/* min-h-32, not h-32: this sits inside a flex-col ancestor, and
          Tailwind's flex-1 is flex: 1 1 0% — the 0% flex-basis overrides a
          plain h-32 for main-axis sizing outright, so the bars collapsed to
          zero height wherever an ancestor's own height wasn't definite (the
          mobile single-column grid, where nothing forces a row height the
          way lg's explicit grid-row placement does). min-height survives
          that: it clamps the flexed size to a floor of 128px regardless of
          how much free space there was to distribute, while still letting
          the bars grow taller than 128px on desktop when NewMockPanel's own
          height gives this row more room than that — found by measuring
          computed height at 0px on mobile, not by reading the class name. */}
      <div className="flex min-h-32 min-w-0 flex-1">
        <div className="relative w-5 shrink-0">
          {GRID_VALUES.map((v) => (
            <span key={v} className="absolute right-1 text-[8px] text-ink-muted" style={{ bottom: `calc(${v}% - 4px)` }}>
              {v}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <div className="relative h-full" style={{ minWidth: seatCount * MIN_BAR_TRACK }}>
            {GRID_VALUES.map((v) => (
              <div key={v} className="pointer-events-none absolute inset-x-0 border-t border-white/[0.06]" style={{ bottom: `${v}%` }} />
            ))}
            <div className="relative flex h-full items-end gap-[2px]">
              {format.seats.map((s) => (
                <Bar
                  key={s.seat}
                  seatInfo={s}
                  color={color}
                  highlighted={!!(recommendation && recommendation.scoring === format.scoring && recommendation.seat === s.seat)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-1 flex justify-between pl-5 text-[9px] text-ink-muted">
        <span>Seat 1</span>
        <span>Seat {seatCount}</span>
      </div>
    </div>
  )
}

// Row 1, cols 2-3 — mean weighted score per individual seat, one chart per
// scoring format you've played enough of to compare (historyStats()'s
// recEngineFormats in app.js). Reads the identical stats.recommendation
// field WhatToRunNext.jsx's top strip does, through the same
// describeRecommendation()/runRecommendation() helpers, so the highlighted
// bar here and the sentence in the strip can never name a different
// (format, seat) pair.
export default function RecommendationEngine({ engine, league, stats, roomActive, onRunAtSeat }) {
  const formats = stats.recEngineFormats
  if (!formats || !formats.length) {
    return (
      <AnalyticsCard title="Recommendation Engine" sub="Avg score by seat">
        <p className="flex h-full items-center text-xs text-ink-muted">
          Run a couple more formats and this will start comparing them.
        </p>
      </AnalyticsCard>
    )
  }

  const scoringNames = engine.scoringNames() || {}
  const info = describeRecommendation(stats, league, scoringNames)
  const labeledFormats = formats.map((f) => ({ ...f, label: scoringNames[f.scoring] || f.scoring }))

  return (
    <AnalyticsCard title="Recommendation Engine" sub="Avg score by seat">
      <div className="flex h-full flex-col">
        <div className="flex flex-1 items-stretch gap-6">
          {labeledFormats.map((f, i) => (
            <FormatChart key={f.scoring} format={f} color={FORMAT_COLORS[i % FORMAT_COLORS.length]} recommendation={info && info.rec} />
          ))}
        </div>
        {info && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
            <p className="min-w-0 flex-1 text-[12px] leading-snug text-white/70">{info.text}</p>
            {/* Same room-lock fix as WhatToRunNext.jsx's identical banner —
                see its own comment. */}
            <button
              type="button"
              onClick={() => runRecommendation(engine, league, info.rec, onRunAtSeat)}
              disabled={roomActive}
              title={roomActive ? "Not available in a room" : undefined}
              className={
                'shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors ' +
                (roomActive
                  ? 'cursor-not-allowed bg-white/10 text-white/30'
                  : 'bg-teal-400 text-obsidian hover:bg-teal-300')
              }
            >
              {info.ctaLabel}
            </button>
          </div>
        )}
      </div>
    </AnalyticsCard>
  )
}
