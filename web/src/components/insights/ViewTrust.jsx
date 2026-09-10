import { OXBLOOD, OXBLOOD_INK, delay } from './tokens.js'

/* View 04 — what these mocks can prove.

   The coverage grid, three mocks that would tighten the read, and the one
   thing a count of drafts cannot tell you: how much your own history repeats
   itself. This is the view that keeps the other three honest, which is why
   it is a view rather than a footnote.

   The correlation card draws in both directions. A page that only ever warns
   is a page that has nothing to say to the reader who earned the good answer
   — and "your mocks are close to independent" is what makes every number on
   the other three views worth what its count suggests. Both sentences are
   written in app.js beside the arithmetic (insightsSampleQuality()). */

function cellStyle(n) {
  if (n === 0) {
    return {
      background: 'rgba(255,255,255,0.02)',
      borderColor: 'rgba(255,255,255,0.06)',
      /* Full ink-muted, not a fraction of it: an empty cell is still a
         reading ("no mocks here") and the dot is the whole of what it says.
         At 0.7 it composites to 3.16 against this cell's own near-transparent
         fill, which is under the bar for a 12.5px glyph. */
      color: '#8A9BAA',
    }
  }
  if (n >= 3) {
    return { background: 'rgba(0,229,255,0.16)', borderColor: 'rgba(0,229,255,0.45)', color: '#EDF1F5' }
  }
  return { background: 'rgba(170,202,242,0.1)', borderColor: 'rgba(170,202,242,0.3)', color: '#EDF1F5' }
}

export default function ViewTrust({ report, onRun, roomActive }) {
  const cov = report.coverage
  const sample = report.sample
  return (
    <div>
      <p className="max-w-[680px] text-[14px] leading-[1.55] text-ink/80">
        {report.mocks} mocks is not {report.mocks} data points. {cov.sampled} of {cov.total} seat-and-format
        cells have any data at all, and what repeats between your own drafts costs some of the rest.
      </p>

      <div className="mt-5 flex flex-col gap-[18px]">
        <div>
          <p className="mb-2.5 font-plex text-[10.5px] tracking-[0.14em] text-ink-soft">
            MOCKS PER SEAT AND FORMAT
          </p>
          {/* The grid scrolls sideways rather than shrinking its cells: ten
              40px squares plus a 92px gutter is 542px, and squeezing that into
              a 340px phone gives cells too small to carry the count that is
              the entire content of the cell. Scrolling and ellipsising are
              the two legal answers to an overflow (CLAUDE.md); a 20px square
              with a digit in it is neither. */}
          <div className="no-scrollbar overflow-x-auto pb-1">
            <div className="min-w-max">
              <div className="mb-1.5 flex gap-[5px] pl-[92px]">
                {Array.from({ length: cov.seats }, (_, i) => (
                  <span
                    key={i}
                    className="w-10 text-center font-plex text-[10.5px] text-ink-soft"
                  >
                    {i + 1}
                  </span>
                ))}
              </div>
              {cov.rows.map((row, ri) => (
                <div key={row.key} className="mb-[5px] flex items-center gap-[5px]">
                  <span className="w-[92px] shrink-0 text-meta text-ink">{row.format}</span>
                  {row.counts.map((n, ci) => (
                    <span
                      key={ci}
                      data-ins-pop
                      title={
                        `${row.format} · seat ${ci + 1} · ` +
                        (n === 0 ? 'no mocks' : `${n} mock${n > 1 ? 's' : ''}`) +
                        (row.teams[ci] && row.teams[ci].length
                          ? ` · ${row.teams[ci].join('/')}-team`
                          : '')
                      }
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-[9px] border font-plex text-meta font-semibold"
                      style={{ ...cellStyle(n), ...delay(140 + (ri * cov.seats + ci) * 16) }}
                    >
                      {n === 0 ? '·' : n}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-meta text-ink-soft">
            Empty cells are guesses, not reads. A seat you have never drafted from tells you nothing about
            drafting from it.
          </p>
        </div>

        <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
          <div className="min-w-0">
            <p className="mb-2.5 font-plex text-[10.5px] tracking-[0.14em] text-ink-soft">
              {report.experiments.length === 1 ? 'ONE MOCK' : 'MOCKS'} THAT WOULD TIGHTEN THE READ
            </p>
            <div className="flex flex-col gap-[9px]">
              {report.experiments.map((e, i) => (
                <button
                  key={e.key}
                  type="button"
                  onClick={() => onRun(e.scoring, e.seat)}
                  disabled={roomActive}
                  title={roomActive ? 'Not available in a room' : e.runLabel}
                  data-ins-rise
                  style={delay(180 + i * 80)}
                  className={
                    'rounded-[13px] border border-white/[0.07] bg-slate px-[15px] py-[14px] text-left transition-transform duration-150 ' +
                    (roomActive ? 'cursor-not-allowed opacity-60' : 'hover:-translate-y-[2px]')
                  }
                >
                  <div className="flex items-baseline justify-between gap-3.5">
                    <p className="text-[14px] font-semibold text-white">{e.title}</p>
                    <p className="shrink-0 font-plex text-[12px] text-teal-300">{e.tag}</p>
                  </div>
                  <p className="mt-1.5 text-meta leading-[1.45] text-ink-soft">{e.note}</p>
                  {/* What the press does, beside what the card advises. The
                      title above is a prescription — "three mocks" — and the
                      button starts one; without this line the card promises
                      three drafts and delivers one. See insightsExperiments()
                      in app.js. */}
                  <p className="mt-2 font-plex text-[11px] text-teal-300">
                    {roomActive ? 'Not available in a room' : e.runLabel}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div
            className="rounded-[13px] border px-[15px] py-[14px]"
            style={
              sample.tone === 'bad'
                ? { borderColor: 'rgba(190,97,83,0.35)', background: 'rgba(190,97,83,0.07)' }
                : { borderColor: 'rgba(0,229,255,0.28)', background: 'rgba(0,229,255,0.05)' }
            }
          >
            <p
              className="font-plex text-[10.5px] tracking-[0.13em]"
              style={{ color: sample.tone === 'bad' ? OXBLOOD_INK : '#66F0FF' }}
            >
              SAMPLE CORRELATION
            </p>
            <p className="mt-[7px] text-[14px] leading-[1.5] text-ink">{sample.line}</p>
            <p className="mt-[7px] text-meta leading-[1.45] text-ink/80">{sample.sub}</p>
            <div className="mt-3.5 h-[7px] overflow-hidden rounded-full bg-white/[0.06]">
              <span
                data-ins-grow-x
                className="block h-full rounded-full"
                style={{
                  width: Math.round((sample.effective / sample.mocks) * 100) + '%',
                  background: sample.tone === 'bad' ? OXBLOOD : '#00E5FF',
                  ...delay(360),
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
