import { useEffect, useRef, useState } from 'react'
import ConnectLeagueModal from './ConnectLeagueModal.jsx'
import { noteLeagueConnected } from '../../hooks/useLeague.js'
import { useSignedIn } from '../../hooks/useAuthState.js'
import { takeYahooReturn } from '../../lib/yahooReturn.js'

/* Finishes a Yahoo connect after Yahoo's consent screen sends the reader
   back.

   Mounted once, at the top of the site, rather than inside any one screen:
   the reader comes back to whichever route they opened the dialog from, and
   a return that only one screen knew how to finish would be lost on every
   other.

   It renders NOTHING until there is a return to finish. That is what keeps
   it out of the prerendered markup -- a dialog drawn on the server and not
   on the client, or the reverse, is a hydration failure, and React answers
   one of those by throwing the whole prerender away (CLAUDE.md, "A portal
   is hydrated too"). The storage is only read in an effect, after
   hydration, and only once somebody is signed in: the code is worthless
   without the account it is exchanged for. */
export default function YahooReturn() {
  const signedIn = useSignedIn()
  const [ret, setRet] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!signedIn || ret) return
    const found = takeYahooReturn()
    if (found) setRet(found)
  }, [signedIn, ret])

  useEffect(() => {
    if (ret && ref.current) ref.current.resumeYahoo(ret)
  }, [ret])

  if (!ret) return null
  return <ConnectLeagueModal ref={ref} onConnected={noteLeagueConnected} />
}
