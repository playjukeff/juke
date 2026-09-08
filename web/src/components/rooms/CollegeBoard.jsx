import { useMemo, useState } from 'react'
import { PosTile } from './sampleParts.jsx'
import { useEngine, useJukeTick } from '../../hooks/useJukeEngine.js'

/* Players who are still in college, and have never been drafted.
 *
 * ---- The one screen in Juke that draws somebody who is not on the board ----
 *
 * Every other list in this app is Sleeper-id-keyed NFL players. These are
 * keyed by CFBD athlete id, because nobody has drafted them and they have no
 * Sleeper id at all. They cannot be queued, drafted or scored, and the moment
 * an NFL team takes one he leaves this board and arrives on the real one with
 * his draft position and college line attached — which needs no code, because
 * the next pipeline run finds him in Sleeper's master and no longer on a
 * college roster.
 *
 * ---- It is ordered by production and says so, which matters more here
 *      than anywhere else in the room ----
 *
 * Measured on the real 2025 FBS season, the top receivers by yards come out
 * Scudero, Sparks, Young — with Jeremiah Smith FIFTH, whom any scout would
 * have first. Yards reward volume and opportunity, not talent.
 *
 * Juke could only reorder them by inventing a scouting model, which is the
 * thing this project refuses everywhere else: it withholds a Juke score for
 * kickers rather than guess, and prints a ranking's own uncertainty rather
 * than dress it up. So the heading says "by production", the note under it
 * says what that does and does not mean, and the reader does the scouting.
 *
 * The combine is the gap that closes this: it is named in the banner as
 * missing rather than left for somebody to wonder about, and when that data
 * exists it fills a hole the screen already points at.
 */

const PER_PAGE = 24

function classLabel(year) {
  // The feed's own number, named rather than reinterpreted. CFBD sends 1-4
  // and a handful of nonsense values the pipeline already drops, so anything
  // arriving here is one of the four.
  return { 1: 'FR', 2: 'SO', 3: 'JR', 4: 'SR', 5: 'SR+', 6: 'SR+' }[year] || '—'
}

function statLine(pos, c) {
  /* What a position's production actually is, rather than every key we hold.
     A quarterback's receiving line is noise and a receiver's passing line is
     a trick play — the same judgement USAGE_COLUMNS already makes in app.js,
     and made here because it is about what to DRAW rather than what to
     store. */
  const n = (v) => (v || 0).toLocaleString()
  if (pos === 'QB') {
    return [
      c.py != null && `${n(c.py)} pass yds`,
      c.pt != null && `${c.pt} TD`,
      c.pi != null && `${c.pi} INT`,
      c.ry ? `${n(c.ry)} rush yds` : null,
    ].filter(Boolean)
  }
  if (pos === 'RB') {
    return [
      c.ry != null && `${n(c.ry)} rush yds`,
      c.rt != null && `${c.rt} TD`,
      c.rc ? `${c.rc} rec` : null,
      c.cy ? `${n(c.cy)} rec yds` : null,
    ].filter(Boolean)
  }
  return [
    c.rc != null && `${c.rc} rec`,
    c.cy != null && `${n(c.cy)} yds`,
    c.ct != null && `${c.ct} TD`,
  ].filter(Boolean)
}

export default function CollegeBoard() {
  const engine = useEngine()
  useJukeTick(engine)
  const [pos, setPos] = useState('ALL')
  const [shown, setShown] = useState(PER_PAGE)

  const rows = useMemo(
    () => (engine && engine.collegeBoard ? engine.collegeBoard() : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, engine && engine.dataReady && engine.dataReady()]
  )
  const meta = engine && engine.collegeBoardMeta ? engine.collegeBoardMeta() : null

  /* Absent, not broken.
   *
   * The block is empty without CFBD_KEY and empty until the nightly has run
   * with one — which is a real state this screen was in on the day it
   * shipped. It says which of the two it is as far as it can tell, rather
   * than drawing an empty table that reads as a failure. */
  if (!rows.length) {
    return (
      <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-10">
        <div className="rounded-[14px] border border-line-hairline bg-surface-card px-5 py-10 text-center">
          <p className="m-0 text-[15px] text-voidInk-body">
            No college board yet.
          </p>
          <p className="mx-auto mt-2 max-w-[52ch] text-[13px] leading-relaxed text-ink-muted">
            This fills from College Football Data on the next nightly rebuild. Until then there is
            nothing here to show — which is a fact about the pipeline rather than about this year's
            class.
          </p>
        </div>
      </div>
    )
  }

  const positions = []
  for (const r of rows) if (!positions.includes(r.pos)) positions.push(r.pos)
  const filtered = pos === 'ALL' ? rows : rows.filter((r) => r.pos === pos)
  const page = filtered.slice(0, shown)

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-10">
      <div className="mb-5 rounded-[12px] border border-flow-blue/30 bg-flow-blue/10 px-4 py-3">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-flow-blue">
          Not drafted · not on any Juke board
        </div>
        <p className="mt-1 max-w-[74ch] text-[13px] leading-relaxed text-voidInk-body">
          Every player here is still in college and has never been drafted, so none of them can be
          queued or drafted in a mock. They arrive on the real board the season an NFL team takes
          one.
          {meta ? (
            <>
              {' '}
              Production is their <strong className="font-semibold text-white">{meta.season}</strong>{' '}
              season; class years are from the {meta.roster} rosters, and the next draft they can
              enter is <strong className="font-semibold text-white">{meta.draft}</strong>.
            </>
          ) : null}{' '}
          There is no combine testing and no draft position for any of them yet — nobody has
          measured or picked them.
        </p>
      </div>

      {positions.length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {['ALL'].concat(positions).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => { setPos(key); setShown(PER_PAGE) }}
              aria-pressed={pos === key}
              className={
                'rounded-full border px-3 py-1 font-mono text-[11px] transition-colors duration-150 ' +
                (pos === key
                  ? 'border-mint/60 bg-mint/15 text-mint'
                  : 'border-line-hairline text-ink-muted hover:border-white/25')
              }
            >
              {key}
            </button>
          ))}
        </div>
      ) : null}

      <section className="rounded-[14px] border border-line-hairline bg-surface-card">
        <div className="flex items-baseline justify-between gap-3 border-b border-line-hairline px-4 py-3 sm:px-5">
          <h2 className="m-0 font-display text-[17px] font-bold text-white">
            By college production, within position
          </h2>
          <span className="font-mono text-[11px] text-ink-muted">
            {filtered.length} {filtered.length === 1 ? 'player' : 'players'}
          </span>
        </div>

        <div className="px-4 sm:px-5">
          {page.map((row) => (
            <div
              key={row.id}
              data-college-row
              className="flex items-center gap-3 border-b border-line-hairline py-2.5 last:border-b-0"
            >
              {/* His rank AT HIS POSITION, not a row number.
                  "WR3" is a fact and the vocabulary this app already speaks
                  (QB1, TE12, the whole player sheet); a sequential index in a
                  filtered list is just where he happens to be sitting. */}
              <span className="w-9 shrink-0 font-mono text-[11px] text-ink-muted">
                {row.pos}{row.rank || '—'}
              </span>
              <PosTile pos={row.pos} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-white">
                  {row.name}
                </span>
                <span className="block truncate font-mono text-[11px] text-ink-muted">
                  {row.school} · {classLabel(row.classYear)}
                </span>
                {/* The numbers, under the name, on a phone.
                    They are the REASON this screen exists -- a research board
                    with the production hidden is a list of names -- and there
                    is no room for them beside a name at 375px, measured. This
                    file's comment claimed they were here before they were,
                    which is the shape of thing that ships when a note is
                    written from intent rather than from the markup. */}
                <span className="mt-0.5 block truncate font-mono text-[11px] text-voidInk-primary sm:hidden">
                  {statLine(row.pos, row.college).join(' · ')}
                </span>
              </span>
              <span className="hidden shrink-0 text-right font-mono text-[11px] text-voidInk-primary sm:block">
                {statLine(row.pos, row.college).join(' · ')}
              </span>
            </div>
          ))}

          {page.length < filtered.length ? (
            <div className="py-3 text-center">
              <button
                type="button"
                onClick={() => setShown(shown + PER_PAGE)}
                className="rounded-full border border-line-hairline px-4 py-1.5 font-mono text-[11px] text-ink-muted transition-colors duration-150 hover:border-white/25"
              >
                Show {Math.min(PER_PAGE, filtered.length - page.length)} more
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <p className="mt-3 max-w-[74ch] text-[12px] leading-relaxed text-ink-muted">
        Ranked within each position by yards, which is production and not a prospect ranking — it rewards volume and
        opportunity rather than talent, and a scout's board would look different. Juke does not
        reorder them, because doing so would mean inventing a scouting model rather than reporting
        what happened. FBS only, and only players a year or more from being draft-eligible.
      </p>
    </div>
  )
}
