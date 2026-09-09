import { useMemo } from 'react'
import { useEngine, useJukeTick } from '../../hooks/useJukeEngine.js'

/* Your league's own draft, graded by the same engine that grades a mock.
 *
 * Everything here comes off the snapshot -- the capture, the lineup and the
 * scoring -- so this reads and never fetches. The grading itself is
 * gradeDraft(), which swaps two pointers and mutates nothing, so opening
 * this while a mock is running cannot disturb the mock.
 *
 * ---- It says which scoring it used ----
 *
 * A league whose rules the worker could not read grades on this session's
 * own table, which is the bug #210 fixed. A panel that cannot say which
 * happened would be repeating it quietly, so the footnote is not decoration.
 *
 * ---- Absent, not empty ----
 *
 * No draft, no lineup, or a draft type whose seat maths Juke does not model
 * (par is a snake's par) draws nothing at all rather than an empty frame --
 * the same contract the score strip and the news tab already keep. */
export default function DraftReportPanel({ league, snapshot }) {
  const engine = useEngine()
  useJukeTick(engine)

  const report = useMemo(() => {
    if (!engine || !engine.leagueDraftReport || !snapshot || !snapshot.draft) return null
    // dataReady() rather than trusting the bridge to exist: board rows are
    // what a pick resolves against, and they arrive on the deferred load.
    if (engine.dataReady && !engine.dataReady()) return null
    return engine.leagueDraftReport({
      draft: snapshot.draft,
      lineup: snapshot.lineup,
      rules: snapshot.rules,
      teams: snapshot.teams,
      ownerId: league && league.ownerId,
    })
  }, [engine, snapshot, league])

  if (!report || report.unsupported) return null

  const seats = [...report.seats].sort((a, b) => (a.rank || 99) - (b.rank || 99))
  const mine = seats.find((s) => s.mine) || null

  return (
    <section className="mt-4">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-[19px] font-extrabold text-ink">Draft report</h2>
        <span className="text-[12px] text-ink-muted">
          {report.counted} picks · {report.shape.teams} teams · {report.shape.rounds} rounds
        </span>
      </div>

      {mine ? (
        <p className="mb-3 text-[14px] text-ink-muted">
          You graded{' '}
          <strong className="font-display text-[16px] text-mint">{mine.grade}</strong>
          {mine.rank ? <> · {ordinal(mine.rank)} of {seats.length}</> : null}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-[18px] border border-line-hairline bg-[#151920]">
        <table className="w-full bg-slate-panel text-left">
          <thead>
            <tr className="bg-slate-sunk/60 text-[10px] uppercase tracking-[0.08em] text-ink-label">
              <th className="px-3 py-2 font-semibold">#</th>
              <th className="px-3 py-2 font-semibold">Team</th>
              <th className="px-3 py-2 text-right font-semibold">Grade</th>
            </tr>
          </thead>
          <tbody>
            {seats.map((s) => (
              <tr
                key={s.teamId}
                className={'border-t border-line-hairline ' + (s.mine ? 'bg-mint/5' : '')}
              >
                <td className="px-3 py-2 font-mono text-[12px] text-ink-muted">{s.rank ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className={'text-[14px] ' + (s.mine ? 'font-semibold text-mint' : 'text-ink')}>
                    {s.name}
                  </span>
                  {s.manager ? (
                    <span className="mt-0.5 block truncate text-[12px] text-ink-muted">{s.manager}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right font-display text-[16px] font-extrabold text-ink">
                  {s.grade || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[12px] text-ink-muted">
        {report.scored === 'league'
          ? "Graded under your league's own scoring and lineup."
          : "Graded on default scoring — your league's rules could not be read."}
        {report.unplaceable
          ? ` ${report.unplaceable} pick${report.unplaceable === 1 ? '' : 's'} could not be priced and ${report.unplaceable === 1 ? 'is' : 'are'} left out.`
          : ''}
      </p>
    </section>
  )
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
