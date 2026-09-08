import { POS_CHALK, CELL_INK } from '../draftRoomPositions.js'
import { STEEL, OXBLOOD, OXBLOOD_INK, YOU, delay } from './tokens.js'

/* View 01 — what you left on the board.

   A bar per mock (points of starter value you passed on), then the selected
   mock pick by pick. Clicking a bar re-derives everything below it, which is
   the one interaction on this page that changes what the panel is about
   rather than which panel you are looking at.

   Every number here is off engine.insightsReport()/insightsMock(). The
   comparison itself — best available at that slot, each alternative offered
   once, kickers and defenses valued but never recommended — is documented in
   app.js's auditMock(); this file only draws it. */

function Bar({ bar, on, hot, fieldMedian, onHover, onSelect, i }) {
  const fill = on ? OXBLOOD_INK : hot ? '#D68575' : bar.aboveRoom ? OXBLOOD : STEEL
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={on}
      title={bar.title}
      onMouseEnter={() => onHover(bar.id)}
      onFocus={() => onHover(bar.id)}
      onClick={() => onSelect(bar.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(bar.id)
        }
      }}
      className={
        'relative flex min-w-0 flex-1 cursor-pointer flex-col justify-end rounded-t-[7px] pb-[18px] ' +
        'transition-colors duration-150 focus:outline-none focus-visible:bg-white/10 ' +
        (on || hot ? 'bg-white/[0.045]' : '')
      }
    >
      <span
        data-ins-grow-y
        style={{ height: Math.max(4, bar.share * 58) + 'px', background: fill, ...delay(140 + i * 40) }}
        className="rounded-t-[4px]"
      />
      <span
        className="absolute bottom-0.5 left-0 right-0 text-center font-plex text-[10px] transition-colors duration-150"
        style={{ color: on ? YOU : hot ? '#EDF1F5' : '#A0AEBC' }}
      >
        {bar.n}
      </span>
    </div>
  )
}

function PickRow({ pick, i }) {
  const cost = pick.delta > 0
  return (
    <div
      data-ins-rise
      data-pick-row
      style={delay(260 + i * 55)}
      className="grid grid-cols-[52px_minmax(0,1.2fr)_60px] items-center gap-3 border-b border-white/[0.05] py-[9px] sm:grid-cols-[58px_minmax(0,1.15fr)_minmax(0,1.15fr)_150px_62px]"
    >
      <span className="font-plex text-[12.5px] text-ink-soft">{pick.code}</span>

      <div className="flex min-w-0 items-center gap-2">
        <span
          className="shrink-0 rounded-[4px] px-[5px] py-px text-[10px] font-extrabold"
          style={{ background: POS_CHALK[pick.you.pos], color: CELL_INK }}
        >
          {pick.you.pos === 'DST' ? 'D/ST' : pick.you.pos}
        </span>
        <span
          className={'truncate text-[13.5px] text-ink ' + (cost ? 'font-semibold' : 'font-normal')}
          title={pick.you.name}
        >
          {pick.you.name}
        </span>
      </div>

      {/* Below sm the middle two columns fold away: five columns in 340px is
          three of them ellipsised to nothing. What survives is the pick, who
          you took and what it cost — the row's own sentence. */}
      {/* Dimmed by tone, never by opacity. The design handoff sets
          `opacity: 0.45` on this column when there is no alternative, and an
          ancestor opacity is a third way to lie about a colour after alpha and
          gradients: a sweep reading `color` sees #8A9BAA and reports 4.9,
          while what is on screen composites to 2.12. That is the same defect
          this project already found on the board card's own POS - TEAM line,
          measured the same way. ink-muted is the dimmest tone that clears the
          bar on this ground, so it is used at full strength. */}
      <div data-pick-best={pick.best ? pick.best.pos : 'none'} className="hidden min-w-0 items-center gap-2 sm:flex">
        <span className="shrink-0 font-plex text-[11px] text-ink-muted">{pick.best ? 'over' : '—'}</span>
        <span
          className="truncate text-[13px]"
          style={{ color: pick.best ? POS_CHALK[pick.best.pos] : '#8A9BAA' }}
          title={pick.best ? pick.best.name : undefined}
        >
          {pick.best ? pick.best.name : 'best available'}
        </span>
      </div>

      <div className="hidden items-center gap-[9px] sm:flex">
        <span className="relative h-[7px] flex-1 rounded-full bg-white/[0.05]">
          {/* An empty track when the pick cost nothing, not a full one.

              A full-width bar in the positive colour reads as a large value
              on a row whose whole content is that there is none — the same
              shape as a bar that draws nothing where it should draw
              something, in the other direction. Nothing left on the board is
              an empty track and a teal zero beside it. */}
          {cost && (
            <span
              data-ins-grow-x
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: Math.max(pick.share * 100, 3) + '%',
                background: OXBLOOD,
                ...delay(260 + i * 55),
              }}
            />
          )}
        </span>
        <span
          className="w-11 shrink-0 text-right font-plex text-[12.5px] font-semibold"
          style={{ color: cost ? OXBLOOD_INK : '#66F0FF' }}
        >
          {cost ? '−' + pick.delta : '0'}
        </span>
      </div>

      {/* The win column answers one question only: what taking the
          alternative instead would have done to your projected win rate. A
          pick with no alternative has no answer to it, so it draws a dash
          rather than the runner-up figure the engine also carries — that
          number is about a different comparison (the next player at your own
          position), and printing two quantities in one column is the
          right-value-wrong-column bug this project has already shipped once,
          in a standings table. The runner-up figure has its own card on
          "Which picks actually mattered". */}
      <span
        data-pick-win
        className="text-right font-plex text-[12px]"
        style={{
          color: !pick.best || pick.winDelta === null ? '#8A9BAA' : pick.winDelta < 0 ? OXBLOOD_INK : '#66F0FF',
        }}
        title={
          !pick.best
            ? 'You took the top of the board here'
            : pick.winDelta === null
              ? 'Not priceable: the swap would leave a starting slot empty'
              : 'Projected win % if you had taken the alternative instead'
        }
      >
        {!pick.best || pick.winDelta === null
          ? '—'
          : (pick.winDelta > 0 ? '+' : pick.winDelta < 0 ? '−' : '') + Math.abs(pick.winDelta).toFixed(1)}
      </span>
    </div>
  )
}

export default function ViewLeftOnBoard({ report, mock, selectedId, hover, onHover, onSelect }) {
  if (!mock) return null
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="font-plex text-[10.5px] tracking-[0.14em] text-ink-soft">
          POINTS LEFT ON THE BOARD, PER MOCK
        </p>
        <p className="text-[13px] text-ink-soft">
          The room&rsquo;s median from the same seats:{' '}
          <b className="font-semibold" style={{ color: STEEL }}>
            {report.fieldMedian}
          </b>
        </p>
      </div>

      <div className="relative mt-3 h-[116px]" onMouseLeave={() => onHover(null)}>
        <div className="absolute inset-0 flex gap-[5px]">
          {report.bars.map((bar, i) => (
            <Bar
              key={bar.id}
              bar={bar}
              i={i}
              on={bar.id === selectedId}
              hot={bar.id === hover}
              fieldMedian={report.fieldMedian}
              onHover={onHover}
              onSelect={onSelect}
            />
          ))}
        </div>
        {/* The room's median, drawn AFTER the bars and above them.

            It sits at the median's own height on the bars' own scale
            (report.fieldShare, chosen by the engine so the line can never
            fall off the top), and it has to paint over the columns rather
            than under them: a bar taller than the line is the entire reading
            of this chart, and a line hidden behind every bar that clears it
            is a line you can only see where it does not matter. The design
            file has it underneath at a hardcoded 40px, which happens to work
            only for the sample data it was drawn with. */}
        {report.fieldShare !== null && (
          <span
            className="pointer-events-none absolute left-0 right-0 z-10 h-px"
            style={{ bottom: 18 + report.fieldShare * 58 + 'px', background: 'rgba(138,166,190,0.75)' }}
          />
        )}
      </div>

      {/* The label and the total share a line, and the explainer runs full
          width under both. The handoff puts the explainer beside the total in
          a two-column row, which at 311px of phone leaves it a 180px column
          and eight lines tall — the same sentence, four times the height, and
          the number it explains scrolled off. */}
      <div className="mt-5 border-t border-white/[0.06] pt-4">
        <div className="flex items-start justify-between gap-5">
          <p className="min-w-0 font-plex text-[10.5px] leading-[1.5] tracking-[0.14em] text-ink-soft">
            PICK BY PICK · {mock.label}
          </p>
          <div className="shrink-0 text-right">
            <p className="font-display text-[30px] font-bold leading-none" style={{ color: OXBLOOD }}>
              {'−'}
              {mock.total}
            </p>
            <p className="mt-1 font-plex text-[10.5px] tracking-[0.1em] text-ink-soft">LEFT ON THE BOARD</p>
          </div>
        </div>
        <p className="mt-2 max-w-[620px] text-[13.5px] leading-[1.5] text-ink/80">
          Every pick against the best value still on the board at that slot, each alternative counted once.
          Zero means you took the top of the board.
        </p>
      </div>

      {/* Column headings, which the handoff's table does not have.

          It can afford not to: its win column is a negative or an em dash, so
          one caption under the total covers the whole table. Here the same
          column can come back POSITIVE - a pick that left points on the board
          and would still have hurt the lineup - and two unlabelled numeric
          columns where one changes sign is a reader guessing which quantity
          they are looking at. Mono at the bottom of the type scale, so the row
          reads as a rule rather than as data. */}
      <div className="mt-3">
        <div className="hidden grid-cols-[58px_minmax(0,1.15fr)_minmax(0,1.15fr)_150px_62px] items-center gap-3 border-b border-white/[0.06] pb-1.5 font-plex text-[9.5px] tracking-[0.12em] text-ink-muted sm:grid">
          <span>SLOT</span>
          <span>YOUR PICK</span>
          <span>BEST AVAILABLE</span>
          <span className="text-right">LEFT ON THE BOARD</span>
          <span className="text-right">WIN %</span>
        </div>
        {mock.picks.map((p, i) => (
          <PickRow key={p.code + p.you.name} pick={p} i={i} />
        ))}
      </div>
    </div>
  )
}
