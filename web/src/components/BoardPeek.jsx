import { useEffect, useState } from 'react'
import { POS_CHALK, CELL_INK } from './draftRoomPositions.js'
import { freshnessLine } from './dataFreshness.js'

/* Tonight's board, in the hero.

   The critique put the "AI-built" complaint above the fold and located it
   precisely: everything down to y=916 was category-interchangeable, the
   right column was empty from y=517 to y=916, and the loudest object on
   that half was a card whose own eyebrow read OPTIONAL. Meanwhile the one
   asset no competitor has — 480 players with live ADP, projections and
   tiers, rebuilt nightly — first appeared below the fold.

   So this is the smallest honest thing that puts it above the fold: the
   five players tonight's board rates highest, with what each is worth over
   a replacement starter, and the board's own size and age underneath. It
   is checkable on arrival, it cannot be written by a competitor, and it
   cannot go stale, because it is read rather than authored.

   ---- Why five names and not the product shot ----

   `shotPicks()` draws five real rounds of a real snake draft and would be
   the richer answer, but it is ten columns wide and this slot is about
   500px. A board excerpt cropped to three columns is not a board. A
   ranked list is honest at this width and says the same thing: here is
   the board, here is what it thinks, check it.

   It is deliberately NOT pair 1 moved upward. That pair argues one player
   in depth — score, replacement, gap, both ranks — and repeating it here
   would spend the section's own opening on a duplicate. This is breadth:
   five names, one number each. */

const SHOWN = 5

function readTop(engine) {
  const board = engine.board()
  if (!board || !board.length) return null

  const rows = []
  for (const p of board) {
    const score = engine.overallScore(p)
    if (score === null || score === undefined) continue
    const gap = engine.replacementGap(p)
    if (gap === null || gap === undefined) continue
    rows.push({ id: p.id, name: p.name, pos: p.pos, score: Math.round(score), gap: Math.round(gap) })
    // The board is ADP-ordered, so the highest scores are near the front —
    // but not strictly, so this cannot break early. It sorts what it has.
  }
  if (!rows.length) return null
  rows.sort((a, b) => b.score - a.score)
  return rows.slice(0, SHOWN)
}

export default function BoardPeek() {
  const [rows, setRows] = useState(null)
  const [fresh, setFresh] = useState(null)

  useEffect(() => {
    const engine = typeof window !== 'undefined' ? window.JukeEngine : null
    if (!engine) return

    const run = () => {
      if (!engine.dataReady || !engine.dataReady()) return
      try {
        const next = readTop(engine)
        if (next) setRows(next)
      } catch {
        // Fails by disappearing, like the score strip. A hero that throws
        // is worse than a hero with one less panel in it.
        setRows(null)
      }
    }

    run()
    setFresh(freshnessLine())
    window.addEventListener('juke:data-loaded', run)
    return () => window.removeEventListener('juke:data-loaded', run)
    /* Deliberately NOT subscribed to `juke:header`.

       That event fires on every render(), which is once per tick of a live
       draft, and this component sits in a tree that applyRoute() hides
       without unmounting. HomeProof learned this the expensive way and
       carries a change-key guard for it; the cheaper answer here is not to
       listen at all. Nothing this panel draws can change without the
       deferred data landing, which `juke:data-loaded` already announces. */
  }, [])

  // No skeleton. This sits above the fold, where a placeholder is a
  // flicker on every cold load rather than a courtesy — and unlike the
  // proof pairs there is no scroll position that guarantees the reader is
  // looking at it when the data arrives.
  if (!rows) return null

  return (
    <section
      aria-label="Tonight's board"
      className="rounded-[18px] border border-line-hairline bg-surface-card px-5 py-5 sm:px-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-voidInk-body">
          Tonight&apos;s board
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-voidInk-muted">
          Over replacement
        </span>
      </div>

      <ol className="mt-4">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-3 border-b border-line-divider py-2.5 last:border-b-0"
          >
            {/* The position palette, not the hero gradient. POS_CHALK is
                the one hue reference this whole product uses for a
                position, so a WR here is the colour a WR is everywhere
                else — which is exactly what the generic cyan-to-periwinkle
                gradient beside it is not. */}
            <span
              className="w-9 shrink-0 rounded-md py-0.5 text-center font-mono text-[10px] font-semibold"
              style={{ background: POS_CHALK[r.pos] || '#8A9BAA', color: CELL_INK }}
            >
              {r.pos}
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] text-white">{r.name}</span>
            <span className="shrink-0 font-mono text-[14px] tabular-nums text-gain">+{r.gap}</span>
          </li>
        ))}
      </ol>

      {fresh && (
        <p className="mt-4 font-mono text-[11px] tabular-nums text-voidInk-muted">{fresh}</p>
      )}
    </section>
  )
}
