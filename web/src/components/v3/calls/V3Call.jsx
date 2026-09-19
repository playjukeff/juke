import { roomIsOpen, lockReason } from '../../RoomPage.jsx'
import { useRooms } from '../../../hooks/useRooms.js'
import { retryLeagues, retrySnapshot } from '../../../hooks/useLeague.js'
import { useLeagueFresh, useSnapshotFresh } from '../../v2/stores.js'
import { CallButton, Headline, Label, QuietButton, Sheet, useEngineData } from '../ui.jsx'
import { CallHead, Loading, ReadOnlyLine, SituationBand, WayIn } from './callKit.jsx'
import { sampleLeague } from './callData.js'
import { bestSwaps, leagueWeekPts } from '../../rooms/strategyBoard.js'
import LineupTool from './LineupTool.jsx'
import WireTool from './WireTool.jsx'
import TradeTool from './TradeTool.jsx'

/* #/calls/<slug> — the three tools a call on Now opens.

   In v3 the in-season rooms stop being places you visit to find out whether
   they have anything to say. Each is the TOOL behind one kind of call:

     lineup  production's Strategy Room  (#/rooms/strategy)
     wire    production's Waiver Room    (#/rooms/waiver)
     trade   production's Trade Room     (#/rooms/trade)

   Every tool opens with the one call it exists for, stated with its unit and
   its arithmetic, then the full working surface underneath.

   ---- Who sees what is production's answer, asked, never restated ----

   roomIsOpen() and lockReason() are RoomPage.jsx's own exports, the same
   two functions the production lobby, the homepage grid and v2 all ask. A
   room production opens only with a connected league opens here only with
   one; section gates (League Intel, Rival Needs) are each tool's TierGate,
   off the gate production's own TABS declare.

   ---- Four league states, not two ----

   'loading' is a skeleton (never a flash of the sample at somebody who has
   connected), 'error' says Juke could not check and offers the retry
   rather than asking a reader to connect a league they may already have,
   'none' is the sample tool with the way in, 'connected' is the tool. */

/* The lineup sample asks for a chair whose draft-order lineup Juke would
   change — through the Strategy Room's own bestSwaps() and weekly scorer, so
   "would change" is the tool's own answer rather than a second opinion. */
function readLineupSample(engine) {
  const board = engine.board()
  const byId = new Map(board.map((p) => [String(p.id), p]))
  const weekPts = leagueWeekPts(engine, null)
  return sampleLeague(engine, { prefer: (team) => bestSwaps(team, byId, weekPts, null, 1).length > 0 })
}

const TOOLS = {
  lineup: { room: 'strategy', Body: LineupTool, what: 'the lineup call', read: readLineupSample },
  wire: { room: 'waiver', Body: WireTool, what: 'the waiver claim', read: sampleLeague },
  trade: { room: 'trade', Body: TradeTool, what: 'the trade question', read: sampleLeague },
}

function NotFound({ slug }) {
  return (
    <div className="grid min-h-[50vh] content-center gap-6">
      <Label>404 · no such call</Label>
      <Headline>That call isn&apos;t on the sheet.</Headline>
      <p className="max-w-[56ch] text-[18px] leading-[1.55] text-v3-ink2">
        There is no tool called <span className="font-figure font-bold text-v3-ink">{slug}</span>. Now opens the three that exist — the lineup swap, the waiver claim and the trade question.
      </p>
      <div className="flex flex-wrap gap-2">
        <CallButton href="#/">Back to Now</CallButton>
        <QuietButton href="#/calls/lineup">The lineup tool</QuietButton>
        <QuietButton href="#/calls/wire">The wire</QuietButton>
        <QuietButton href="#/calls/trade">The trade tool</QuietButton>
      </div>
    </div>
  )
}

/* The sample page: the real tool on an invented league, labelled SAMPLE,
   with the way in as the page's one primary action. */
function SampleTool({ tool }) {
  const sample = useEngineData(tool.read)
  const Body = tool.Body
  const action = (
    <div className="grid gap-2">
      <WayIn />
      <ReadOnlyLine />
    </div>
  )
  if (!sample) {
    return (
      <div className="grid gap-8">
        <CallHead
          label={`Sample call · ${tool.what}`}
          title="Reading tonight’s board."
          reason="The sample league is drafted off tonight’s board the moment it lands."
          action={action}
          band={<SituationBand sample items={['a sample league', 'not your league']} />}
        />
        <Loading />
      </div>
    )
  }
  return (
    <Body
      sample
      sampleInfo={{ teams: sample.teams, seat: sample.seat, rounds: sample.rounds }}
      league={sample.league}
      snapshot={sample.snapshot}
      status="ready"
      reason={null}
      action={action}
    />
  )
}

export default function V3Call({ slug }) {
  const rooms = useRooms()
  const { status, league } = useLeagueFresh()
  const tool = TOOLS[slug] || null
  const room = tool ? rooms.find((r) => r.slug === tool.room) || null : null

  // Production's own rule: what a connected league opens, and nothing else.
  const open = !!(room && status === 'connected' && league && roomIsOpen(room, status))
  const byLeague = !!(room && lockReason(room, 'none') === 'league')

  // Above every return, and a null id asks the worker for nothing — so a
  // guest or a not-found never touches it.
  const snap = useSnapshotFresh(open ? league.leagueId : null, open ? league.provider : null)

  if (!tool) return <NotFound slug={slug} />
  if (!rooms.length) return <Loading />

  if (open) {
    const Body = tool.Body
    return (
      <Body
        league={league}
        snapshot={snap.snapshot}
        status={snap.status}
        reason={snap.reason}
        onRetry={() => retrySnapshot(league.leagueId, league.provider)}
      />
    )
  }

  if (status === 'loading') {
    return (
      <div className="grid gap-8">
        <CallHead label={`Now · ${tool.what}`} title="Checking which league is yours." reason={null} band={null} />
        <Loading />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="grid gap-8">
        <CallHead label={`Now · ${tool.what}`} title="We could not check your league." reason="Juke could not find out whether you have a league connected, so it is not going to guess and ask you to connect one you may already have." band={null} />
        <Sheet code="Your league" aside="Not checked" role="alert">
          <p className="text-[15px] leading-[1.55] text-v3-ink2">Nothing about your league has changed. This page just could not ask.</p>
          <QuietButton onClick={retryLeagues} className="mt-4">Try again</QuietButton>
        </Sheet>
      </div>
    )
  }

  // 'none', or connected to a league this tool cannot open: the sample.
  if (byLeague || !room) return <SampleTool key={slug} tool={tool} />

  return <NotFound slug={slug} />
}
