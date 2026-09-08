import { GAIN, INK_MUTED } from './tokens.js'

/* P6 — how much the number above this can carry.

   It replaces "81% · three signals agree", and the reason that line had to
   go is that 81% is not a confidence, it is a number that LOOKS like one. A
   reader cannot tell whether it came from a sample of two hundred or of
   four, and neither of those is 81% confident about the same thing.

   Three facts instead, and each one is checkable: how many of the signals
   agree, how wide the error is, and how big the sample was. A bare
   percentage never appears.

   ---- Thin evidence is a border, not a hidden card ----

   Below the sample threshold the whole panel takes a `cost` edge and one
   line saying why. The Prospect Room's own notice is the model and this is
   that notice generalised: withhold the confidence, not the content. A
   reader who can see the evidence is thin can decide for themselves; a
   reader shown nothing has only been told the product has no opinion. */

function Dots({ agree = 0, total = 0 }) {
  if (!total) return null
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`${agree} of ${total} signals agree`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full"
          style={
            i < agree
              ? { background: GAIN }
              : { border: `1px solid ${INK_MUTED}` }
          }
        />
      ))}
    </span>
  )
}

export default function Confidence({ agree, signals, error, sample, thin, caveat, className = '' }) {
  return (
    <div className={'flex flex-wrap items-center gap-x-4 gap-y-1.5 ' + className}>
      {signals ? (
        <span className="inline-flex items-center gap-2">
          <Dots agree={agree} total={signals} />
          <span className="font-plex text-[11px] text-ink-soft">
            {agree} of {signals} agree
          </span>
        </span>
      ) : null}
      {error ? <span className="font-plex text-[11px] text-ink-soft">{error}</span> : null}
      {sample ? <span className="font-plex text-[11px] text-ink-soft">{sample}</span> : null}
      {thin && caveat ? <span className="basis-full font-body text-[12px] text-cost">{caveat}</span> : null}
    </div>
  )
}

/* The wrapper a panel takes when its own sample is too thin to argue from.
   Used by the Prospect Room's notice and by anything else that has to draw a
   number it does not fully trust — the border is the whole signal, so the
   content inside is untouched. */
export function ThinEvidence({ thin, children, className = '' }) {
  return (
    <div
      className={
        (thin ? 'rounded-panel border border-cost/60 p-4 ' : '') + className
      }
    >
      {children}
    </div>
  )
}
