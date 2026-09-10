import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { RotateCw } from 'lucide-react'
import { POS_BADGE } from './draftRoomPositions.js'

// standard/half/full PPR — the same three keys rulesForFormat() already
// knows, so "0 / 0.5 / 1" in the UI maps straight onto the real format names
// rather than a second copy of what those numbers mean. shortLabel is the
// mobile segmented control's own label set (design_handoff_mobile) — three
// pills across a 343px-wide card have less room than desktop's row, so
// "Half PPR" loses its second word there; value/format (the only fields the
// scoring math reads) are identical, so there's still one definition of
// what the three formats are, just two label strings for two widths.
const PPR_OPTIONS = [
  { value: 0, format: 'standard', label: 'Standard', shortLabel: 'Standard' },
  { value: 0.5, format: 'half', label: 'Half PPR', shortLabel: 'Half' },
  { value: 1, format: 'ppr', label: 'Full PPR', shortLabel: 'Full PPR' },
]

// The mobile card's closing line — dynamic by format rather than the static
// "the receivers climb and Barkley slides" the mock illustrates: which
// players are even in the pool is real, nightly-refreshed board data (see
// usePlayerPool below), so a sentence naming specific movers would be wrong
// the first morning the board changes and is exactly the kind of hardcoded
// name CLAUDE.md's product-shot section already warns against. This says
// what's universally true of the rule instead.
const PPR_EXPLAIN = {
  standard: 'Receptions are worth nothing here, so this board rewards rushing and touchdowns alone.',
  half: 'Receptions are worth half a point here — real movement, gentler than full PPR.',
  ppr: 'Receptions are worth a full point here, so pass-catchers climb and pure runners slide.',
}

// The candidate pool: real, PPR-relevant skill players (only ones a
// reception rule can actually move — K/DST excluded, same FORCED_LATE
// filter the app's own suggestions engine uses). Wider than either row
// count needs (20, not 6) because homepage v4 pass 2 sorts this pool by
// VORP *per format* (see useRankedRows below) rather than by raw points —
// a player who ranks outside the old fixed six-player cut under one
// format can rank inside the new top seven under another, and a pool
// sized to the smaller number would silently miss him.
function usePlayerPool() {
  const [pool, setPool] = useState([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const engine = typeof window !== 'undefined' ? window.JukeEngine : null
    if (!engine) return

    // players.js/stats.js/draft-engine.js load off the critical path now
    // (app.js's deferred-data boot) — engine.dataReady() is false in the
    // window before they land, and vorpUnder()/survivalProbability() both
    // need DraftEngine loaded (nextPicksFor() calls DraftEngine.onTheClock
    // directly, unguarded, the same as every other Draft-Room-only bridge
    // call). Re-reads on "juke:header" the same way ScoringDemoCard always
    // has, so the empty window here fills in once the deferred data lands
    // rather than staying empty for the rest of the page's life.
    const read = () => {
      if (!engine.dataReady()) return
      const statKeys = engine.statKeys()
      const forcedLate = engine.forcedLate()
      if (!statKeys) return

      const eligible = engine.board().filter((p) => {
        if (forcedLate[p.pos]) return false
        const s = engine.statOf(p)
        return s && s.p && s.p.gp > 0 && s.p[statKeys.rec] > 0
      })

      if (eligible.length) { setPool(eligible); setReady(true) }
    }

    read()
    window.addEventListener('juke:header', read)
    return () => window.removeEventListener('juke:header', read)
  }, [])

  return { pool, ready }
}

// Board · sorted by value over replacement (§3.4's panel title) — VORP
// and Proj both reran under the clicked format, not just Proj: engine.
// vorpUnder(format) recomputes replacement level under that SAME format
// rather than reading REPLACEMENT_PTS (the league's own live rules,
// which may disagree with whatever this solo visitor's toggle is on).
// "The curve falls when the reception bonus drops, but replacement falls
// with it" is the whole argument CLAUDE.md documents for this pattern —
// a fixed VORP that only Proj reran under would be exactly the "half the
// grade was reading a lie" class of bug that file is written to prevent.
//
// Seat 0's own second pick (round 2) of a fresh, unstarted DEMO_TEAMS-team
// draft — not "my next turn" in whatever draft the browser's shared engine
// singleton happens to be holding. engine.nextPicksFor() used to answer
// this by walking the real, global state.picks, which on the marketing
// homepage is whatever a previous visit (or this tab's own solo draft)
// left behind — often near-finished or already discarded — so the target
// pick it returned could land near the very last pick of an entire draft.
// This card's rows are the top seven by VORP, the earliest-ADP players on
// the board by construction, so survival against a pick that late rounded
// to 0% for every single one of them. DraftEngine.overallOf() is pure
// snake arithmetic with no such state to drift off of — the same function
// DraftBoardGrid.jsx already calls for a corner pick number on an empty
// board cell (CLAUDE.md's "the seat-versus-pick-number bug"). Exported so
// ShowYourWorking.jsx's own "next turn" demo targets the identical pick
// rather than a second, independently-chosen team count.
export const DEMO_TEAMS = 10

function useRankedRows(pool, ready, format, count) {
  const engine = typeof window !== 'undefined' ? window.JukeEngine : null
  const DE = typeof window !== 'undefined' ? window.DraftEngine : null
  const secondPick = DE ? DE.overallOf(2, 0, DEMO_TEAMS) : null

  if (!engine || !ready || !pool.length) return []

  const vorpTable = engine.vorpUnder(format)
  return pool
    .map((player) => {
      const row = vorpTable[player.id]
      return row && row.vorp !== null ? { player, projPts: row.projPts, vorp: row.vorp } : null
    })
    .filter(Boolean)
    .sort((a, b) => b.vorp - a.vorp)
    .slice(0, count)
    .map((row, i) => {
      // survivalProbability() returns a raw 0-1 fraction (it's a
      // probability, not a UI value) — the "%" is this component's own
      // formatting choice, not something the bridge should bake in for
      // every caller.
      const raw = secondPick != null ? engine.survivalProbability(row.player, secondPick) : null
      return { ...row, rank: i + 1, surv: raw != null ? Math.round(raw * 100) : null }
    })
}

// 34px | minmax(0,1fr) | 56px | 62px | 52px, 10px column gap only — the
// design handoff's own board grid (§4), narrower on the three numeric
// columns and with no row-gap eating into the shared column gutter than
// the figure this replaced, which is what let "Christian McCaffrey"
// truncate in the player column at this card's width. Shared by the
// header row and every data row so the two can never drift out of
// alignment with each other.
const ROW_GRID = 'grid-cols-[34px_minmax(0,1fr)_56px_62px_52px]'
// Four columns, not five: the documented fallback below ("drop Proj, keep
// Surv") is now the shipped state. Five was "measured at 375px and it fits",
// but that measurement predated the hero grid's 40px side padding — inside
// today's hero the card is 295px, which left the 1fr player column 31px and
// every name truncated to two letters. Dropping Proj hands its 46px + gap to
// the name, which is the widest thing the row actually carries.
const MOBILE_ROW_GRID = 'grid-cols-[28px_minmax(0,1fr)_46px_40px]'

function RowCells({ row, grid, dense }) {
  const { player, projPts, vorp, surv, rank } = row
  // Top three by VORP, not an absolute threshold — the emphasis has to
  // survive a scoring change, and a fixed cutoff (e.g. "VORP > 100")
  // would not: a reception bonus dropping to zero can pull every VORP on
  // the board down together without changing who the top three actually
  // are relative to each other.
  const emphasized = rank <= 3
  return (
    <div className={`grid ${grid} items-center ${dense ? 'gap-2 px-[14px]' : 'gap-x-[10px] gap-y-0 px-3'} rounded-[11px] border border-line-hairline bg-surface-row py-[12px]`}>
      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-center text-[10px] font-bold ${POS_BADGE[player.pos] || 'bg-white/10 text-white/50'}`}>
        {player.pos}
      </span>
      <span className={`min-w-0 truncate font-semibold text-voidInk-primary ${dense ? 'text-meta' : 'text-[15px]'}`}>
        {player.name}
      </span>
      {/* Proj is desktop-only — the mobile grid dropped its column (see
          MOBILE_ROW_GRID above), and a fifth cell in a four-column grid
          would wrap onto a phantom second row rather than error. */}
      {!dense && (
        <span className="text-right font-numeral tabular-nums font-semibold text-voidInk-body text-meta">
          {projPts != null ? Math.round(projPts) : '—'}
        </span>
      )}
      <span
        className={`text-right font-numeral tabular-nums font-semibold ${dense ? 'text-[11px]' : 'text-meta'} ${emphasized ? 'text-teal-300' : 'text-voidInk-muted'}`}
      >
        {vorp >= 0 ? '+' : ''}
        {Math.round(vorp)}
      </span>
      <span className={`text-right font-numeral tabular-nums font-semibold text-voidInk-muted ${dense ? 'text-[11px]' : 'text-meta'}`}>
        {surv != null ? `${surv}%` : '—'}
      </span>
    </div>
  )
}

// The interactive proof behind "Show Your Working" — every number here
// reruns live off the real board when the PPR toggle is clicked, which is
// the one thing on the page a reader can't fake by looking at a screenshot:
// they have to click it. Its own component, not inlined into Hero.jsx or
// ShowYourWorking.jsx, because a design review found it buried below a full
// scroll behind a static, non-interactive board card in the hero — this is
// now the hero's own second column, and ShowYourWorking.jsx (further down
// the page) no longer carries a second copy of the same demo.
export default function ScoringDemoCard() {
  const { pool, ready } = usePlayerPool()
  const [ppr, setPpr] = useState(1)
  const format = PPR_OPTIONS.find((o) => o.value === ppr)?.format ?? 'ppr'

  const ranked = useRankedRows(pool, ready, format, 7)
  // Not a second, differently-sorted seven-cut — the mobile board's own
  // "not optional" rule (§3.9) is six rows off the *same* VORP order,
  // so mobile and desktop always agree on who's #1 through #6.
  const mobileRanked = ranked.slice(0, 6)

  return (
    <>
      {/* ---------- Mobile ----------
          Four columns — §3.9's documented fallback (drop Proj, keep Surv:
          "survival is the differentiator, projection is the commodity"),
          shipped rather than held in reserve. "Ship five if it fits" was
          measured against a 375px viewport, not against the 295px this
          card actually gets inside the hero grid's 40px side padding, and
          at 295 the five-column player cell was 31px wide — every name
          two letters and an ellipsis. See MOBILE_ROW_GRID. */}
      <div className="rounded-[14px] border border-line-hairline bg-surface-card p-5 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <p className="font-numeral text-[10.5px] font-semibold tracking-[0.13em] text-voidInk-muted">
            BOARD · SORTED BY VORP
          </p>
        </div>

        {/* Full PPR / Half / Standard, left to right — the mock's own
            order, reversed from desktop's Standard-first array rather than
            a second options list, so value/format never drift between the
            two segmented controls. h-11 (44px) on every pill: the handoff's
            own tap-target floor, not met by desktop's shorter chip. */}
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-white/5 p-1">
          {[...PPR_OPTIONS].reverse().map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPpr(opt.value)}
              className={`flex h-11 items-center justify-center rounded-full px-2 text-meta font-semibold transition-all duration-200 ${
                ppr === opt.value ? 'bg-teal-500 text-obsidian shadow-[0_0_12px_rgba(0,229,255,0.5)]' : 'text-white/50 hover:text-white'
              }`}
            >
              {opt.shortLabel}
            </button>
          ))}
        </div>

        <div className={`mt-4 grid ${MOBILE_ROW_GRID} gap-2 px-[14px] font-numeral text-[10.5px] font-semibold uppercase tracking-[0.13em] text-voidInk-muted`}>
          <span>Pos</span>
          <span>Player</span>
          <span className="text-right">VORP</span>
          <span className="text-right">Surv</span>
        </div>

        <div className="mt-1 flex flex-col gap-[7px]">
          {mobileRanked.map((row) => (
            <motion.div key={row.player.name} layout transition={{ type: 'spring', stiffness: 350, damping: 32 }}>
              <RowCells row={row} grid={MOBILE_ROW_GRID} dense />
            </motion.div>
          ))}
        </div>

        <p className="mt-4 text-[14px] leading-[1.5] text-voidInk-body">
          {PPR_EXPLAIN[format]} Every ranking on Juke moves with your rules.
        </p>
      </div>

      {/* ---------- Desktop ---------- */}
      <div className="hidden rounded-[14px] border border-line-hairline bg-surface-card px-[22px] pb-[22px] pt-6 lg:block">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-base font-bold text-voidInk-primary">Board · sorted by value over replacement</span>
          <div className="inline-flex gap-1 rounded-full bg-white/5 p-1">
            {PPR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPpr(opt.value)}
                className={`rounded-full px-[13px] py-[6px] text-meta font-semibold transition-all duration-200 ${
                  ppr === opt.value ? 'bg-teal-500 text-obsidian shadow-[0_0_12px_rgba(0,229,255,0.5)]' : 'text-white/50 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className={`mt-4 grid ${ROW_GRID} gap-x-[10px] gap-y-0 px-3 font-numeral text-[10.5px] font-semibold uppercase tracking-[0.13em] text-voidInk-muted`}>
          <span>Pos</span>
          <span>Player</span>
          <span className="text-right">Proj</span>
          <span className="text-right">VORP</span>
          <span className="text-right">Surv</span>
        </div>

        <div className="mt-2 flex flex-col gap-[7px]">
          {ranked.map((row) => (
            <motion.div key={row.player.name} layout transition={{ type: 'spring', stiffness: 350, damping: 32 }}>
              <RowCells row={row} grid={ROW_GRID} />
            </motion.div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-[7px] font-numeral tabular-nums text-[11px] font-medium text-voidInk-muted">
          <RotateCw className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            Projected season points · {ppr === 1 ? '1.0' : ppr === 0.5 ? '0.5' : 'no reception bonus'}
            {ppr !== 0 && ' per reception'}
          </span>
        </div>
      </div>
    </>
  )
}
