import { useEngine, useJukeTick } from '../../hooks/useJukeEngine.js'
import { POS_CHALK, CELL_INK } from '../draftRoomPositions.js'
import { Bar } from '../decision/Bar.jsx'

/* The blurred sample content behind the Waiver Room's unlock card
   (design_handoff_v3_alive 2dg/3dg).

   **The players come off the live board; the waiver numbers are the
   sample.** The handoff hardcodes four rows. A hardcoded roster is wrong
   the first morning the pipeline moves — the rule this project already
   holds for the hero shot, the door and every "Claim and proof" stage —
   and a preview naming a retired player is exactly the kind of small
   wrongness a fantasy reader notices instantly. So the names, positions
   and drops are read off `board`, ordered the way the board already orders
   it, and only the FAAB and the delta are invented.

   Those two are invented on purpose and the hero says so out loud: "A
   sample week." There is no league connected, so there is no real budget
   and no real bench to price a claim against — deriving a number from
   nothing would be the pipeline recording an opinion. Announcing the
   sample in the copy is the honest version, and it is the handoff's own.

   The values are deterministic per row rather than random, so the screen
   does not reshuffle under a reader on every render.

   `useJukeTick` because `board` is empty until players.js lands (deferred,
   not blocking) — the same reason MockDraftsPhone's history rows read the
   tick. Without it this renders four empty rows on a cold load and never
   fills them. */

const FAAB = [12, 8, 21, 4]
const DELTA = ['+6.2', '+3.8', '+2.9', '+1.4']

export default function WaiverPreview() {
  const engine = useEngine()
  useJukeTick(engine)

  const board = engine && engine.board ? engine.board() : []
  if (!board.length) return null

  /* Deeper into the board than the first four names: a waiver claim is
     somebody the room passed on, not the first overall pick. Past pick ~96
     is the eighth round of a ten-team draft, which is where a real wire
     lives.

     Skill positions only, at both ends. A kicker or a defense is a legal
     add and a strange thing to lead a waiver list with — and stranger as
     the player being DROPPED, since every roster starts exactly one of
     each and nobody drops the only one they have. "Drop Philadelphia
     Defense" was the first thing this rendered. */
  const SKILL = ['RB', 'WR', 'TE', 'QB']
  const skill = board.filter((p) => SKILL.indexOf(p.pos) >= 0)
  const rows = skill.slice(96, 100)
  const drops = skill.slice(130, 134)
  const deltaMax = Math.max(...DELTA.map((d) => Math.abs(parseFloat(d))))

  return (
    <div>
      {rows.map((p, i) => {
        const drop = drops[i]
        return (
          <div
            key={p.name}
            className="grid grid-cols-[44px_1fr_auto] items-center gap-3 border-b border-line-hairline py-3"
          >
            <span
              className="grid h-11 w-11 place-items-center rounded-xl font-display text-[14px] font-extrabold"
              style={{ background: POS_CHALK[p.pos] || POS_CHALK.DST, color: CELL_INK }}
            >
              {p.pos}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold text-white">{p.name}</span>
              {/* ink.muted, not CELL_SUB. Both are "the quieter of two
                  inks", and they are quiet on opposite grounds: CELL_SUB
                  (#2B3540) exists only to sit ON a chalk fill, so on this
                  dark row it is very nearly the background. The tile above
                  is the one thing here with a light ground and it is the
                  only thing taking CELL_INK. */}
              <span className="mt-0.5 block truncate text-[12px] text-ink-muted">
                Drop {drop ? drop.name : 'a bench spot'} · FAAB ${FAAB[i]}
              </span>
            </span>
            {/* `gain`, and a bar under it.
 
                Two things at once, and the second is the reason for the
                first. A preview's job is to show what the room looks
                like, and the room draws its wire as bars now -- a preview
                still drawing four bare figures is advertising a screen
                that no longer exists. The colour follows: mint is the
                rail's "you are here", and +6.2 points a week is a value.
 
                The bar is scaled across the four sample rows, which is the
                whole of P3 -- and it is the one number here that is
                honest about being made up, since it says only "this one
                is bigger than that one". */}
            <span className="w-[86px] shrink-0 text-right">
              <span className="block font-display text-[22px] font-extrabold text-gain">
                {DELTA[i]}
              </span>
              <Bar
                className="mt-1.5"
                value={Math.abs(parseFloat(DELTA[i]))}
                max={deltaMax}
                sign="gain"
                index={i}
              />
            </span>
          </div>
        )
      })}
    </div>
  )
}
