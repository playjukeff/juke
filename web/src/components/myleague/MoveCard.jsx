import { PosTile } from '../rooms/sampleParts.jsx'
import BarRow from '../decision/Bar.jsx'
import Confidence from '../decision/Confidence.jsx'

/* The primary recommendation card — "the move that matters this week."

   Demo-only for this phase: no room writes a real recommendation anywhere
   yet (Waiver/Strategy/Trade's connected implementations are a later
   phase), so MyLeagueScreen never mounts this against real data. It stays
   a real, importable component rather than inline JSX inside
   MyLeagueDemo.jsx so the first room that DOES start writing real
   recommendations has something to render them into.

   ---- What the decision system changed here (P1, P3, P6) ----

   Two things, and both were the card asserting more than it could support.

   The evidence was a `<dl>` of three key–value rows: "Immediate impact
   +4.2 pts/wk", "Rest of season +31.6 pts", "Roster need RB3 slot: 3.1
   pts/wk". Three quantities, TWO units, one heading — a reader cannot put
   31.6 beside 4.2 and get anything, which is precisely the table P3 says
   has to go. It is one unit on one scale now, with the league's median add
   drawn as a field marker, so the card shows the GAP rather than listing
   the parts of it.

   And the confidence was `81%` at 30px, the second-largest number on the
   card. A percentage looks like a confidence and is not one: it carries no
   sample size, and eighty-one per cent off four weeks and off four seasons
   are different claims that print identically. `<Confidence>` shows the
   three facts behind it instead — how many signals agree, how wide the
   error is, how big the sample was — and none of them is a bare percentage.

   The teal left rule stays. It is the brand marking the card as the
   product's own recommendation, not a value: the numbers inside it are all
   `cost`/`gain`/`evidence` now, which is the split the system is built on. */

export default function MoveCard({
  room,
  title,
  pos,
  confidence,
  gap,
  ctaLabel,
  onOpen,
}) {
  // One scale for the rows AND the marker: a marker drawn against a
  // different maximum from the bars beside it is a reference line pointing
  // at nothing, which is worse than no marker at all.
  const rows = (gap && gap.rows) || []
  const max = Math.max(
    ...rows.map((r) => Math.abs(r.value)),
    gap && gap.marker ? Math.abs(gap.marker.at) : 0,
    1,
  )

  return (
    <div className="mx-auto mt-4 max-w-[1280px] px-5 sm:px-10">
      <div className="jd-rise rounded-card border-l-[3px] border-teal bg-[#151920] p-[18px] sm:p-6 lg:grid lg:grid-cols-[1fr_300px] lg:gap-6">
        <div>
          <span className="font-plex text-label uppercase tracking-[0.1em] text-teal">
            THE MOVE{room ? ` · ${room.toUpperCase()}` : ''}
          </span>
          <div className="mt-1.5 flex items-start gap-3">
            {pos ? <PosTile pos={pos} size={36} /> : null}
            <h2 className="m-0 font-decision text-[24px] font-extrabold leading-tight text-white sm:text-[28px]">
              {title}
            </h2>
          </div>

          {confidence ? (
            <Confidence
              className="mt-3.5"
              agree={confidence.agree}
              signals={confidence.signals}
              error={confidence.error}
              sample={confidence.sample}
            />
          ) : null}

          {ctaLabel ? (
            <button
              type="button"
              onClick={onOpen}
              className="mt-4 rounded-chip bg-teal px-5 py-2.5 text-meta font-bold text-obsidian transition-transform duration-hover hover:-translate-y-0.5"
            >
              {ctaLabel}
            </button>
          ) : null}
        </div>

        {rows.length ? (
          <div className="mt-5 lg:mt-0">
            <p className="font-plex text-label uppercase text-ink-label">
              The gap{gap.unit ? `, ${gap.unit}` : ''}
            </p>
            {/* pt-4 rather than pt-0: the marker's own label sits 12px above
                its line, outside the track, and the first row would clip it
                against the heading otherwise. */}
            <div className="pt-4">
              {rows.map((r, i) => (
                <BarRow
                  key={r.label}
                  index={i}
                  label={r.label}
                  value={r.value}
                  max={max}
                  sign={r.sign || 'evidence'}
                  // The marker rides the first row only. Repeated down the
                  // list it reads as a grid line, which is a different claim
                  // — a field median is one value, drawn once.
                  marker={i === 0 ? gap.marker : undefined}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
