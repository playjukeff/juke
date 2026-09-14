import { useEffect, useMemo, useState } from 'react'
import { STAT_COLUMNS, STAT_GROUPS, MOBILE_SORTS, lastsTone, statValue } from '../../playerColumns.js'
import { Kicker, PosChip } from '../v2ui.jsx'
import { POS_FILTERS, SORT_DEFAULT_DIR, filterAndSort, readersFor, signedInt, teamsOnBoard, tierAverages, withDividers } from './cockpitData.js'
import { DeepTag, DraftButton, FOCUS, Headshot, InjuryTag, StarButton, Switch } from './parts.jsx'
import { IconSearch } from './icons.jsx'

/* The player pool: every player still on the board, filtered, sorted and
   draftable.

   The columns are playerColumns.js's — the one union list the production
   table, the phone list and the player sheet all read — and every cell goes
   through its statValue(), so a number here cannot disagree with the same
   player's row anywhere else in the app. Filtering and sorting happen in
   cockpitData.js against the same readers the cells draw from.

   ---- Paged, not virtualised ----

   The board runs to 480 players. Drawing all of them into a table is the
   one real cost production's pool pays on every pick; here the list shows
   the first 80 and says how many more there are, which is the rule the
   locker already learned ("the button says what the press does"). Any
   filter or sort resets it to the top, where the answer to the new
   question is. */

const PAGE = 80
const COL = Object.fromEntries(STAT_COLUMNS.map((c) => [c.key, c]))
const FLEX_POS = ['RB', 'WR', 'TE']

function groupsFor(pos) {
  return STAT_GROUPS.filter((g) => {
    if (!g.positions || pos === 'ALL') return true
    if (pos === 'FLEX') return g.positions.some((p) => FLEX_POS.includes(p))
    return g.positions.includes(pos)
  })
}

function toneFor(col, raw) {
  if (raw === null || raw === undefined) return 'text-v2-ink3'
  if (col.key === 'vorp') return raw > 0 ? 'text-v2-volt' : raw < 0 ? 'text-v2-loss' : 'text-v2-ink2'
  if (col.key === 'juke') return 'text-v2-cyan'
  if (col.key === 'pts') return 'text-v2-ink'
  if (col.key === 'lasts') {
    const t = lastsTone(raw)
    return t === 'rose' ? 'text-v2-loss' : t === 'amber' ? 'text-v2-warn' : 'text-v2-ink2'
  }
  return 'text-v2-ink2'
}

function cellText(col, raw) {
  if (raw === null || raw === undefined) return '—'
  if (col.key === 'vorp') return signedInt(raw)
  if (col.key === 'lasts') return `${raw}%`
  return String(raw)
}

export function usePoolFilters() {
  const [f, setF] = useState({ search: '', pos: 'ALL', team: 'ALL', tenure: 'all', season: 'projected', showDrafted: false, sortBy: 'board', sortDir: 'asc' })
  const set = (patch) => setF((cur) => ({ ...cur, ...patch }))
  const sort = (key) => setF((cur) => {
    if (key === cur.sortBy) return { ...cur, sortDir: cur.sortDir === 'asc' ? 'desc' : 'asc' }
    return { ...cur, sortBy: key, sortDir: key === 'board' ? 'asc' : (SORT_DEFAULT_DIR[key] || 'desc') }
  })
  return [f, set, sort]
}

function FilterBar({ engine, board, f, set, counts, total, priorYear, phone }) {
  const teams = useMemo(() => teamsOnBoard(board), [board.length])
  // 16px on a phone: iOS zooms any field smaller than that on focus and
  // does not zoom back out (CLAUDE.md's touch-screen rule).
  const sel = `h-10 rounded-[9px] bg-v2-inset px-2.5 text-[16px] text-v2-ink ring-1 ring-inset ring-white/[0.1] sm:text-[13px] ${FOCUS}`
  const narrowed = f.team !== 'ALL' || f.tenure !== 'all' || f.season !== 'projected' || f.showDrafted
  const extras = (
    <>
      <label className={phone ? 'block' : ''}>
        <span className="sr-only">NFL team</span>
        <select value={f.team} onChange={(e) => set({ team: e.target.value })} className={`${sel} ${phone ? 'w-full' : ''}`}>
          <option value="ALL">All NFL teams</option>
          {teams.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label className={phone ? 'block' : ''}>
        <span className="sr-only">Tenure</span>
        <select value={f.tenure} onChange={(e) => set({ tenure: e.target.value })} className={`${sel} ${phone ? 'w-full' : ''}`}>
          <option value="all">All tenure</option>
          <option value="rookie">Rookies</option>
          <option value="veteran">Veterans</option>
        </select>
      </label>
      {priorYear && (
        <label className={phone ? 'block' : ''}>
          <span className="sr-only">Season shown</span>
          <select value={f.season} onChange={(e) => set({ season: e.target.value })} className={`${sel} ${phone ? 'w-full' : ''}`}>
            <option value="projected">2026 projection</option>
            <option value="prior">{priorYear} actual</option>
          </select>
        </label>
      )}
      <Switch checked={f.showDrafted} onChange={(v) => set({ showDrafted: v })} label="Show drafted" />
    </>
  )
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-[180px]">
          <span className="sr-only">Search players</span>
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-v2-ink3" />
          <input
            type="search"
            value={f.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="Search players"
            className={`h-10 w-full rounded-[9px] bg-v2-inset pl-9 pr-3 text-[16px] text-v2-ink ring-1 ring-inset ring-white/[0.1] placeholder:text-v2-ink3 sm:text-[13px] ${FOCUS}`}
          />
        </label>
        {!phone && extras}
      </div>
      {phone && (
        <details className="group rounded-[10px] bg-v2-inset ring-1 ring-inset ring-white/[0.06] [&_summary::-webkit-details-marker]:hidden">
          <summary className={`flex min-h-[40px] cursor-pointer list-none items-center justify-between px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-v2-ink2 ${FOCUS}`}>
            Filters{narrowed ? ' · on' : ''}
            <span className="grid h-5 w-5 place-items-center rounded-full ring-1 ring-inset ring-white/[0.15] transition-transform group-open:rotate-45" aria-hidden="true">+</span>
          </summary>
          <div className="grid grid-cols-1 gap-2 px-3 pb-3">{extras}</div>
        </details>
      )}

      <div className="flex items-center gap-2">
        <div role="group" aria-label="Position" className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
          {POS_FILTERS.map((pos) => {
            const on = f.pos === pos
            const c = counts ? counts[pos] : null
            return (
              <button
                key={pos}
                type="button"
                aria-pressed={on}
                onClick={() => set({ pos })}
                className={`flex min-h-[44px] shrink-0 flex-col items-center justify-center rounded-[9px] px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors ${FOCUS} ${
                  on ? 'bg-v2-volt text-v2-voltInk' : 'text-v2-ink2 ring-1 ring-inset ring-white/[0.08] hover:text-v2-ink'
                }`}
              >
                <span>{pos === 'DST' ? 'D/ST' : pos}</span>
                {c && pos !== 'FLEX' && (
                  <span className={`text-[10px] tabular-nums ${on ? '' : c.short ? 'text-v2-ink' : 'text-v2-ink3'}`}>{c.text}</span>
                )}
              </button>
            )
          })}
        </div>
        <span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-v2-ink3 sm:inline">{total} {f.showDrafted ? 'players' : 'available'}</span>
      </div>

      {phone && (
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Sort" className="flex flex-1 gap-1">
            {MOBILE_SORTS.map((s) => {
              const on = f.sortBy === s.key
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ sortBy: s.key, sortDir: s.key === 'board' ? 'asc' : (SORT_DEFAULT_DIR[s.key] || 'desc') })}
                  className={`min-h-[36px] flex-1 rounded-[8px] font-mono text-[11px] font-semibold uppercase tracking-[0.06em] ${FOCUS} ${
                    on ? 'bg-white/[0.1] text-v2-ink' : 'text-v2-ink3 hover:text-v2-ink'
                  }`}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-v2-ink3">{total} left</span>
        </div>
      )}
    </div>
  )
}

function Divider({ row }) {
  if (row.type === 'deep') {
    return (
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-y border-white/[0.1] bg-white/[0.02] px-3 py-2">
        <Kicker tone="text-v2-ink">Real ADP ends here</Kicker>
        <span className="text-[12px] text-v2-ink2">Below this line no real draft has taken these players — ranked by Sleeper’s own depth order, and marked Deep.</span>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-y border-v2-warn/20 bg-v2-warn/[0.04] px-3 py-2">
      <Kicker tone="text-v2-warn">{row.pos} tier {row.tier} ends</Kicker>
      <span className="text-[12px] text-v2-ink2">
        {row.remaining} {row.pos}{row.remaining === 1 ? '' : 's'} left before the drop
        {row.drop == null ? ' — no more after this tier' : row.drop > 0 ? ` — the next tier projects ${row.drop} fewer points` : ' — the next tier projects about the same'}
      </span>
    </div>
  )
}

export default function PlayerPool({ engine, version, f, set, sort, canDraft, draftReason, onDraft, onOpen, nextOverall, phone }) {
  const board = engine.board() || []
  const [shown, setShown] = useState(PAGE)
  const filterKey = JSON.stringify(f)
  useEffect(() => { setShown(PAGE) }, [filterKey])

  const readers = useMemo(() => readersFor(engine, f.season, nextOverall), [engine, f.season, nextOverall, version])
  const players = useMemo(() => filterAndSort(engine, board, f, readers), [version, filterKey, readers])
  const tierAvg = useMemo(() => tierAverages(board, readers.pointsProjected), [version, board.length])
  const rows = useMemo(() => withDividers(engine, players, f, tierAvg), [players, tierAvg])
  const counts = engine.filterCounts()
  const queued = new Set(engine.queue() || [])
  const picks = engine.picks() || []
  const takenBy = (p) => {
    const pick = picks.find((x) => x.player === p || x.player.name === p.name)
    return pick ? engine.teamLabel(pick.slot) : null
  }

  // Page by player rows, not by divider rows.
  let playersSeen = 0
  const visible = []
  for (const r of rows) {
    if (r.type === 'player') {
      if (playersSeen >= shown) break
      playersSeen++
    }
    visible.push(r)
  }
  const remaining = players.length - playersSeen

  const groups = groupsFor(f.pos)
  const cols = groups.flatMap((g) => g.keys.map((k) => COL[k]))
  const ctx = readers
  const seasonLabel = f.season === 'prior' && readers.priorYear ? `${readers.priorYear} actual` : 'Projected'

  const more = remaining > 0 && (
    <div className="flex items-center justify-between gap-3 px-3 py-3">
      <span className="font-mono text-[11px] tabular-nums text-v2-ink3">Showing {playersSeen} of {players.length}</span>
      <button type="button" onClick={() => setShown((n) => n + PAGE)} className={`min-h-[40px] rounded-[9px] px-3.5 text-[13px] font-medium text-v2-ink ring-1 ring-inset ring-white/[0.12] hover:bg-white/[0.04] ${FOCUS}`}>
        Show {Math.min(PAGE, remaining)} more
      </button>
    </div>
  )

  const empty = !players.length && (
    <div className="px-4 py-12 text-center">
      <span className="block font-telemetry text-[22px] font-bold uppercase italic text-v2-ink">Nobody matches</span>
      <span className="mt-1 block text-[13px] text-v2-ink2">Clear the search or widen a filter.</span>
    </div>
  )

  if (phone) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-white/[0.06] px-3 py-3">
          <FilterBar engine={engine} board={board} f={f} set={set} counts={counts} total={players.length} priorYear={readers.priorYear} phone />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {empty}
          <ul>
            {visible.map((row) => {
              if (row.type !== 'player') return <li key={row.key}><Divider row={row} /></li>
              const p = row.player
              const by = p.drafted ? takenBy(p) : null
              const pick = (k) => { const c = COL[k]; const raw = statValue(c, p, ctx); return { c, raw } }
              const stats = ['pts', 'vorp', 'juke', 'lasts'].map(pick)
              return (
                <li key={row.key} className="border-b border-white/[0.05] px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <StarButton on={queued.has(p.name)} onClick={() => engine.queueToggle(p.name)} name={p.name} size="h-11 w-9" />
                    <button type="button" onClick={() => onOpen(p)} className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-[8px] text-left ${FOCUS}`}>
                      <Headshot src={engine.photoUrl(p)} name={p.name} pos={p.pos} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[14px] font-semibold text-v2-ink">{p.name}</span>
                          <InjuryTag code={p.inj} />
                          {p.deep && <DeepTag />}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <PosChip pos={p.pos} />
                          <span className="font-mono text-[10px] tabular-nums text-v2-ink3">{p.team} · bye {p.bye || '—'} · ADP {typeof p.adp === 'number' ? p.adp.toFixed(1) : '—'}</span>
                        </span>
                      </span>
                    </button>
                    {by ? (
                      <span className="max-w-[80px] truncate text-right font-mono text-[10px] text-v2-ink3">{by}</span>
                    ) : (
                      <DraftButton size="sm" disabled={!canDraft} reason={draftReason} onClick={() => onDraft(p)} className="min-h-[44px]" />
                    )}
                  </div>
                  <dl className="mt-2 grid grid-cols-4 gap-1 pl-[46px]">
                    {stats.map(({ c, raw }) => (
                      <div key={c.key}>
                        <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-v2-ink3">{c.label}</dt>
                        <dd className={`font-mono text-[13px] font-semibold tabular-nums ${toneFor(c, raw)}`}>{cellText(c, raw)}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              )
            })}
          </ul>
          {more}
        </div>
      </div>
    )
  }

  const th = (col) => {
    const on = f.sortBy === col.key
    const ariaSort = on ? (f.sortDir === 'asc' ? 'ascending' : 'descending') : undefined
    return (
      <th key={col.key} scope="col" aria-sort={ariaSort} className="border-b border-white/[0.07] bg-v2-panel p-0 text-right" style={{ minWidth: col.width + 8 }}>
        {col.sortable ? (
          <button
            type="button"
            onClick={() => sort(col.key)}
            className={`inline-flex h-9 w-full items-center justify-end gap-0.5 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${FOCUS} ${on ? 'text-v2-ink' : 'text-v2-ink3 hover:text-v2-ink2'}`}
          >
            {col.label}
            <span aria-hidden="true" className="w-2 text-[9px]">{on ? (f.sortDir === 'asc' ? '▲' : '▼') : ''}</span>
          </button>
        ) : (
          <span className="inline-flex h-9 items-center px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-v2-ink3">{col.label}</span>
        )}
      </th>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-white/[0.06] px-4 py-3">
        <FilterBar engine={engine} board={board} f={f} set={set} counts={counts} total={players.length} priorYear={readers.priorYear} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-max border-separate border-spacing-0 bg-v2-panel text-left">
          <thead className="sticky top-0 z-10">
            <tr>
              <th scope="col" rowSpan={2} className="sticky left-0 z-20 border-b border-white/[0.07] bg-v2-panel px-3 text-left align-bottom">
                <button
                  type="button"
                  onClick={() => sort('board')}
                  aria-pressed={f.sortBy === 'board'}
                  className={`inline-flex h-9 items-center font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${FOCUS} ${f.sortBy === 'board' ? 'text-v2-ink' : 'text-v2-ink3 hover:text-v2-ink2'}`}
                >
                  Player · board order
                </button>
              </th>
              {groups.map((g) => (
                <th key={g.label || 'ref'} scope="colgroup" colSpan={g.keys.length} className={`border-l border-white/[0.05] bg-v2-panel px-2 pt-2 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${g.teal ? 'text-v2-cyan' : 'text-v2-ink3'}`}>
                  {g.label === 'Projected' ? seasonLabel : g.label}
                </th>
              ))}
            </tr>
            <tr>{cols.map((c) => th(c))}</tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              if (row.type !== 'player') {
                return (
                  <tr key={row.key}>
                    <td colSpan={cols.length + 1} className="p-0">
                      <div className="sticky left-0 w-[min(640px,100%)]"><Divider row={row} /></div>
                    </td>
                  </tr>
                )
              }
              const p = row.player
              const by = p.drafted ? takenBy(p) : null
              return (
                <tr key={row.key} className="group">
                  <td className="sticky left-0 z-[1] border-b border-white/[0.04] bg-v2-panel px-2 py-1.5 group-hover:bg-v2-raised">
                    <div className="flex w-[300px] items-center gap-2">
                      <StarButton on={queued.has(p.name)} onClick={() => engine.queueToggle(p.name)} name={p.name} />
                      {by ? (
                        <span className="w-[62px] shrink-0 truncate font-mono text-[10px] text-v2-ink3" title={`Taken by ${by}`}>{by}</span>
                      ) : (
                        <DraftButton size="sm" disabled={!canDraft} reason={draftReason} onClick={() => onDraft(p)} className="w-[62px]" />
                      )}
                      <button type="button" onClick={() => onOpen(p)} className={`flex min-w-0 flex-1 items-center gap-2 rounded-[6px] text-left ${FOCUS}`}>
                        <Headshot src={engine.photoUrl(p)} name={p.name} pos={p.pos} size={28} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className={`truncate text-[13px] font-medium ${p.drafted ? 'text-v2-ink3 line-through' : 'text-v2-ink'}`}>{p.name}</span>
                            <InjuryTag code={p.inj} />
                            {p.deep && <DeepTag />}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <PosChip pos={p.pos} className="!h-[16px] !min-w-[26px]" />
                            <span className="font-mono text-[10px] text-v2-ink3">{p.team || 'FA'}</span>
                          </span>
                        </span>
                      </button>
                    </div>
                  </td>
                  {cols.map((c) => {
                    const raw = statValue(c, p, ctx)
                    return (
                      <td key={c.key} className={`border-b border-white/[0.04] px-2 py-1.5 text-right font-mono text-[12px] tabular-nums group-hover:bg-v2-raised ${toneFor(c, raw)} ${c.key === 'pts' ? 'font-semibold' : ''}`}>
                        {cellText(c, raw)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
        {empty}
        {more}
      </div>
    </div>
  )
}
