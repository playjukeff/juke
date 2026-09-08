import { useTier } from '../../hooks/useTier.js'
import { tierLabel } from '../../lib/tiers.js'

/* The one header every room wears — Juke Journey v3's `Room Shell`.
 *
 * The handoff's first constraint is this component: "One RoomShell; rooms
 * pass config, never re-render their own header." Five rooms drawing five
 * headers is five places for the back link, the tier badge and the tab bar
 * to drift, and they drift silently because each one renders fine alone.
 *
 * ---- Built from the source, not the README ----
 *
 * The package's own README describes props this component does not have
 * (`context`, `kpis`, `tier`) and CLAUDE.md already records that this
 * README drifts from its markup. `prototype/Room Shell.dc.html` is what
 * this is built from: a 52px identity row (back · room · title · meta ·
 * stats · tier badge) over a 44px tab bar, 96px in total, sticky.
 *
 * Two deliberate departures, both because the prototype is a prototype:
 *
 *   * its `tabs` arrive with a pre-computed `style` string, because its
 *     parent did the styling. Here the shell owns how a tab looks and
 *     takes `{ key, label, gate }` — which is what the README's own props
 *     section describes and the only shape that keeps the drift this
 *     component exists to prevent from moving up one level.
 *   * `tierLabel` is a prop there and is read from useTier() here. One
 *     place knows, so no room can pass the wrong one, and it is the same
 *     hook LeagueSwitcher and ConnectLeagueCta already read.
 *
 * ---- The badge says "Season Pass", not "PRO" ----
 *
 * The handoff's badge enum is FREE / PRO / ALL ACCESS. Those are the
 * WORKER's values — lib/tiers.js says so in its own header: the enum is
 * 'free'/'pro'/'allaccess' and the customer-facing ladder is Free /
 * Season Pass / Multi-League. Printing "PRO" on a badge would be showing
 * somebody an internal identifier, and it would disagree with every other
 * surface that already names the tier properly.
 *
 * ---- A gate chip is amber, not gold ----
 *
 * The prototype's chip is `--gold #FFD166`. `flow.gold` here is the
 * League Room's identity, and that token group's own comment is that a
 * room is not a state — a tab being locked at your tier is a state. So it
 * takes `flow.amber`, the state colour the verdict badges already use.
 */

/* The gated tab's chip. Derived from the tier the gate names rather than
   written out, so a chip cannot say something different from what the
   upgrade flow will offer. */
function gateChip(gate) {
  return tierLabel(gate).toUpperCase()
}

function Stat({ label, value, tone }) {
  return (
    <div className="flex flex-col items-end gap-px">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
        {label}
      </span>
      <span className={'font-mono text-[17px] font-semibold ' + (tone || 'text-ink')}>{value}</span>
    </div>
  )
}

export default function RoomShell({
  room,
  title,
  meta,
  stats = [],
  tabs = [],
  active,
  onTab,
  backHref = '#/rooms',
  backLabel = 'Rooms',
  children,
}) {
  const { tier } = useTier()

  return (
    <>
      {/* Anchored on an attribute rather than a tag or a label: the page
          already has ShellHeader's own <header>, and the "one RoomShell"
          constraint is only checkable if a test can tell the two apart
          without matching copy that moves. */}
      <header
        data-room-shell
        className="sticky top-0 z-[5] border-b border-line-hairline bg-flow-bar text-ink"
      >
        <div className="flex min-h-[52px] flex-wrap items-stretch">
          {backHref ? (
            <a
              href={backHref}
              aria-label={`Back to ${backLabel}`}
              className="flex min-h-[44px] items-center border-r border-line-hairline px-3.5 text-[13px] font-semibold text-ink-soft transition-colors duration-150 hover:text-white"
            >
              <span aria-hidden="true">←</span>
            </a>
          ) : null}

          <div className="flex flex-col justify-center gap-0.5 border-r border-line-hairline px-4 py-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-ink-muted">
              {room}
            </span>
            <span className="font-display text-[14px] font-bold tracking-[-0.015em]">
              {title}
              {meta ? (
                <span className="ml-1 font-mono text-[11px] font-medium text-ink-muted">
                  · {meta}
                </span>
              ) : null}
            </span>
          </div>

          {/* `ml-auto` even when there are no stats, so the tier badge sits
              at the far end rather than hard against the title block. */}
          <div className="ml-auto flex flex-wrap items-center gap-4 px-[18px] py-2">
            {stats.map((s, i) => (
              <div key={s.label} className="flex items-center gap-4">
                <Stat label={s.label} value={s.value} tone={s.tone} />
                {i < stats.length - 1 ? (
                  <span aria-hidden="true" className="h-[26px] w-px bg-line-hairline" />
                ) : null}
              </div>
            ))}
            {/* Nothing until the tier is actually known.

                tierStore holds `tier: null` while loading and tierLabel()
                falls back to Free, so drawing unconditionally would flash
                "FREE" at a Season Pass account on every room they open and
                then correct itself — a badge asserting the one thing this
                header says about who you are, wrongly, for a beat.

                Signed out settles to 'free' immediately, so a guest sees
                FREE with no flicker; and an error keeps whatever tier was
                already known, so a failed refresh does not demote anybody
                on screen. Absent, not wrong. */}
            {tier ? (
              <span className="rounded-[5px] border border-teal/[0.34] bg-teal/[0.14] px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-teal">
                {tierLabel(tier)}
              </span>
            ) : null}
          </div>
        </div>

        {/* Absent, not empty. A room with one body has no sections to
            navigate, and an empty 44px strip under the bar reads as a tab
            row that failed to load — the same "a control that cannot act
            must not be offered" call WeekStrip makes about a week nobody
            can open. */}
        {tabs.length ? (
          <nav
            data-room-tabs
            aria-label={`${room} sections`}
            className="flex gap-0.5 overflow-x-auto whitespace-nowrap border-t border-line-hairline px-2"
          >
            {tabs.map((t) => {
              const on = t.key === active
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-current={on ? 'page' : undefined}
                  onClick={onTab ? () => onTab(t.key) : undefined}
                  className={
                    'flex-none border-b-2 px-3 py-3 text-[13px] font-semibold transition-colors duration-150 ' +
                    (on
                      ? 'border-teal text-white'
                      : 'border-transparent text-ink-muted hover:text-voidInk-primary')
                  }
                >
                  {t.label}
                  {t.gate ? (
                    <span className="ml-1.5 rounded-[3px] bg-flow-amber/[0.14] px-1 py-px font-mono text-[10px] font-bold uppercase tracking-[0.07em] text-flow-amber">
                      {gateChip(t.gate)}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </nav>
        ) : null}
      </header>
      {children}
    </>
  )
}
