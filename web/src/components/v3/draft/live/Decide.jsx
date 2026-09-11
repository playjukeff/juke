import { ordinal, readDecide, reasonFor, whatItCosts } from '../../../v2/cockpit/cockpitData.js'
import { Delta, Headline, Label, PosTag, Sheet, ValueBar, cx } from '../../ui.jsx'
import { DraftButton, FOCUS, Headshot, InjuryTag, StarButton } from '../kit.jsx'

/* Decide: what Juke would do with this pick, and what waiting costs.

   The three calls are engine.suggestions('ALL') — never the position chip.
   Their labels and the sentences under them are DraftDecideScreen.jsx's,
   read through cockpitData.js with the same two thresholds, so a candidate
   cannot be "Scarcest" here and "Also available" one view over. The
   survival numbers are survivalProbability() — FFC's real ADP dispersion,
   not a simulation — asked against your NEXT pick. */

function pct(v) {
  return v == null ? '—' : `${Math.round(v * 100)}%`
}

/* How likely he lasts, in words. Caution below the line where waiting is a
   real risk; ink above it. Never gain/cost — a survival chance has no
   direction of its own. */
function survivalWord(s, actionable) {
  if (s == null) return { label: 'No market read', tone: 'text-v3-ink3' }
  if (s < 0.2) return { label: actionable ? 'Take him now' : 'Likely gone', tone: 'font-bold text-v3-warn' }
  if (s < 0.65) return { label: 'Coin flip', tone: 'text-v3-warn' }
  return { label: 'Safe to wait', tone: 'text-v3-ink' }
}

function Card({ c, lead, engine, canDraft, draftReason, onDraft, onOpen, queued, counts, nextOverall, myTurn }) {
  const p = c.player
  const word = survivalWord(c.survival, myTurn)
  const does = c.fit && c.fit.startsNow ? `Fills your ${ordinal(c.fit.have + 1)} ${p.pos} slot.` : `Bench depth at ${p.pos}.`
  const costs = whatItCosts(engine, p, counts, nextOverall)
  return (
    <Sheet as="article" code={c.label} aside={lead ? 'the call' : ''} className={cx('flex min-w-0 flex-col', lead && 'border-v3-ink shadow-[inset_0_0_0_1px_rgb(var(--v3-ink))]')} bodyClass="flex flex-1 flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={() => onOpen(p)} className={cx('flex min-w-0 items-center gap-3 rounded-[4px] text-left', FOCUS)}>
          <Headshot src={engine.photoUrl(p)} name={p.name} size={44} />
          <span className="min-w-0">
            <span className="block truncate text-[18px] font-extrabold leading-tight tracking-[-0.01em] text-v3-ink">{p.name}</span>
            <span className="mt-1 flex items-center gap-1.5">
              <PosTag pos={p.pos} />
              <span className="truncate font-figure text-[12px] tabular-nums text-v3-ink3">{p.team} · bye {p.bye || '—'}</span>
              <InjuryTag code={p.inj} />
            </span>
          </span>
        </button>
        <StarButton on={queued} onClick={() => engine.queueToggle(p.name)} name={p.name} />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-v3-rule pt-3">
        <div><dt><Label className="text-[11px]">Juke</Label></dt><dd className="mt-0.5 font-figure text-[22px] font-bold tabular-nums text-v3-ink">{c.juke == null ? '—' : Math.round(c.juke)}</dd></div>
        <div><dt><Label className="text-[11px]"><abbr title="Projected points over a replacement starter" className="no-underline">VORP</abbr></Label></dt><dd className="mt-0.5 text-[22px]"><Delta value={c.vorp} /></dd></div>
        <div><dt><Label className="text-[11px]">In tier</Label></dt><dd className="mt-0.5 font-figure text-[22px] font-bold tabular-nums text-v3-ink">{c.tierLeft ?? '—'}</dd></div>
      </dl>
      <div className="mt-3 rounded-[4px] bg-v3-paper px-3 py-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <Label className="text-[11px]">If you wait{nextOverall ? ` · pick ${nextOverall}` : ''}</Label>
          <span className={cx('whitespace-nowrap font-figure text-[13px]', word.tone)}>{word.label}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <ValueBar value={c.survival} max={1} tone="neutral" className="flex-1" />
          <span className="w-10 text-right font-figure text-[13px] font-bold tabular-nums text-v3-ink">{pct(c.survival)}</span>
        </div>
        <span className="mt-1 block text-[12px] text-v3-ink3">chance he is still on the board</span>
      </div>
      <p className="mt-3 text-[14px] font-semibold leading-[1.45] text-v3-ink">{reasonFor(c)}</p>
      <p className="mt-1 text-[13px] leading-[1.5] text-v3-ink2">{does}</p>
      {costs && <p className="mt-1 text-[13px] leading-[1.5] text-v3-ink2"><span className="font-semibold text-v3-ink">What it costs: </span>{costs}</p>}
      <div className="mt-auto pt-4">
        <DraftButton rank={lead ? 'call' : 'row'} size={lead ? 'lg' : 'md'} disabled={!canDraft} reason={draftReason} onClick={() => onDraft(p)} label={lead ? `Draft ${p.name.split(' ').slice(-1)[0]}` : 'Draft'} className="w-full" />
      </div>
    </Sheet>
  )
}

export default function Decide({ engine, myTurn, canDraft, draftReason, onDraft, onOpen, nextOverall, onBrowse, phone }) {
  if (engine.draftOver()) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div>
          <Headline as="h2" size="section">Nothing left to decide</Headline>
          <p className="mt-2 text-[15px] text-v3-ink2">The draft is complete — the report has the verdict.</p>
        </div>
      </div>
    )
  }
  const d = readDecide(engine, nextOverall)
  const queued = new Set(engine.queue() || [])
  const available = engine.board().filter((p) => !p.drafted).length

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={cx('mx-auto flex max-w-[1180px] flex-col gap-5', phone ? 'p-3' : 'p-5')}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Label>{myTurn ? 'Your pick' : 'While you wait'}</Label>
            <Headline as="h2" size="section" className="mt-1">What Juke would do</Headline>
            <p className="mt-1.5 max-w-[62ch] text-[15px] leading-[1.5] text-v3-ink2">
              {myTurn
                ? 'Three options, ranked by value, need and risk — and what each one leaves behind.'
                : `Not your turn yet. These are the three Juke would take for you now, and how likely each is to last to pick ${nextOverall ?? '—'}.`}
            </p>
          </div>
          <button type="button" onClick={onBrowse} className={cx('min-h-[44px] rounded-[6px] border border-v3-rule bg-v3-sheet px-4 text-[14px] font-semibold text-v3-ink hover:border-v3-ink3', FOCUS)}>
            Browse all {available} players
          </button>
        </div>

        {d.candidates.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
            {d.candidates.map((c, i) => (
              <Card key={c.player.name} c={c} lead={i === 0} engine={engine} canDraft={canDraft} draftReason={draftReason} onDraft={onDraft} onOpen={onOpen} queued={queued.has(c.player.name)} counts={d.counts} nextOverall={nextOverall} myTurn={myTurn} />
            ))}
          </div>
        ) : <Sheet band={false}><p className="text-[14px] text-v3-ink2">Nothing left worth ranking.</p></Sheet>}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Sheet code={`Still here at pick ${nextOverall ?? '—'}?`} aside="nearest on the board" bodyClass="p-3">
            {!d.survivors.length ? <p className="text-[13px] text-v3-ink2">You have no pick left in this draft.</p> : (
              <ul className="space-y-1">
                {d.survivors.map((s) => {
                  const w = survivalWord(s.survival, false)
                  return (
                    <li key={s.player.name}>
                      <button type="button" onClick={() => onOpen(s.player)} className={cx('grid min-h-[44px] w-full grid-cols-[auto_minmax(0,1fr)_minmax(56px,30%)_44px] items-center gap-2.5 rounded-[4px] px-1.5 text-left hover:bg-v3-paper', FOCUS)}>
                        <PosTag pos={s.player.pos} />
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-semibold text-v3-ink">{s.player.name}</span>
                          <span className="block font-figure text-[12px]"><span className={w.tone}>{w.label}</span> <span className="text-v3-ink3">·</span> <Delta value={s.vorp} className="text-[12px]" /></span>
                        </span>
                        <ValueBar value={s.survival} max={1} tone="neutral" />
                        <span className="text-right font-figure text-[13px] font-bold tabular-nums text-v3-ink">{pct(s.survival)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Sheet>

          <div className="flex flex-col gap-4">
            <Sheet code="Tier ladder" aside="top tier at each position" bodyClass="p-4">
              <ul className="space-y-2">
                {d.tierLadder.map((t) => {
                  const caption = t.total === 0 ? 'none this deep' : t.remaining === 0 ? 'tier gone' : t.remaining <= 4 ? `cliff after ${t.remaining} more` : 'no rush'
                  const warn = t.total > 0 && t.remaining > 0 && t.remaining <= 4
                  return (
                    <li key={t.pos} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5">
                      <PosTag pos={t.pos} />
                      <span className="flex h-2.5 gap-[3px]" role="img" aria-label={`${t.remaining} of ${t.total} left`}>
                        {Array.from({ length: Math.max(t.total, 1) }).map((_, i) => <span key={i} className={cx('h-full flex-1 rounded-[2px]', i < t.remaining ? 'bg-v3-ink' : 'bg-v3-well')} />)}
                      </span>
                      <span className={cx('font-figure text-[12px]', warn ? 'font-bold text-v3-warn' : 'text-v3-ink2')}>
                        {caption}{t.drop != null && t.remaining > 0 ? ` · drop ${t.drop}` : ''}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </Sheet>
            <Sheet code="The room" aside="last six picks" bodyClass="p-4">
              <p className="text-[14px] leading-[1.5] text-v3-ink2">
                {d.run
                  ? <>A <span className="font-bold text-v3-ink">{d.run.pos} run</span>: {d.run.count} of the last six picks.{d.run.depth != null ? ` ${d.run.depth} starters’ worth left at the position.` : ''}</>
                  : 'No run on — the last six picks are spread across positions.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {d.needs.map((n) => (
                  <span key={n.pos} className={cx('rounded-[4px] border px-2 py-1 font-figure text-[12px] tabular-nums', n.short ? 'border-v3-ink font-bold text-v3-ink' : 'border-v3-rule text-v3-ink3')}>
                    {n.pos === 'DST' ? 'D/ST' : n.pos} {n.text}
                  </span>
                ))}
              </div>
            </Sheet>
          </div>
        </div>
        <p className="text-[12px] text-v3-ink3">“Likely gone” means under a 20% chance he lasts, read off the market’s own spread of where this player goes — not a simulation.</p>
      </div>
    </div>
  )
}
