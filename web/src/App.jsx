import Homepage from './components/Homepage.jsx'
import RoomsLobby from './components/RoomsLobby.jsx'
import RoomPage from './components/RoomPage.jsx'
import MyLeagueScreen from './components/MyLeagueScreen.jsx'
import YouScreen from './components/YouScreen.jsx'
import DraftsScreen from './components/DraftsScreen.jsx'
import { useHashRoute } from './hooks/useHashRoute.js'

/* The one tree #root renders, and the only place the routes React owns are
   chosen between.

   `home` is the default and the unresolved state both, which is what keeps
   the prerender honest: scripts/prerender.mjs renders this with no window,
   useHashRoute() answers home there, and the client's hydration pass answers
   home too — so the markup matches and the real route lands one tick later.
   Anything that reads location during render puts React #418 back. */
export default function App() {
  const { view, slug } = useHashRoute()

  if (view === 'rooms') return <RoomsLobby />
  if (view === 'room') return <RoomPage slug={slug} />
  if (view === 'my-league') return <MyLeagueScreen />
  if (view === 'you') return <YouScreen />
  if (view === 'drafts') return <DraftsScreen />
  return <Homepage />
}
