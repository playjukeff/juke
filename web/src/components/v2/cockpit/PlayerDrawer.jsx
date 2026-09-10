import { useEffect, useRef, useState } from 'react'
import { STAT_COLUMNS, lastsTone, statValue } from '../../playerColumns.js'
import OurReadTab from '../../OurReadTab.jsx'
import ProjectionsTab from '../../ProjectionsTab.jsx'
import GameLogsTab from '../../GameLogsTab.jsx'
import LatestNewsTab from '../../LatestNewsTab.jsx'
import DepthChartTab from '../../DepthChartTab.jsx'
import DraftFitTab from '../../DraftFitTab.jsx'
import UsageTab from '../../UsageTab.jsx'
import { INJURY_META } from '../../draftRoomPositions.js'
import { Kicker, PosChip } from '../v2ui.jsx'
import { readersFor, signedInt } from './cockpitData.js'
import { useDialogFocus } from './useCockpit.js'
import { DraftButton, FOCUS, Headshot, InjuryTag } from './parts.jsx'
import { IconBookmark, IconClose, IconStar } from './icons.jsx'

/* A player, in depth, without leaving the pick.

   The head of the drawer is v2's own: the six numbers a pick turns on,
   read through playerColumns.js's statValue() so they cannot disagree with
   the same player's row in the pool, the market sentence off
   survivalProbability(), and the two actions. Below it are production's
   seven research tab BODIES, reused as they are — Our Read, Draft Fit,
   Projections, Usage, Game Logs, Latest News, Depth Chart. Each is a
   reading of a bridge function (jukeReadout, draftFit, projectionSummary,
   usageFor, gameLogFor, Live.news, depthChartFor) with years of fixes in
   it; restyling seven tables would be seven places for the same number to
   start disagreeing. They carry production's own ink tokens, which read on
   v2's darker panel.

   One tab body is mounted at a time and only while the drawer is open —
   Latest News spends a request against a monthly allowance. */

const COL = Object.fromEntries(STAT_COLUMNS.map((c) => [c.key, c]))
const STRIP = [
  ['pts', 'Pts'],
  ['vorp', 'VORP'],
  ['juke', 'Juke'],
  ['lasts', 'Lasts'],
  ['adp', 'ADP'],
  ['bye', 'Bye'],
]

const tabList = ({ fit, usage }) => ['Our Read', fit && 'Draft Fit', 'Projections', usage && 'Usage', 'Game Logs', 'Latest News', 'Depth Chart'].filter(Boolean)

export default function PlayerDrawer({ engine, player, onClose, canDraft, draftReason, onDraft, nextOverall, phone }) {
  const panel = useRef(null)
  const [tab, setTab] = useState('Our Read')
  const open = !!player
  useDialogFocus(open, onClose, panel)
  useEffect(() => { if (player) setTab('Our Read') }, [player && player.name])

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

  const body =
    current === 'Our Read' ? <OurReadTab engine={engine} player={player} />
      : current === 'Draft Fit' ? <DraftFitTab fit={fit} player={player} />
        : current === 'Projections' ? <ProjectionsTab summary={engine.projectionSummary(player)} record={engine.projectionRecord(player)} />
          : current === 'Usage' ? <UsageTab usage={usage} />
            : current === 'Game Logs' ? <GameLogsTab engine={engine} player={player} />
              : current === 'Latest News' ? <LatestNewsTab engine={engine} player={player} />
                : <DepthChartTab engine={engine} player={player} />

  const titleId = 'v2-player-drawer-title'

  return (
    <div className="fixed inset-0 z-[80]" role="presentation">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={
          phone
            ? 'absolute inset-x-0 bottom-0 flex max-h-[90dvh] flex-col overflow-hidden rounded-t-[20px] bg-v2-panel ring-1 ring-inset ring-white/[0.1] motion-safe:animate-[v2sheet_220ms_ease-out]'
            : 'absolute inset-y-0 right-0 flex w-[min(640px,100vw)] flex-col overflow-hidden bg-v2-panel shadow-[-24px_0_60px_-20px_rgba(0,0,0,0.8)] ring-1 ring-inset ring-white/[0.08] motion-safe:animate-[v2drawer_220ms_ease-out]'
        }
        style={phone ? { paddingBottom: 'env(safe-area-inset-bottom)' } : undefined}
      >
        <style>{'@keyframes v2drawer{from{transform:translateX(24px);opacity:.6}to{transform:none;opacity:1}}@keyframes v2sheet{from{transform:translateY(40px);opacity:.6}to{transform:none;opacity:1}}'}</style>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="border-b border-white/[0.07] p-4 sm:p-5">
            <div className="flex items-start gap-3.5">
              <Headshot src={engine.photoUrl(player)} name={player.name} pos={player.pos} size={phone ? 56 : 72} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <PosChip pos={player.pos} />
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-v2-ink2">{player.team || 'Free agent'}</span>
                  <InjuryTag code={player.inj} />
                </div>
                <h2 id={titleId} className="mt-1.5 font-telemetry text-[30px] font-extrabold uppercase italic leading-[0.92] text-v2-ink sm:text-[36px]">{player.name}</h2>
                <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink3">
                  {[player.bye ? `Bye ${player.bye}` : null, player.tier != null ? `Tier ${player.tier}` : null, `Board #${player.overall}`, inj ? inj.label : null].filter(Boolean).join(' · ')}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {engine.watchlistToggle && (
                  <button
                    type="button"
                    onClick={() => engine.watchlistToggle(player.name)}
                    aria-pressed={watched}
                    aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
                    title={watched ? 'On your watchlist' : 'Add to watchlist'}
                    className={`grid h-11 w-11 place-items-center rounded-[10px] ring-1 ring-inset ring-white/[0.1] ${FOCUS} ${watched ? 'text-v2-cyan' : 'text-v2-ink2 hover:text-v2-ink'}`}
                  >
                    <IconBookmark filled={watched} />
                  </button>
                )}
                <button type="button" onClick={onClose} data-autofocus aria-label="Close player" className={`grid h-11 w-11 place-items-center rounded-[10px] text-v2-ink2 ring-1 ring-inset ring-white/[0.1] hover:text-v2-ink ${FOCUS}`}>
                  <IconClose />
                </button>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {STRIP.map(([key, label]) => {
                const raw = statValue(COL[key], player, readers)
                let text = raw == null ? '—' : String(raw)
                let tone = 'text-v2-ink'
                if (key === 'vorp' && raw != null) { text = signedInt(raw); tone = raw > 0 ? 'text-v2-volt' : raw < 0 ? 'text-v2-loss' : 'text-v2-ink' }
                if (key === 'juke' && raw != null) tone = 'text-v2-cyan'
                if (key === 'lasts' && raw != null) { text = `${raw}%`; const t = lastsTone(raw); tone = t === 'rose' ? 'text-v2-loss' : t === 'amber' ? 'text-v2-warn' : 'text-v2-ink' }
                if (raw == null) tone = 'text-v2-ink3'
                return (
                  <div key={key} className="rounded-[10px] bg-v2-inset px-2.5 py-2 ring-1 ring-inset ring-white/[0.05]">
                    <dt><Kicker>{label}</Kicker></dt>
                    <dd className={`mt-0.5 font-telemetry text-[22px] font-bold leading-none tabular-nums ${tone}`}>{text}</dd>
                  </div>
                )
              })}
            </dl>

            {pick ? (
              <p className="mt-3 rounded-[10px] bg-white/[0.03] px-3 py-2 text-[13px] text-v2-ink2 ring-1 ring-inset ring-white/[0.05]">
                Taken at pick {pick.overall} by {pick.slot === engine.mySlot() ? 'you' : engine.teamLabel(pick.slot)}.
              </p>
            ) : survival != null && nextOverall != null ? (
              <p className={`mt-3 rounded-[10px] bg-white/[0.03] px-3 py-2 text-[13px] ring-1 ring-inset ring-white/[0.05] ${survival < 0.4 ? 'text-v2-loss' : 'text-v2-ink2'}`}>
                {survival < 0.4
                  ? `Gone before pick ${nextOverall} in ${Math.round((1 - survival) * 100)}% of boards.`
                  : `Still there at pick ${nextOverall} in ${Math.round(survival * 100)}% of boards.`}
              </p>
            ) : null}

            {!pick && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => engine.queueToggle(player.name)}
                  aria-pressed={queued}
                  className={`inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-[10px] text-[14px] font-semibold ring-1 ring-inset ${FOCUS} ${
                    queued ? 'text-v2-cyan ring-v2-cyan/40' : 'text-v2-ink ring-white/[0.14] hover:bg-white/[0.04]'
                  }`}
                >
                  <IconStar filled={queued} /> {queued ? 'In your queue' : 'Add to queue'}
                </button>
                <DraftButton variant="primary" size="lg" disabled={!canDraft} reason={draftReason} onClick={() => { onDraft(player); onClose() }} className="flex-1" label={`Draft ${player.name.split(' ').slice(-1)[0]}`} />
              </div>
            )}
          </div>

          <div role="tablist" aria-label="Research" className="sticky top-0 z-10 flex overflow-x-auto border-b border-white/[0.07] bg-v2-panel [scrollbar-width:none]">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={current === t}
                onClick={() => setTab(t)}
                className={`relative shrink-0 whitespace-nowrap px-3.5 py-3 text-[13px] font-medium ${FOCUS} ${current === t ? 'text-v2-ink' : 'text-v2-ink3 hover:text-v2-ink2'}`}
              >
                {t}
                {current === t && <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-v2-volt" aria-hidden="true" />}
              </button>
            ))}
          </div>
          <div role="tabpanel" aria-label={current} className="p-4 sm:p-5">{body}</div>
        </div>
      </div>
    </div>
  )
}
