import { CELL_INK } from '../draftRoomPositions.js'
import { OXBLOOD_INK, TONE_MARK, delay } from './tokens.js'

/* The sidebar: the costliest habit, the two behind it, and how these rosters
   fail. It does not change with the selected view, because a habit is a fact
   about all of them.

   The light card is `flow.gold` rather than the handoff's #FBD5A8, which is
   POS_CHALK.TE — see tokens.js. The habit it carries is about whichever
   position is costing the most, so a card wearing tight end's own colour
   under a headline about running backs would read as a mistake in exactly
   the way a right value in the wrong column does.

   Its button is the same (format, seat) launch the rail's "run this next"
   card and view 04's experiment cards use, through the one runAt() the panel
   owns. The handoff's label for it — "Mock it with TE by 42" — promises a
   draft-time RULE the engine has no way to enforce: there is no positional
   constraint in draft-engine.js, engine.draftPlayer() has no refusal for one
   and autoPickForMe() would take the very player the card forbade. That is
   the same finding PracticeScenarios.jsx already recorded for
   `rules.noQbBeforeRound`, and the same answer applies: name the weakness,
   launch a real draft at the seat and format that tests it, and do not print
   a rule nothing enforces. */

const GOLD = '#F7D9A8'
/* The ink on that card, and it is NOT the handoff's #8A4B12.

   That value measures 4.99 against #F7D9A8, which passes — and the two stat
   tiles inside the card are not #F7D9A8. They carry rgba(22,32,46,0.1) over
   it, which composites to rgb(225,199,156), and #8A4B12 on THAT is 4.13.
   Measured on the rendered card rather than against the swatch, which is the
   only reading that counts: a colour is right on the surface it actually
   lands on, and this one lands on two.

   #78400F is the same hue and saturation two steps darker (HSL lightness
   30.6% -> 25.5%), so the card reads identically and both grounds clear the
   bar: 6.08 on the card, 5.04 on the tiles. CELL_INK, which carries the
   headline and the two values, is 12.07 on the card and 9.99 on a tile. */
const GOLD_LABEL = '#78400F'

function Card({ children, className = '' }) {
  return (
    <div className={'rounded-2xl border border-white/[0.07] bg-slate-panel px-[18px] py-[17px] ' + className}>
      {children}
    </div>
  )
}

export default function InsightsSidebar({ report, roomActive, onRun, onOpenHabit }) {
  const [top, ...rest] = report.habits
  const next = rest.slice(0, 2)
  const run = report.runNext

  return (
    <aside className="flex w-full shrink-0 flex-col gap-3 xl:w-[316px]">
      {top && (
        <div
          data-ins-breathe
          className="rounded-2xl p-5"
          style={{
            background: GOLD,
            boxShadow: '0 18px 44px rgba(247,217,168,0.15), 0 0 0 1px rgba(247,217,168,0.5)',
          }}
        >
          <div className="flex items-center gap-2">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke={GOLD_LABEL}
              strokeWidth="2.1"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 4v10" />
              <path d="M12 18.6v.4" />
            </svg>
            <p
              className="text-[10.5px] font-extrabold uppercase tracking-[0.13em]"
              style={{ color: GOLD_LABEL }}
            >
              Costliest habit · {top.frequency}
            </p>
          </div>
          <p
            className="mt-2.5 font-display text-[26px] font-bold leading-none tracking-[-0.02em]"
            style={{ color: CELL_INK }}
          >
            {top.title}
          </p>
          <p className="mt-3 text-[13.5px] leading-[1.5]" style={{ color: '#2B3540' }}>
            {top.evidence}
          </p>
          <div className="mt-3.5 flex gap-2.5">
            <div className="flex-1 rounded-[10px] px-[11px] py-2.5" style={{ background: 'rgba(22,32,46,0.1)' }}>
              <p className="font-plex text-[10px] tracking-[0.1em]" style={{ color: GOLD_LABEL }}>
                COST
              </p>
              <p
                className="mt-1 font-display text-[20px] font-bold leading-none"
                style={{ color: CELL_INK }}
              >
                {'−'}
                {Math.round(top.costPoints)} pts
              </p>
            </div>
            <div className="flex-1 rounded-[10px] px-[11px] py-2.5" style={{ background: 'rgba(22,32,46,0.1)' }}>
              <p className="font-plex text-[10px] tracking-[0.1em]" style={{ color: GOLD_LABEL }}>
                WIN %
              </p>
              <p
                className="mt-1 font-display text-[20px] font-bold leading-none"
                style={{ color: CELL_INK }}
              >
                {top.winPct >= 0 ? '' : '−'}
                {Math.abs(top.winPct).toFixed(1)}
              </p>
            </div>
          </div>
          {run && (
            <button
              type="button"
              onClick={() => onRun(run.scoring, run.seat)}
              disabled={roomActive}
              title={roomActive ? 'Not available in a room' : undefined}
              className={
                'mt-3.5 w-full rounded-[11px] py-3 text-[12.5px] font-extrabold uppercase tracking-[0.06em] transition-transform duration-150 ' +
                (roomActive ? 'cursor-not-allowed opacity-50' : 'hover:-translate-y-0.5')
              }
              style={{ background: CELL_INK, color: GOLD }}
            >
              {run.label}
            </button>
          )}
        </div>
      )}

      {next.length > 0 && (
        <Card>
          <p className="mb-3 font-plex text-[10.5px] tracking-[0.14em] text-ink-soft">
            OTHER HABITS WORTH FIXING
          </p>
          {next.map((h, i) => (
            <button
              key={h.pos}
              type="button"
              onClick={onOpenHabit}
              data-ins-rise
              style={delay(240 + i * 90)}
              className="w-full border-t border-white/[0.06] pb-2.5 pt-[11px] text-left"
            >
              <div className="flex items-baseline justify-between gap-3">
                {/* h.short, not h.title — see insightsHabits() in app.js for
                    why these two are different sentences rather than one
                    truncated. */}
                <p className="min-w-0 text-[13.5px] font-semibold text-ink">{h.short}</p>
                <p className="shrink-0 font-plex text-[12.5px]" style={{ color: OXBLOOD_INK }}>
                  {'−'}
                  {Math.round(h.costPoints)} pts
                </p>
              </div>
              <p className="mt-[5px] text-[12.5px] leading-[1.45] text-ink-soft">{h.evidence}</p>
            </button>
          ))}
        </Card>
      )}

      <Card className="min-h-0 xl:flex-1">
        <p className="mb-3 font-plex text-[10.5px] tracking-[0.14em] text-ink-soft">HOW THESE ROSTERS FAIL</p>
        {report.failures.map((f, i) => (
          <div
            key={f.key}
            data-ins-rise
            style={delay(280 + i * 80)}
            className="flex items-start gap-[11px] border-t border-white/[0.06] pb-2.5 pt-[11px]"
          >
            <span
              className="mt-1 h-[9px] w-[9px] shrink-0 rounded-full"
              style={{ background: TONE_MARK[f.tone] }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] text-ink">{f.title}</p>
              <p className="mt-1 text-[12.5px] leading-[1.45] text-ink-soft">{f.note}</p>
            </div>
            <span className="shrink-0 font-plex text-[12.5px]" style={{ color: TONE_MARK[f.tone] }}>
              {f.value}
            </span>
          </div>
        ))}
      </Card>
    </aside>
  )
}
