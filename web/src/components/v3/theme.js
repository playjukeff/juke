import { useSyncExternalStore } from 'react'

/* v3's light and dark themes, and the choice between them.

   Three choices, not two: Light, Dark and System. System follows the
   device's own setting and keeps following it (a phone that turns dark at
   sunset turns the sheet dark with it), and it is the default, because a
   person who has already told their device which they prefer should not
   have to tell Juke again.

   The choice is kept in localStorage. It is a per-browser convenience with
   nothing riding on it, which is the one thing localStorage is right for,
   and every read and write is wrapped because the accessor can throw (a
   private window, site data blocked).

   What it switches is html[data-v3-theme], which only the --v3-* colours in
   index.css answer to. It is stamped while V3App is mounted and REMOVED
   when it unmounts, so leaving #/v3 for the live site or v2 leaves nothing
   behind: production has its own data-theme and never sees this one. */

const KEY = 'juke.v3.theme'
const ATTR = 'data-v3-theme'
export const THEME_CHOICES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]
const VALID = new Set(THEME_CHOICES.map((c) => c.value))

function readChoice() {
  try {
    const v = window.localStorage.getItem(KEY)
    return VALID.has(v) ? v : 'system'
  } catch {
    return 'system'
  }
}

let choice = typeof window === 'undefined' ? 'system' : readChoice()
let query = null
let mounts = 0
const listeners = new Set()

function deviceDark() {
  if (!query && typeof window !== 'undefined' && window.matchMedia) query = window.matchMedia('(prefers-color-scheme: dark)')
  return !!(query && query.matches)
}

export function resolvedTheme() {
  return choice === 'system' ? (deviceDark() ? 'dark' : 'light') : choice
}

function stamp() {
  if (mounts > 0 && typeof document !== 'undefined') document.documentElement.setAttribute(ATTR, resolvedTheme())
}

function notify() {
  stamp()
  listeners.forEach((fn) => fn())
}

export function setThemeChoice(next) {
  if (!VALID.has(next) || next === choice) return
  choice = next
  try { window.localStorage.setItem(KEY, next) } catch { /* the choice still holds for this visit */ }
  notify()
}

/* Called by V3App from a layout effect, so the attribute is on the document
   before the first v3 frame is painted and nobody sees the wrong theme
   flash. Counted, so a remount (StrictMode, a route change inside #/v3)
   cannot strip the attribute out from under a mounted app. */
export function mountTheme() {
  mounts += 1
  deviceDark()
  const onDevice = () => { if (choice === 'system') notify() }
  if (query) query.addEventListener ? query.addEventListener('change', onDevice) : query.addListener(onDevice)
  stamp()
  return () => {
    if (query) query.removeEventListener ? query.removeEventListener('change', onDevice) : query.removeListener(onDevice)
    mounts -= 1
    if (mounts === 0 && typeof document !== 'undefined') document.documentElement.removeAttribute(ATTR)
  }
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const snapshot = () => `${choice}:${resolvedTheme()}`

export function useV3Theme() {
  const snap = useSyncExternalStore(subscribe, snapshot, () => 'system:light')
  const [c, resolved] = snap.split(':')
  return { choice: c, resolved, setChoice: setThemeChoice }
}
