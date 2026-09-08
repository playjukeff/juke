import { OXBLOOD, OXBLOOD_INK, YOU, delay } from './tokens.js'

/* View 02 — which picks actually mattered.

   One card per fork whose projected win % moved by a point or more, plus the
   one decision that went the other way. The bar grows out from a centre line
   because the centre line is what zero means here: a regret extends left, a
   good call extends right, and getting that origin wrong makes a cost look
   briefly like a gain.

   A card the model cannot price does not appear — see winWith() in app.js
   for the one case that produces (your only quarterback swapped for a tight
   end, which empties the QB slot and reports the collapse of a lineup with a
   hole in it as the cost of the pick). Those picks are still in view 01's
   table with an em dash in the win column. */

function Fork({ fork, max, i, onOpen }) {
  const w = (Math.abs(fork.winDelta) / max) * 46
  return (
    <button
      type="button"
      onClick={onOpen}
      data-ins-rise
      style={delay(140 + i * 80)}
      className={
        'w-full rounded-[14px] border px-[17px] py-[15px] text-left transition-transform duration-[170ms] hover:-translate-y-[3px] ' +
        (fork.good ? 'border-teal-400/[0.32] bg-teal-400/[0.05]' : 'border-white/[0.07] bg-slate')
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-plex text-[10.5px] tracking-[0.13em] text-ink-soft">
            {fork.code} · {fork.mockLabel}
          </p>
          <p className="mt-[7px] font-display text-[17px] font-bold leading-[1.2] text-white sm:text-[19px]">
            {fork.title}
          </p>
          <p className="mt-[5px] text-[13px] leading-[1.5] text-ink/80">{fork.note}</p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className="font-display text-[24px] font-bold leading-none sm:text-[27px]"
            style={{ color: fork.good ? YOU : OXBLOOD_INK }}
          >
            {(fork.winDelta > 0 ? '+' : '−') + Math.abs(fork.winDelta).toFixed(1)}
          </p>
          <p className="mt-1 font-plex text-[10px] tracking-[0.1em] text-ink-soft">WIN % SWING</p>
        </div>
      </div>
      <div className="relative mt-[13px] h-[26px]">
        <span className="absolute inset-y-0 left-1/2 w-px bg-white/[0.16]" />
        <span
          data-ins-grow-x
          className="absolute top-[7px] h-3 rounded-[3px]"
          style={{
            left: fork.good ? '50%' : 50 - w + '%',
            width: w + '%',
            background: fork.good ? YOU : OXBLOOD,
            transformOrigin: fork.good ? 'left' : 'right',
            ...delay(280 + i * 80),
          }}
        />
        <span
          className="absolute top-1 font-plex text-[10px] text-ink-soft"
          style={{ left: 'calc(50% + 8px)' }}
        >
          {fork.axisNote}
        </span>
      </div>
    </button>
  )
}

export default function ViewLeverage({ mock, onOpen }) {
  if (!mock) return null
  const max = Math.max(1, ...mock.forks.map((f) => Math.abs(f.winDelta)))
  return (
    <div>
      <p className="max-w-[760px] text-[13.5px] leading-[1.55] text-ink/80">{mock.forkIntro}</p>
      {mock.forks.length ? (
        <div className="mt-[18px] flex flex-col gap-2.5">
          {mock.forks.map((f, i) => (
            <Fork key={f.code + f.title} fork={f} max={max} i={i} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        /* Absent rather than empty is the rule everywhere else in this app;
           here the absence is the finding, so it is said rather than drawn as
           nothing. A reader who took the top of the board every round has
           earned the sentence. */
        <p className="mt-6 rounded-[14px] border border-white/[0.07] bg-slate px-[17px] py-[15px] text-[13.5px] leading-[1.5] text-ink-soft">
          Nothing in this mock is worth relitigating. Pick another one from the bar chart on{' '}
          <span className="text-ink">What you left on the board</span> to audit a draft that was closer.
        </p>
      )}
    </div>
  )
}
