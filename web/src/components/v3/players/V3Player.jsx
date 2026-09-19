import { useEffect, useMemo, useState } from 'react'
import { CallButton, Delta, Fig, Headline, Icon, Label, PageHead, PosTag, QuietButton, Skeleton, cx } from '../ui.jsx'
import { injuryWord, posWord, readPlayer } from './playerData.js'
import { DeepTag, FigCell, InjuryTag, PlayerFace, RookieTag } from './parts.jsx'
import {
  DepthSheet, FitSheet, JukeSheet, LogsSheet, NewsSheet, ProjectionSheet, ProspectSheet, RecordSheet, SeasonSheet,
  SeasonsSheet, UsageSheet,
} from './PlayerSections.jsx'
import { useBoardKey, useHeaderTick } from './useBoardKey.js'
import { CountUp } from '../motion.jsx'
import Crumbs from '../games/Crumbs.jsx'
import PlayerWeek from '../games/PlayerWeek.jsx'

/* One player, as a page — #/players/<sleeperId>, and a defense's id is
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
    <a href="#/players" className="inline-flex min-h-[44px] items-center gap-2 self-start rounded-[6px] text-[15px] font-semibold text-v3-ink2 hover:text-v3-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call">
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
        reason={`Nothing on tonight's board carries the id "${id}". Players join and leave when the nightly rebuild runs — search the index for him by name.`}
        action={<QuietButton href="#/players">Browse every player</QuietButton>}
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
  /* ---- Which horizon the strip answers about ----

     Board and ADP are facts about the draft and do not move. The other
     three — what he is worth, how far over replacement, the headline score
     — are questions with two answers once a season is being played, and
     the strip answers about the one that is CURRENT.

     Out of season that is the preseason projection and there is nothing to
     say. In season it is the rest of the season, and the preseason trio
     moves down into the two panels that already carry it with its
     arithmetic and its own caption. Leaving August's numbers as the
     largest thing on the page in October is this project's own
     right-value-wrong-column bug with a horizon instead of a scoring
     table: a receiver who has climbed 67 places since week 1 was reading a
     Juke score of 0 in 56px type, correct about a board nobody is drafting
     off any more.

     Every caption names its horizon either way, so the two can never be
     read as one number that changed its mind. */
  const ros = d.season ? d.season.ros : null
  const pre = (sub) => (d.season ? (sub ? `preseason · ${sub}` : 'preseason') : sub)
  /* The horizon goes LAST here and first in pre(), which is not a slip: at
     phone width the tail is what is lost, and "rest of season · Very Low"
     loses the band -- the half that says something -- while "Very Low ·
     rest of season" loses the half a reader can infer from every caption
     around it.

     **Corrected in place, 19 September 2026.** This note used to open "a
     FigCell's sub truncates, and at 375px a third of the strip is about
     105px". Neither half survives measurement. The sub clamps to two lines
     now rather than truncating to one (parts.jsx says why), and a cell is
     **87px** at 375 -- measured in a real browser, against a figure that
     had been carried here as an estimate. The correction matters because
     the budget is what decides a caption: 87px is about thirteen
     characters a line and twenty-six across the clamp, where 105 would
     have promised thirty-two and let a caption ship clipped.

     pre() is deliberately left as it is. It has the same ordering problem
     and fixing it would change a screen out of season, which this pass is
     not about. */
  const now = (sub) => (sub ? `${sub} · rest of season` : 'rest of season')

  /* What the Juke score is a share OF, which is the one fact the strip has
     never carried and the only one that lets 57 and 100 be read against each
     other. The score is this player's edge over a replacement starter
     divided by the biggest such edge on the board, so "76 pts of the best
     132" is the arithmetic of the number directly above it, checkable on
     the spot -- the same contract the grade panel's own weighted-sum line
     has.

     "pts" is there to kill one reading, not to state a unit the cell above
     already implies: "76 of the best 132" parses as "76 of the best 132
     PLAYERS", which is a count of something else entirely and is the sort
     of sentence a reader resolves wrongly without ever noticing they had a
     choice.

     It REPLACES the band rather than joining it. "High" is a restatement of
     57 in words, which is the qualifier-restating-its-own-subject failure
     this project has already shipped once (the Strategy Room's +6.9 beside
     +6.9), and the band is still drawn in the panels below, next to the
     preseason score it is worth comparing against. The denominator is not
     drawn anywhere else at all.

     Both figures are rounded and the score is not computed from them, so
     the division comes out one short of the printed score for **10 of the
     415 priced players** on the 18 September half-PPR board -- 2.4%, never
     by more than one. Measured rather than estimated, and left alone: the
     caption's job is to show the reader what the scale is, and the honest
     alternative is a decimal place on a figure this file already argues is
     sharper than the sport supports.

     Un-clamped on purpose. A sub-replacement player scores a floored 0 in
     both horizons, and "-5 pts of the best 145" is the thing that tells two
     zeros apart -- which is exactly what replacementGap() exists for and
     what a band reading "Very Low" twice cannot do.

     It is the ONE cell in the strip whose caption does not name its
     horizon, and that is a measurement rather than an oversight.
     "76 pts of the best 132 · rest of season" is thirty-nine characters
     against the twenty-six an 87px cell allows, and it was confirmed
     clipped in a real browser at 375 (1440, at 206px and one line, was
     clean throughout). Something had to go. The horizon is already
     printed on both of this cell's neighbours in the same group and
     again on the panel below; the denominator is printed nowhere else
     at all, which is the whole reason this caption exists.

     The band is the fallback rather than the default, so a player the
     board cannot price still gets the sentence he used to get. */
  const scale = (gap, best) =>
    gap === null || gap === undefined || !best ? null : `${Math.round(gap)} pts of the best ${best}`
  // Horizon only when there is no arithmetic to print in its place.
  const scaleSub = (gap, best, band, horizon) => {
    const s = scale(gap, best)
    return s || horizon(band || null)
  }

  return (
    <header className="grid gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-10">
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 sm:gap-x-6">
          <PlayerFace photo={d.photo} initials={d.initials} pos={p.pos} size={112} fluid className="h-[72px] w-[72px] border border-v3-rule text-[22px] sm:row-span-2 sm:h-[112px] sm:w-[112px] sm:text-[34px]" />
          <Label className="sm:self-end">{POS_NAME[p.pos] || p.pos} · {p.team || 'Free agent'}{p.bye ? ` · bye week ${p.bye}` : ''}</Label>
          <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:self-start">
            <Headline className="break-words">{p.name}</Headline>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <PosTag pos={p.pos} />
              <span className="font-figure text-[15px] font-semibold text-v3-ink2">{p.team || 'FA'}</span>
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
          {ros ? (
            <>
              <FigCell label="Pts left" sub={now(null)}><CountUp value={ros.pts === null ? null : Math.round(ros.pts)} /></FigCell>
              <FigCell label="Over repl." sub={r.unranked ? 'not rated' : now(ros.replacementRank ? `vs ${posWord(p.pos)}${ros.replacementRank}` : null)}><Delta value={ros.gap} count className="text-[22px]" /></FigCell>
              <FigCell label="Juke score" sub={r.unranked ? 'not rated' : scaleSub(ros.gap, ros.best, ros.scoreLabel, now)}>
                <span className={ros.score === null ? 'text-v3-ink3' : ''}><CountUp value={ros.score} /></span>
              </FigCell>
            </>
          ) : (
            <>
              <FigCell label="Proj pts" sub={pre(d.scoring)}><CountUp value={p.projPts === null || p.projPts === undefined ? null : Math.round(p.projPts)} /></FigCell>
              <FigCell label="Over repl." sub={r.unranked ? 'not rated' : pre(r.replacementRank ? `vs ${r.replacementRank}` : null)}><Delta value={r.gap} count className="text-[22px]" /></FigCell>
              <FigCell label="Juke score" sub={r.unranked ? 'not rated' : scaleSub(r.gap, r.bestGap, r.label, pre)}>
                <span className={r.score === null || r.score === undefined ? 'text-v3-ink3' : ''}><CountUp value={typeof r.score === 'number' ? r.score : null} /></span>
              </FigCell>
            </>
          )}
        </dl>
      </div>

      {p.inj && (
        <p className="rounded-[6px] border border-v3-warn bg-v3-warnWash px-4 py-2.5 text-[15px] text-v3-ink">
          <strong className="font-semibold text-v3-warn">{injuryWord(p.inj)}.</strong> His designation on tonight&apos;s board, from the nightly rebuild.
        </p>
      )}

      {fit && (
        <div className="flex flex-wrap items-center gap-3 rounded-[6px] border border-v3-rule bg-v3-sheet p-3">
          <CallButton href="#/draft/live">Back to your draft <Icon name="arrow" className="h-4 w-4" /></CallButton>
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

/* Where this page sits -- Players / NFL / name -- and, when he was opened
   from a game, the way back to it. The game id rides on the address
   (?from=) rather than in memory, so a shared link keeps it and a reload
   does not lose it. */
function PlayerCrumbs({ name }) {
  const [back, setBack] = useState(null)
  useEffect(() => {
    const read = () => {
      const q = (window.location.hash.split('?')[1] || '')
      const from = new URLSearchParams(q).get('from')
      if (!from || !/^\d{1,12}$/.test(from)) { setBack(null); return }
      const e = window.JukeEngine
      Promise.resolve(e && e.primeScores ? e.primeScores() : null).then((games) => {
        const g = Array.isArray(games) ? games.find((x) => String(x.id) === from) : null
        setBack({ href: `#/games/${from}`, label: g ? `${g.away} @ ${g.home}` : 'Back to the game' })
      }, () => setBack({ href: `#/games/${from}`, label: 'Back to the game' }))
    }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])
  return <Crumbs items={[{ label: 'Players', href: '#/players' }, { label: 'NFL', href: '#/players' }, { label: name }]} back={back} />
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
      <PlayerCrumbs name={d.player.name} />
      <Header d={d} fit={fit} engine={engine} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8">
        <div className="grid min-w-0 gap-6">
          {/* In season this leads, above the Juke score: what has happened
              and what is left is the question somebody opens a player for
              in October, and the preseason arithmetic below it is the
              reference rather than the answer. Absent out of season. */}
          <SeasonSheet d={d} />
          <JukeSheet d={d} />
          <ProjectionSheet d={d} />
          <UsageSheet usage={d.usage} />
          <LogsSheet key={d.player.id} engine={engine} player={d.player} />
        </div>
        <div className={cx('grid min-w-0 gap-6')}>
          <PlayerWeek player={d.player} />
          <FitSheet fit={fit} player={d.player} />
          <ProspectSheet d={d} />
          <RecordSheet record={d.record} />
          <SeasonsSheet seasons={d.seasons} live={d.live} />
          <DepthSheet engine={engine} d={d} />
          <NewsSheet engine={engine} player={d.player} />
          <p className="text-[13px] leading-[1.55] text-v3-ink3">
            Every figure here is Juke&apos;s own engine reading tonight&apos;s board of <Fig>{d.readout ? d.readout.boardSize : ''}</Fig> players under {d.scoring}, the scoring your mock is set to — the projection above also shows him under the other two stock tables.
            {d.season ? ' The strip at the top and “This season” below it are the rest of the season, which moves when a game is played; the projection and the Juke score panel are the preseason board, unchanged, and each says so.' : ''}
          </p>
        </div>
      </div>
    </article>
  )
}
