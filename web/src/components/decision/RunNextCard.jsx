/* P7 — the last thing in a room sidebar: one run that would settle the thing
   the rest of the page has just told you.

   A diagnosis with nowhere to act on it is a complaint. That sentence is
   already in this repo, on WhatToRunNext.jsx, and this is the same idea
   given a shape every room can carry rather than one screen's own band.

   ---- The button is teal, and it is the only teal action on the sidebar ----

   The system's first rule is that teal is the brand and the action and never
   a value; this card is the sidebar's one action, so it is the one place the
   rule points AT teal rather than away from it. Everything else on the
   sidebar — the stake card's button included — is a surface-coloured
   control, so a reader scanning the column finds exactly one thing that
   looks pressable in the brand's own colour.

   ---- Pre-configured, always ----

   `href` carries the query that sets the draft up (seat, format, the rule
   being tested). A card that says "run a half-PPR mock from seat 10" and
   then drops you on an empty setup screen is the dead-control failure this
   project keeps finding, and it is worse here than anywhere: this is the
   card whose entire premise is that it has already done the thinking. */

export default function RunNextCard({ eyebrow = 'Run this next', title, children, action, index = 0 }) {
  if (!action) return null
  const Tag = action.href ? 'a' : 'button'
  return (
    <section
      data-run-next
      className="jd-rise rounded-card border border-gain bg-slate-panel px-[18px] py-4"
      style={{ '--i': index }}
    >
      <p className="font-plex text-label uppercase text-accent-pink">{eyebrow}</p>
      <h3 className="mt-2 font-decision text-[17px] font-bold text-ink">{title}</h3>
      {children ? <p className="mt-1.5 text-meta leading-[1.45] text-ink-soft">{children}</p> : null}
      <Tag
        type={action.href ? undefined : 'button'}
        href={action.href}
        onClick={action.onClick}
        disabled={action.href ? undefined : action.disabled}
        title={action.title}
        aria-disabled={action.disabled ? 'true' : undefined}
        className={
          'mt-3.5 flex h-10 w-full items-center justify-center rounded-chip text-meta font-semibold ' +
          'transition-transform duration-hover ' +
          (action.disabled
            ? 'pointer-events-none cursor-not-allowed bg-white/10 text-white/30'
            : 'bg-teal text-slate-sunk hover:-translate-y-0.5')
        }
      >
        {action.label}
      </Tag>
    </section>
  )
}
