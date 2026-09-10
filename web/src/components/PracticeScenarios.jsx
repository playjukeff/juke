import { useEffect, useState } from 'react'
import { SignInButton } from '@clerk/clerk-react'
import { useAccountUiReady } from '../hooks/useAccountUiReady.js'
import { useSignedIn } from '../hooks/useAuthState.js'
import { useLeague } from '../hooks/useLeague.js'
import { scenariosFor, sublineOf } from './practiceScenarios.js'

/* "Practice a scenario" — the 2x2 grid on the Mock Drafts lobby, from
   design_handoff_practice_scenarios (option 1c).

   It fills the empty column under "Draft with friends", and the handoff is
   explicit about what it is for: pressing a card starts a real mock draft
   under that card's settings, in one tap, with no sign-in gate. That is the
   whole module — everything else here is in service of it.

   ---- Every card launches a real draft ----

   engine.startScenario() is the one function that turns a card into a draft
   (app.js, beside startFromHistoryLeague). It applies the card's settings to
   the one real `league` and calls the ordinary startDraft(), so a scenario
   room is not a special mode: it is a mock draft that arrived with its
   settings already chosen. Read its own comment for what it does about the
   handoff's "one-off override" requirement, and why.

   ---- Which four cards ----

   practiceScenarios.js decides; this file draws. Guest gets four curated
   presets; signed in with three or more graded mocks gets four built out of
   real history. That split, the fallback between them, and every string on a
   card live there for the reason oneThatGotAway() lives in app.js rather
   than in the dashboard that prints it.

   ---- The loading state is honest about being brief ----

   The handoff asks for a pressed/loading state on the tapped card with the
   others disabled while the room is created. startScenario() is synchronous
   and DraftRoom raises its own full-screen DraftRoomLoader on the same
   press, so what a manager actually watches is that loader, not this. The
   flag is still real and still does two jobs: it stops a second card being
   pressed inside the frame before the loader mounts, and it is what carries
   a refusal back onto the card that caused it. */

/* 120ms ease-out, the handoff's own transition. Written once here because
   three different properties on the card use it. */
const EASE = 'transition-[background-color,transform] duration-[120ms] ease-out'

function ScenarioCard({ scenario, launching, disabled, onLaunch }) {
  return (
    <button
      type="button"
      data-practice-scenario={scenario.id}
      disabled={disabled}
      onClick={() => onLaunch(scenario)}
      className={
        'flex min-h-[100px] flex-col gap-1.5 rounded-xl bg-surface-row p-4 text-left ' +
        EASE +
        ' hover:bg-flow-tile active:scale-[0.98] disabled:opacity-60'
      }
    >
      {/* The eyebrow's colour is per card, so it is an inline style rather
          than a class: Tailwind's JIT finds classes by grepping source text
          and `text-[${accent}]` never appears as a literal — the same trap
          draftRoomPositions.js documents for its own class maps. */}
      {/* Sans, not mono. The handoff's mono is the section label above the
          grid and only that — its own eyebrow rule names a size, a weight
          and a tracking and no family, so it inherits the body face. Set in
          font-plex the four eyebrows read as four code fragments. */}
      <span
        className="text-[11px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: launching ? undefined : scenario.accent }}
      >
        {launching ? <span className="text-voidInk-muted">Starting…</span> : scenario.eyebrow}
      </span>
      <span className="text-[16px] font-bold leading-tight text-voidInk-primary">{scenario.title}</span>
      <span className="text-meta leading-snug text-voidInk-muted">{sublineOf(scenario)}</span>
    </button>
  )
}

export default function PracticeScenarios({ engine, tick, onLaunch }) {
  const signedIn = useSignedIn()
  const accountsReady = useAccountUiReady()
  /* One extra GET /me/leagues on this screen for a signed-in manager, and
     none at all for a guest — the hook short-circuits to "none" without a
     token. ShellHeader already asks the same question one level up and the
     hook holds no cache, so this is a second call rather than a shared one.
     It buys the "League prep" card its real team count, which is the only
     thing on this screen that can name the league somebody is drafting for. */
  const { league: connectedLeague } = useLeague()

  const [launchingId, setLaunchingId] = useState(null)
  const [problem, setProblem] = useState(null)
  const [data, setData] = useState(null)

  /* `tick` is in the dependency list for the same load-bearing reason
     DraftRoomEntry's own history effect carries it: historyList() resolves
     stored names against the LIVE board, and historyStats() cannot compute
     avgRoundByPosition or holeRounds at all until draft-engine.js has landed
     — both are deferred. Read once on mount, a signed-in manager with real
     history gets the guest cards for as long as the tab is open. */
  useEffect(() => {
    if (!engine) return
    try {
      setData(scenariosFor({
        signedIn,
        league: engine.league(),
        history: engine.historyList() || [],
        stats: engine.historyStats() || {},
        connectedLeague,
      }))
    } catch {
      setData(null)
    }
  }, [engine, tick, signedIn, connectedLeague])

  if (!data) return null

  const launch = (scenario) => {
    setProblem(null)
    setLaunchingId(scenario.id)
    const result = onLaunch(scenario)
    // A refusal comes back with a sentence and the screen stays put; a
    // success is already gone by the time this runs, and clearing the flag
    // on it would un-disable a grid nobody is looking at any more.
    if (result && result.ok === false) {
      setLaunchingId(null)
      setProblem(result.problem || 'That scenario could not be started.')
    }
  }

  const signIn = <span className="font-semibold text-mint">Sign in</span>

  return (
    <section className="mt-5">
      {/* Baseline-aligned, so the mono label and the 13px note sit on one
          line rather than on two optical ones. */}
      <div className="flex items-baseline justify-between gap-3">
        {/* The lobby's own section-label style, not the handoff's raw
            12px/.14em: "YOUR MOCK DRAFTS" is eleven pixels at .11em two
            inches below this, and two labels doing the same job at two
            sizes is what makes a screen look assembled rather than designed. */}
        <p className="font-plex text-[11px] font-semibold uppercase tracking-[0.12em] text-voidInk-muted">
          Practice a scenario
        </p>
        <p className="shrink-0 text-meta text-voidInk-muted">{data.rightLabel}</p>
      </div>

      {/* One column under 480px, which is the handoff's own collapse point.
          It is a viewport query standing in for a column-width one — this
          column is full width below `lg` and about 590px above it, so the
          two agree everywhere except a tablet held narrow, where two cards
          are still comfortable. */}
      <div className="mt-3.5 grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2">
        {data.scenarios.map((s) => (
          <ScenarioCard
            key={s.id}
            scenario={s}
            launching={launchingId === s.id}
            disabled={!!launchingId}
            onLaunch={launch}
          />
        ))}
      </div>

      {problem && (
        <p className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[12px] leading-relaxed text-rose-200/90">
          {problem}
        </p>
      )}

      <p className="mt-3.5 text-center text-meta text-voidInk-muted">
        {data.derived || signedIn ? (
          data.footer
        ) : (
          <>
            {/* Only the two words link, per the handoff. accountsReady is
                the same guard every other Clerk trigger in this app carries
                — with no publishable key there is no provider above this and
                <SignInButton> throws, so the sentence renders as plain text
                instead of taking the page down with it. */}
            {accountsReady ? (
              <SignInButton mode="modal">
                <button type="button" className="font-semibold text-mint hover:underline">Sign in</button>
              </SignInButton>
            ) : (
              signIn
            )}
            {' to save results and get scenarios built from your drafts'}
          </>
        )}
      </p>
    </section>
  )
}
