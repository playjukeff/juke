import { useEffect, useState } from 'react'
import { knownAbout } from '../../rooms/prospectBoard.js'
import { Delta, Fig, GoLink, Label, PosTag, Seg, Sheet, ValueBar, cx, ordinal } from '../ui.jsx'
import { FORMATS, FORMAT_LABEL, findByName, posWord } from './playerData.js'
import { Meter } from './parts.jsx'

/* The player page's sections, one per thing production's sheet could show
   (Our Read, Draft Fit, Projections, Usage, Game Logs, Latest News, Depth
   Chart) plus the two the phone profile had that the desktop card did not
   (a career by season, the team's offensive ranks) and one production kept
   in the Prospect Room only (what is known about a rookie).

   Each draws exactly what its engine function hands it — jukeReadout(),
   projectionSummary(), projectionRecord(), usageFor(), gameLogFor(),
   depthChartFor(), draftFit(), prospectFor() — and decides nothing about
   football itself. Where production's sheet made a presentation decision
   with a reason attached (the three replacement bands, games played beside
   every season, the tab that is absent rather than empty), the decision is
   kept and the look is v3's. */

function TH({ children, align = 'right', className = '' }) {
  return (
    <th scope="col" className={cx('px-3 py-2 font-figure text-[12px] font-semibold uppercase tracking-[0.1em] text-v3-ink3', align === 'left' ? 'text-left' : 'text-right', className)}>
      {children}
    </th>
  )
}

function TableBox({ children, caption, minWidth }) {
  return (
    <div className="overflow-x-auto rounded-[4px] border border-v3-rule">
      <table className="w-full border-collapse bg-v3-sheet border-0 [&_th]:border-0 [&_th]:bg-v3-sheet [&_td]:border-0" style={minWidth ? { minWidth } : undefined}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  )
}

function Note({ children, className = '' }) {
  return <p className={cx('text-[13px] leading-[1.55] text-v3-ink3', className)}>{children}</p>
}

/* ---- The Juke score, with its arithmetic ---- */

function Step({ n, title, sub, children }) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-v3-band font-figure text-[13px] font-bold text-white">{n}</span>
      <div className="min-w-0">
        <div className="text-[15px] font-bold text-v3-ink">{title} {sub && <span className="font-normal text-v3-ink2">— {sub}</span>}</div>
        <div className="mt-1.5">{children}</div>
      </div>
    </li>
  )
}

export function JukeSheet({ d }) {
  const r = d.readout
  const p = d.player
  if (!r) return null
  const noProjection = r.score === null && !r.unranked

  /* Three bands, not two — production's own call (OurReadTab). A gap of
     exactly 0 reads worst as a bare score: 20 points is about three games
     across a season, and inside that the honest sentence is "you can wait". */
  const near = r.gap !== null && r.gap <= 0 && Math.abs(r.gap) <= 20
  const below = r.gap !== null && r.gap < 0 && Math.abs(r.gap) > 20
  const above = r.gap !== null && r.gap > 0
  const proj = p.projPts === null || p.projPts === undefined ? null : Math.round(p.projPts)
  const replacement = proj !== null && r.gap !== null ? proj - r.gap : null
  const scale = Math.max(proj || 0, replacement || 0, 1)

  return (
    <Sheet code="Juke score" aside={`${d.scoring} · ${r.teams}-team league`} aria-label="Juke score">
      {noProjection ? (
        <p className="text-[16px] leading-[1.55] text-v3-ink2">
          No projection for this player yet, so there is nothing to score him on. The nightly data refresh fills this in for anyone Sleeper carries.
        </p>
      ) : r.unranked ? (
        <div className="grid gap-3">
          <div className="flex items-baseline gap-3">
            <span className="text-[28px] font-black tracking-[-0.02em] text-v3-ink">Not rated</span>
            <Label>{posWord(p.pos)} · withheld</Label>
          </div>
          <p className="max-w-[64ch] text-[16px] leading-[1.55] text-v3-ink2">{r.unrankedNote}</p>
          <p className="max-w-[64ch] text-[15px] leading-[1.55] text-v3-ink">
            {p.pos === 'DST' ? 'This defense is' : 'He is'} projected for <Fig className="font-bold">{Math.round(p.projPts)}</Fig> points under {d.scoring}; what Juke will not do is say where that puts {p.pos === 'DST' ? 'it among defenses' : 'him among kickers'}.
          </p>
        </div>
      ) : (
        <div className="grid gap-5">
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-6">
            <div className="flex items-baseline gap-3 sm:block">
              <Fig className="block text-[56px] font-bold leading-none text-v3-ink">{r.score}</Fig>
              <Label className="sm:mt-2 sm:block">{r.label}</Label>
            </div>
            <div className="grid gap-2">
              {above && (
                <p className="text-[16px] leading-[1.55] text-v3-ink">
                  <Delta value={r.gap} unit="pts" /> above a replacement starter — startable {posWord(p.pos)} territory runs to{' '}
                  <strong className="font-semibold">{r.replacementRank}</strong> on this board.
                </p>
              )}
              {near && (
                <p className="text-[16px] leading-[1.55] text-v3-ink">
                  <strong className="font-semibold">About replacement level</strong> — roughly what a freely available {posWord(p.pos)} is worth, because startable territory runs to{' '}
                  <strong className="font-semibold">{r.replacementRank}</strong> on this board. The projected points are real; a low score means you can wait rather than spend a pick, not that he is bad.
                </p>
              )}
              {below && (
                <p className="text-[16px] leading-[1.55] text-v3-ink">
                  <strong className="font-semibold">Below replacement</strong> — <Delta value={r.gap} unit="pts" /> against a replacement starter, where startable {posWord(p.pos)} territory begins at{' '}
                  <strong className="font-semibold">{r.replacementRank}</strong>. A score of 0 is a floor, not a verdict: about a third of the players who scored zero on one season&apos;s actuals were above replacement the next.
                </p>
              )}
              <p className="text-[15px] leading-[1.55] text-v3-ink2">{r.reason}</p>
            </div>
          </div>

          {proj !== null && replacement !== null && (
            <div className="rounded-[6px] border border-v3-rule bg-v3-paper p-4">
              <Label>How the score is made</Label>
              <ol className="mt-3 grid gap-3">
                <Step n={1} title="Project the season" sub={`under ${d.scoring}, from raw stats`}>
                  <div className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-3">
                    <ValueBar value={proj} max={scale} tone="neutral" />
                    <Fig className="text-right text-[14px] font-bold text-v3-ink">{proj}</Fig>
                  </div>
                </Step>
                <Step n={2} title={`Find the replaceable ${posWord(p.pos)}`} sub={`startable territory runs to ${r.replacementRank} on this board`}>
                  <div className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-3">
                    <ValueBar value={replacement} max={scale} tone="neutral" />
                    <Fig className="text-right text-[14px] font-bold text-v3-ink">{replacement}</Fig>
                  </div>
                </Step>
                <Step n={3} title="Measure the gap over that line">
                  <p className="text-[14px] leading-[1.5] text-v3-ink2">
                    <Fig>{proj} − {replacement} =</Fig> <Delta value={r.gap} unit="pts" />. Against the biggest gap on the board, that is a Juke score of <Fig className="font-bold text-v3-ink">{r.score}</Fig> — never below 0, never above 100.
                  </p>
                </Step>
              </ol>
            </div>
          )}
        </div>
      )}

      {r.deep && (
        <p className="mt-5 rounded-[6px] border border-v3-rule bg-v3-well px-4 py-3 text-[14px] leading-[1.55] text-v3-ink2">
          <strong className="font-semibold text-v3-ink">Deep board</strong> — {r.deepNote}
        </p>
      )}

      {r.upside !== null && (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { name: 'Upside', v: r.upside, label: r.upsideLabel, why: r.upsideWhy },
            { name: 'Bust risk', v: r.bust, label: r.bustLabel, why: r.bustWhy },
          ].map((m) => (
            <div key={m.name} className="rounded-[6px] border border-v3-rule p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[15px] font-bold text-v3-ink">{m.name}</span>
                <span className="font-figure text-[13px] font-semibold uppercase tracking-[0.08em] text-v3-ink2">{m.label}</span>
              </div>
              <div className="mt-2"><Meter value={m.v} /></div>
              {m.why && m.why.length > 0 && <p className="mt-2 text-[13px] leading-[1.5] text-v3-ink3">{m.why.join(' · ')}</p>}
            </div>
          ))}
        </div>
      )}

      {r.priorScore !== null && r.priorSeason && (
        <p className="mt-4 text-[14px] text-v3-ink2">
          Scored <Fig className="font-bold text-v3-ink">{r.priorScore}</Fig> on {r.priorSeason} actuals
          {r.priorGames !== null ? <> ({r.priorGames} game{r.priorGames === 1 ? '' : 's'})</> : null}.
        </p>
      )}

      {!r.unranked && !noProjection && (
        <Note className="mt-4">
          The Juke score is projected points above the last startable player at this position in a {r.teams}-team league, as a share of the best such figure on the board. It is a ranking against the pool, not a rating of the player — somebody always scores 100, and most of the {r.boardSize} players here score nothing, because a league this size only ever starts {r.startersInPlay} at once.
        </Note>
      )}
    </Sheet>
  )
}

/* ---- The projection ---- */

export function ProjectionSheet({ d }) {
  const s = d.summary
  const p = d.player
  const maxPts = Math.max(1, ...d.byFormat.map((f) => f.pts || 0))
  const unranked = !!(d.readout && d.readout.unranked)
  return (
    <Sheet code="Projection" aside={`2026 · ${d.scoring}`} aria-label="Projection">
      {!s ? (
        <p className="text-[16px] text-v3-ink2">No projection stored for this player yet.</p>
      ) : (
        <div className="grid gap-5">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Season points', <Fig key="a" className="font-bold">{s.points}</Fig>],
              ['Per game', <Fig key="b" className="font-bold">{s.perGame}</Fig>],
              ['Projects', unranked ? <span key="c" className="text-[18px] font-bold">Not ranked</span> : <Fig key="c" className="font-bold">{s.posRank || '—'}</Fig>],
              ['vs market', unranked ? <Fig key="d" className="text-v3-ink3">—</Fig> : <Delta key="d" value={s.vsAdp} />],
            ].map(([k, v]) => (
              <div key={k} className="rounded-[6px] bg-v3-paper p-3">
                <dt><Label className="text-[11px]">{k}</Label></dt>
                <dd className="mt-1 text-[22px] leading-none text-v3-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <Note>
            {unranked
              ? <>Drafted as <strong className="font-semibold text-v3-ink2">{posWord(p.pos)}{p.posRank}</strong> by the market. Juke does not rank {p.pos === 'DST' ? 'defenses' : 'kickers'} against each other, so there is no projected rank to set beside it.</>
              : <>Drafted as <strong className="font-semibold text-v3-ink2">{posWord(p.pos)}{p.posRank}</strong> by the market; &ldquo;vs market&rdquo; is how many places higher (or lower) the projection ranks him within his position.</>}
          </Note>

          {s.stats.length > 0 && (
            <div>
              <Label>Projected stat line</Label>
              <dl className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {s.stats.map((st) => (
                  <div key={st.key} className="rounded-[4px] border border-v3-rule px-2 py-2 text-center">
                    <dt className="font-figure text-[11px] font-semibold uppercase tracking-[0.08em] text-v3-ink3">{st.label}</dt>
                    <dd className="mt-0.5 font-figure text-[16px] font-bold tabular-nums text-v3-ink">{st.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <div>
            <Label>Under each scoring</Label>
            <ul className="mt-2 grid gap-2">
              {d.byFormat.map((f) => (
                <li key={f.format} className="grid grid-cols-[3.25rem_minmax(0,1fr)_3.5rem_4.5rem] items-center gap-3">
                  <span className={cx('font-figure text-[13px] font-bold uppercase tracking-[0.06em]', f.format === d.live ? 'text-v3-ink' : 'text-v3-ink3')}>{FORMAT_LABEL[f.format]}</span>
                  <ValueBar value={f.pts} max={maxPts} tone="neutral" />
                  <Fig className="text-right text-[14px] font-bold text-v3-ink">{f.pts === null ? '—' : Math.round(f.pts)}</Fig>
                  <span className="text-right text-[14px]"><Delta value={f.vorp} /></span>
                </li>
              ))}
            </ul>
            <Note className="mt-2">
              Season points, then points over replacement, under each of the three stock tables — {FORMAT_LABEL[d.live]} is the one your mock is set to.
              {d.byFormat.every((f) => f.vorp === null) ? ' Kickers and defenses are not rated, so they carry no figure over replacement.' : ''}
            </Note>
          </div>
        </div>
      )}
    </Sheet>
  )
}

/* ---- Our record, and every season ---- */

export function RecordSheet({ record }) {
  if (!record || !record.length) return null
  return (
    <Sheet code="Our record on him" aside="What we said · what happened" aria-label="Our record on him">
      <TableBox caption="Our archived preseason projection against his actual season" minWidth={360}>
        <thead className="border-b border-v3-rule">
          <tr><TH align="left">Year</TH><TH>We said</TH><TH>He got</TH><TH>Diff</TH><TH>GP</TH></tr>
        </thead>
        <tbody>
          {record.map((row) => (
            <tr key={row.year} className="border-b border-v3-rule last:border-b-0">
              <td className="px-3 py-2 text-left font-figure text-[15px] text-v3-ink2">{row.year}</td>
              <td className="px-3 py-2 text-right font-figure text-[15px] tabular-nums text-v3-ink2">{Math.round(row.proj)}</td>
              <td className="px-3 py-2 text-right font-figure text-[15px] font-bold tabular-nums text-v3-ink">{Math.round(row.act)}</td>
              <td className="px-3 py-2 text-right text-[15px]"><Delta value={row.diff} /></td>
              <td className="px-3 py-2 text-right font-figure text-[15px] tabular-nums text-v3-ink3">{row.games === null ? '—' : row.games}</td>
            </tr>
          ))}
        </tbody>
      </TableBox>
      <Note className="mt-3">
        A projection is an expected value that prices in injury risk, so it runs about 20 points light on anyone who stays fit — most healthy seasons beat it. Games played is the column to read beside a big miss: most of a forecast&apos;s error is availability.
      </Note>
    </Sheet>
  )
}

export function SeasonsSheet({ seasons, live }) {
  if (!seasons || !seasons.length) return null
  return (
    <Sheet code="Seasons" aside={`${seasons.length} on file`} aria-label="Seasons">
      <TableBox caption="Fantasy points by season under each scoring format" minWidth={360}>
        <thead className="border-b border-v3-rule">
          <tr>
            <TH align="left">Year</TH>
            <TH>GP</TH>
            {FORMATS.map((f) => <TH key={f} className={f === live ? 'text-v3-ink' : ''}>{FORMAT_LABEL[f]}</TH>)}
          </tr>
        </thead>
        <tbody>
          {seasons.map((s) => (
            <tr key={s.year} className="border-b border-v3-rule last:border-b-0">
              <td className="px-3 py-2 text-left font-figure text-[15px] text-v3-ink2">{s.year}</td>
              <td className="px-3 py-2 text-right font-figure text-[15px] tabular-nums text-v3-ink3">{s.games === null ? '—' : s.games}</td>
              {FORMATS.map((f) => (
                <td key={f} className={cx('px-3 py-2 text-right font-figure text-[15px] tabular-nums', f === live ? 'font-bold text-v3-ink' : 'text-v3-ink2')}>
                  {s.pts[f] === null || s.pts[f] === undefined ? '—' : Math.round(s.pts[f])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </TableBox>
      <Note className="mt-3">Every stored season rescored under each stock table, with {FORMAT_LABEL[live]} — your mock&apos;s scoring — in bold. A season he did not play is left out rather than shown as a zero.</Note>
    </Sheet>
  )
}

/* ---- Usage: absent, not empty, when usageFor() answers null ---- */

export function UsageSheet({ usage }) {
  if (!usage) return null
  return (
    <Sheet code="Usage" aside="How he was used" aria-label="Usage">
      <TableBox caption="Usage by season" minWidth={Math.max(360, 120 + usage.head.length * 76)}>
        <thead className="border-b border-v3-rule">
          <tr>
            <TH align="left">Year</TH>
            {usage.head.map((h) => <TH key={h} className="whitespace-nowrap">{h}</TH>)}
            <TH>GP</TH>
          </tr>
        </thead>
        <tbody>
          {usage.rows.map((row) => (
            <tr key={row.year} className="border-b border-v3-rule last:border-b-0">
              <td className="px-3 py-2 text-left font-figure text-[15px] text-v3-ink2">{row.year}</td>
              {row.cells.map((c, i) => (
                <td key={usage.head[i]} className="whitespace-nowrap px-3 py-2 text-right font-figure text-[15px] tabular-nums text-v3-ink">{c === null ? '—' : c}</td>
              ))}
              <td className="px-3 py-2 text-right font-figure text-[15px] tabular-nums text-v3-ink3">{row.games === null ? '—' : row.games}</td>
            </tr>
          ))}
        </tbody>
      </TableBox>
      <div className="mt-3 grid gap-2">
        {usage.hasShare && <Note>Share is of his team&apos;s whole season, not of the games he played — read it next to GP. A negative air-yards share is real: a screen pass is caught behind the line.</Note>}
        {usage.hasModel && <Note>xFP is what an average player would have scored from the same opportunities, per the ffverse expected-points model, and ±xFP is how far he beat or trailed that. Both are under the model&apos;s own scoring; your scoring settings do not move them.</Note>}
        <Note>These explain a season rather than rank a player. Nothing here feeds the Juke score, the suggestions or the CPU — measured against points per game, usage predicted next season no better.</Note>
      </div>
    </Sheet>
  )
}

/* ---- Game logs ---- */

export function LogsSheet({ engine, player }) {
  const [picked, setPicked] = useState(null)
  // gameLogFor() resolves a year this player does not have to his most
  // recent one, so a stale pick from another player falls back correctly.
  const log = engine.gameLogFor(player, picked)
  if (!log || !log.year) return null
  return (
    <Sheet code="Game logs" aside={`${log.year} · ${log.perGameAvg} per game played`} aria-label="Game logs">
      {log.years.length > 1 && (
        <div className="mb-4">
          <Seg label="Season" value={log.year} onChange={setPicked} options={log.years.map((y) => ({ value: y, label: y }))} />
        </div>
      )}
      <TableBox caption={`${log.year} week by week`} minWidth={Math.max(360, log.head.length * 64)}>
        <thead className="border-b border-v3-rule">
          <tr>{log.head.map((h, i) => <TH key={h + i} align={i === 0 ? 'left' : 'right'} className="whitespace-nowrap">{h}</TH>)}</tr>
        </thead>
        <tbody>
          {log.rows.map((row, i) => (
            <tr key={i} className="border-b border-v3-rule last:border-b-0">
              {row.cells.map((v, j) => (
                <td
                  key={j}
                  className={cx(
                    'whitespace-nowrap px-3 py-1.5 font-figure text-[14px] tabular-nums',
                    j === 0 ? 'text-left' : 'text-right',
                    row.blank ? 'text-v3-ink3' : j === 1 && row.tone === 'hi' ? 'font-bold text-v3-gain' : j === 1 && row.tone === 'lo' ? 'text-v3-cost' : j === 1 ? 'font-semibold text-v3-ink' : 'text-v3-ink2',
                  )}
                >
                  {v === null ? '—' : v}
                  {j === 1 && !row.blank && row.tone === 'hi' && <span className="sr-only"> (well above his average)</span>}
                  {j === 1 && !row.blank && row.tone === 'lo' && <span className="sr-only"> (well below his average)</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </TableBox>
      <Note className="mt-3">Points under your mock&apos;s scoring. Green is a week at 1.4 times his average or better, red one at half of it or worse; a dimmed row is a week he did not play.</Note>
    </Sheet>
  )
}

/* ---- Latest news: the worker's route, and gone when it is not wired up ---- */

export function NewsSheet({ engine, player }) {
  // null: not asked yet or still asking. 'off': no provider, or no id to ask
  // with — the section draws nothing (production's contract: a section
  // nobody asked to wait for is worse as an empty box than as no box).
  const [items, setItems] = useState(null)
  useEffect(() => {
    setItems(null)
    const theirId = engine.sourceId ? engine.sourceId(player, 'tank') : null
    const live = typeof window !== 'undefined' ? window.Live : null
    if (!theirId || !live || !live.news) { setItems('off'); return undefined }
    // Which player an answer belongs to is checked when it LANDS.
    let stale = false
    live.news(theirId)
      .then((data) => {
        if (stale) return
        if (!data || data.configured === false) { setItems('off'); return }
        setItems((data.items || []).map(engine.newsItemView).filter(Boolean))
      })
      .catch(() => { if (!stale) setItems('off') })
    return () => { stale = true }
  }, [engine, player.id])

  if (items === null || items === 'off') return null
  return (
    <Sheet code="Latest news" aside="Linked, not reproduced" aria-label="Latest news">
      {items.length === 0 ? (
        <p className="text-[15px] text-v3-ink2">No recent headlines for this player.</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((n) => (
            <li key={n.url}>
              <a href={n.url} target="_blank" rel="noopener noreferrer" className="block rounded-[6px] border border-v3-rule p-3 hover:border-v3-ink3 hover:bg-v3-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call">
                <span className="block text-[15px] font-semibold leading-snug text-v3-ink">{n.title}</span>
                {n.summary && <span className="mt-1 block text-[14px] leading-[1.5] text-v3-ink2">{n.summary}</span>}
                <span className="mt-1.5 block font-figure text-[12px] uppercase tracking-[0.08em] text-v3-ink3">{n.source}{n.when ? ` · ${n.when}` : ''}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <Note className="mt-3">Headlines from our news provider, linked rather than reproduced. Juke does not write these and does not endorse them.</Note>
    </Sheet>
  )
}

/* ---- The depth chart, and the offense around him ---- */

const RANK_LABELS = [['off', 'Offense'], ['passYd', 'Pass yds'], ['passAtt', 'Pass att'], ['passTd', 'Pass TD'], ['td', 'Total TD']]

export function DepthSheet({ engine, d }) {
  const p = d.player
  const raw = engine.depthChartFor ? engine.depthChartFor(p) : null
  // His own group first, the rest in the order the engine hands them.
  const groups = raw ? [...raw.filter((g) => g.players.some((x) => x.isSelf)), ...raw.filter((g) => !g.players.some((x) => x.isSelf))] : null
  const ranks = d.teamRanks
  if (!groups && !ranks) return null
  return (
    <Sheet code="Depth chart" aside={p.team || ''} aria-label="Depth chart">
      {ranks && (
        <div className="mb-5">
          <Label>{p.team} offense, NFL rank{d.teamRanksMeta && d.teamRanksMeta.season ? ` · ${d.teamRanksMeta.season}` : ''}</Label>
          <dl className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {RANK_LABELS.filter(([k]) => ranks[k]).map(([k, label]) => (
              <div key={k} className="rounded-[4px] bg-v3-paper px-2 py-2">
                <dt className="truncate font-figure text-[11px] font-semibold uppercase tracking-[0.08em] text-v3-ink3">{label}</dt>
                <dd className="mt-0.5 font-figure text-[16px] font-bold text-v3-ink">{ordinal(ranks[k].rank)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {groups ? (
        <div className="grid gap-4">
          {groups.map((g) => (
            <div key={g.group}>
              <Label>{g.group}</Label>
              <ul className="mt-1.5 grid gap-1">
                {g.players.map((x) => {
                  const other = !x.isSelf ? findByName(engine, x.name, p.team) : null
                  return (
                    <li
                      key={x.name}
                      className={cx('grid min-h-[40px] grid-cols-[1.5rem_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-[4px] px-2', x.isSelf ? 'bg-v3-band text-white' : 'border border-v3-rule')}
                      aria-current={x.isSelf ? 'true' : undefined}
                    >
                      <span className={cx('text-center font-figure text-[12px]', x.isSelf ? 'text-v3-bandInk' : 'text-v3-ink3')}>{x.order || '–'}</span>
                      <PosTag pos={x.pos} />
                      {other ? (
                        <a href={`#/v3/players/${encodeURIComponent(other.id)}`} className="truncate text-[14px] font-semibold text-v3-ink underline decoration-v3-rule decoration-2 underline-offset-4 hover:decoration-v3-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call">{x.name}</a>
                      ) : (
                        <span className={cx('truncate text-[14px] font-semibold', x.isSelf ? 'text-white' : 'text-v3-ink')}>{x.name}</span>
                      )}
                      <span className={cx('font-figure text-[12px]', x.isSelf ? 'text-v3-bandInk' : 'text-v3-ink3')}>ADP {x.adp.toFixed(1)}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          <Note>Only players inside the draftable pool appear, so this is the fantasy-relevant depth chart rather than the full roster.</Note>
        </div>
      ) : (
        <p className="text-[15px] text-v3-ink2">No depth chart data for {p.team}.</p>
      )}
    </Sheet>
  )
}

/* ---- Draft fit: only while a draft is running ---- */

export function FitSheet({ fit, player }) {
  if (!fit) return null
  const { tierLeft, posLeft, picksAway, nextOverall, adp, have, atCap, startsNow, byeClash, bye, market, unranked } = fit
  const spots = (n) => `${n} spot${n === 1 ? '' : 's'}`
  const rows = [
    { k: 'Left in his tier', v: tierLeft, warn: tierLeft <= 2, note: `${posLeft} ${posWord(player.pos)} left on the board` },
    {
      k: 'Your wait',
      v: picksAway === null ? '—' : picksAway === 0 ? 'Now' : picksAway,
      note: picksAway === null ? 'You have no picks left' : picksAway === 0 ? "You're on the clock now" : `${picksAway} picks until your next (${nextOverall} overall)`,
    },
    { k: 'Would he start?', v: startsNow ? 'Yes' : 'Bench', note: startsNow ? 'He cracks your best lineup as it stands' : 'Depth today — a normal pick, not a bad one' },
    { k: `${posWord(player.pos)} you hold`, v: have, warn: atCap, note: atCap ? 'At the limit for this position' : have === 0 ? 'None yet' : 'Room for another' },
    { k: 'Bye week', v: bye ? `Wk ${bye}` : '—', warn: byeClash >= 2, note: !bye ? 'No bye recorded' : byeClash === 0 ? 'Nobody on your roster is out that week' : `${byeClash} on your roster ${byeClash === 1 ? 'is' : 'are'} out that week` },
    unranked
      ? { k: 'Market', v: 'Not ranked', note: `We don't rank ${posWord(player.pos)} — the projected order doesn't hold up against what happens` }
      : { k: 'Market', v: market === 0 ? 'Fair' : <Delta value={market} />, note: market === 0 ? 'Drafted about where we rank him' : market > 0 ? `We rank him ${spots(market)} higher than the room does` : `The room rates him ${spots(Math.abs(market))} above where we do` },
  ]
  const survives = adp === null || picksAway === null || picksAway === 0 ? null : adp > nextOverall
  return (
    <Sheet code="Draft fit" aside="Your draft, right now" aria-label="Draft fit">
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.k} className={cx('rounded-[6px] border p-3', r.warn ? 'border-v3-warn bg-v3-warnWash' : 'border-v3-rule')}>
            <dt><Label className={cx('text-[11px]', r.warn ? 'text-v3-warn' : '')}>{r.k}</Label></dt>
            <dd className="mt-1 font-figure text-[20px] font-bold leading-none text-v3-ink">{r.v}</dd>
            <dd className="mt-1 text-[13px] leading-[1.45] text-v3-ink2">{r.note}</dd>
          </div>
        ))}
      </dl>
      {survives !== null && (
        <Note className="mt-3">
          His ADP is {adp.toFixed(1)} and your next pick is {nextOverall}. {survives ? 'On average he lasts that long — though ADP is an average, and no single draft looks like one.' : 'On average he is gone before then, so waiting is a real risk.'}
        </Note>
      )}
    </Sheet>
  )
}

/* ---- A rookie: what is on file, and what is not ---- */

export function ProspectSheet({ d }) {
  const { player, stat, prospect } = d
  if (!stat || stat.exp !== 0) return null
  const { known, missing } = knownAbout({ player, stat, prospect })
  return (
    <Sheet code="Before the NFL" aside={`${known.length} of ${known.length + missing.length} known`} aria-label="Before the NFL">
      <dl className="grid gap-1.5">
        {known.map((k) => (
          <div key={k.label} className="flex items-baseline justify-between gap-4 border-b border-v3-rule pb-1.5 last:border-b-0">
            <dt className="text-[14px] text-v3-ink2">{k.label}</dt>
            <dd className="min-w-0 text-right font-figure text-[14px] font-semibold text-v3-ink">{k.value}</dd>
          </div>
        ))}
      </dl>
      {missing.length > 0 && (
        <div className="mt-4">
          <Label>Not known</Label>
          <p className="mt-1 text-[14px] leading-[1.5] text-v3-ink2">{missing.join(' · ')}</p>
        </div>
      )}
      <div className="mt-4"><GoLink href="#/v3/players/rookies">The whole rookie class</GoLink></div>
    </Sheet>
  )
}
