import { useEngine, useJukeTick } from '../../hooks/useJukeEngine.js'
import { SampleCard, AccentCard, Bar } from './sampleParts.jsx'

/* design_handoff_v3_alive 2eg/3eg — a sample offer, priced.

   Same split as WaiverPreview: the two players are read off the live board
   so the offer is between people who actually exist and actually play the
   positions the card says they do, and the valuation (−0.8, +3.1, the 46%
   fairness fill) is the sample the hero announces. There is no league
   connected, so there is no roster to price a trade against — a number
   derived from nothing would be the app recording an opinion.

   The two sides are drawn from the same depth of the board on purpose: an
   offer between the 3rd overall pick and the 140th is not a fair-value
   check, it is a joke, and the whole card is about the fairness bar sitting
   near the middle. */

export default function TradePreview() {
  const engine = useEngine()
  useJukeTick(engine)

  const board = engine && engine.board ? engine.board() : []
  if (board.length < 60) return null

  const give = board[42]
  const get = board[46]
  const sweetener = board[118]

  const Side = ({ label, player }) => (
    <div>
      <span className="block font-mono text-[9px] tracking-[0.1em] text-ink-muted">{label}</span>
      <span className="mt-1.5 block truncate text-[15px] font-semibold text-white">{player.name}</span>
      <span className="block text-[12px] text-ink-muted">
        {player.pos} · {player.team}
      </span>
    </div>
  )

  /* The offer and the counter side by side on desktop (3eg). They are the
     two halves of one decision — "here is what she asked for" and "here is
     what to say back" — so a reader comparing them should not have to
     hold one in their head while scrolling to the other. */
  return (
    <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
      <SampleCard>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[14px] font-semibold text-white">
            <span
              className="grid h-7 w-7 place-items-center rounded-full font-display font-extrabold text-surface-page"
              style={{ background: '#CDBDEF' }}
            >
              S
            </span>
            Sarah&apos;s offer
          </span>
          <span className="font-mono text-[10px] tracking-[0.1em]" style={{ color: '#CDBDEF' }}>
            EXPIRES 2D
          </span>
        </div>

        <div className="mt-3.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
          <Side label="YOU GIVE" player={give} />
          <span className="text-[18px] text-ink-muted" aria-hidden="true">⇄</span>
          <Side label="YOU GET" player={get} />
        </div>

        <Bar pct={46} from="#82A1F6" to="#CDBDEF" tick />

        <div className="mt-2 flex justify-between font-mono text-[10px] text-ink-muted">
          <span>FAIR · −0.8 FOR YOU</span>
          <span className="text-gain">COUNTER GETS +3.1</span>
        </div>
      </SampleCard>

      <div className="lg:[&>div]:mt-0">
      <AccentCard accent="#CDBDEF" wash="#1f1a30" eyebrow="SUGGESTED COUNTER">
        <div className="mt-2 text-[15px] font-semibold text-white">
          {give.name.split(' ').slice(-1)[0]} + {sweetener.name.split(' ').slice(-1)[0]} for{' '}
          {get.name.split(' ').slice(-1)[0]} + 2026 3rd
        </div>
        <p className="mb-3.5 mt-1.5 text-meta leading-[1.45] text-voidInk-body">
          Sarah is thin at {sweetener.pos}; {sweetener.name.split(' ').slice(-1)[0]} costs you
          nothing off your bench.
        </p>
        <div className="flex gap-2">
          <span
            className="flex-1 rounded-full py-3 text-center text-[14px] font-bold text-surface-page"
            style={{ background: 'linear-gradient(100deg,#44D4E2,#82A1F6)' }}
          >
            Send counter
          </span>
          <span className="flex-1 rounded-full border border-flow-pillEdge py-3 text-center text-[14px] font-semibold text-voidInk-primary">
            Accept as-is
          </span>
        </div>
      </AccentCard>
      </div>
    </div>
  )
}
