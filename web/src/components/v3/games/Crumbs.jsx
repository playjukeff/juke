/* The trail at the top of the scores pages -- "Scores / NFL / DET @ BUF ·
   September 17, 2026", "Players / NFL / Josh Allen" -- so a reader always
   knows where a page sits and can climb out of it in one press.

   The trail is the page's PLACE, fixed, not the path the reader took. The
   path gets its own chip at the end (`back`), so arriving at a player from
   a game offers "← DET @ BUF" without the trail pretending a player lives
   inside a game. */
import { Icon, cx } from '../ui.jsx'

export default function Crumbs({ items, back, className }) {
  return (
    <nav aria-label="Breadcrumb" className={cx('flex flex-wrap items-center gap-x-2 gap-y-2 text-[14px]', className)}>
      <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((it, i) => {
          const last = i === items.length - 1
          return (
            <li key={i} className="flex min-w-0 items-center gap-2">
              {last ? (
                <span aria-current="page" className="min-w-0 font-semibold text-v3-call">{it.label}</span>
              ) : (
                <>
                  <a href={it.href} className="font-medium text-v3-ink2 hover:text-v3-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call">{it.label}</a>
                  <span aria-hidden="true" className="text-v3-ink3">/</span>
                </>
              )}
            </li>
          )
        })}
      </ol>
      {back ? (
        <a href={back.href} className="ml-auto inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border border-v3-rule bg-v3-sheet px-3 text-[13px] font-semibold text-v3-ink2 hover:border-v3-ink3 hover:text-v3-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call">
          <Icon name="back" className="h-3.5 w-3.5" /> {back.label}
        </a>
      ) : null}
    </nav>
  )
}

/* "September 17, 2026" in the reader's own zone. */
export function longDate(iso) {
  const t = Date.parse(iso || '')
  if (!Number.isFinite(t)) return ''
  return new Date(t).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}
