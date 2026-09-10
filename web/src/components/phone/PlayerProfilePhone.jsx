import { useState } from 'react'
import { Star, X } from 'lucide-react'
import { POS_SOLID, INJURY_META } from '../draftRoomPositions.js'
import OurReadTab from '../OurReadTab.jsx'
import GameLogsTab from '../GameLogsTab.jsx'
import DepthChartTab from '../DepthChartTab.jsx'
import LatestNewsTab from '../LatestNewsTab.jsx'

function heightText(inches) {
  const n = Number(inches)
  if (!n || n < 40 || n > 90) return null
  return Math.floor(n / 12) + "'" + (n % 12) + '"'
}

const RANK_LABELS = [['off', 'OFFENSE'], ['passYd', 'PASS YD'], ['passAtt', 'PASS ATT'], ['passTd', 'PASS TD'], ['td', 'TD']]

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// README section 5. Summary = OurReadTab (the model explaining a player's
// score, real data — not the prototype's fabricated "2026 Season Outlook"
// paragraph, which is prose no part of this pipeline generates) + the real
// news feed. Game Log and Team reuse the exact same components the tablet/
// desktop profile already uses (engine.gameLogFor/depthChartFor), plus a
// real per-team rank strip on Team (task: Team Rank pipeline) that the
// tablet card doesn't have yet. History is genuinely new: a career-by-
// season table built from stat.s, which no existing tab draws as one
// table (ProjectionsTab's own "our record" table is projected-vs-actual
// for the same season, a different question).
export default function PlayerProfilePhone({ engine, player, onClose, rules }) {
  const [tab, setTab] = useState('summary')
  const s = engine.statOf(player)
  const watching = engine.watchlisted(player)
  const photo = engine.photoUrl(player)
  const teamRanks = engine.teamRanksFor(player.team)
  const rankMeta = engine.teamRanksMeta()

  const seasons = s && s.s ? Object.keys(s.s).sort().reverse() : []

  return (
    <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#0D131C] pt-[env(safe-area-inset-top)]">
      {player.inj && INJURY_META[player.inj] && (
        <div className="flex shrink-0 items-center justify-center gap-2 bg-gradient-to-r from-[#4A3A16] to-[#6B5320] py-[9px]">
          <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#E0A72B] text-[11px] font-bold text-[#4A3A16]">?</span>
          <span className="text-meta font-bold uppercase tracking-[0.1em] text-white">{INJURY_META[player.inj].label}</span>
        </div>
      )}

      <div className="flex shrink-0 gap-3.5 px-4 pb-4 pt-3.5" style={{ background: 'linear-gradient(120deg, rgba(255,255,255,0.05), rgba(255,255,255,0))' }}>
        <div className="w-24 shrink-0">
          <div
            className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl"
            style={{ backgroundColor: POS_SOLID[player.pos] || '#38434F' }}
          >
            <span className="font-display text-[22px] font-bold text-white/85">{player.team}</span>
            {photo && (
              <img
                src={photo}
                alt=""
                loading="lazy"
                onError={(e) => e.currentTarget.remove()}
                className={'absolute inset-0 h-full w-full ' + (player.pos === 'DST' ? 'object-contain p-2' : 'object-cover')}
              />
            )}
          </div>
          {/* No jersey-number field exists anywhere in the pipeline
              (checked: not in build_players.py, not on the board object,
              not in statOf()) — the design's "#16" is dropped rather than
              rendering it blank, same rule as Rost % and DEF's Yd/A. */}
          <p className="mt-1.5 text-center font-plex text-[11px] text-ink-muted">
            {player.pos} &bull; {player.team}
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ink-soft">{player.name.split(' ').slice(0, -1).join(' ')}.</p>
          <p className="truncate font-display text-[32px] font-bold uppercase leading-[0.95] text-ink">
            {player.name.split(' ').slice(-1)[0]}
          </p>

          {player.pos !== 'DST' && s && (
            <div className="mt-2 flex gap-4">
              <div>
                <p className="font-plex text-[8px] tracking-[0.1em] text-ink-muted">AGE</p>
                <p className="text-[15px] font-bold text-ink">{s.age ?? '—'}</p>
              </div>
              <div>
                <p className="font-plex text-[8px] tracking-[0.1em] text-ink-muted">HT</p>
                <p className="text-[15px] font-bold text-ink">{heightText(s.ht) ?? '—'}</p>
              </div>
              <div>
                <p className="font-plex text-[8px] tracking-[0.1em] text-ink-muted">WT</p>
                <p className="text-[15px] font-bold text-ink">{s.wt ? s.wt + ' lbs' : '—'}</p>
              </div>
              <div>
                <p className="font-plex text-[8px] tracking-[0.1em] text-ink-muted">EXP</p>
                <p className="text-[15px] font-bold text-ink">{s.exp === 0 ? 'R' : s.exp ?? '—'}</p>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => engine.watchlistToggle(player.name)}
            className={
              'mt-3 flex h-[38px] w-full items-center justify-center gap-2 rounded-full text-[14px] font-bold tracking-[0.08em] ' +
              (watching ? 'bg-teal-500/[0.18] text-teal-300' : 'bg-white/[0.12] text-ink')
            }
          >
            <Star className="h-3.5 w-3.5" fill={watching ? 'currentColor' : 'none'} />
            {watching ? 'WATCHING' : 'WATCH'}
          </button>
        </div>
      </div>

      <div className="flex shrink-0 border-b border-white/[0.08]">
        {[['summary', 'SUMMARY'], ['gamelog', 'GAME LOG'], ['team', 'TEAM'], ['history', 'HISTORY']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={
              'flex-1 border-b-2 py-[11px] text-center text-[12px] font-bold tracking-[0.06em] ' +
              (tab === key ? 'border-ink text-ink' : 'border-transparent text-ink-muted')
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[90px] pt-3.5">
        {tab === 'summary' && (
          <div className="flex flex-col gap-4">
            <OurReadTab engine={engine} player={player} />
            <div>
              <p className="mb-1.5 font-plex text-[10px] uppercase tracking-wide text-ink-muted">RECENT NEWS</p>
              <LatestNewsTab engine={engine} player={player} />
            </div>
          </div>
        )}
        {tab === 'gamelog' && <GameLogsTab engine={engine} player={player} />}
        {tab === 'team' && (
          <div className="flex flex-col gap-4">
            {teamRanks && (
              <div>
                <p className="mb-1.5 font-plex text-[10px] tracking-[0.12em] text-ink-muted">
                  TEAM RANK{rankMeta ? ` · ${rankMeta.season}` : ''}
                </p>
                <div className="flex gap-2 overflow-x-auto">
                  {RANK_LABELS.map(([key, label]) => (
                    teamRanks[key] ? (
                      <div key={key} className="flex shrink-0 flex-col items-center gap-1">
                        <span className="font-plex text-[9px] text-ink-muted">{label}</span>
                        <span className="rounded-lg bg-[rgba(190,24,93,0.25)] px-3 py-1.5 text-sm font-bold text-[#FDA4AF]">
                          {ordinal(teamRanks[key].rank)}
                        </span>
                      </div>
                    ) : null
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="mb-1.5 font-display text-[22px] font-semibold text-ink">Depth Chart</p>
              <DepthChartTab engine={engine} player={player} />
            </div>
          </div>
        )}
        {tab === 'history' && (
          <HistoryTab engine={engine} player={player} rules={rules} seasons={seasons} stat={s} />
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close player profile"
        className="fixed bottom-6 right-[18px] z-[71] flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(160,174,188,0.32)] text-white"
      >
        <X className="h-6 w-6" />
      </button>
    </div>
  )
}

// stat.s[year] is a season block in the same raw shape stat.p is (see
// CLAUDE.md: "Every points total must go through fantasyPoints()") —
// pointsUnder() rescores it under whichever preset this table asks for,
// same as every other historical figure in this app. Position rank across
// the whole league for a past season is deliberately not computed here:
// it would mean scoring every stored player for every stored season on
// every profile open, which is real cost for a column this table can live
// without — the design's own POS RK column is the one piece of README
// section 5 not reproduced, flagged rather than silently dropped.
function HistoryTab({ engine, seasons, stat, rules }) {
  if (!stat || seasons.length === 0) {
    return <p className="px-1 py-6 text-center text-sm text-ink-muted">No season history stored for this player.</p>
  }
  const ppr = engine.rulesForFormat ? engine.rulesForFormat('ppr') : rules
  const half = engine.rulesForFormat ? engine.rulesForFormat('half') : rules

  return (
    <div className="overflow-hidden rounded-lg border border-slate-rule">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-rule bg-slate-sunk/60">
            <th className="px-2 py-1.5 text-left font-semibold text-ink-muted">YEAR</th>
            <th className="px-2 py-1.5 text-right font-semibold text-ink-muted">GM</th>
            <th className="px-2 py-1.5 text-right font-semibold text-ink-muted">PPR</th>
            <th className="px-2 py-1.5 text-right font-semibold text-ink-muted">HALF</th>
          </tr>
        </thead>
        <tbody>
          {seasons.map((y, i) => {
            const block = stat.s[y]
            if (!block || !(block.gp > 0)) return null
            const pprPts = engine.pointsUnder(block, ppr)
            const halfPts = engine.pointsUnder(block, half)
            return (
              <tr key={y} className={i < seasons.length - 1 ? 'border-b border-white/[0.06]' : ''}>
                <td className="px-2 py-1.5 text-white/80">{y}</td>
                <td className="px-2 py-1.5 text-right text-white/70">{block.gp}</td>
                <td className="px-2 py-1.5 text-right font-semibold text-white/85">{pprPts == null ? '—' : Math.round(pprPts)}</td>
                <td className="px-2 py-1.5 text-right text-white/70">{halfPts == null ? '—' : Math.round(halfPts)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
