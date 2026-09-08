import { useEffect, useState } from 'react'

// One room list, read off window.JukeEngine.rooms(), shared by every
// screen that needs it rather than each keeping its own copy — the "two
// different implementations that have drifted" bug SiteNav.jsx's own file
// comment already documents for NAV_LINKS, just for the room list instead
// of the nav links. Named two callers when this was written
// (RoomsGrid.jsx, RoomsNavMenu.jsx) and "six rooms" when ROOMS still held
// League alongside a retired Prospect; both are stale now that League has
// graduated into its own screen and Prospect is back, netting five, and
// railItems.js/RoomsGridAlive.jsx/RoomPage.jsx are among several more
// callers since — grep useRooms() for the current list rather than
// trusting a name written down here.
export function useRooms() {
  const [rooms, setRooms] = useState([])

  useEffect(() => {
    const engine = typeof window !== 'undefined' ? window.JukeEngine : null
    if (!engine) return
    setRooms(engine.rooms())
  }, [])

  return rooms
}
