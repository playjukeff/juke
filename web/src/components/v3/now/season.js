import { useEffect, useRef, useState } from 'react'

/* Where the NFL season is, as Now needs to know it, and the two live reads
   the in-season pages draw (the week's slate, and who moved).

   ---- The season is asked, never guessed from a calendar ----

   JukeEngine.seasonClock() is the answer: { season, week, phase, started,
   weeksComplete }, or null when nobody knows. It is a new bridge entry, so
   it is feature-detected rather than assumed, and until it exists the
   pipeline's own week stamp stands in: weekProjMeta() is non-null only
   while the nightly is carrying a regular-season week's projections, which
   is the one fact it can honestly be read as. Neither answering is
   "unknown", and unknown renders the preseason page — the page that was
   right every day before this one existed. No date is written down here:
   a hard-coded "week 1 is 10 September" is wrong the first year the NFL
   moves it, and wrong in every other year for the weeks after it.

   ---- A connected league outranks the NFL clock ----

   Nothing here decides a connected page. A league's own snapshot knows
   whether IT has drafted, which week IT is on and whether ITS season is
   complete (NowConnected reads all three); the NFL clock only decides the
   pages for somebody Juke cannot read a league for. */

const PHASES = ['preseason', 'regular', 'postseason', 'offseason']

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

const UNKNOWN = { phase: 'unknown', season: null, week: null, started: false, weeksComplete: null, source: 'none' }

export function readSeason(engine) {
  if (!engine) return UNKNOWN
  if (typeof engine.seasonClock === 'function') {
    let c = null
    try { c = engine.seasonClock() } catch { c = null }
    if (c && PHASES.includes(c.phase)) {
      return {
        phase: c.phase,
        season: c.season !== undefined && c.season !== null ? String(c.season) : null,
        week: num(c.week),
        started: !!c.started,
        weeksComplete: typeof c.weeksComplete === 'number' ? c.weeksComplete : null,
        source: 'clock',
      }
    }
    // The clock exists and says it does not know. That is an answer, and
    // the older stand-in is not consulted over it.
    return { ...UNKNOWN, source: 'clock' }
  }
  if (typeof engine.weekProjMeta === 'function') {
    let m = null
    try { m = engine.weekProjMeta() } catch { m = null }
    const week = m ? num(m.week) : null
    if (week) {
      return { phase: 'regular', season: m.season ? String(m.season) : null, week, started: true, weeksComplete: null, source: 'weekProj' }
    }
  }
  return UNKNOWN
}

/* Three pages, four phases and unknown. The offseason is the draft's
   season as much as the preseason is — the brief's own grouping — and
   unknown takes the preseason page because it is the one that makes no
   claim about the date. */
export function bucketOf(phase) {
  if (phase === 'regular') return 'season'
  if (phase === 'postseason') return 'post'
  return 'draft'
}

/* The season, re-read whenever anything could have moved it: the deferred
   data landing (the pipeline's stamp arrives with stats.js), the engine's
   own tick, the tab coming back, and once a minute — a phase changes at a
   kickoff, not at a page load. Compared as a string so an unchanged answer
   is not a re-render. */
export function useSeason() {
  const [season, setSeason] = useState(() => readSeason(typeof window !== 'undefined' ? window.JukeEngine : null))
  const last = useRef(JSON.stringify(season))
  useEffect(() => {
    const read = () => {
      const next = readSeason(window.JukeEngine)
      const key = JSON.stringify(next)
      if (key === last.current) return
      last.current = key
      setSeason(next)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') read() }
    read()
    window.addEventListener('juke:data-loaded', read)
    window.addEventListener('juke:header', read)
    document.addEventListener('visibilitychange', onVisible)
    const id = setInterval(read, 60000)
    return () => {
      window.removeEventListener('juke:data-loaded', read)
      window.removeEventListener('juke:header', read)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(id)
    }
  }, [])
  return season
}

/* Who moved: JukeEngine.playerMovers({ limit }), feature-detected. An
   absent entry, a throw, or a non-array all answer [] — and [] draws no
   section at all, because a "who moved" heading over nothing is a claim
   that nobody did. Only rows carrying a name and a position are kept: a
   row that cannot be drawn truthfully is dropped rather than half-drawn. */
export function readMovers(engine, limit = 6) {
  if (!engine || typeof engine.playerMovers !== 'function') return []
  if (engine.dataReady && !engine.dataReady()) return []
  let rows = null
  try { rows = engine.playerMovers({ limit }) } catch { rows = null }
  if (!Array.isArray(rows)) return []
  return rows.filter((r) => r && r.name && r.pos).slice(0, limit)
}

export function useMovers(on, limit = 6) {
  const [rows, setRows] = useState([])
  useEffect(() => {
    if (!on) { setRows([]); return undefined }
    const read = () => setRows(readMovers(window.JukeEngine, limit))
    read()
    window.addEventListener('juke:data-loaded', read)
    return () => window.removeEventListener('juke:data-loaded', read)
  }, [on, limit])
  return rows
}

/* The week's games, off the same one-minute sessionStorage entry the score
   strip and the kickoff pill already read (JukeEngine.primeScores()), so
   this costs no request the header had not already made. It fails the way
   the strip fails: by disappearing. `null` is "nothing honest to draw". */
export function useSlate(on) {
  const [games, setGames] = useState(null)
  useEffect(() => {
    if (!on) { setGames(null); return undefined }
    let alive = true
    const read = () => {
      const e = window.JukeEngine
      if (!e || typeof e.primeScores !== 'function') return
      Promise.resolve(e.primeScores())
        .then((g) => { if (alive) setGames(Array.isArray(g) && g.length ? g : null) })
        .catch(() => { if (alive) setGames(null) })
    }
    read()
    const id = setInterval(read, 60000)
    window.addEventListener('juke:data-loaded', read)
    return () => { alive = false; clearInterval(id); window.removeEventListener('juke:data-loaded', read) }
  }, [on])
  return games
}

/* The next kickoff as an instant, so a caller can print the exact time
   beside the countdown — a countdown is read as a fact, and the fact is the
   wall-clock time, not the ticking digits. Null when there is nothing
   honest to count to. */
export function useNextKickoffAt() {
  const [at, setAt] = useState(null)
  useEffect(() => {
    let alive = true
    const read = () => {
      const e = window.JukeEngine
      if (!e || typeof e.nextKickoff !== 'function') return
      const next = e.nextKickoff() || null
      if (next) { if (alive) setAt(next); return }
      if (e.primeScores) Promise.resolve(e.primeScores()).then(() => { if (alive && e.nextKickoff) setAt(e.nextKickoff() || null) }, () => {})
    }
    read()
    const id = setInterval(read, 30000)
    window.addEventListener('juke:data-loaded', read)
    return () => { alive = false; clearInterval(id); window.removeEventListener('juke:data-loaded', read) }
  }, [])
  return at
}
