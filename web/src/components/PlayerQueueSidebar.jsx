import { useLayoutEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bookmark, ChevronDown, ChevronUp, Plus, Search, Star } from 'lucide-react'
import { POS_BADGE, POS_LIST, INJURY_META } from './draftRoomPositions.js'
import JukeValueAssistant from './JukeValueAssistant.jsx'
import { MOBILE_COL_WIDTH, MOBILE_SORTS, STAT_COLUMNS, STAT_GROUPS, statValue, lastsTone } from './playerColumns.js'

// Keyed lookup so the group header can total its own columns' widths
// rather than carrying a second copy of them.
const COL_BY_KEY = Object.fromEntries(STAT_COLUMNS.map((c) => [c.key, c]))

/* The identity block's width on desktop, and the shape every cell in it
   shares there. 296px holds the queue star, a 58px Draft pill, a 32px
   headshot/initials circle and about 146px of name — measured against
   "Jaxon Smith-Njigba", the Players tab's own longest real name.

   `mobile` (below) is the phone/app variant: 208px as a floor, not a
   fixed width — see the mobileNameW effect further down (where nameW is
   read) for why it has to grow past that rather than stay fixed. It
   still gets a Draft affordance next to the star, just a narrow icon
   rather than the desktop pill: 26px wide, the exact width the star's
   own tap target already costs, so the pair together barely spends more
   than the star alone did. The POS badge
   still moves back onto the avatar instead of its own scrolling column,
   and the row's own tap still opens the player sheet (PlayerProfileModal)
   as a second way to reach the same action — see that component's own
   comment for the Draft/Queue actions living there too. */
const NAME_W = 296
const MOBILE_NAME_W = 208
const POS_W = 44
// STICKY_CELL's own children — the two 26px icon buttons, the 32px avatar,
// three 8px gaps between the four of them, and px-2's own 16px — every
// one of them fixed-width and shrink-0. This is what's left over for the
// name once those are paid for; the mobileNameW effect below adds a real
// measurement of the longest name on top of it, rather than a guess.
const MOBILE_IDENTITY_CHROME_W = 26 + 26 + 32 + 8 * 3 + 16
// min-w-0: without it, a flex item's *default* min-width is auto, which
// resolves to its own content's min-content size rather than 0 — and that
// floor wins over an explicit flex-basis when the two disagree. Every
// other fixed-width child here already opts out with its own shrink-0,
// and the name block itself already carries min-w-0 — but the cell that
// wraps all four of them never did, so its own automatic floor was
// whichever row's content happened to be widest at that moment. Reported
// directly: "Jaxon Smith-Njigba" measured at a 237px cell against every
// other row's 208, which is a column that silently disagrees with itself
// from row to row, not merely a name that runs long. flex: 0 0 208px says
// "never grow, never shrink" and was already being overridden by content
// it was never told to ignore.
// [will-change:transform] for the same reason the header wrapper carries
// it (see the group/column header comment below): this cell is its own
// independently `position: sticky` element, sitting beside plain-flow
// stat-column siblings within the same row. Reported directly, with a
// screenshot: a row's name/team/badge (this cell) rendering apart from
// its own PTS/VORP/rushing/receiving numbers, split by the sticky header
// in between, on a fast scroll — the row measured perfectly aligned once
// settled (identity and row bounding boxes both landed at the same y),
// which is exactly what a compositing-layer paint-order race during
// active scrolling looks like from a static check: gone by the time
// anything can measure it. Same mechanism, same remedy, one cell over.
//
// Reported a third time after that fix, on a filtered view (posFilter
// narrowed, tier dividers active) rather than the unfiltered scroll the
// first two reports were on — a different trigger, same symptom. Could
// not be reproduced or measured in this project's own tooling even
// simulating the filter-change row-animation burst that's the one real
// difference between this report and the prior two (every visible
// motion.div row re-enters at once on a filter change, same as it would
// mid-scroll) — Chromium's own compositor is not mobile WebKit's, and
// nothing here claims otherwise. [-webkit-transform:translateZ(0)] and
// backface-visibility:hidden are added alongside will-change: the older,
// more forceful GPU-layer-promotion pair that some WebKit versions honour
// more reliably than will-change alone for exactly this "sticky element
// briefly loses to a transformed sibling" failure mode — a known class of
// bug, not a guess specific to this file. Belt-and-suspenders over a fix
// that cannot be confirmed from here: verify on the real device before
// reaching for a fourth attempt.
const STICKY_CELL = 'sticky left-0 z-20 flex shrink-0 items-center px-2 min-w-0 [will-change:transform] [-webkit-transform:translateZ(0)] [backface-visibility:hidden]'

// FLEX sits after the four skill positions and before K/DST, matching
// SLOT_ORDER in app.js — the same ordering a roster fills them in.
const FILTERS = ['ALL', ...POS_LIST, 'FLEX', 'K', 'DST']

/* What the count means, said in words for a pointer. "All" counts roster
   spots rather than starting slots, so it needs its own wording — the shared
   sentence read "13 more ALL to fill your starting lineup", which is wrong
   about the number and about the noun. */
function countTitle(pos, c) {
  const left = c.need - c.have
  if (pos === 'ALL') {
    return c.short ? `${left} more roster ${left === 1 ? 'spot' : 'spots'} still to fill` : 'Your roster is full'
  }
  if (c.short) return `${left} more ${pos} to fill your starting lineup`
  if (c.full) return `You are holding as many ${pos} as this draft will suggest`
  return undefined
}

/* The sort keys, the column widths and the cell readers all live in
   playerColumns.js now — one definition serving the table header, the
   mobile chips and DraftRoom's sort. SORT_DEFAULT_DIR is re-exported rather
   than redefined so DraftRoom's existing import keeps working against that
   same single source. */
export { SORT_DEFAULT_DIR } from './playerColumns.js'

/* rose/amber/soft -> real classes, kept out of playerColumns.js: that file
   computes the *value* a cell should show (lastsTone()'s three-way split),
   never a class name — the same separation every other column already
   keeps between statValue() and the tone the table paints it in. */
const LASTS_CLASS = {
  rose: 'text-rose-300',
  amber: 'text-amber-300',
  soft: 'text-ink-soft',
}

// Real, undrafted board players only — this is `board()` filtered/sorted at
// the UI layer, not a second suggestions engine. Ranking (ADP, need, risk,
// the model's opinion) stays exactly where CLAUDE.md says it has to live:
// suggestions() in app.js. The list here is ordered by the board's own
// `overall` (ADP rank), same as the legacy Players tab.
export default function PlayerQueueSidebar({
  // Only for the tier-cliff dividers below — engine.tierRemaining(), the
  // same canonical count app.js's own board chip and DraftDecideScreen's
  // tier ladder read, rather than this component tallying `players` (its
  // own, possibly search/team/exp-filtered prop) a third time.
  engine,
  players,
  search,
  onSearch,
  posFilter,
  counts,
  onPosFilter,
  expBand,
  onExpBand,
  watchlistOnly,
  onWatchlistOnly,
  showDrafted,
  onShowDrafted,
  pointsFor,
  vorpFor,
  valueFor,
  survivalFor,
  photoFor,
  initialsFor,
  onDraft,
  myTurn,
  draftOver,
  queuedNames,
  onToggleQueue,
  draftedByFor,
  onSelectPlayer,
  sortBy,
  sortDir,
  onSort,
  recommended,
  recommendedVorp,
  recommendedTierLeft,
  projOf,
  tierAvgByPos,
  // The Players tab mounts just this table — its own filter bar and
  // Autopick ribbon replace the recommendation card, search box, position
  // chips and toggles below, so none of that header renders here. The
  // mobile sheet (PlayerHub.jsx) and the Board tab's dock both leave this
  // false and get the header exactly as before.
  bareTable,
  // "Projected" everywhere except the Players tab's "2025 Season" mode,
  // where it's the actual year ("2025 Actual") — a caller-supplied label
  // rather than a second copy of the season names playerColumns.js has no
  // reason to know about.
  projectedGroupLabel,
  // The phone/app pool (PlayersTab.jsx's mobile Pool pane): a narrower
  // identity block, a flat per-column width instead of each column's own
  // desktop width, no separate POS column, and no Draft pill in the row.
  // The column *order* is no longer part of this list — mobile reads
  // STAT_GROUPS the same as desktop now, see that export's own comment.
  mobile,
}) {
  /* What statValue() reads a cell from: the derived columns keep the
     readers this list already had, so the table can never disagree with
     the recommendation card or the sort about a player's points, VORP or
     Juke score, and the raw counting stats come off the projection block. */
  const statCtx = { pointsFor, vorpFor, valueFor, survivalFor, projOf }

  // Widens the mobile identity column to fit the longest name actually on
  // the board, rather than truncating names past a fixed guess. A canvas
  // measurement would need to know the name line's real font to build a
  // matching font string for ctx.font — and that line carries no
  // font-family class of its own, inheriting whatever the page's default
  // is (index.css sets no font-family on body at all; Tailwind's own
  // preflight default is the only thing supplying one), so a hand-built
  // string would be a guess this file has no way to keep honest if that
  // default ever changes. A real, hidden DOM node styled with the exact
  // same classes the name line renders with can't drift from it the same
  // way — it *is* the thing being measured, not a description of it.
  //
  // Held to a monotonic max rather than reset on every measurement: players
  // leave `players` as they're drafted, so the true longest name on the
  // board can only ever get shorter as a draft goes on, and a column that
  // shrinks mid-draft would read as the layout jittering rather than
  // adapting. useLayoutEffect, not useEffect, so the corrected width is
  // committed before the browser paints the frame after players loads or
  // changes — the alternative is one visible frame at the old width first.
  const [mobileNameW, setMobileNameW] = useState(MOBILE_NAME_W)
  useLayoutEffect(() => {
    if (!mobile || !players.length) return
    const probe = document.createElement('span')
    probe.className = 'truncate text-xs font-medium'
    probe.style.cssText = 'position:absolute; visibility:hidden; white-space:pre; top:-9999px; left:-9999px;'
    document.body.appendChild(probe)
    let maxNameW = 0
    for (const p of players) {
      probe.textContent = p.name
      const w = probe.getBoundingClientRect().width
      if (w > maxNameW) maxNameW = w
    }
    document.body.removeChild(probe)
    // +2: the probe and the real name both render text-xs font-medium, so
    // this isn't covering a font mismatch — it's covering the fact that a
    // fractional-pixel measurement rounded up by getBoundingClientRect can
    // still land one pixel short of what text-overflow:ellipsis decides is
    // "doesn't fit" on the real, rendered element, and losing that pixel
    // means the exact clip this column exists to prevent.
    const needed = MOBILE_IDENTITY_CHROME_W + Math.ceil(maxNameW) + 2
    setMobileNameW((prev) => Math.max(prev, needed))
  }, [mobile, players])

  const nameW = mobile ? mobileNameW : NAME_W
  const colWidth = (col) => (mobile ? MOBILE_COL_WIDTH : col.width)

  // A single position filter narrows the stat groups to the ones that
  // position actually has — "ALL" keeps every group, the union-across-
  // positions shape playerColumns.js's own header comment documents.
  // Filtering here, not there: STAT_GROUPS/STAT_COLUMNS stay the one list
  // every consumer of this file shares, mobile included now — see that
  // export's own comment for why the mobile-only reordering this used to
  // read from a separate MOBILE_GROUPS is gone. The Juke group is never
  // filtered out — an unranked K/DST prints an em dash in it rather than
  // losing the group, same as overallScore()/survivalProbability()
  // withhold a number rather than a column.
  const visibleGroups = STAT_GROUPS.filter((g) => !g.positions || posFilter === 'ALL' || g.positions.includes(posFilter))
  // Columns in whichever order visibleGroups is already in, rather than a
  // separate filter-then-sort pass that could disagree with it.
  const visibleColumns = visibleGroups.flatMap((g) => g.keys.map((k) => COL_BY_KEY[k]))

  /* Tier-cliff dividers, interleaved into the row list rather than drawn
     per-row — a divider belongs *between* two players, so it has to be
     built as its own pass over the list rather than something a single
     row can decide to render above itself.

     Only when the list is in board order. buildTiers() in app.js assigns
     tiers by walking each position's board-sorted (ADP) sublist and only
     ever incrementing — "already ADP sorted" is that function's own
     comment — so tier climbs monotonically per position along board order
     and nowhere else. Sorted by VORP or any raw stat, a lower tier can
     follow a higher one for reasons that have nothing to do with a real
     cliff; showing a divider there would label a coincidence as a cliff,
     so it simply doesn't fire outside 'board'.

     And only when posFilter has narrowed the list to one of those tiered
     positions. A tier is a within-position idea — "the next WR" — and
     board order across every position at once (ALL, or FLEX's RB+WR+TE)
     interleaves them by true ADP, so a WR tier's own divider can end up
     with an RB or a DST sitting directly under it purely because that
     player's ADP happened to fall between two WRs. Nothing about the
     player is wrong and nothing about the divider's own numbers is wrong
     — a defense really was that many picks away from the next WR tier —
     but a row that isn't the position the ribbon just named reads as
     though it belongs to that tier, which is a false claim regardless of
     how the text above it is worded. Reported directly: a defense sitting
     between "WR Tier 8 ends here" and "WR Tier 9 ends here." The one
     condition that actually fixes it is the list containing only one
     tiered position at a time, which is also exactly the moment a cliff
     is worth signposting — nobody scanning DST while wondering about a
     WR run needs to be told about it.

     "How many left before the drop" goes through engine.tierRemaining()
     rather than a second tally over `players` here — that was the bug:
     `players` is this component's own prop, already narrowed by whatever
     search text, NFL-team filter or rookie/veteran band the Players tab
     has active, none of which changes what "left in the tier" actually
     means. A manager filtered to WR, sorted by board order (the default),
     who then types a name into the search box keeps every condition above
     satisfied while the divider's own count silently shrank to "how many
     of the *visible* rows are left" — a different, smaller number than
     the real one, and a real one the Decide tab's ladder and the board's
     own tier chip both still print correctly, because they read off the
     whole board rather than this filtered list. tierRemaining() recounts
     off the real board every time, so it can't inherit a filter this list
     happens to be under — one call per divider row, not per player, since
     dividers are rare next to rows. lastPlayer holds the last *player
     object* seen at each position (not just its tier number), because
     that object is exactly what tierRemaining() needs to identify "the
     tier that just ended" — its own pos and tier are all the function
     reads. */
  /* The deep-board divider marks where real ADP ends and Sleeper's own
     depth order (extend_deep_bench() in build_players.py) begins. It's a
     single, global flip rather than a per-position one: every extended
     entry gets an adp higher than every real one *in its own format*
     (build_players.py), so walking board order the `deep` flag goes
     false -> true exactly once and stays true — no per-position reset
     the way a tier cliff needs. It still only fires in board order, for
     the same reason the tier dividers are gated on it: outside ADP order
     a deep player can sort anywhere among real ones (by name, by a stat
     column), and one boundary line would claim a cliff that isn't there.
     Unlike tier dividers it doesn't also need posFilter narrowed to a
     single tiered position — "real ADP ends here" is true of the whole
     board, FLEX and ALL included. */
  const showTierDividers = sortBy === 'board' && tierAvgByPos && POS_LIST.includes(posFilter)
  const showDeepDivider = sortBy === 'board'
  const rows = []
  if (showTierDividers || showDeepDivider) {
    const lastPlayer = {}
    let deepDividerShown = !showDeepDivider
    players.forEach((player) => {
      if (showTierDividers && !player.drafted && POS_LIST.includes(player.pos) && player.tier != null) {
        const last = lastPlayer[player.pos]
        if (last != null && player.tier > last.tier) {
          const posAvgs = tierAvgByPos[player.pos] || {}
          const endingAvg = posAvgs[last.tier]
          const nextAvg = posAvgs[last.tier + 1]
          const drop = endingAvg != null && nextAvg != null ? Math.round(endingAvg - nextAvg) : null
          rows.push({
            type: 'divider',
            kind: 'tier',
            key: 'tier-' + player.pos + '-' + last.tier,
            pos: player.pos,
            tierEnding: last.tier,
            remaining: engine.tierRemaining(last),
            drop,
          })
        }
        lastPlayer[player.pos] = player
      }
      if (!deepDividerShown && player.deep) {
        rows.push({ type: 'divider', kind: 'deep', key: 'deep-board-start' })
        deepDividerShown = true
      }
      rows.push({ type: 'player', key: player.id || player.name, player })
    })
  } else {
    players.forEach((player) => rows.push({ type: 'player', key: player.id || player.name, player }))
  }

  // No windowing on this list — see the file's own history for why that's
  // an acceptable trade at a few hundred rows — but a deeper board (up to
  // ~480 now, extend_deep_bench()) makes the one real cost of that worse:
  // every visible motion.div plays its mount/re-enter animation at once on
  // a filter change (this file's STICKY_CELL comment already documents
  // that as a reported, if unreproduced, jank source at the old ~230-row
  // depth). Skipping the per-row entrance animation once the list is this
  // long doesn't touch the shared-layoutId fly-to-board-cell animation
  // (that's one row at a time, on an actual draft, never a mass re-mount)
  // — it only turns off the opacity/y spring nobody can see resolve
  // separately in a burst that size anyway.
  const manyRows = rows.length > 150

  return (
    // Sizing against the board+queue row (flex-1, lg:flex-[3], lg:min-w)
    // lives on DraftRoom.jsx's own wrapper around PlayerHub — this fills
    // that wrapper rather than sizing itself against the row a second
    // time. The profile that used to share a relative ancestor with this
    // list (PlayerProfileDrawer) is a top-level modal now and has no
    // positioning relationship with this component at all.
    // No h-full. The wrapper above is a flex row, so align-items:stretch
    // already sizes this to it — and height:100% actively defeats that:
    // the parent's height comes from flex layout rather than from an
    // explicit value, so the percentage resolved against an indefinite
    // height and fell back to auto. Measured on a phone, that made this box
    // 6867px tall inside a 518px parent, which handed flex-1 below an
    // unbounded height to divide and left the list unable to scroll at all.
    <div className="flex w-full flex-col overflow-hidden bg-slate-bar/40">
      {!bareTable && (
      <div className="shrink-0 space-y-3 border-b border-slate-rule p-4 lg:space-y-2 lg:p-2.5">
        {/* Replaces the old plain "Juke AI Draft Assistant" label — this
            is that framing with an actual real recommendation behind it
            now, not just a caption over the search box. Two renders, one
            per breakpoint, because the compact variant is a different
            shape rather than the same card scaled — see its own comment. */}
        {/* Compact at every width now, where this used to render the tall
            card below lg and the compact one above it. The tall variant is
            225px of a header that only has 518px to share with the list, and
            measured on a phone that left the list 47 visible pixels — one
            row and part of a second, out of 210 players. Compact takes the
            header from 471 to 309 and the list from 47 to 209, which is four
            rows and a scroll rather than a dead end.

            Nothing is lost by dropping the tall one here specifically: the
            Decide tab is three full recommendation cards of exactly this
            content, so on a phone the tall card was the same advice twice,
            charging the Players list most of its height for the repeat. */}
        <div>
          <JukeValueAssistant
            compact
            player={recommended}
            vorp={recommendedVorp}
            tierLeft={recommendedTierLeft}
            onDraft={onDraft}
            myTurn={myTurn}
            photoFor={photoFor}
            initialsFor={initialsFor}
            onOpenProfile={onSelectPlayer}
          />
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search players..."
            className="w-full rounded-lg border border-slate-rule bg-slate-sunk/60 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-teal-400/60 focus:outline-none"
          />
        </div>

        {/* A design review read this row as ambiguous — is "RB 4" a filter
            you can click, or a report of what you've drafted? It's both by
            design (see countTitle()'s own tooltip and the fraction-vs-count
            comment below), which is exactly what a bare row of chips can't
            say on its own. One label, not a rebuild: moving the counts out
            to the roster pane would drop the "which position still needs
            help" read this row exists to give at a glance while filtering. */}
        <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-muted">Filter by position · your roster need alongside</p>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => onPosFilter(pos)}
              className={
                'rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-150 ' +
                (posFilter === pos
                  ? 'bg-teal-500 text-obsidian'
                  : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white')
              }
            >
              {pos === 'ALL' ? 'All' : pos}
              {/* The roster-need count, from engine.filterCounts(). The whole
                  decision — fraction while a slot is owed, bare count once it
                  is met, fraction always for All where the denominator is a
                  real ceiling — is made engine-side, because a fraction is a
                  promise about its denominator and this one has been got
                  wrong before: have/starters in every state painted a green
                  "TE 1/1" that read as a cap, and was reported as the app
                  refusing a second tight end. It had refused nothing. */}
              {counts && counts[pos] && (
                <span
                  title={countTitle(pos, counts[pos])}
                  className={
                    'ml-1.5 tabular-nums ' +
                    (posFilter === pos
                      ? 'text-obsidian/60'
                      : counts[pos].short ? 'text-amber-300/80'
                        : counts[pos].full ? 'text-ink-muted' : 'text-ink-muted')
                  }
                >
                  {counts[pos].text}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* A second, independent dimension from position — "RB rookies I'm
            watching" is a real combination, which a single-select list
            can't hold. Watchlist and Drafted are plain toggles that combine
            freely with everything else here.

            Veterans dropped — the two bands were never symmetric: the
            question a manager actually asks mid-draft is "show me only the
            rookies," never "hide the rookies," and a Veterans chip that
            just meant "everyone else" duplicated what leaving the filter on
            Rookies-off already showed. `expBand` still supports 'veteran'
            underneath (app.js's exp filter is unchanged); only the button
            that could ever set it is gone. */}
        <div className="flex flex-wrap gap-1.5">
          {[
            { key: 'rookie', label: 'Rookies' },
          ].map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => onExpBand(expBand === b.key ? 'all' : b.key)}
              className={
                'rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-150 ' +
                (expBand === b.key
                  ? 'bg-teal-500 text-obsidian'
                  : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white')
              }
            >
              {b.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onWatchlistOnly(!watchlistOnly)}
            aria-pressed={watchlistOnly}
            className={
              'flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-150 ' +
              (watchlistOnly
                ? 'bg-amber-400/90 text-obsidian'
                : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white')
            }
          >
            <Bookmark className={'h-3 w-3 ' + (watchlistOnly ? 'fill-obsidian' : '')} />
            Watchlist
          </button>
          <button
            type="button"
            onClick={() => onShowDrafted(!showDrafted)}
            aria-pressed={showDrafted}
            className={
              'rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-150 ' +
              (showDrafted
                ? 'bg-teal-500 text-obsidian'
                : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white')
            }
          >
            Drafted
          </button>
        </div>

        {/* Sorting, below lg only — a shortcut, not the only way. Every
            column in the table is sortable from its own header on either
            breakpoint now; these are the few a thumb should not have to
            scroll sideways to reach. Same tap-to-sort, tap-again-to-flip
            as the headers. */}
        <div className="flex flex-wrap items-center gap-1.5 lg:hidden">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Sort</span>
          {MOBILE_SORTS.map((col) => {
            const active = sortBy === col.key
            return (
              <button
                key={col.key}
                type="button"
                onClick={() => onSort(col.key)}
                aria-pressed={active}
                className={
                  'flex items-center gap-0.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-150 ' +
                  (active ? 'bg-teal-500 text-obsidian' : 'bg-white/5 text-white/50')
                }
              >
                {col.label}
                {active && col.key !== 'board' ? (
                  sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                ) : null}
              </button>
            )
          })}
        </div>

        {/* "Not your turn" and "the draft is over" are different facts —
            !myTurn is true for both, and a design review caught this
            exact line still reading "disabled until it's your turn" on a
            finished draft, where there is no turn left to wait for. */}
        {!myTurn && (
          <p className="text-[10px] leading-relaxed text-ink-muted">
            {draftOver ? 'Draft complete.' : "Draft is disabled until it's your turn."}
          </p>
        )}
      </div>
      )}


      {/* One horizontally scrollable table, both breakpoints. The stats a
          drafter wants — projection, passing, rushing, receiving — used to
          live on a separate Players tab, which meant leaving the board to
          look anything up. They scroll sideways here instead, the way
          Sleeper's own board does it, so nothing about a player is more
          than a swipe away.

          The scroll lives on this one container rather than per row: rows
          that each scrolled independently would never line up under a
          shared header, and the header is what makes a wall of numbers
          readable. overflow-auto (not overflow-y-auto) is what gives the
          list both axes.

          pb-28 below lg keeps the last row clear of the sheet's own bottom
          edge on a phone; lg:pb-6 is a plain breathing gap in the desktop
          panel, which has nothing floating over it.

          min-h-0 is what makes overflow-auto above actually engage. A flex
          child defaults to min-height:auto, which refuses to shrink below
          its own content — so this box sized itself to all 210 rows (7527px
          measured on a phone), the scroller never had anything to scroll,
          and the list simply ran off the bottom of the sheet with no way to
          reach it. Same class as the entry screen's stacking bug, mirrored:
          there min-h-0 was present where it had to be absent, here it was
          absent where it has to be present. */}
      {/* pb-28 clears PlayerHub's own floating sheet (Board/Analysis's
          mobile fallback) — the one context this padding was written for.
          The new mobile Pool pane sits in normal flow above the bottom bar
          instead of floating over anything, so it only needs a small
          breathing gap, not 112px of it. */}
      <div className={'min-h-0 flex-1 overflow-auto ' + (mobile ? 'no-scrollbar pb-4' : 'pb-28 lg:pb-6')}>
        <div className="min-w-max">
          {/* Group header — the spanning row saying which family of stats
              the columns beneath belong to, so "YDS" three times over is
              never ambiguous.

              flex: n 0 (sum of its columns' widths)px, n being the column
              count — this has to be the *grow factor* the columns beneath
              it collectively add up to (each grows by 1), not just a
              starting width, or the group's own edge stops lining up with
              its last column's edge the moment there's leftover width to
              share out (see the numeric columns' own comment below). */}
          {/* Group and column header used to be two independently sticky
              rows (top-0 and top-[18px]), which meant two separate scroll-
              driven positioning contexts that only had to agree by
              arithmetic. On a phone under real momentum scrolling they
              could repaint a frame apart, and the row beneath — genuinely
              still moving — showed through the seam for that frame: the
              "column headers bleed into the stats below them" report.
              One sticky wrapper around both rows makes them a single paint
              unit with nothing left to desync, and removes the top-[18px]
              magic number along with it. will-change:transform is the
              standard nudge onto its own compositing layer, which is what
              keeps that one unit's repaint from lagging the content
              scrolling under it in the first place.

              Reported again after that, and again after STICKY_CELL got
              the identical fix (see that constant's own comment for the
              full history) — translateZ(0) and backface-visibility:hidden
              added here too, same reasoning, same pairing. */}
          <div className="sticky top-0 z-30 bg-slate-panel [will-change:transform] [-webkit-transform:translateZ(0)] [backface-visibility:hidden]">
          <div className="flex border-b border-slate-rule">
            <div className={STICKY_CELL + ' bg-slate-panel'} style={{ flex: `0 0 ${nameW}px` }} />
            {visibleGroups.map((g, gi) => {
              // POS has no entry in STAT_GROUPS (it isn't a statValue()
              // column, it's the hand-coded badge column below) but the
              // handoff's own desktop group row still spans it under the
              // same blank label as BYE/ADP — one group cell over the
              // three, not POS getting a second, redundant "POS" header of
              // its own next to the column row's real "Pos" label. Mobile
              // has no separate POS column at all (the badge sits on the
              // avatar instead), so this merge is desktop-only.
              const cols = g.keys.map((k) => COL_BY_KEY[k])
              const posSpan = !mobile && gi === 0 ? 1 : 0
              const w = cols.reduce((sum, c) => sum + colWidth(c), 0) + posSpan * POS_W
              return (
                <div
                  key={g.label || 'core'}
                  style={{ flex: `${cols.length + posSpan} 0 ${w}px` }}
                  className={
                    'shrink-0 border-l border-slate-rule/60 pt-1 text-center text-[9px] font-semibold uppercase tracking-wide ' +
                    (g.teal ? 'text-teal-300' : 'text-ink-muted')
                  }
                >
                  {g.label === 'Projected' && projectedGroupLabel ? projectedGroupLabel : g.label}
                </div>
              )
            })}
          </div>

          {/* Column header — sortable where the sort reader can order by
              it. Stacks under the group row inside the shared sticky
              wrapper above, so it needs no top offset of its own.

              Every numeric column is flex 1 0 {width}px — grow:1, shrink:0,
              its own width as the starting basis — so the columns share out
              any leftover width evenly instead of leaving a gutter between
              the identity block and PTS. A fixed, non-growing width (what
              this table used before) is what left that gutter: the columns
              summed to less than the container's real width the moment the
              container was wider than ~900px, and nothing claimed the rest. */}
          <div className="flex border-b border-slate-rule bg-slate-panel">
            <div
              className={STICKY_CELL + ' bg-slate-panel text-[10px] font-semibold uppercase tracking-wide text-ink-muted'}
              style={{ flex: `0 0 ${nameW}px` }}
            >
              Player
            </div>
            {!mobile && (
              <div style={{ flex: `1 0 ${POS_W}px` }} className="flex shrink-0 items-center justify-center border-l border-slate-rule/60 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                Pos
              </div>
            )}
            {visibleColumns.map((col) => {
              const active = sortBy === col.key
              const content = (
                <>
                  {col.label}
                  {active ? (
                    sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  ) : null}
                </>
              )
              return col.sortable ? (
                <button
                  key={col.key}
                  type="button"
                  onClick={() => onSort(col.key)}
                  style={{ flex: `1 0 ${colWidth(col)}px` }}
                  className={
                    'flex shrink-0 items-center justify-end gap-0.5 border-l border-slate-rule/60 px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-colors duration-150 ' +
                    (active ? 'text-teal-300' : 'text-ink-muted hover:text-white/60')
                  }
                >
                  {content}
                </button>
              ) : (
                <div
                  key={col.key}
                  style={{ flex: `1 0 ${colWidth(col)}px` }}
                  className="flex shrink-0 items-center justify-end border-l border-slate-rule/60 px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted"
                >
                  {content}
                </div>
              )
            })}
          </div>
          </div>

          <AnimatePresence initial={false}>
            {rows.map((row) => {
              if (row.type === 'divider' && row.kind === 'deep') {
                return (
                  // Neutral, not amber — amber already means "a tier is
                  // about to run out," a scarcity warning. This isn't one:
                  // it's informational, the same register as an injury
                  // badge rather than a countdown, so it stays on the
                  // established muted-white palette this file already
                  // uses for that (text-ink-muted, bg-white/10 below).
                  <div
                    key={row.key}
                    className="flex min-w-max items-center gap-3 border-y border-white/15 bg-white/[0.03] px-3 py-2"
                  >
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-white/70">
                      Real ADP ends here
                    </span>
                    <span className="text-[11px] text-white/50">
                      Below this line, no real draft has ever taken these players — ranked by Sleeper's
                      own depth order instead, and marked DEEP.
                    </span>
                  </div>
                )
              }
              if (row.type === 'divider') {
                return (
                  // Amber, not gold — #FFD166/--mine is reserved for
                  // "whose seat/turn this is" everywhere else in the app
                  // (CLAUDE.md: "Gold is identity... a colour doing five
                  // jobs is not a signal"). Amber is a different, already-
                  // established colour for this exact meaning: it's what
                  // JukeValueAssistant's own "Tier scarcity" warning uses a
                  // few rows above this list, for the identical idea of a
                  // tier running out.
                  <div
                    key={row.key}
                    className="flex min-w-max items-center gap-3 border-y border-amber-400/25 bg-amber-400/[0.05] px-3 py-2"
                  >
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                      {row.pos} tier {row.tierEnding} ends here
                    </span>
                    <span className="text-[11px] text-white/60">
                      {row.remaining} {row.pos}{row.remaining === 1 ? '' : 's'} left before the drop
                      {row.drop == null
                        ? ' — no more after this tier'
                        : row.drop > 0
                          ? ` — the next tier projects ${row.drop} fewer points`
                          : ' — the next tier projects about the same'}
                    </span>
                  </div>
                )
              }
              const player = row.player
              const photo = photoFor(player)
              const queued = queuedNames.has(player.name)
              const draftedBy = player.drafted ? draftedByFor(player) : null
              return (
                <motion.div
                  key={row.key}
                  layoutId={'player-' + (player.id || player.name)}
                  initial={manyRows ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  /* No exit animation, deliberately. This row shares its
                     layoutId with the board cell the player lands in, and
                     a row cannot both fly away on its own and morph into
                     that cell — contradictory instructions about one
                     element. Framer resolved the conflict by handing the
                     layoutId to the board cell and never unmounting the
                     row, so a drafted player stayed in the available list
                     for the rest of the draft. Without an exit there is
                     nothing for AnimatePresence to wait on, and the shared
                     layoutId still flies the card into its cell. */
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  onClick={() => onSelectPlayer(player)}
                  // Shown-but-drafted rows used to sit at the exact same
                  // brightness as available ones, distinguished only by the
                  // action column swapping a Draft button for a team name —
                  // easy to miss at a glance, which is what "greyed out" was
                  // actually asking for.
                  //
                  // bg-slate-sunk is new here, matching the identity cell a
                  // few lines down that's carried it all along. Without it
                  // only that one cell was opaque — the stat columns (PTS,
                  // VORP, everything "at the far right") had no background
                  // of their own, so this whole motion.div showed through
                  // to a translucent bg-slate-bar/40 four ancestors up. That
                  // made no visible difference on its own, but it meant a
                  // row had nothing solid behind its text if it ever
                  // rendered a frame out of stacking order against the
                  // sticky header above (a Framer Motion row gets its own
                  // compositing layer from the opacity/transform in its own
                  // animate prop, and mobile WebKit doesn't always resolve
                  // layer paint order against z-index the way the spec
                  // says it should) — reported as the header "bleeding into
                  // the stats below." An opaque row can't produce that: at
                  // worst a wrongly-ordered frame shows a solid row instead
                  // of the header for an instant, never overlapping text.
                  className={
                    'flex cursor-pointer border-b border-slate-rule/50 bg-slate-sunk transition-colors duration-150 hover:bg-white/[0.03] ' +
                    (player.drafted ? 'opacity-50' : '')
                  }
                >
                  {/* Sticky identity cell — who the row is about stays put
                      while the numbers scroll. Opaque on purpose: a
                      transparent sticky cell lets the scrolling cells
                      slide visibly beneath it.

                      Order: queue star, Draft pill, headshot, name over
                      team — the Draft button lives here now rather than at
                      the row's far end, so a thumb (or, here, a mouse
                      that's already reading the name) never has to cross
                      the entire scrollable width to reach it. */}
                  <div className={STICKY_CELL + ' gap-2 bg-slate-sunk'} style={{ flex: `0 0 ${nameW}px` }}>
                    {player.drafted ? (
                      <Star className={'shrink-0 text-white/10 ' + (mobile ? 'h-[15px] w-[15px]' : 'h-4 w-4')} />
                    ) : (
                      // 26px wide, 44px tall tap area on mobile — the
                      // handoff's own floor for anything tappable, on a
                      // control that's visually much smaller than that.
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onToggleQueue(player.name) }}
                        title={queued ? 'Remove from your queue' : 'Add to your queue'}
                        className={
                          'flex shrink-0 items-center justify-center text-ink-muted transition-colors duration-150 hover:text-amber-300 ' +
                          (mobile ? 'h-11 w-[26px]' : '')
                        }
                      >
                        <Star className={'h-4 w-4 ' + (queued ? 'fill-amber-300 text-amber-300' : '')} />
                      </button>
                    )}

                    {/* Mobile gets its own narrow icon, not the desktop
                        pill: a 58px text pill plus a 44px star plus the
                        avatar left the name 82px on a 402px screen,
                        clipping three of the first six real names — the
                        original reason this slot drew nothing at all on
                        mobile. Reported back as a real regression rather
                        than an acceptable trade: the row's own tap still
                        opens the sheet (PlayerProfileModal.jsx has the full
                        48px Draft action), but that is a second, slower
                        path to the same thing a phone drafter reaches for
                        constantly. Narrow rather than gone: 26px, matching
                        the queue star's own tap width immediately to its
                        left, so the pair costs barely more than the star
                        alone did — measured live against "Jaxon
                        Smith-Njigba" (this file's own longest real name,
                        NAME_W's comment above), no clipping. */}
                    {mobile ? (
                      !player.drafted && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onDraft(player) }}
                          disabled={!myTurn}
                          title={myTurn ? 'Draft' : 'Not your turn'}
                          className={
                            'flex h-11 w-[26px] shrink-0 items-center justify-center transition-colors duration-150 ' +
                            (myTurn ? 'text-white/50 hover:text-teal-300 active:scale-95' : 'cursor-not-allowed text-white/15')
                          }
                        >
                          <Plus className="h-4 w-4" strokeWidth={3} />
                        </button>
                      )
                    ) : (draftedBy ? (
                      <span className="w-[58px] shrink-0 truncate text-center text-[9px] font-semibold uppercase tracking-wide text-ink-muted">
                        {draftedBy}
                      </span>
                    ) : (
                      // Ghost, not the gradient — a gradient is an emphasis
                      // device, and every one of ~200 rows getting the full
                      // teal-to-purple treatment the instant it's your turn
                      // is noise, not emphasis (nothing on the list stands
                      // out if everything does). The one gradient "Draft"
                      // button on this screen lives on the recommended-pick
                      // card above the list (JukeValueAssistant's compact
                      // variant) — that's the single primary action; every
                      // row here stays a quiet, equally-weighted option.
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDraft(player) }}
                        disabled={!myTurn}
                        title={myTurn ? undefined : 'Not your turn'}
                        className={
                          'w-[58px] shrink-0 rounded-full border py-1.5 text-[11px] font-bold transition-colors duration-150 ' +
                          (myTurn
                            ? 'border-white/15 text-white/70 hover:border-teal-400/50 hover:bg-teal-400/[0.06] hover:text-teal-300 active:scale-95'
                            : 'cursor-not-allowed border-white/5 text-white/20')
                        }
                      >
                        Draft
                      </button>
                    ))}

                    {/* 32px flat, not the old 28/40px mobile/desktop split
                        that came with the identity block's own two widths —
                        see NAME_W's comment. Desktop pins no badge here: POS
                        is its own scrolling column instead (right after this
                        block). Mobile has no such column, so the badge sits
                        back on the avatar, the same overlay treatment the
                        board's own board-card face and the Picks rail
                        already use for a face with no room beside it. */}
                    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-sunk text-[9px] font-bold text-ink-soft">
                      {initialsFor(player)}
                      {photo && (
                        <img
                          src={photo}
                          alt=""
                          loading="lazy"
                          onError={(e) => e.currentTarget.remove()}
                          className={'absolute inset-0 h-full w-full ' + (player.pos === 'DST' ? 'object-contain p-1' : 'object-cover')}
                        />
                      )}
                      {mobile && (
                        <span
                          className={
                            'absolute -bottom-1 -right-1 rounded px-1 py-px text-[7px] font-bold leading-tight ring-2 ring-slate-sunk ' +
                            (POS_BADGE[player.pos] || 'bg-white/10 text-white/50')
                          }
                        >
                          {player.pos}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-white/90">{player.name}</p>
                      <p className="flex items-center gap-1 truncate text-[10px] text-ink-muted">
                        {player.team}
                        {INJURY_META[player.inj] && (
                          <span className={'rounded px-1 py-px text-[8px] font-bold uppercase leading-tight ' + INJURY_META[player.inj].cls}>
                            {player.inj}
                          </span>
                        )}
                        {/* Per-row, not just the one-time divider above:
                            any sort other than board order interleaves
                            deep and real players, so the divider alone
                            can't carry this once the list stops being in
                            ADP order. */}
                        {player.deep && (
                          <span
                            className="rounded px-1 py-px text-[8px] font-bold uppercase leading-tight bg-white/10 text-white/70"
                            title="No real ADP behind this ranking — Sleeper's own depth order, not a live draft"
                          >
                            Deep
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {!mobile && (
                    <div style={{ flex: `1 0 ${POS_W}px` }} className="flex shrink-0 items-center justify-center border-l border-slate-rule/40">
                      <span className={'rounded px-1.5 py-0.5 text-[9px] font-bold ' + (POS_BADGE[player.pos] || 'bg-white/10 text-white/60')}>
                        {player.pos}
                      </span>
                    </div>
                  )}

                  {visibleColumns.map((col) => {
                    const v = statValue(col, player, statCtx)
                    const tone = col.key === 'lasts' ? lastsTone(v) : null
                    return (
                      <div
                        key={col.key}
                        style={{ flex: `1 0 ${colWidth(col)}px` }}
                        className={
                          'flex shrink-0 items-center justify-end border-l border-slate-rule/40 px-1.5 py-2 text-xs tabular-nums ' +
                          (v == null
                            ? 'text-white/15'
                            : tone
                              ? LASTS_CLASS[tone] + ' font-medium'
                              : col.tone === 'teal'
                                ? 'font-semibold text-teal-400/90'
                                : col.tone === 'strong'
                                  ? 'font-medium text-white/80'
                                  : 'text-white/55')
                        }
                      >
                        {v == null ? '—' : col.key === 'lasts' ? v + '%' : v}
                      </div>
                    )
                  })}
                </motion.div>
              )
            })}
          </AnimatePresence>

          {players.length === 0 && (
            <p className="mt-8 text-center text-sm text-ink-muted">No players match this search.</p>
          )}
        </div>
      </div>
    </div>
  )
}
