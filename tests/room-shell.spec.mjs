/* One shell, worn by every screen, and each screen naming its own subject
   in the body rather than in the chrome.

   ---- What this file was ----

   RoomShell: the bar the five rooms wore, its back link to the rooms
   lobby, the tier chip a guest was told their plan on, and the assertion
   that every room's bar was literally the same bar. The cutover retired
   all of it — there is no rooms lobby to go back to, `RoomPage` and
   `RoomShell` render on no address, and the three in-season rooms became
   TOOLS a call opens (#/calls/lineup, #/calls/wire, #/calls/trade) rather
   than places you visit to find out whether they have anything to say.

   So the markup is gone and the REQUIREMENT is not, which is the same call
   rail-nav.spec.mjs made in the same pass. Two of the four things this
   file guarded are still live questions about v3's calls:

     - every call wears the same chrome, so a reader never relearns where
       they are;
     - the call's own subject is an H1 in the BODY, never in the bar. That
       one is worth keeping on its own terms: it is the rule that stopped
       the room's name being chrome, and a tool whose headline is its
       subject ("Claim Drake London.") is the whole reason the calls are
       phrased as calls.

   ---- What is NOT covered here, and why, rather than quietly dropped ----

   The tier chip. A guest was told which plan they were on in the room's
   bar; v3 has no bar, and its tier handling moved into #/account and into
   callKit's own gate. That is a real assertion with no home in this file
   any more — it belongs to whatever covers #/account, and it is named here
   so that its absence is a decision on the record rather than an
   omission nobody noticed.

   The back link to the lobby. There is no lobby. The way off a call is the
   primary nav and the wordmark, both of which rail-nav.spec.mjs asserts on
   every screen including these three. */

import { test, expect } from "@playwright/test";
import { openApp } from "./helpers.mjs";

/* The three calls, by address and by the subject each one names. Read off
   the built site rather than copied out of a component — the same rule
   shell-routes.spec.mjs follows, and for the same reason: these are the
   sentences a reader actually sees, and a component's source spells them
   before CSS has uppercased anything. */
const CALLS = [
  { hash: "#/calls/lineup", names: "Start Dallas Goedert over Brock Bowers." },
  { hash: "#/calls/wire", names: "Claim Drake London." },
  { hash: "#/calls/trade", names: "Ask for Isaiah Likely." },
];

test.describe("the calls wear one shell", () => {
  for (const call of CALLS) {
    test(`${call.hash} names its own call in the body`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await openApp(context, call.hash);
      await page.waitForTimeout(600);

      /* The H1 is the call, and it is inside #root rather than in the
         header. Asserted as both halves: the header must NOT be where the
         subject lives, which is the half that would silently pass if the
         subject were simply absent. */
      const h1 = page.locator("#root h1").first();
      const norm = (t) => t.toLowerCase().replace(/\s+/g, " ").trim();
      expect(norm(await h1.innerText())).toContain(norm(call.names));

      const header = page.locator("header").first();
      if (await header.count()) {
        expect(
          norm(await header.innerText()),
          "the call's subject is not repeated in the chrome",
        ).not.toContain(norm(call.names));
      }

      await context.close();
    });
  }

  /* Every call's chrome is the same chrome. The old version compared the
     rooms' bars by their rendered class string, which is a fact about
     Tailwind rather than about the product; this compares what the shell
     OFFERS — the same nav, the same five places, the same way home — which
     is what "a reader never relearns where they are" actually means. */
  test("every call's chrome is the same chrome", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await openApp(context, CALLS[0].hash);

    const shapes = [];
    for (const call of CALLS) {
      await page.evaluate((h) => { location.hash = h; }, call.hash);
      await page.waitForTimeout(400);
      shapes.push(
        await page.locator('nav[aria-label="Primary"]:visible a').evaluateAll((as) =>
          as.map((a) => `${a.getAttribute("href")}|${a.textContent.trim()}`).join(" "),
        ),
      );
    }

    expect(new Set(shapes).size, `one shell, not three: ${JSON.stringify(shapes)}`).toBe(1);
    expect(shapes[0], "and it is a real nav rather than an empty one").toContain("#/");

    await context.close();
  });
});
