import { useEffect, useState } from 'react'
import { useMinWidth } from '../hooks/useBreakpoint.js'
import { AnimatePresence, motion } from 'framer-motion'
import { Bookmark, Star, X } from 'lucide-react'
import { POS_BADGE, INJURY_META } from './draftRoomPositions.js'
import { useEngine } from '../hooks/useJukeEngine.js'
import { STAT_COLUMNS, statValue, lastsTone } from './playerColumns.js'
import OurReadTab from './OurReadTab.jsx'
import ProjectionsTab from './ProjectionsTab.jsx'
import GameLogsTab from './GameLogsTab.jsx'
import LatestNewsTab from './LatestNewsTab.jsx'
import DepthChartTab from './DepthChartTab.jsx'
import DraftFitTab from './DraftFitTab.jsx'
import UsageTab from './UsageTab.jsx'

// Two of these are conditional, so the list is built from a single ordered
// literal and filtered rather than spliced by index — the previous version
// reached into BASE_TABS[0] and BASE_TABS.slice(1) to get Draft Fit into
// second place, which silently means something different the moment another
// optional tab joins it.
const tabList = ({ fit, usage }) => [
  'Our Read',
  fit && 'Draft Fit',
  'Projections',
  // Sits after Projections on purpose: Projections says how much he is
  // worth, Usage says why he scored what he scored. Hidden entirely when
  // usageFor() returns null — a defence, an unjoined player, or a run where
  // nflverse was unreachable — because a section nobody asked to wait for is
  // worse as a permanently empty panel than as no panel, which is the rule
  // the news tab already follows.
  usage && 'Usage',
  'Game Logs',
  'Latest News',
  'Depth Chart',
].filter(Boolean)

const COL_BY_KEY = Object.fromEntries(STAT_COLUMNS.map((c) => [c.key, c]))
// The mobile sheet's own stat grid, in the handoff's own reading order —
// row-major over a 3-column grid, not the table's column order. Every
// value still comes from statValue()/lastsTone(), the exact readers the
// desktop table and PlayerHub's list already use, so a number here can
// never disagree with the identical player's row anywhere else on screen.
const MOBILE_STAT_KEYS = ['pts', 'vorp', 'juke', 'lasts', 'adp', 'bye']
const MOBILE_STAT_LABELS = { pts: 'PTS', vorp: 'VORP', juke: 'JUKE', lasts: 'LASTS', adp: 'ADP', bye: 'BYE' }

// Replaces PlayerProfileDrawer — a slide-in panel that only ever covered
// the Player Queue, and only existed inside PlayerHub, which unmounts on
// the Decide tab. A player's name was clickable in at most one place in
// the app (the queue row itself) because everywhere else had nowhere to
// send the click. This mounts once at DraftRoom.jsx's top level instead,
// alongside DraftInsightsDashboard, so it's reachable from every tab and
// every card that names a player. Same treatment as that dashboard —
// fixed inset-0, dimmed and blurred, centered content — rather than a
// drawer sized to a panel that may not even be on screen: an overlay that
// only has to cover *something specific* doesn't exist here any more, so
// there's no "specific" left for it to be scoped to.
export default function PlayerProfileModal({
  player, onClose, photoFor, initialsFor,
  // Mobile sheet only (see the lg:hidden block below) — the desktop card
  // above needs none of these, it already has engine access of its own via
  // useEngine() plus the six research tabs. pointsFor/vorpFor/valueFor/
  // survivalFor are the identical functions DraftRoom.jsx already hands
  // every other surface (PlayerQueueSidebar, PlayerHub, PlayersTab), passed
  // through rather than recomputed here — the plain projected readers, not
  // the Players tab's own season-toggled versions, since this modal has no
  // season concept of its own and mounts from screens that don't either.
  nextOverall, queuedNames, onToggleQueue, onDraft, myTurn, autopick,
  pointsFor, vorpFor, valueFor, survivalFor,
}) {
  const engine = useEngine()
  const [tab, setTab] = useState('Our Read')

  const fit = engine && player ? engine.draftFit(player) : null
  const usage = engine && engine.usageFor ? engine.usageFor(player) : null
  const TABS = tabList({ fit, usage })

  // Which half of this component is actually alive. `lg:hidden` and its
  // opposite are CSS, and CSS-hidden is still mounted — the exact thing
  // useMinWidth was written for. It matters here because the research tabs
  // now exist on both halves: rendered in both, LatestNewsTab would mount
  // twice for one open and ask the worker for the same player's headlines
  // twice, against a thousand-call monthly allowance. 1024 is Tailwind's
  // `lg`, the breakpoint the two halves already split on.
  const isDesktop = useMinWidth(1024)

  // Built once and rendered in exactly one place. Creating the element is
  // free; mounting it is not, which is the whole point of isDesktop above.
  const tabStrip = (
    <div className="flex shrink-0 overflow-x-auto border-b border-slate-rule">
      {TABS.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setTab(t)}
          className={
            'shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-center text-[11px] font-semibold transition-colors duration-150 lg:px-5 lg:py-3.5 lg:text-sm ' +
            (tab === t ? 'border-teal-400 text-teal-300' : 'border-transparent text-ink-muted hover:text-white/60')
          }
        >
          {t}
        </button>
      ))}
    </div>
  )

  const tabBody = !engine ? null : tab === 'Our Read' ? (
    <OurReadTab engine={engine} player={player} />
  ) : tab === 'Draft Fit' ? (
    <DraftFitTab fit={fit} player={player} />
  ) : tab === 'Projections' ? (
    <ProjectionsTab
      summary={engine.projectionSummary(player)}
      record={engine.projectionRecord(player)}
    />
  ) : tab === 'Usage' ? (
    <UsageTab usage={usage} />
  ) : tab === 'Game Logs' ? (
    <GameLogsTab engine={engine} player={player} />
  ) : tab === 'Latest News' ? (
    <LatestNewsTab engine={engine} player={player} />
  ) : (
    <DepthChartTab engine={engine} player={player} />
  )

  useEffect(() => {
    if (!TABS.includes(tab)) setTab(TABS[0])
  }, [TABS.join('|'), tab])

  useEffect(() => {
    if (player) setTab('Our Read')
  }, [player?.id || player?.name])

  useEffect(() => {
    if (!player) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [player, onClose])

  const inj = player ? INJURY_META[player.inj] : null

  // Mobile-only derived values — guarded on `player` the same way `inj` is
  // above, computed unconditionally rather than inside the JSX below since
  // JSX can't hold a `const`. Cheap even when unused (desktop-only opens
  // never read them), and keeping them beside `inj`/`fit` rather than
  // inlined in the sheet's own markup is what let the sheet below stay a
  // single readable return.
  const queued = player && queuedNames ? queuedNames.has(player.name) : false
  const survival = player && survivalFor ? survivalFor(player) : null
  const risky = survival != null && survival < 0.4
  // Reuses Card()'s own one-line phrasing from DraftDecideScreen.jsx
  // (the "gone before / still there" sentence, same 40% threshold) rather
  // than writing a second version of the same read — see that file's own
  // comment on why 0.4 is the line between a real risk and a safe wait.
  const marketSentence = survival == null || nextOverall == null
    ? null
    : risky
      ? `Gone before pick ${nextOverall} in ${Math.round((1 - survival) * 100)}% of boards.`
      : `Still there at ${nextOverall} in ${Math.round(survival * 100)}% of boards.`
  const canDraft = !!myTurn && !autopick
  const draftTitle = !myTurn ? 'Not your turn' : autopick ? 'Disable Autopick to draft' : undefined
  const statCtx = { pointsFor, vorpFor, valueFor, survivalFor, projOf: () => null }
  const mobileStats = player
    ? MOBILE_STAT_KEYS.map((key) => {
        const raw = statValue(COL_BY_KEY[key], player, statCtx)
        if (key === 'lasts') {
          const t = lastsTone(raw)
          const tone = t === 'rose' ? 'text-rose-300' : t === 'amber' ? 'text-amber-300' : 'text-ink-soft'
          return { key, label: MOBILE_STAT_LABELS[key], display: raw == null ? '—' : raw + '%', tone }
        }
        const tone = key === 'vorp' || key === 'juke' ? 'text-teal-300' : 'text-white'
        return { key, label: MOBILE_STAT_LABELS[key], display: raw == null ? '—' : String(raw), tone }
      })
    : []

  return (
    <AnimatePresence>
      {player && (
        <motion.div
          key={player.id || player.name}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[70] overflow-y-auto bg-slate/97 backdrop-blur-md"
          onClick={onClose}
        >
          {/* mx-auto max-w-2xl, the same "full-bleed backdrop, constrained
              centered column" shape DraftInsightsDashboard already uses —
              a reader closing this and opening that a moment later (a
              board header click, once the draft's over) shouldn't land on
              two different ideas of what an overlay in this app looks
              like. stopPropagation keeps a click inside the card from
              bubbling to the backdrop's own onClose.

              hidden lg:flex: below lg this six-tab research card gives way
              to the simpler action sheet underneath — see its own comment
              for why that's a different design rather than a squeezed copy
              of this one. */}
          <div className="hidden min-h-full items-start justify-center px-4 py-8 sm:px-6 lg:flex">
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-rule bg-slate-panel shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] lg:max-w-3xl xl:max-w-4xl"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-rule p-4 sm:p-5 lg:p-7">
                <div className="flex min-w-0 items-center gap-3 lg:gap-5">
                  <div className="relative flex h-14 w-14 sm:h-16 sm:w-16 lg:h-24 lg:w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-sunk text-sm lg:text-lg font-bold text-ink-soft">
                    {initialsFor(player)}
                    {photoFor(player) && (
                      <img
                        src={photoFor(player)}
                        alt=""
                        loading="lazy"
                        onError={(e) => e.currentTarget.remove()}
                        className={'absolute inset-0 h-full w-full ' + (player.pos === 'DST' ? 'object-contain p-1.5' : 'object-cover')}
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-display text-lg sm:text-xl lg:text-3xl font-bold text-white">{player.name}</p>
                    <p className="flex flex-wrap items-center gap-1.5 lg:gap-2 text-xs lg:text-sm text-ink-muted lg:mt-1.5">
                      <span className={'rounded px-1.5 py-0.5 lg:px-2 lg:py-1 text-[10px] lg:text-xs font-bold ' + (POS_BADGE[player.pos] || 'bg-white/10 text-white/50')}>
                        {player.pos}
                      </span>
                      {player.team}
                      {/* The one non-negotiable fact this card has to carry:
                          whether he's actually available to play. Same
                          codes/severity app.js's own injBadge()/RULED_OUT/
                          RISKY already established — see INJURY_META's own
                          comment on why the hues don't collide with a
                          position badge sitting right beside it. */}
                      {inj && (
                        <span className={'rounded px-1.5 py-0.5 lg:px-2 lg:py-1 text-[10px] lg:text-xs font-bold uppercase tracking-wide ' + inj.cls} title={inj.label}>
                          {player.inj}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 lg:gap-3">
                  {engine && (
                    <button
                      type="button"
                      onClick={() => engine.watchlistToggle(player.name)}
                      title={engine.watchlisted(player) ? 'Remove from watchlist' : 'Add to watchlist'}
                      aria-label={engine.watchlisted(player) ? 'Remove from watchlist' : 'Add to watchlist'}
                      className={
                        'flex h-8 w-8 lg:h-11 lg:w-11 items-center justify-center rounded-full border transition-colors duration-150 ' +
                        (engine.watchlisted(player)
                          ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                          : 'border-slate-rule bg-slate-sunk/60 text-white/60 hover:border-slate-rule hover:text-white')
                      }
                    >
                      <Bookmark className={'h-4 w-4 lg:h-5 lg:w-5 ' + (engine.watchlisted(player) ? 'fill-amber-300' : '')} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    title="Close"
                    aria-label="Close player profile"
                    className="flex h-8 w-8 lg:h-11 lg:w-11 shrink-0 items-center justify-center rounded-full border border-slate-rule bg-slate-sunk/60 text-white/60 transition-colors duration-150 hover:border-slate-rule hover:text-white"
                  >
                    <X className="h-4 w-4 lg:h-5 lg:w-5" />
                  </button>
                </div>
              </div>

              {tabStrip}

              <div className="max-h-[65vh] lg:max-h-[75vh] flex-1 overflow-y-auto p-4 sm:p-5 lg:p-7">
                {isDesktop && tabBody}
              </div>
            </motion.div>
          </div>

          {/* Mobile: a bottom sheet, not this card squeezed to fit — the
              six research tabs above are a desk-side deep dive; a phone
              mid-draft needs the numbers a pick turns on and the two
              actions that follow from them, in one glance with nothing to
              tap through first. drag="y" + the 24px threshold mirrors
              PlayerHub's own sheet; onClick stopPropagation keeps a tap
              inside the sheet from bubbling to the backdrop's onClose,
              exactly like the desktop card beside it. */}
          <motion.div
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.3}
            onDragEnd={(_, info) => { if (info.offset.y > 24) onClose() }}
            onClick={(e) => e.stopPropagation()}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className="fixed inset-x-0 bottom-0 z-[70] flex max-h-[85vh] touch-none flex-col overflow-hidden rounded-t-xl border-t border-slate-rule bg-slate-panel shadow-2xl lg:hidden"
          >
            <div className="flex shrink-0 cursor-grab justify-center pt-2 active:cursor-grabbing">
              <span className="h-1 w-9 rounded-full bg-slate-rule" />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
              <div className="flex items-center gap-3 border-b border-slate-rule pb-4">
                <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-sunk text-xs font-bold text-ink-soft">
                  {initialsFor(player)}
                  {photoFor(player) && (
                    <img
                      src={photoFor(player)}
                      alt=""
                      loading="lazy"
                      onError={(e) => e.currentTarget.remove()}
                      className={'absolute inset-0 h-full w-full ' + (player.pos === 'DST' ? 'object-contain p-1' : 'object-cover')}
                    />
                  )}
                  <span className={'absolute -bottom-1 -right-1 rounded px-1 py-px text-[8px] font-bold leading-tight ring-2 ring-slate-panel ' + (POS_BADGE[player.pos] || 'bg-white/10 text-white/50')}>
                    {player.pos}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-2xl font-bold leading-tight text-white">{player.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                    <span>
                      {[player.team, player.bye ? `Bye ${player.bye}` : null, player.tier != null ? `Tier ${player.tier}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {inj && (
                      <span className={'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ' + inj.cls} title={inj.label}>
                        {player.inj}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 py-4">
                {mobileStats.map((s) => (
                  <div key={s.key} className="rounded-lg bg-white/[0.03] px-2 py-2.5 text-center">
                    <p className="font-plex text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-muted">{s.label}</p>
                    <p className={'mt-1 font-display text-lg font-bold ' + s.tone}>{s.display}</p>
                  </div>
                ))}
              </div>

              {marketSentence && (
                <p className={'mb-4 rounded-lg bg-white/[0.04] p-3 text-[13px] leading-[1.45] ' + (risky ? 'text-rose-200' : 'text-emerald-200')}>
                  {marketSentence}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onToggleQueue(player.name)}
                  className={
                    'flex h-12 flex-1 items-center justify-center gap-1.5 rounded-lg border text-sm font-semibold transition-colors duration-150 ' +
                    (queued ? 'border-amber-400/40 bg-amber-400/10 text-amber-300' : 'border-slate-rule bg-white/[0.03] text-white/80')
                  }
                >
                  <Star className={'h-4 w-4 ' + (queued ? 'fill-amber-300' : '')} />
                  {queued ? 'In your queue' : 'Add to queue'}
                </button>
                <button
                  type="button"
                  onClick={() => { onDraft(player); onClose() }}
                  disabled={!canDraft}
                  title={draftTitle}
                  className={
                    'h-12 flex-1 rounded-lg text-sm font-bold transition-all duration-200 ' +
                    (!canDraft
                      ? 'cursor-not-allowed bg-white/5 text-white/25'
                      : 'bg-cta text-white shadow-glass hover:scale-[1.02]')
                  }
                >
                  Draft
                </button>
              </div>

              {/* The research tabs, BELOW the two actions.

                  The sheet's own contract, in the comment above it, is the
                  numbers a pick turns on and the two actions that follow,
                  "in one glance with nothing to tap through first". A tab
                  strip placed *above* that content would break it — which is
                  what the desktop card does, correctly, because a desk-side
                  reader is not mid-pick. Placed below, the glance is intact
                  and the tabs are depth for whoever scrolls, so the phone
                  stops being the surface that simply cannot reach Our Read,
                  Projections, Game Logs, News or the depth chart at all.

                  One tab at a time rather than six inlined: inlining them
                  all would put a week-by-week log and a news fetch under
                  every open, and Latest News costs a request against a
                  thousand-a-month allowance. Selected-by-default is Our
                  Read, the shortest and the one thing here that is a verdict
                  rather than a table.

                  Same strip, same bodies, same `tab` state as the desktop
                  card — rendered here only when this half is the live one.
                  See isDesktop. */}
              <div className="-mx-4 mt-5 border-t border-slate-rule">
                {tabStrip}
                <div className="px-4 pt-4">{!isDesktop && tabBody}</div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
