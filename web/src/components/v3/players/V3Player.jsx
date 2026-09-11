import { useMemo } from 'react'
import { CallButton, Delta, Fig, Headline, Icon, Label, PageHead, PosTag, QuietButton, Skeleton, cx } from '../ui.jsx'
import { injuryWord, posWord, readPlayer } from './playerData.js'
import { DeepTag, FigCell, InjuryTag, PlayerFace, RookieTag } from './parts.jsx'
import {
  DepthSheet, FitSheet, JukeSheet, LogsSheet, NewsSheet, ProjectionSheet, ProspectSheet, RecordSheet, SeasonsSheet, UsageSheet,
} from './PlayerSections.jsx'
import { useBoardKey, useHeaderTick } from './useBoardKey.js'
import { CountUp } from '../motion.jsx'

/* One player, as a page — #/v3/players/<sleeperId>, and a defense's id is
   its club (SEA). Production's player sheet is an overlay inside the Draft
   Room with its research behind seven tabs; here it is the whole page, in
   the order a reader asks: who he is and whether he can play, what Juke
   makes of him and the arithmetic, what he is projected to do, what he has
   done, and the room around him.

   ---- Draft state is read, never invented ----

   The queue, the watchlist and draftFit() belong to a running draft. With
   one running they appear, with the one action a mid-draft reader wants —
   back to the draft — as the page's call. Without one there is nothing to
   queue into, and no control is offered that could not act. */

const POS_NAME = { QB: 'Quarterback', RB: 'Running back', WR: 'Wide receiver', TE: 'Tight end', K: 'Kicker', DST: 'Team defense' }

function BackLink() {
  return (
    <a href="#/v3/players" className="inline-flex min-h-[44px] items-center gap-2 self-start rounded-[6px] text-[14px] font-semibold text-v3-ink2 hover:text-v3-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call">
      <Icon name="back" className="h-4 w-4" /> Every player
    </a>
  )
}

function NotFound({ id }) {
  return (
    <div className="grid gap-6">
      <BackLink />
      <PageHead
        label="Players · not on the board"
        title="No player answers to that id."
        lede={`Nothing on tonight's board carries the id "${id}". Players join and leave when the nightly rebuild runs — search the index for him by name.`}
        action={<QuietButton href="#/v3/players">Browse every player</QuietButton>}
      />
    </div>
  )
}

function Header({ d, fit, engine }) {
  const p = d.player
  const r = d.readout || {}
  const rookie = d.stat && d.stat.exp === 0
  const queued = fit && engine.queued ? engine.queued(p) : false
  const watched = fit && engine.watchlisted ? engine.watchlisted(p) : false

  return (
    <header className="grid gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-10">
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 sm:gap-x-6">
          <PlayerFace photo={d.photo} initials={d.initials} pos={p.pos} size={112} fluid className="h-[72px] w-[72px] border border-v3-rule text-[22px] sm:row-span-2 sm:h-[112px] sm:w-[112px] sm:text-[32px]" />
          <Label className="sm:self-end">{POS_NAME[p.pos] || p.pos} · {p.team || 'Free agent'}{p.bye ? ` · bye week ${p.bye}` : ''}</Label>
          <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:self-start">
            <Headline className="break-words">{p.name}</Headline>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <PosTag pos={p.pos} />
              <span className="font-figure text-[14px] font-semibold text-v3-ink2">{p.team || 'FA'}</span>
              {p.inj && <InjuryTag code={p.inj} full />}
              {rookie && <RookieTag />}
              {p.deep && <DeepTag />}
            </div>
            {d.bio.length > 0 && <p className="mt-2 text-[15px] leading-[1.5] text-v3-ink2">{d.bio.join(' · ')}</p>}
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-x-6 gap-y-4 rounded-[6px] border border-v3-rule bg-v3-sheet p-4 sm:grid-cols-5 lg:min-w-[520px]">
          <FigCell label="Board" sub="by ADP">{p.overall ? `#${p.overall}` : '—'}</FigCell>
          <FigCell label="ADP" sub={p.deep ? 'no real draft' : `${posWord(p.pos)}${p.posRank} by market`}>{typeof p.adp === 'number' ? p.adp.toFixed(1) : '—'}</FigCell>
          {/* The three figures Juke adds tick up to themselves when the page is
              arrived at. A dash (a kicker's withheld score, a missing
              projection) is drawn as a dash and never counts. */}
          <FigCell label="Proj pts" sub={d.scoring}><CountUp value={p.projPts === null || p.projPts === undefined ? null : Math.round(p.projPts)} /></FigCell>
          <FigCell label="Over repl." sub={r.unranked ? 'not rated' : r.replacementRank ? `vs ${r.replacementRank}` : null}><Delta value={r.gap} count className="text-[22px]" /></FigCell>
          <FigCell label="Juke score" sub={r.unranked ? 'not rated' : r.label || null}>
            <span className={r.score === null || r.score === undefined ? 'text-v3-ink3' : ''}><CountUp value={typeof r.score === 'number' ? r.score : null} /></span>
          </FigCell>
        </dl>
      </div>

      {p.inj && (
        <p className="rounded-[6px] border border-v3-warn bg-v3-warnWash px-4 py-2.5 text-[15px] text-v3-ink">
          <strong className="font-semibold text-v3-warn">{injuryWord(p.inj)}.</strong> His designation on tonight&apos;s board, from the nightly rebuild.
        </p>
      )}

      {fit && (
        <div className="flex flex-wrap items-center gap-3 rounded-[6px] border border-v3-rule bg-v3-sheet p-3">
          <CallButton href="#/v3/draft/live">Back to your draft <Icon name="arrow" className="h-4 w-4" /></CallButton>
          <QuietButton onClick={() => engine.queueToggle(p.name)} aria-pressed={queued}>
            {queued ? <><Icon name="check" className="h-4 w-4" /> In your queue</> : 'Add to your queue'}
          </QuietButton>
          <QuietButton onClick={() => engine.watchlistToggle(p.name)} aria-pressed={watched}>
            {watched ? <><Icon name="check" className="h-4 w-4" /> Watching</> : 'Watch him'}
          </QuietButton>
          {p.drafted && <span className="font-figure text-[13px] font-semibold uppercase tracking-[0.08em] text-v3-ink3">Already drafted</span>}
        </div>
      )}
    </header>
  )
}

export default function V3Player({ playerId }) {
  const key = useBoardKey()
  const tick = useHeaderTick()
  const engine = typeof window !== 'undefined' ? window.JukeEngine : null
  const id = decodeURIComponent(playerId || '')

  const d = useMemo(() => (key && engine ? readPlayer(engine, id) : null), [key, id, engine])
  // Draft state moves on every pick; it is read on the header tick rather
  // than memoised with the board.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fit = useMemo(() => (d && !d.missing && engine && engine.draftFit ? engine.draftFit(d.player) : null), [d, tick, engine])

  if (!d) {
    return (
      <div className="grid gap-6">
        <BackLink />
        <div className="h-[140px] animate-pulse rounded-[6px] bg-v3-well" aria-hidden="true" />
        <Skeleton lines={8} />
      </div>
    )
  }
  if (d.missing) return <NotFound id={id} />

  return (
    <article className="grid gap-8" aria-label={d.player.name}>
      <BackLink />
      <Header d={d} fit={fit} engine={engine} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8">
        <div className="grid min-w-0 gap-6">
          <JukeSheet d={d} />
          <ProjectionSheet d={d} />
          <UsageSheet usage={d.usage} />
          <LogsSheet key={d.player.id} engine={engine} player={d.player} />
        </div>
        <div className={cx('grid min-w-0 gap-6')}>
          <FitSheet fit={fit} player={d.player} />
          <ProspectSheet d={d} />
          <RecordSheet record={d.record} />
          <SeasonsSheet seasons={d.seasons} live={d.live} />
          <DepthSheet engine={engine} d={d} />
          <NewsSheet engine={engine} player={d.player} />
          <p className="text-[13px] leading-[1.55] text-v3-ink3">
            Every figure here is Juke&apos;s own engine reading tonight&apos;s board of <Fig>{d.readout ? d.readout.boardSize : ''}</Fig> players under {d.scoring}, the scoring your mock is set to — the projection above also shows him under the other two stock tables.
          </p>
        </div>
      </div>
    </article>
  )
}
