import { Kicker, PosChip } from '../v2ui.jsx'
import { ordinal, readDecide, reasonFor, signedInt, survivalWord, whatItCosts } from './cockpitData.js'
import { DraftButton, FOCUS, Headshot, InjuryTag, Panel, StarButton } from './parts.jsx'

/* Decide: what Juke would do with this pick, and what waiting costs.

   The three cards are engine.suggestions('ALL') — never the position chip,
   which is a lens and not a decision (CLAUDE.md, "A filter is a lens, never
   a decision"). Their labels and the sentences under them are
   DraftDecideScreen.jsx's, with the same two thresholds, so a candidate
   cannot be "Scarcest" here and "Also available" one tab over. The
   survival numbers are survivalProbability() — FFC's real ADP dispersion,
   not a simulation — asked against your NEXT pick, the off-by-one the
   production screen already paid for once. */

function pct(v) {
  return v == null ? '—' : `${Math.round(v * 100)}%`
}

function Card({ c, lead, engine, canDraft, draftReason, onDraft, onOpen, queued, counts, nextOverall, myTurn }) {
  const p = c.player
  const word = survivalWord(c.survival, myTurn)
  const does = c.fit && c.fit.startsNow ? `Fills your ${ordinal(c.fit.have + 1)} ${p.pos} slot.` : `Bench depth at ${p.pos}.`
  const costs = whatItCosts(engine, p, counts, nextOverall)
  return (
    <article className={`flex min-w-0 flex-col rounded-[16px] p-4 ring-1 ring-inset ${lead ? 'bg-v2-raised ring-white/[0.14]' : 'bg-v2-inset ring-white/[0.06]'}`}>
      <div className="flex items-center justify-between gap-2">
        <Kicker tone={lead ? 'text-v2-ink' : 'text-v2-ink2'}>{c.label}</Kicker>
        <StarButton on={queued} onClick={() => engine.queueToggle(p.name)} name={p.name} />
      </div>
      <button type="button" onClick={() => onOpen(p)} className={`mt-1 flex items-center gap-3 rounded-[8px] text-left ${FOCUS}`}>
        <Headshot src={engine.photoUrl(p)} name={p.name} pos={p.pos} size={44} />
        <span className="min-w-0">
          <span className="block truncate font-telemetry text-[24px] font-bold uppercase italic leading-[0.95] text-v2-ink">{p.name}</span>
          <span className="mt-1 flex items-center gap-1.5">
            <PosChip pos={p.pos} />
            <span className="font-mono text-[10px] tabular-nums text-v2-ink3">{p.team} · bye {p.bye || '—'}</span>
            <InjuryTag code={p.inj} />
          </span>
        </span>
      </button>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        <div>
          <dt><Kicker>Juke</Kicker></dt>
          <dd className="font-telemetry text-[26px] font-bold leading-none tabular-nums text-v2-ink">{c.juke == null ? '—' : Math.round(c.juke)}</dd>
        </div>
        <div>
          <dt><Kicker>VORP</Kicker></dt>
          <dd className={`font-telemetry text-[26px] font-bold leading-none tabular-nums ${c.vorp > 0 ? 'text-v2-volt' : c.vorp < 0 ? 'text-v2-loss' : 'text-v2-ink'}`}>{signedInt(c.vorp)}</dd>
        </div>
        <div>
          <dt><Kicker>In tier</Kicker></dt>
          <dd className="font-telemetry text-[26px] font-bold leading-none tabular-nums text-v2-ink">{c.tierLeft ?? '—'}</dd>
        </div>
      </dl>

      <div className="mt-3 rounded-[10px] bg-white/[0.03] px-3 py-2 ring-1 ring-inset ring-white/[0.05]">
        <div className="flex items-baseline justify-between gap-2">
          <Kicker>If you wait{nextOverall ? ` · pick ${nextOverall}` : ''}</Kicker>
          <span className={`font-mono text-[12px] font-semibold ${word.tone}`}>{word.label}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            {c.survival != null && <span className="absolute inset-y-0 left-0 rounded-full bg-v2-cyan/80" style={{ width: `${Math.max(2, c.survival * 100)}%` }} />}
          </span>
          <span className="w-10 text-right font-mono text-[12px] tabular-nums text-v2-ink">{pct(c.survival)}</span>
        </div>
        <span className="mt-1 block text-[11px] text-v2-ink3">chance he is still on the board</span>
      </div>

      <p className="mt-3 text-[13px] font-medium leading-[1.45] text-v2-ink">{reasonFor(c)}</p>
      <p className="mt-1 text-[12px] leading-[1.5] text-v2-ink2">{does} {c.vorp != null ? `${signedInt(c.vorp)} points over a replacement starter.` : ''}</p>
      {costs && <p className="mt-1 text-[12px] leading-[1.5] text-v2-ink3"><span className="text-v2-ink2">What it costs: </span>{costs}</p>}

      <div className="mt-auto pt-4">
        <DraftButton
          variant={lead ? 'primary' : 'row'}
          size={lead ? 'lg' : 'md'}
          disabled={!canDraft}
          reason={draftReason}
          onClick={() => onDraft(p)}
          label={lead ? `Draft ${p.name.split(' ').slice(-1)[0]}` : 'Draft'}
          className="w-full"
        />
      </div>
    </article>
  )
}

export default function DecidePanel({ engine, myTurn, canDraft, draftReason, onDraft, onOpen, nextOverall, onBrowse, phone }) {
  if (engine.draftOver()) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div>
          <span className="block font-telemetry text-[32px] font-extrabold uppercase italic text-v2-ink">Nothing left to decide</span>
          <span className="mt-1 block text-[14px] text-v2-ink2">The draft is complete — the report has the verdict.</span>
        </div>
      </div>
    )
  }
  const d = readDecide(engine, nextOverall)
  const queued = new Set(engine.queue() || [])
  const available = engine.board().filter((p) => !p.drafted).length

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={`mx-auto flex max-w-[1180px] flex-col gap-5 ${phone ? 'p-3' : 'p-5'}`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Kicker tone="text-v2-ink2">{myTurn ? 'Your pick' : 'While you wait'}</Kicker>
            <h2 className="mt-1 font-telemetry text-[34px] font-extrabold uppercase italic leading-[0.9] text-v2-ink">What Juke would do</h2>
            <p className="mt-1.5 max-w-[60ch] text-[13px] text-v2-ink2">
              {myTurn
                ? 'Three options, ranked by value, need and risk — and what each one leaves behind.'
                : `Not your turn yet. These are the three Juke would take for you now, and how likely each is to last to pick ${nextOverall ?? '—'}.`}
            </p>
          </div>
          <button type="button" onClick={onBrowse} className={`min-h-[40px] rounded-[9px] px-3.5 text-[13px] font-medium text-v2-ink ring-1 ring-inset ring-white/[0.12] hover:bg-white/[0.04] ${FOCUS}`}>
            Browse all {available} players
          </button>
        </div>

        {d.candidates.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
            {d.candidates.map((c, i) => (
              <Card
                key={c.player.name}
                c={c}
                lead={i === 0}
                engine={engine}
                canDraft={canDraft}
                draftReason={draftReason}
                onDraft={onDraft}
                onOpen={onOpen}
                queued={queued.has(c.player.name)}
                counts={d.counts}
                nextOverall={nextOverall}
                myTurn={myTurn}
              />
            ))}
          </div>
        ) : (
          <Panel className="p-5 text-[13px] text-v2-ink2">Nothing left worth ranking.</Panel>
        )}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Panel className="p-4">
            <div className="flex items-baseline justify-between gap-2">
              <Kicker tone="text-v2-ink2">Still here at pick {nextOverall ?? '—'}?</Kicker>
              <span className="text-[11px] text-v2-ink3">the players the board ranks nearest it</span>
            </div>
            {!d.survivors.length ? (
              <p className="mt-2 text-[12px] text-v2-ink3">You have no pick left in this draft.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {d.survivors.map((s) => {
                  const w = survivalWord(s.survival, false)
                  return (
                    <li key={s.player.name}>
                      <button type="button" onClick={() => onOpen(s.player)} className={`grid min-h-[44px] w-full grid-cols-[auto_minmax(0,1fr)_minmax(60px,30%)_44px] items-center gap-2.5 rounded-[8px] px-1.5 text-left hover:bg-white/[0.03] ${FOCUS}`}>
                        <PosChip pos={s.player.pos} />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] text-v2-ink">{s.player.name}</span>
                          <span className={`block font-mono text-[10px] ${w.tone}`}>{w.label} · VORP {signedInt(s.vorp)}</span>
                        </span>
                        <span className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                          {s.survival != null && <span className="absolute inset-y-0 left-0 rounded-full bg-v2-cyan/80" style={{ width: `${Math.max(2, s.survival * 100)}%` }} />}
                        </span>
                        <span className="text-right font-mono text-[12px] tabular-nums text-v2-ink">{pct(s.survival)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          <div className="flex flex-col gap-3">
            <Panel className="p-4">
              <Kicker tone="text-v2-ink2">Tier ladder · the top tier at each position</Kicker>
              <ul className="mt-2 space-y-1.5">
                {d.tierLadder.map((t) => {
                  const caption = t.total === 0 ? 'none this deep' : t.remaining === 0 ? 'tier gone' : t.remaining <= 4 ? `cliff after ${t.remaining} more` : 'no rush'
                  const warn = t.total > 0 && t.remaining > 0 && t.remaining <= 4
                  return (
                    <li key={t.pos} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2.5">
                      <PosChip pos={t.pos} />
                      <span className="flex h-2 gap-[3px]" aria-label={`${t.remaining} of ${t.total} left`}>
                        {Array.from({ length: Math.max(t.total, 1) }).map((_, i) => (
                          <span key={i} className={`h-full flex-1 rounded-[2px] ${i < t.remaining ? 'bg-v2-ink2' : 'bg-white/[0.08]'}`} />
                        ))}
                      </span>
                      <span className={`font-mono text-[11px] ${warn ? 'text-v2-warn' : 'text-v2-ink3'}`}>
                        {caption}{t.drop != null && t.remaining > 0 ? ` · drop ${t.drop}` : ''}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </Panel>
            <Panel className="p-4">
              <Kicker tone="text-v2-ink2">The room</Kicker>
              <p className="mt-2 text-[13px] leading-[1.5] text-v2-ink2">
                {d.run
                  ? <>A <span className="font-semibold text-v2-ink">{d.run.pos} run</span>: {d.run.count} of the last six picks.{d.run.depth != null ? ` ${d.run.depth} starters’ worth left at the position.` : ''}</>
                  : 'No run on — the last six picks are spread across positions.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {d.needs.map((n) => (
                  <span key={n.pos} className={`rounded-[6px] px-2 py-1 font-mono text-[11px] tabular-nums ring-1 ring-inset ${n.short ? 'text-v2-ink ring-white/[0.14]' : 'text-v2-ink3 ring-white/[0.06]'}`}>
                    {n.pos === 'DST' ? 'D/ST' : n.pos} {n.text}
                  </span>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  )
}
