import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { X, Check, Lock } from 'lucide-react'
import { PLATFORMS, LIVE_PLATFORMS } from './leaguePlatforms.js'
import { tierLabel } from '../../lib/tiers.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/* Connect a league: which platform, then one identifying thing, then which
   of the results is yours.

   ---- The platform step exists because the site claims four ----

   It did not, and that was the bug: every connect control on the site is
   captioned with four platforms, and pressing one opened a dialog headed
   "Your Sleeper username" with nothing in between. Reported as a
   disconnect between what we say we connect to and what the pop-up asks
   for, and it is exactly that — the reader is told the product reads their
   ESPN league and then asked for a credential from somewhere else.

   So the platform is chosen, all four are listed, and the ones that are
   not built are visibly locked rather than absent. See leaguePlatforms.js
   for why they are listed at all.

   **The step was kept when only one platform was live**, on the argument
   that it "stops being a step nobody notices the day a second platform
   ships, rather than being a screen somebody has to remember to add back".
   ESPN is that day, and the step needed no change at all — which is the
   cheapest possible confirmation that keeping it was right.

   ---- Two platforms, two different middles, one ending ----

   Sleeper: who are you → here are your leagues → pick one.
   ESPN:    which league → here are its teams → pick yours.

   They are not the same question and the dialog does not pretend they are.
   ESPN publishes nothing that maps a person to their leagues, so there is
   no username step to be had; and having resolved the league it still has
   to ask which team is the reader's, because there is no account to infer
   it from and every screen saying "your roster" needs the answer.

   What they share is the shape — one field, then one list — which is why
   this is one component with `isEspn` branches rather than two dialogs.
   Two dialogs would drift the first time the confirmation copy changed.

   ---- Why a username or an id, and never a login ----

   Neither platform is asked for a password, and in both cases that is a
   property of the API rather than a policy this file keeps.

   Sleeper's public API needs no key and has no OAuth, and it has no write
   endpoints at all. A username is enough to read the leagues behind it,
   which is the whole of what Juke wants. That is what makes "Connecting is
   read-only. Juke never edits your league" — the line on every unlock card
   — a property of the integration rather than a promise somebody has to
   keep: there is no credential here that could be used to change anything,
   because none was asked for.

   It also means no password ever reaches this app, which is the honest
   reason to prefer it over the alternative even where an alternative
   exists.

   ---- Two steps, and the second one has to exist ----

   A manager with one league would be happy with "type your name, done".
   Most have several, and a wrong guess connects the wrong roster to every
   screen in the app — so the league is always chosen, never inferred, even
   when there is only one to choose from. The single-league case is one
   extra press and no ambiguity.

   ---- The failures are told apart ----

   "We could not find that username" and "we could not reach Sleeper" want
   different things from the reader — retype versus retry — so live.js
   reports `not-found` separately from `offline` and this says the
   different thing. Collapsing them is how a form tells somebody their name
   is wrong when the network is down.

   ESPN adds a third, and it is the one that most needs saying: `private`
   means the league exists and its owner has not made it viewable. That is
   the only failure in this dialog with a fix the reader can carry out, so
   it names the fix — League Settings, visibility — rather than reporting
   that the number did not work, which would send them to re-check a number
   that was right. */

const ConnectLeagueModal = forwardRef(function ConnectLeagueModal({ onConnected }, ref) {
  const dialogRef = useRef(null)
  const [username, setUsername] = useState('')
  // platform | idle | looking | picking | connecting | done
  // | not-found | private | tier-limit | error
  const [status, setStatus] = useState('platform')
  const [platform, setPlatform] = useState(null)
  const [leagues, setLeagues] = useState([])
  const [sleeperUser, setSleeperUser] = useState(null)
  const [chosen, setChosen] = useState(null)
  /* ESPN resolves ONE league from the id, and then asks a question Sleeper
     never has to: which of these teams is yours. There is no account here
     to infer it from, and without it every screen that says "your roster"
     has nothing to key on. */
  const [espnLeague, setEspnLeague] = useState(null)
  // Which tier's cap was hit, and what it is — filled only on a tier-limit
  // refusal, to say which plan this account is on rather than a bare
  // "you're at your limit".
  const [tierInfo, setTierInfo] = useState({ tier: null, cap: null })
  // The tier-limit branch's own tiny email-capture, same shape as
  // EarlyAccessModal's: idle | invalid | submitting | success | error.
  const [email, setEmail] = useState('')
  const [notifyStatus, setNotifyStatus] = useState('idle')

  useImperativeHandle(ref, () => ({
    open() {
      setUsername('')
      setLeagues([])
      setSleeperUser(null)
      setChosen(null)
      setEspnLeague(null)
      setPlatform(null)
      setTierInfo({ tier: null, cap: null })
      setEmail('')
      setNotifyStatus('idle')
      // Always the first step, never the one it was left on: this dialog
      // is one element reused for every open, which is the same reason
      // openSheet() clears the player sheet's team colour rather than
      // merely setting it.
      setStatus('platform')
      dialogRef.current?.showModal()
    },
    /* The cap is already known before this opens — every caller has
       useTier() and useLeague().leagues.length in hand — so a Free reader
       (or anyone else already at their cap) lands straight on the
       tier-limit screen instead of picking a platform, typing a username
       and choosing a league only to be told no at the very end. The worker
       still refuses a connect against this same cap regardless of which
       path opened the dialog; this only saves the trip for the case that
       can be known in advance. */
    openAtLimit(tier, cap) {
      setEmail('')
      setNotifyStatus('idle')
      setTierInfo({ tier, cap })
      setStatus('tier-limit')
      dialogRef.current?.showModal()
    },
  }))

  const close = () => dialogRef.current?.close()

  const live = () => (typeof window !== 'undefined' ? window.Live : null)
  const token = () => {
    const auth = typeof window !== 'undefined' ? window.JukeAuth : null
    return auth && auth.getToken ? auth.getToken() : Promise.resolve(null)
  }

  const isEspn = platform && platform.key === 'espn'

  /* One field, two questions.

     Sleeper asks who you are and answers with your leagues. ESPN has no
     such lookup at all — it addresses a league by the number in its own
     URL — so the same input takes a league id and answers with one league
     and its teams. Both then converge on "pick one", which is why this is
     one step rather than two flows drawn side by side. */
  const lookup = async (e) => {
    e.preventDefault()
    const typed = username.trim()
    if (!typed) return
    setStatus('looking')
    const l = live()

    if (isEspn) {
      const res = l && l.espnLookup ? await l.espnLookup(typed) : { ok: false, reason: 'offline' }
      if (!res.ok) {
        // Three different things to tell somebody, and only one of them is
        // "check the number" — see worker/espn.js for what ESPN answers.
        setStatus(res.reason === 'private' ? 'private'
                : res.reason === 'not-found' ? 'not-found'
                : 'error')
        return
      }
      setEspnLeague(res.league)
      setStatus('picking')
      return
    }

    const res = l && l.sleeperLookup ? await l.sleeperLookup(typed) : { ok: false, reason: 'offline' }
    if (!res.ok) {
      setStatus(res.reason === 'not-found' ? 'not-found' : 'error')
      return
    }
    setSleeperUser(res.user)
    setLeagues(res.leagues)
    // A real account with no leagues this season is its own answer, and
    // not an error: it is what a manager who has not joined one yet sees.
    setStatus('picking')
  }

  const connect = async () => {
    if (!chosen) return
    setStatus('connecting')
    const l = live()
    /* What identifies the reader inside the league differs by platform:
       Sleeper knows them from the username lookup, ESPN only from the team
       they just picked. Both land in the same `ownerId` column, because
       both answer the same question — which of these rosters is theirs. */
    const res = l && l.connectLeague
      ? isEspn
        ? await l.connectLeague(await token(), espnLeague.leagueId, chosen.teamId, 'espn')
        : await l.connectLeague(await token(), chosen.leagueId, sleeperUser && sleeperUser.userId, 'sleeper')
      : { ok: false, reason: 'offline' }

    if (!res.ok) {
      if (res.reason === 'tier-limit') {
        setTierInfo({ tier: res.tier, cap: res.cap })
        setStatus('tier-limit')
        return
      }
      // A league that stopped being public between the lookup and the
      // connect is worth naming rather than reporting as a generic failure.
      setStatus(res.reason === 'private' ? 'private' : 'error')
      return
    }
    setStatus('done')
    if (onConnected) onConnected(res.league)
    // Long enough to read the confirmation, short enough not to be a wait.
    setTimeout(() => close(), 900)
  }

  /* The tier-limit branch's own way forward. There is no checkout to send
     anybody to — see worker/store.js's LEAGUE_CAP comment and CLAUDE.md's
     "payment processing is explicitly out of scope" — so this is the same
     email-capture EarlyAccessModal.jsx already uses for every other "not
     built yet" dead end, inlined rather than opened as a second dialog:
     chaining two <dialog> elements from one imperative open() has nowhere
     good to hand the ref, and this is small enough not to need its own
     component. */
  const notify = async (e) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!EMAIL_RE.test(trimmed)) {
      setNotifyStatus('invalid')
      return
    }
    setNotifyStatus('submitting')
    const signup = typeof window !== 'undefined' && window.Live && window.Live.signup
    // The tier ABOVE the one that was hit — a Free account capped at zero
    // wants Season Pass; a Season Pass account with its one league already
    // connected wants Multi-League.
    const nextTier = tierInfo.tier === 'pro' ? 'allaccess' : 'pro'
    const result = signup ? await signup(trimmed, 'upgrade:' + nextTier) : { ok: false }
    setNotifyStatus(result && result.ok ? 'success' : 'error')
  }

  /* The picking step renders one list. Sleeper fills it with leagues and
     ESPN with the chosen league's teams — different things to choose, the
     same question being asked, so one renderer rather than two lists side
     by side that drift the first time a row gains a field. */
  const rows = isEspn ? (espnLeague ? espnLeague.teams : []) : leagues
  const rowKey = (r) => (isEspn ? r.teamId : r.leagueId)

  const label = 'font-mono text-[11px] tracking-[0.14em] text-teal'

  return (
    <dialog
      ref={dialogRef}
      className="m-auto rounded-2xl border border-line-hairline bg-[#151920] p-0 text-white backdrop:bg-black/60"
      onClick={(e) => {
        // The convention every other dialog here uses: a click landing on
        // the dialog element itself is a click on the backdrop.
        if (e.target === dialogRef.current) close()
      }}
    >
      <div className="w-[min(92vw,30rem)] p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className={label}>CONNECT A LEAGUE</span>
            <h3 className="mt-1.5 font-display text-[24px] font-bold text-white">
              {status === 'platform'
                ? 'Where is your league?'
                : status === 'tier-limit'
                  ? "You're at your plan's limit"
                : status === 'picking' || status === 'connecting' || status === 'done'
                  // ESPN has already resolved the league; what is being
                  // chosen at this step is which team in it is yours.
                  ? (isEspn ? 'Which team is yours?' : 'Which league?')
                  : isEspn
                    ? 'Your ESPN league ID'
                    : `Your ${platform ? platform.name : 'Sleeper'} username`}
            </h3>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-mr-1.5 -mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/50 transition-colors hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {status === 'platform' ? (
          <>
            <p className="mt-2 text-[14px] leading-[1.5] text-voidInk-body">
              Juke reads your league to price waivers, trades and your lineup. It never writes to
              it.
            </p>

            <ul className="mt-4 flex flex-col gap-2">
              {PLATFORMS.map((p) => (
                <li key={p.key}>
                  <button
                    type="button"
                    disabled={!p.live}
                    onClick={() => { setPlatform(p); setStatus('idle') }}
                    className={
                      'flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors duration-150 ' +
                      (p.live
                        ? 'border-line-hairline hover:border-teal/60'
                        : 'cursor-default border-line-hairline/60 opacity-45')
                    }
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-white">
                        {p.name}
                      </span>
                      {p.note ? (
                        <span className="mt-0.5 block text-[12px] text-ink-muted">{p.note}</span>
                      ) : null}
                    </span>
                    {p.live ? (
                      <span className="shrink-0 text-[18px] text-ink-muted" aria-hidden="true">›</span>
                    ) : (
                      <Lock className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                    )}
                  </button>
                </li>
              ))}
            </ul>

            {/* Said once, plainly, rather than left for somebody to infer
                from the dimmed rows. The locked platforms carry no "soon"
                badge of their own for the reason the sport chips do not
                either: a lock says "not this one" and a badge says "we have
                committed to a date".

                Derived, because the hand-written version of this sentence
                read "Sleeper is the one Juke reads today" and was still
                saying it the moment ESPN shipped — the stale-copy failure
                this project keeps finding, in the dialog whose whole job is
                to be accurate about which platforms work. */}
            <p className="mt-3.5 text-[13px] leading-[1.4] text-voidInk-body">
              {LIVE_PLATFORMS.length === PLATFORMS.length
                ? 'Juke reads all of these.'
                : `${LIVE_PLATFORMS.map((p) => p.name).join(' and ')} ${
                    LIVE_PLATFORMS.length > 1 ? 'are' : 'is'
                  } what Juke reads today. The others are not connected yet.`}
            </p>
          </>
        ) : status === 'tier-limit' ? (
          <>
            <p className="mt-2 text-[14px] leading-[1.5] text-voidInk-body">
              {tierLabel(tierInfo.tier)} connects{' '}
              {tierInfo.cap ? `${tierInfo.cap} ${tierInfo.cap === 1 ? 'league' : 'leagues'}` : 'no leagues'}.
              Upgrading isn't live yet — leave an email and we'll tell you when it is.
            </p>
            {notifyStatus === 'success' ? (
              <p className="mt-4 flex items-center gap-2 text-[15px] text-mint">
                <Check className="h-5 w-5 shrink-0" />
                You're on the list.
              </p>
            ) : (
              <form onSubmit={notify}>
                <input
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (notifyStatus !== 'idle') setNotifyStatus('idle')
                  }}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="mt-4 w-full rounded-xl border border-line-hairline bg-surface-page px-4 py-3 text-[16px] text-white outline-none placeholder:text-ink-muted focus:border-teal"
                />
                {notifyStatus === 'invalid' ? (
                  <p className="mt-2 text-[13px] text-flow-rose">That doesn&apos;t look like an email address.</p>
                ) : null}
                {notifyStatus === 'error' ? (
                  <p className="mt-2 text-[13px] text-flow-rose">That didn&apos;t send. Try again in a moment.</p>
                ) : null}
                <button
                  type="submit"
                  disabled={notifyStatus === 'submitting'}
                  className="mt-3 w-full rounded-full px-5 py-3 text-[15px] font-bold text-surface-page transition-transform duration-150 hover:scale-[1.01] disabled:opacity-40"
                  style={{ background: 'linear-gradient(100deg,#44D4E2,#82A1F6)' }}
                >
                  {notifyStatus === 'submitting' ? 'Sending…' : 'Notify me'}
                </button>
              </form>
            )}
          </>
        ) : status === 'done' ? (
          <p className="mt-4 flex items-center gap-2 text-[15px] text-mint">
            <Check className="h-5 w-5 shrink-0" />
            Connected {chosen ? chosen.name : 'your league'}.
          </p>
        ) : status === 'picking' || status === 'connecting' ? (
          <>
            <p className="mt-2 text-[14px] leading-[1.5] text-voidInk-body">
              {isEspn ? (
                <>
                  <b className="font-semibold text-white">{espnLeague?.name}</b>
                  {espnLeague?.season ? ` · ${espnLeague.season}` : ''} · Juke reads this league
                  and never writes to it.
                </>
              ) : (
                <>
                  Signed in as <b className="font-semibold text-white">{sleeperUser?.name}</b>. Juke
                  reads this league and never writes to it.
                </>
              )}
            </p>

            {rows.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-flow-pillEdge px-4 py-5 text-center text-[14px] text-voidInk-body">
                {isEspn
                  ? 'That league has no teams in it yet.'
                  : 'No leagues on that account this season.'}
              </p>
            ) : (
              <ul className="mt-4 flex max-h-[46vh] flex-col gap-2 overflow-y-auto">
                {rows.map((lg) => {
                  const on = chosen && rowKey(chosen) === rowKey(lg)
                  return (
                    <li key={rowKey(lg)}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setChosen(lg)}
                        className={
                          'flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors duration-150 ' +
                          (on
                            ? 'border-teal bg-flow-mintDark/40'
                            : 'border-line-hairline hover:border-white/25')
                        }
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-semibold text-white">
                            {lg.name}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[11px] tracking-[0.1em] text-ink-muted">
                            {isEspn
                              // A team's manager is the thing that tells two
                              // similarly-named teams apart, and it is the
                              // only way somebody picks their own out of ten.
                              ? [lg.abbrev, lg.manager].filter(Boolean).join(' · ').toUpperCase()
                                || 'TEAM ' + lg.teamId
                              : `${lg.season}${lg.totalTeams ? ` · ${lg.totalTeams} TEAMS` : ''}`}
                          </span>
                        </span>
                        {on ? <Check className="h-5 w-5 shrink-0 text-teal" /> : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            <button
              type="button"
              onClick={connect}
              disabled={!chosen || status === 'connecting'}
              className="mt-5 w-full rounded-full px-5 py-3 text-[15px] font-bold text-surface-page transition-transform duration-150 hover:scale-[1.01] disabled:opacity-40"
              style={{ background: 'linear-gradient(100deg,#44D4E2,#82A1F6)' }}
            >
              {status === 'connecting' ? 'Connecting…' : isEspn ? 'Connect this team' : 'Connect league'}
            </button>
          </>
        ) : (
          <form onSubmit={lookup}>
            {/* A way back to the platform list. A three-step flow whose
                first step cannot be returned to is a flow that punishes a
                misclick with a close-and-reopen — and this one's first
                step is a choice between four things, which is exactly
                where a misclick happens. */}
            <button
              type="button"
              onClick={() => { setPlatform(null); setUsername(''); setStatus('platform') }}
              className="-ml-1 mt-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[13px] text-ink-muted transition-colors hover:text-white"
            >
              <span aria-hidden="true">‹</span> Not {platform ? platform.name : 'Sleeper'}?
            </button>

            <p className="mt-1.5 text-[14px] leading-[1.5] text-voidInk-body">
              {isEspn ? (
                <>
                  The number in your league&apos;s own URL — <span className="font-mono text-[13px] text-white">
                  leagueId=</span> on fantasy.espn.com. The league has to be public for Juke to read
                  it, and nothing is ever written back.
                </>
              ) : (
                <>
                  We read your leagues from Sleeper. No password, and nothing is ever written back —
                  Sleeper&apos;s public API has no way to change your league even if we wanted to.
                </>
              )}
            </p>

            <input
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                if (status !== 'idle') setStatus('idle')
              }}
              autoComplete={isEspn ? 'off' : 'username'}
              spellCheck={false}
              /* numeric on a phone for ESPN: the value is a league id, and
                 a text keyboard for a ten-digit number is a small tax paid
                 on every character. */
              inputMode={isEspn ? 'numeric' : 'text'}
              placeholder={isEspn ? '65142363' : 'sleeper username'}
              /* 16px, because anything smaller makes iOS zoom the page in
                 on focus and not zoom back out — the floor CLAUDE.md keeps
                 for every field in this app. */
              className="mt-4 w-full rounded-xl border border-line-hairline bg-surface-page px-4 py-3 text-[16px] text-white outline-none placeholder:text-ink-muted focus:border-teal"
            />

            {status === 'not-found' ? (
              <p className="mt-2 text-[13px] text-flow-rose">
                {isEspn
                  ? 'No ESPN league with that ID. It is the number after leagueId= in the URL.'
                  : 'No Sleeper account with that username. Check the spelling — it is the username, not a display name.'}
              </p>
            ) : null}
            {/* The one failure with a fix the reader can carry out, so it
                says what the fix is rather than "could not read it". */}
            {status === 'private' ? (
              <p className="mt-2 text-[13px] text-flow-rose">
                That league is private, so ESPN will not let Juke read it. In the ESPN app, open
                League Settings and set visibility to public, then try again.
              </p>
            ) : null}
            {status === 'error' ? (
              <p className="mt-2 text-[13px] text-flow-rose">
                Could not reach {isEspn ? 'ESPN' : 'Sleeper'} just now. Try again in a moment.
              </p>
            ) : null}

            <button
              type="submit"
              disabled={!username.trim() || status === 'looking'}
              className="mt-4 w-full rounded-full px-5 py-3 text-[15px] font-bold text-surface-page transition-transform duration-150 hover:scale-[1.01] disabled:opacity-40"
              style={{ background: 'linear-gradient(100deg,#44D4E2,#82A1F6)' }}
            >
              {status === 'looking' ? 'Looking…' : isEspn ? 'Find my league' : 'Find my leagues'}
            </button>
          </form>
        )}
      </div>
    </dialog>
  )
})

export default ConnectLeagueModal
