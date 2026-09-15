/* The connect dialog, driven for real.

   CLAUDE.md calls this the widest gap in the account surface's coverage:
   every ConnectLeagueCta sits inside Clerk's <SignedIn>, a test build has
   no publishable key, so the dialog was only ever verified by hand.

   It is narrower than that: `useSignedIn()` reads `window.JukeAuth` and the
   `juke:auth` event rather than Clerk directly -- deliberately, because a
   keyless build has no provider for `useAuth()` to throw against -- so
   stubbing that global is enough to reach the whole flow with no source
   edit and no Clerk instance.

   CBS is what it covers, because CBS is the platform whose flow is not a
   mirror of the other two: it has no public half at all, so its address
   and its sign-in are one step rather than two, and a step that asked for
   the address alone could only ever fail.

   `window.Live` is stubbed AFTER load rather than in an init script --
   live.js assigns it wholesale at boot and would overwrite one. */
import { test, expect } from '@playwright/test'
import { SITE } from './helpers.mjs'

const LEAGUE = {
  provider: 'cbs',
  leagueId: 'sanctuaryfootballleague',
  name: 'Sanctuary Football League',
  season: '2026',
  totalTeams: 12,
  draftStatus: 'complete',
  teams: [
    { teamId: '4', name: 'Team Four', manager: 'Chase' },
    { teamId: '14', name: 'Team Fourteen', manager: 'Someone' },
  ],
}

async function openDialog(page, opts = {}) {
  await page.addInitScript(() => {
    window.JukeAuth = {
      isSignedIn: true, userId: 'u_test',
      getToken: () => Promise.resolve('tok'),
    }
  })
  await page.goto(SITE + '/#/you')
  // live.js assigns window.Live wholesale at boot, so the stubs go on
  // AFTER it lands rather than in an init script that it overwrites.
  await page.waitForFunction(() => !!window.Live)
  await page.evaluate(({ lg, connectFails }) => {
    window.__LEAGUE = lg
    window.__calls = []
    const ok = (extra) => Object.assign({ ok: true, reason: null }, extra)
    window.Live.listLeagues = () => Promise.resolve(ok({ leagues: [] }))
    // useTier() reads /me, not a `tier` method -- the cap otherwise sends
    // every open straight to the tier-limit screen.
    window.Live.me = () => Promise.resolve(ok({ signedIn: true, tier: 'allaccess' }))
    /* ESPN's public lookup answers "private", which is the branch that
       offers the sign-in step the bookmarklet lives on. */
    window.Live.espnLookup = () => Promise.resolve({ ok: false, reason: 'private' })
    window.Live.cbsLookup = (id, season, cred, token) => {
      window.__calls.push({ fn: 'cbsLookup', id, pid: cred && cred.pid, token })
      if (!cred || cred.pid !== 'GOODPID') return Promise.resolve({ ok: false, reason: 'private' })
      return Promise.resolve(ok({ league: window.__LEAGUE, season: '2026' }))
    }
    window.Live.connectLeague = (token, leagueId, ownerId, provider, cred) => {
      window.__calls.push({ fn: 'connectLeague', leagueId, ownerId, provider, pid: cred && cred.pid })
      if (connectFails) return Promise.resolve({ ok: false, reason: connectFails })
      return Promise.resolve(ok({ league: window.__LEAGUE }))
    }
    window.dispatchEvent(new Event('juke:auth'))
  }, { lg: LEAGUE, connectFails: opts.connectFails || null })
  await page.getByRole('button', { name: /connect a league/i }).first().click()
}

test('CBS is offered, and its step asks for the address and the cookie together', async ({ page }) => {
  await openDialog(page)

  // The platform step lists it as live rather than locked.
  const cbs = page.getByRole('button', { name: /^CBS/ })
  await expect(cbs).toBeEnabled()
  await cbs.click()

  // One step, both fields: CBS has no public half, so an address-only step
  // could never succeed.
  await expect(page.getByRole('heading', { name: /your cbs league/i })).toBeVisible()
  const address = page.locator('input[placeholder*="cbssports.com"]')
  const pid = page.locator('#cbs-pid')
  await expect(address).toBeVisible()
  await expect(pid).toBeVisible()

  const submit = page.getByRole('button', { name: /find my league/i })
  await expect(submit).toBeDisabled()
  await address.fill('https://sanctuaryfootballleague.football.cbssports.com/rules')
  await expect(submit).toBeDisabled()          // the cookie is required too
  await pid.fill('BADPID')
  await expect(submit).toBeEnabled()

  // A refusal names both halves and offers no "make it public".
  await submit.click()
  await expect(page.getByText(/would not open that league/i)).toBeVisible()
  await expect(page.getByText(/set visibility to public/i)).toHaveCount(0)

  // And the honest retention line, which may not inherit ESPN's.
  await expect(page.getByText(/does not expire on its own/i)).toBeVisible()

  await pid.fill('GOODPID')
  await submit.click()

  // Then the second question ESPN also asks: which of these teams is yours.
  await expect(page.getByText('Sanctuary Football League')).toBeVisible()
  await page.getByRole('radio', { name: 'Team Four CHASE' }).click()
  await page.getByRole('button', { name: /connect this team/i }).click()
  // The confirmation is up for 900ms before the dialog closes itself, so
  // what is asserted is the call it made rather than a frame of text.
  await page.waitForFunction(() => (window.__calls || []).some((c) => c.fn === 'connectLeague'))

  const calls = await page.evaluate(() => window.__calls)
  const connect = calls.find((c) => c.fn === 'connectLeague')
  expect(connect).toMatchObject({
    provider: 'cbs', leagueId: 'sanctuaryfootballleague', ownerId: '4', pid: 'GOODPID',
  })
  // The lookup is always made as somebody: CBS has no signed-out read.
  expect(calls.filter((c) => c.fn === 'cbsLookup').every((c) => c.token === 'tok')).toBe(true)
})

test('the other two platforms are untouched by it', async ({ page }) => {
  await openDialog(page)
  await page.getByRole('button', { name: /^Sleeper/ }).click()
  await expect(page.getByRole('heading', { name: /sleeper username/i })).toBeVisible()
  await expect(page.locator('#cbs-pid')).toHaveCount(0)
})

test('a connect that fails keeps the team you picked', async ({ page }) => {
  /* The deployment having no usable key is not the reader's fault and not a
     retry -- but it used to be written into `status`, which the picking step
     does not render, so the dialog fell back to the address form and threw
     away the team. Reported from the live site.

     What this asserts is that the press and its answer stay on one screen. */
  await openDialog(page, { connectFails: 'private-unavailable' })

  await page.getByRole('button', { name: /^CBS/ }).click()
  await page.locator('input[placeholder*="cbssports.com"]')
    .fill('sanctuaryfootballleague.football.cbssports.com')
  await page.locator('#cbs-pid').fill('GOODPID')
  await page.getByRole('button', { name: /find my league/i }).click()

  await page.getByRole('radio', { name: 'Team Four CHASE' }).click()
  await page.getByRole('button', { name: /connect this team/i }).click()

  await expect(page.getByText(/not switched on for this deployment/i)).toBeVisible()

  // Still on the picking step: the league, the chosen team and the button
  // that was pressed are all still there.
  await expect(page.getByText('Sanctuary Football League')).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Team Four CHASE' })).toBeVisible()
  await expect(page.getByRole('button', { name: /connect this team/i })).toBeVisible()
  // And NOT back on the address step.
  await expect(page.getByRole('button', { name: /find my league/i })).toHaveCount(0)
})

test('the CBS step offers the bookmarklet, and says what to do with it', async ({ page }) => {
  /* The manual path is developer tools -> Application -> Cookies, which is a
     real barrier in front of the one thing a subscriber is trying to do. The
     drag target is the easy path and has to actually be there. */
  await openDialog(page)
  await page.getByRole('button', { name: /^CBS/ }).click()

  const bm = page.getByRole('link', { name: /copy my key/i })
  await expect(bm).toBeVisible()

  /* It has to be a javascript: href -- that is the whole mechanism. A
     bookmark cannot carry a newline either, so the one-lining matters. */
  const href = await bm.getAttribute('href')
  expect(href.startsWith('javascript:')).toBe(true)
  expect(href).not.toContain(String.fromCharCode(10))
  // It names the one cookie it will read, and only that one.
  expect(href).toContain('["pid"]')
  expect(href).not.toContain('espn_s2')

  /* Clicking it HERE is refused by this page's own CSP, so the click has to
     say what to do rather than appear to do nothing -- a control that
     cannot act must not merely fail. */
  await bm.click()
  await expect(page.getByText(/drag it up to your bookmarks bar/i)).toBeVisible()

  // And the manual route is still reachable for a phone, where dragging a
  // bookmark is not a thing anybody can do.
  await expect(page.getByText(/or find it by hand/i)).toBeVisible()
})

test('the ESPN private step offers one too, and one paste fills both boxes', async ({ page }) => {
  /* ESPN needed a browser extension right up until the HttpOnly flag on
     `espn_s2` was actually looked at -- it is not set, so document.cookie
     can read it and this is the same mechanism CBS gets. */
  await openDialog(page)
  await page.getByRole('button', { name: /^ESPN/ }).click()
  await page.locator('input[placeholder="65142363"]').fill('65142363')
  await page.getByRole('button', { name: /find my league/i }).click()

  // The public lookup answers "private", which is what offers the sign-in step.
  await page.getByRole('button', { name: /connect it with my espn sign-in/i }).click()

  const bm = page.getByRole('link', { name: /copy my key/i })
  await expect(bm).toBeVisible()
  const href = await bm.getAttribute('href')
  expect(href.startsWith('javascript:')).toBe(true)
  expect(href).toContain('espn_s2')
  expect(href).toContain('SWID')

  /* One clipboard value, two boxes -- pasting into EITHER fills both,
     because somebody with one value and two fields tries whichever is
     nearer. */
  await page.locator('#espn-s2').focus()
  await page.evaluate(() => {
    const el = document.querySelector('#espn-s2')
    const dt = new DataTransfer()
    dt.setData('text', 'SWID={ABC-123}; espn_s2=AEBxyz')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await expect(page.locator('#espn-swid')).toHaveValue('{ABC-123}')
  await expect(page.locator('#espn-s2')).toHaveValue('AEBxyz')
})
