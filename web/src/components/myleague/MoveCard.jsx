import { PosTile } from '../rooms/sampleParts.jsx'

/* The primary recommendation card — "the move that matters this week."
   Demo-only for this phase: no room writes a real recommendation anywhere
   yet (Waiver/Strategy/Trade's connected implementations are a later
   phase), so MyLeagueScreen never mounts this against real data. It stays
   a real, importable component rather than inline JSX inside
   MyLeagueDemo.jsx so the first room that DOES start writing real
   recommendations has something to render them into. */
export default function MoveCard({ room, title, pos, confidence, why, evidence, ctaLabel, onOpen }) {
  return (
    <div className="mx-auto mt-4 max-w-[1280px] px-5 sm:px-10">
      <div className="rounded-[18px] border-l-[3px] border-teal bg-[#151920] p-[18px] sm:p-6 lg:grid lg:grid-cols-[1fr_260px] lg:gap-6">
        <div>
          <span className="font-mono text-[10px] tracking-[0.1em] text-teal">
            THE MOVE{room ? ` · ${room.toUpperCase()}` : ''}
          </span>
          <div className="mt-1.5 flex items-start gap-3">
            {pos ? <PosTile pos={pos} size={36} /> : null}
            <h2 className="m-0 font-display text-[24px] font-extrabold leading-tight text-white sm:text-[28px]">
              {title}
            </h2>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-[30px] font-extrabold text-white">{confidence}%</span>
            <span className="text-[12px] text-ink-muted">confidence{why ? ` · ${why}` : ''}</span>
          </div>
          {ctaLabel ? (
            <button
              type="button"
              onClick={onOpen}
              className="mt-4 rounded-full bg-teal px-5 py-2.5 text-[13px] font-bold text-obsidian"
            >
              {ctaLabel}
            </button>
          ) : null}
        </div>
        {evidence && evidence.length ? (
          <dl className="mt-4 flex flex-col gap-2 lg:mt-0">
            {evidence.map((row) => (
              <div
                key={row[0]}
                className="flex justify-between gap-3 border-b border-line-hairline pb-2 text-[13px] last:border-b-0"
              >
                <dt className="text-ink-muted">{row[0]}</dt>
                <dd className="font-mono text-voidInk-primary">{row[1]}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </div>
  )
}
