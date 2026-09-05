import { useCallback, useEffect, useState } from 'react'
import CockpitHeaderPhone from './CockpitHeaderPhone.jsx'
import DraftBoardPeekPhone from './DraftBoardPeekPhone.jsx'
import BottomSheet, { SHEET_SNAPS } from '../BottomSheet.jsx'
import PlayersTabPhone from './PlayersTabPhone.jsx'
import QueueTabPhone from './QueueTabPhone.jsx'
import TeamTabPhone from './TeamTabPhone.jsx'
import ChatTabPhone from './ChatTabPhone.jsx'
import PlayerProfilePhone from './PlayerProfilePhone.jsx'

/* The header's height before it has measured itself — a first-paint
   estimate only, replaced within a frame by CockpitHeaderPhone's own
   ResizeObserver (see useReportHeight there for why this cannot be a
   constant). 106 is what it used to be hardcoded to: right on a notched
   phone, ~41px too tall everywhere else. Kept as the seed rather than
   dropped to the un-notched 65 because overshooting for one frame hides a
   sliver of board, and undershooting draws the board under the header. */
const HEADER_SEED_H = 106

const TABS = [
  { key: 'players', label: 'Players' },
  { key: 'queue', label: 'Queue' },
  { key: 'team', label: 'Team' },
  { key: 'chat', label: 'Chat' },
]

// The whole "board peek" phone draft room (README's option 1a) — mounted
// once, from DraftRoom.jsx's own final return, only when usePhoneWidth()
// is true and the draft is live and not yet over (see that file's own
// comment on why `view === 'insights'` deliberately falls through to the
// existing render tree instead of being handled here: Insights is already
// responsive at every width today, so it needs no phone-specific rebuild).
//
// Every value below is something DraftRoom.jsx already computed for the
// desktop/tablet render — nothing here re-derives from `engine` a second
// time, same rule this whole file's siblings already follow.
//
// `tick` is the one prop here that carries no data of its own: it is
// DraftRoom.jsx's own useJukeTick counter, passed down purely so a child
// that memoizes over the board has something that actually changes when a
// pick lands. `board` and `picks` are both mutated in place, so neither
// can say "something moved" — see PlayersTabPhone's own note on the pool
// that stopped clearing because its memo was keyed on `board`.
export default function DraftRoomPhone({
  engine, league, picks, board, tick, mySlot, onClock, overall, myTurn, code, urgent,
  timeLeft, clockLength, onOpenMenu,
  autopick, onToggleAutopick, over,
  rules, pointsFor, valueFor, vorpFor, survivalFor,
  photoFor, initialsFor, flexPositions, draftedByFor,
  queuedNames, queuePlayers, onToggleQueue, onDraft,
  filterCounts, tierAvgByPos, priorSeasonYear, projOf, season, onSetSeason,
}) {
  const [tab, setTab] = useState('players')
  const [sheetSnap, setSheetSnap] = useState(1)
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [viewSlot, setViewSlot] = useState(mySlot)
  /* A counter, not a boolean — see DraftBoardGrid's own note on the prop
     it feeds. Pressing the crosshair twice in a row has to scroll twice,
     and only a value that changes every press can say that. */
  const [findLive, setFindLive] = useState(0)
  const [headerH, setHeaderH] = useState(HEADER_SEED_H)
  // Stable across renders so the observer in the header is set up once —
  // see useReportHeight's own note on why it deliberately does not list
  // this in its dependency array.
  const onHeaderHeight = useCallback((h) => setHeaderH((prev) => (prev === h ? prev : h)), [])
  /* The sheet's tallest snap has to stay below the fixed header (z-40,
     above the sheet's own z-30) — see BottomSheet.jsx's own comment on
     `maxHeight` for what goes wrong otherwise.

     BOTH halves of this subtraction have to be live, and the viewport half
     was read once at mount. That is fine on a desktop and wrong on the
     device this screen exists for: a phone browser's URL bar shows and
     hides as you scroll, and rotating changes it outright, so a height
     captured at mount can overstate the room by 60-90px within seconds of
     the draft starting. The sheet is then taller than the space under the
     header and the header covers its drag handle — the same end state the
     auto-pick ribbon produces, reached without anybody touching auto-pick,
     and the reason an 8px overlap on an iPhone SE becomes a fully buried
     handle rather than a tight one. */
  const [viewportH, setViewportH] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 0))
  /* `window.innerHeight`, deliberately, and NOT `visualViewport.height`.

     visualViewport is the one that tracks the on-screen keyboard — and the
     Chat tab has a composer, so using it would shrink the sheet every time
     somebody typed a message. `position: fixed` is laid out against the
     LAYOUT viewport, which is what innerHeight reports and what the URL
     bar and rotation actually move. Measuring the sheet's ceiling against
     the same viewport the sheet is positioned in is the whole point. */
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const read = () => setViewportH((prev) => (prev === window.innerHeight ? prev : window.innerHeight))
    window.addEventListener('resize', read)
    window.addEventListener('orientationchange', read)
    return () => {
      window.removeEventListener('resize', read)
      window.removeEventListener('orientationchange', read)
    }
  }, [])

  const sheetMaxHeight = viewportH ? viewportH - headerH : undefined
  /* How much of the board the sheet is covering right now, worked out the
     same way BottomSheet works out its own resting height — the snap,
     clamped to the same ceiling. The board is `fixed ... bottom: 0` and the
     sheet is drawn over it, so without this the board centres the live pick
     in a box whose lower half nobody can see: measured at 375x812 with the
     sheet at its default snap, the crosshair put the live cell at y=444
     under a sheet starting at y=342. Arithmetically centred, invisible, and
     indistinguishable from a board that never scrolled — which is how it
     was reported.

     Read off SHEET_SNAPS rather than measured from the DOM so the board
     never has to wait a frame for a layout read, and so a drag in progress
     (which drives height off a motion value, not off this) does not make
     the board chase it. */
  const sheetCover = Math.min(SHEET_SNAPS[sheetSnap], sheetMaxHeight || SHEET_SNAPS[sheetSnap])

  return (
    <>
      <CockpitHeaderPhone
        code={code}
        myTurn={myTurn}
        urgent={urgent}
        timeLeft={timeLeft}
        clockLength={clockLength}
        onOpenMenu={onOpenMenu}
        onFindLive={() => setFindLive((n) => n + 1)}
        autopick={autopick}
        onToggleAutopick={onToggleAutopick}
        onHeight={onHeaderHeight}
        over={over}
      />

      <DraftBoardPeekPhone
        engine={engine}
        league={league}
        picks={picks}
        mySlot={mySlot}
        onClock={onClock}
        onSelectPlayer={setSelectedPlayer}
        headerH={headerH}
        scrollToLiveSignal={findLive}
        bottomInset={sheetCover}
      />

      <BottomSheet
        snapIndex={sheetSnap}
        onSnapIndexChange={setSheetSnap}
        maxHeight={sheetMaxHeight}
        header={
          <div className="flex w-full shrink-0 border-b border-white/[0.06] px-0">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={
                  'flex-1 border-b-2 py-[9px] text-center font-body text-[13px] font-semibold transition-colors duration-150 ' +
                  (tab === t.key ? 'border-teal-400 text-teal-300' : 'border-transparent text-ink-muted')
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      >
        {tab === 'players' && (
          <PlayersTabPhone
            engine={engine}
            league={league}
            board={board}
            tick={tick}
            mySlot={mySlot}
            myTurn={myTurn}
            rules={rules}
            pointsFor={pointsFor}
            valueFor={valueFor}
            vorpFor={vorpFor}
            survivalFor={survivalFor}
            photoFor={photoFor}
            initialsFor={initialsFor}
            flexPositions={flexPositions}
            draftedByFor={draftedByFor}
            queuedNames={queuedNames}
            onToggleQueue={onToggleQueue}
            onDraft={onDraft}
            filterCounts={filterCounts}
            tierAvgByPos={tierAvgByPos}
            priorSeasonYear={priorSeasonYear}
            projOf={projOf}
            season={season}
            onSetSeason={onSetSeason}
            onSelectPlayer={setSelectedPlayer}
          />
        )}
        {tab === 'queue' && (
          <QueueTabPhone
            queuePlayers={queuePlayers}
            survivalFor={survivalFor}
            onRemove={onToggleQueue}
            autopick={autopick}
            onToggleAutopick={onToggleAutopick}
            over={over}
          />
        )}
        {tab === 'team' && (
          <TeamTabPhone
            engine={engine}
            league={league}
            mySlot={mySlot}
            viewSlot={viewSlot}
            onViewSlot={setViewSlot}
            teamLabelOf={(slot) => engine.teamLabel(slot)}
            picks={picks}
            photoFor={photoFor}
            initialsFor={initialsFor}
          />
        )}
        {tab === 'chat' && (
          <ChatTabPhone engine={engine} onExpandSheet={() => setSheetSnap(2)} />
        )}
      </BottomSheet>

      {selectedPlayer && (
        <PlayerProfilePhone
          engine={engine}
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
          rules={rules}
        />
      )}
    </>
  )
}
