/* Every `<BarRow>` in a connected room, at both ends of the range.

   The defect this exists for was on screen for months at DESKTOP width and
   nothing here could see it. `<BarRow>` was a three-column grid, the Waiver
   Room's "where a claim would help" panel sits in a 360px rail at `lg`, and
   the label column came out **119px at 1440** — so every label in it read
   "Bijan Robinson · o…", carrying neither the player nor the position he
   beats. The same panel measured 111px at 375.

   So this asserts the property rather than a layout: no label is truncated,
   and every row still draws a bar. Both are true of the one-line
   arrangement a wide box gets and of the wrapped one a narrow box gets,
   which is what makes it a check on the outcome rather than on the CSS that
   happens to produce it.

   ---- Two things that make it a real check rather than a green one ----

   **The row count is asserted before anything about the rows.** The first
   version of this sweep selected on `display === "grid"` and reported zero
   clipped labels the moment the rows became flex — a check that reports
   nothing after the change it is checking is the vacuity trap, not a pass.
   The selector asks for the bar's own `h-bar-track`, which is a fact about
   what a row IS.

   **The stub has to wait for the board.** `RoomPage` fetches the snapshot
   on the render its league id arrives on, which is routinely BEFORE
   `players.js` lands — and a fixture that builds its rosters out of
   `JukeEngine.board()` then answers `ok: false`, the room draws "we could
   not read your league", and nothing retries. It resolves on
   `juke:data-loaded` instead. Same shape as `WaiverRoomLive`'s own memo on
   `board.length`, one layer out.

   ---- Why every test here skips against production ----

   The stub writes `window.JukeAuth`, which is what `useSignedIn()` reads
   BECAUSE that hook deliberately does not touch Clerk. In a keyless build
   the stub is the whole truth. Against production `AuthBridge` writes the
   real thing over it, the league never connects, and the room renders its
   guest state — so these would stand red on the nightly rather than
   report anything, which is the standing-red trap this project already
   records once for `league-connect.spec.mjs`.

   VERIFY A SKIP IN BOTH DIRECTIONS or it is a deletion: locally both run
   and pass, against production both skip. */

import { test, expect } from "@playwright/test";
import { openApp, LOCAL_SITE } from "./helpers.mjs";

const CLERK_GATED =
  "needs a connected league, which a keyed build gates behind Clerk";

const ROUTES = ["#/rooms/waiver", "#/rooms/trade"];

/* Signed in, with one league, and a snapshot built out of the real board so
   the rows are real players rather than a fixture the renderer cannot
   disagree with. Installed before any page script, and reinstalled when
   live.js lands and replaces `window.Live` with its own object. */
function stubLeague(context) {
  return context.addInitScript(() => {
    window.JukeAuth = {
      isSignedIn: true,
      userId: "u1",
      getToken: () => Promise.resolve("t"),
    };
    const install = () => {
      const L = window.Live || (window.Live = {});
      L.listLeagues = () =>
        Promise.resolve({
          ok: true,
          leagues: [
            {
              leagueId: "lg1",
              provider: "sleeper",
              name: "Test League",
              season: "2026",
              totalTeams: 10,
              ownerId: "me",
            },
          ],
        });
      L.leagueSnapshot = () =>
        new Promise((resolve) => {
          const ready = () =>
            window.JukeEngine &&
            window.JukeEngine.dataReady &&
            window.JukeEngine.dataReady();
          const go = () => resolve(build());
          if (ready()) go();
          else window.addEventListener("juke:data-loaded", go, { once: true });

          function build() {
            const board = window.JukeEngine.board();
            const at = (pos) =>
              board
                .filter(
                  (p) =>
                    p.pos === pos && p.projPts !== null && p.projPts !== undefined
                )
                .sort((a, b) => b.projPts - a.projPts);
            const wr = at("WR");
            const rb = at("RB");
            const qb = at("QB");
            const te = at("TE");
            if (!wr[60] || !rb[35] || !qb[10] || !te[10]) {
              return { ok: false, reason: "board too short" };
            }
            /* Deliberately a thin roster: the best held player at each
               position has to be beatable by the wire, or there are no gap
               rows to measure. The bench WR is better than the starting one
               so the Strategy side has a legal same-position swap too. */
            const mine = {
              rosterId: 1,
              ownerId: "me",
              teamName: "Mine",
              players: [rb[20].id, rb[35].id, wr[60].id, wr[8].id, qb[10].id, te[10].id].map(String),
              starters: [rb[20].id, wr[60].id, qb[10].id, te[10].id].map(String),
            };
            const them = {
              rosterId: 2,
              ownerId: "them",
              teamName: "Gridiron Gang",
              players: [rb[0].id, wr[0].id, qb[0].id, te[0].id].map(String),
              starters: [rb[0].id, wr[0].id, qb[0].id, te[0].id].map(String),
            };
            return {
              ok: true,
              snapshot: { teams: [mine, them], week: 3, waiverBudget: 100 },
            };
          }
        });
    };
    install();
    window.addEventListener("juke:data-loaded", install);
    document.addEventListener("DOMContentLoaded", install);
  });
}

/* A row is a `.jd-rise` carrying a bar track — which is what a BarRow IS,
   rather than how it is laid out. `scrollWidth > clientWidth` is the only
   truncation test that works on an ellipsised label, and the +1 is for
   subpixel rounding at dpr > 1. */
function readRows(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".jd-rise")]
      .filter(
        (r) =>
          r.children.length === 3 &&
          [...r.children].some((c) => /h-bar-track/.test(String(c.className)))
      )
      .map((r) => {
        const label = r.children[0];
        const bar = [...r.children].find((c) =>
          /h-bar-track/.test(String(c.className))
        );
        return {
          text: label.textContent.trim(),
          clipped: label.scrollWidth > label.clientWidth + 1,
          bar: Math.round(bar.getBoundingClientRect().width),
        };
      })
  );
}

for (const width of [375, 1440]) {
  test(`no bar row loses its label at ${width}`, async ({ browser }) => {
    test.skip(!LOCAL_SITE, CLERK_GATED);

    const context = await browser.newContext({ viewport: { width, height: 1200 } });
    await stubLeague(context);

    let seen = 0;
    for (const route of ROUTES) {
      const page = await openApp(context, route);
      /* The room draws once the snapshot lands, which is after the board.
         Waiting on the rows themselves rather than on a duration — the same
         reason every other wait in this suite is a condition. */
      await page
        .waitForFunction(
          () => document.querySelectorAll(".jd-rise").length > 0,
          null,
          { timeout: 20000 }
        )
        .catch(() => {});
      const rows = await readRows(page);

      for (const row of rows) {
        expect(row.clipped, `"${row.text}" is truncated at ${width} (${route})`).toBe(false);
        /* A bar of zero width is the other way to lose the comparison, and
           it is what a wrapped item with no basis would produce. */
        expect(row.bar, `"${row.text}" has no bar at ${width} (${route})`).toBeGreaterThan(40);
      }
      seen += rows.length;
      await page.close();
    }

    /* The control. Every assertion above is about something NOT being
       wrong, so a selector that matched nothing would satisfy all of them. */
    expect(seen, "the sweep found bar rows to check").toBeGreaterThan(2);

    await context.close();
  });
}
