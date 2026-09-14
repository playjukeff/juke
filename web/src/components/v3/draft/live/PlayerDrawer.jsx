import { useEffect, useRef, useState } from 'react'
import { STAT_COLUMNS, lastsTone, statValue } from '../../../playerColumns.js'
import { INJURY_META } from '../../../draftRoomPositions.js'
import { readersFor } from '../../../v2/cockpit/cockpitData.js'
import { Delta, Label, PosTag, cx } from '../../ui.jsx'
import { DraftButton, FOCUS, Glyph, Headshot, InjuryTag, useDialogFocus } from '../kit.jsx'
import { DraftFit, Depth, GameLogs, News, OurRead, Projections, Usage } from './Research.jsx'

/* A player, in depth, without leaving the pick.

   The head is the six numbers a pick turns on, read through
   playerColumns.js's statValue() so they cannot disagree with the same
   player's row in the pool; the market sentence off survivalProbability();
   and the two actions. Below it the seven research tabs, each a reading of
   one bridge function (see Research.jsx). One tab body is mounted at a time
   and only while the drawer is open — Latest News spends a request against
   a monthly allowance. The tab list is a filtered literal, so reading order
   is source order and a tab with nothing to say is absent, not empty. */

const COL = Object.fromEntries(STAT_COLUMNS.map((c) => [c.key, c]))
const STRIP = [['pts', 'Pts'], ['vorp', 'Over repl.'], ['juke', 'Juke'], ['lasts', 'Lasts'], ['adp', 'ADP'], ['bye', 'Bye']]
const tabList = ({ fit, usage }) => ['Our read', fit && 'Draft fit', 'Projections', usage && 'Usage', 'Game logs', 'Latest news', 'Depth chart'].filter(Boolean)

export default function PlayerDrawer({ engine, player, onClose, canDraft, draftReason, onDraft, nextOverall, phone }) {
  const panel = useRef(null)
  const closeRef = useRef(null)
  const [tab, setTab] = useState('Our read')
  useDialogFocus(!!player, onClose, panel, closeRef)
  useEffect(() => { if (player) setTab('Our read') }, [player && player.name])
  if (!player) return null

  const fit = engine.draftFit(player)
  const usage = engine.usageFor ? engine.usageFor(player) : null
  const tabs = tabList({ fit, usage })
  const current = tabs.includes(tab) ? tab : tabs[0]
  const readers = readersFor(engine, 'projected', nextOverall)
  const queued = (engine.queue() || []).includes(player.name)
  const watched = engine.watchlisted ? engine.watchlisted(player) : false
  const survival = engine.survivalProbability(player, nextOverall)
  const inj = INJURY_META[player.inj]
  const pick = (engine.picks() || []).find((x) => x.player.name === player.name)
  const titleId = 'v3-player-drawer-title'

  const body =
    current === 'Our read' ? <OurRead engine={engine} player={player} />
      : current === 'Draft fit' ? <DraftFit fit={fit} player={player} />
        : current === 'Projections' ? <Projections summary={engine.projectionSummary(player)} record={engine.projectionRecord(player)} />
          : current === 'Usage' ? <Usage usage={usage} />
            : current === 'Game logs' ? <GameLogs engine={engine} player={player} />
              : current === 'Latest news' ? <News engine={engine} player={player} />
                : <Depth engine={engine} player={player} />

  return (
    <div className="fixed inset-0 z-[80]" role="presentation">
      <style>{'@keyframes v3pd{from{transform:translateX(32px);opacity:.4}to{transform:none;opacity:1}}@keyframes v3ps{from{transform:translateY(40px);opacity:.4}to{transform:none;opacity:1}}'}</style>
      <div className="absolute inset-0 bg-v3-shade/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={phone
          ? 'absolute inset-x-0 bottom-0 flex max-h-[90dvh] flex-col overflow-hidden rounded-t-[6px] bg-v3-sheet motion-safe:animate-[v3ps_200ms_ease-out]'
          : 'absolute inset-y-0 right-0 flex w-[min(660px,100vw)] flex-col overflow-hidden bg-v3-sheet shadow-[-24px_0_48px_-24px_rgb(var(--v3-shade)/0.35)] motion-safe:animate-[v3pd_200ms_ease-out]'}
        style={phone ? { paddingBottom: 'env(safe-area-inset-bottom)' } : undefined}
      >
        <div className="flex min-h-[40px] shrink-0 items-center justify-between gap-3 bg-v3-band pl-4 pr-1 text-white">
          <span className="truncate font-figure text-[12px] font-bold uppercase tracking-[0.14em]">{pick ? `Taken · pick ${pick.overall}` : 'Scouting report'}</span>
          <div className="flex shrink-0 items-center">
            {engine.watchlistToggle && (
              <button type="button" onClick={() => engine.watchlistToggle(player.name)} aria-pressed={!!watched} aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'} title={watched ? 'On your watchlist' : 'Add to watchlist'} className={cx('grid h-10 w-10 place-items-center rounded-[4px] text-white hover:bg-v3-bandSoft', FOCUS)}>
                <Glyph name="bookmark" className="h-4 w-4" filled={!!watched} />
              </button>
            )}
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close player" className={cx('grid h-10 w-10 place-items-center rounded-[4px] text-white hover:bg-v3-bandSoft', FOCUS)}>
              <Glyph name="close" className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="border-b border-v3-rule p-4 sm:p-5">
            <div className="flex items-start gap-3.5">
              <Headshot src={engine.photoUrl(player)} name={player.name} size={phone ? 56 : 72} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <PosTag pos={player.pos} />
                  <span className="font-figure text-[13px] uppercase tracking-[0.1em] text-v3-ink2">{player.team || 'Free agent'}</span>
                  <InjuryTag code={player.inj} />
                </div>
                <h2 id={titleId} className="mt-1.5 font-sheet text-[28px] font-black leading-[1.05] tracking-[-0.025em] text-v3-ink sm:text-[34px]">{player.name}</h2>
                <span className="mt-1 block font-figure text-[12px] uppercase tracking-[0.08em] text-v3-ink3">
                  {[player.bye ? `Bye ${player.bye}` : null, player.tier != null ? `Tier ${player.tier}` : null, `Board #${player.overall}`, inj ? inj.label : null].filter(Boolean).join(' · ')}
                </span>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {STRIP.map(([key, label]) => {
                const raw = statValue(COL[key], player, readers)
                let content = raw == null ? <span className="text-v3-ink3">—</span> : String(raw)
                if (key === 'vorp' && raw != null) content = <Delta value={raw} />
                if (key === 'lasts' && raw != null) content = <span className={lastsTone(raw) === 'rose' ? 'text-v3-warn' : ''}>{raw}%</span>
                return (
                  <div key={key} className="rounded-[4px] bg-v3-paper px-2.5 py-2">
                    <dt><Label className="text-[11px]">{label}</Label></dt>
                    <dd className="mt-0.5 font-figure text-[20px] font-bold leading-none tabular-nums text-v3-ink">{content}</dd>
                  </div>
                )
              })}
            </dl>

            {pick ? (
              <p className="mt-3 rounded-[4px] bg-v3-paper px-3 py-2 text-[14px] text-v3-ink2">Taken at pick {pick.overall} by {pick.slot === engine.mySlot() ? 'you' : engine.teamLabel(pick.slot)}.</p>
            ) : survival != null && nextOverall != null ? (
              <p className={cx('mt-3 rounded-[4px] px-3 py-2 text-[14px]', survival < 0.4 ? 'bg-v3-warnWash text-v3-warn' : 'bg-v3-paper text-v3-ink2')}>
                {survival < 0.4 ? `Gone before pick ${nextOverall} in ${Math.round((1 - survival) * 100)}% of boards.` : `Still there at pick ${nextOverall} in ${Math.round(survival * 100)}% of boards.`}
              </p>
            ) : null}

            {!pick && (
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => engine.queueToggle(player.name)} aria-pressed={queued} className={cx('inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-[6px] border text-[15px] font-semibold', FOCUS, queued ? 'border-v3-band bg-v3-band text-white' : 'border-v3-rule bg-v3-sheet text-v3-ink hover:border-v3-ink3')}>
                  <Glyph name="star" className="h-4 w-4" filled={queued} /> {queued ? 'In your queue' : 'Add to queue'}
                </button>
                <DraftButton rank="call" size="lg" disabled={!canDraft} reason={draftReason} onClick={() => { onDraft(player); onClose() }} className="flex-1" label={`Draft ${player.name.split(' ').slice(-1)[0]}`} />
              </div>
            )}
          </div>

          <div role="tablist" aria-label="Research" className="sticky top-0 z-10 flex overflow-x-auto border-b border-v3-rule bg-v3-sheet [scrollbar-width:none]">
            {tabs.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={current === t} onClick={() => setTab(t)} className={cx('relative min-h-[44px] shrink-0 whitespace-nowrap px-3.5 text-[14px] font-semibold', FOCUS, current === t ? 'text-v3-ink' : 'text-v3-ink3 hover:text-v3-ink')}>
                {t}
                {current === t && <span className="absolute inset-x-3 bottom-0 h-[3px] bg-v3-ink" aria-hidden="true" />}
              </button>
            ))}
          </div>
          <div role="tabpanel" aria-label={current} className="bg-v3-paper p-4 sm:p-5">{body}</div>
        </div>
      </div>
    </div>
  )
}
