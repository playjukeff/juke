/* "Copy my key" — one bookmarklet per platform, from one builder.

   Neither ESPN nor CBS publishes OAuth for third parties, so reading a
   private league means reading it AS the reader, and the only thing that
   carries that is a cookie out of their own browser. The connect dialog used
   to ask people to open developer tools and copy one out by hand, which is a
   real barrier in front of the one thing a subscriber is trying to do.

   Dragged to the bookmarks bar and clicked on the platform's own page, this
   reads the named cookies and puts them on the clipboard. Nothing else about
   the connect flow changes, and nothing about what Juke stores changes.

   ---- Two properties decide whether a platform can have one at all ----

   **The cookie must not be HttpOnly**, or `document.cookie` cannot see it
   and only a browser extension's `chrome.cookies` API can. Measured rather
   than assumed, 15 September 2026:

     CBS `pid`        no HttpOnly — read off the league host's Set-Cookie
     ESPN `espn_s2`   no HttpOnly — read off the DevTools cookie table while
                      signed in, and confirmed with
                      `document.cookie.includes('espn_s2')` returning true,
                      because ESPN sets nothing on an anonymous page and so
                      cannot be measured with a plain request the way CBS can

   That second row retired a browser extension from this project's roadmap,
   and it is worth recording why one was expected: FantasyPros forced an
   extension on every web user in 2020 for ESPN, which read as strong
   evidence that `espn_s2` was unreadable. It is not — their extension solves
   a different problem (enumerating a signed-in user's leagues). **An
   inference from a competitor's architecture is not a measurement of the
   thing it implies**, and the measurement was one line in a console.

   **And the snippet runs under the PLATFORM's Content-Security-Policy**,
   never ours. CBS sends `default-src … 'unsafe-inline' 'unsafe-eval'`, and
   `'unsafe-inline'` is what lets a `javascript:` URL execute at all. A site
   without it refuses this silently, in some browsers and not others — so
   check that header before adding a third platform here.

   ---- What every one of these deliberately does not do ----

   It reads the cookies it is told to read and copies them. It sends nothing
   anywhere, touches nothing on the page, and reads no other cookie — a
   signed-in session carries a great deal more than these, and none of the
   rest is Juke's business. The value goes to the clipboard and the reader
   chooses whether to paste it. `scripts/test_bookmarklets.mjs` asserts that
   directly, against a cookie string stuffed with things it must not carry.

   **Values are never decoded.** `document.cookie` hands back the raw,
   percent-encoded form, which is exactly the form a browser sends and
   exactly what the worker puts back into a `cookie:` header. Decoding here
   would produce a value that looks tidier and authenticates against
   nothing. */

/* Everything the snippet does is explained HERE rather than inside the
   template, because everything inside it ships in the `href` — a string the
   reader drags to their bookmarks bar and can read in the bookmark's own
   properties. The first version carried about four hundred characters of
   prose in every bookmark, including a note about `espn_s2` inside CBS's
   one, which is noise and a small leak of our own reasoning into somebody
   else's browser.

   In order, it:

     - splits `document.cookie` on ";" and compares each NAME exactly, so
       `anon_pid` can never satisfy a lookup for `pid`. Deliberately NOT a
       regex: the pattern would sit three escaping layers deep — this file,
       then the template literal, then the snippet's own string literal —
       and getting it wrong by one pair ships a bare `s*`, which matches the
       letter "s" instead of whitespace. That is a syntax error nowhere and
       shows up only as a bookmarklet that finds no cookie. It cost three
       attempts here before the escaping was abandoned rather than won. An
       exact compare has no escaping in it at all, and is stricter than the
       word boundary it replaced;
     - refuses unless it found EVERY name it was given, because ESPN accepts
       one half of its pair no more than it accepts none — the rule the
       connect route already states;
     - joins them `a=1; b=2`, so a two-cookie platform is still one paste;
     - writes to the clipboard, falling back to a selectable prompt, because
       clipboard access wants a secure context and a gesture and a browser
       that refuses still has to leave the reader holding the value. */
function build({ names, platform, whereHint }) {
  const list = JSON.stringify(names)
  const snippet = `(function(){
  try {
    var want = ${list};
    var got = [];
    var parts = document.cookie.split(';');
    for (var i = 0; i < want.length; i++) {
      for (var j = 0; j < parts.length; j++) {
        var eq = parts[j].indexOf('=');
        if (eq > 0 && parts[j].slice(0, eq).trim() === want[i]) {
          got.push(want[i] + '=' + parts[j].slice(eq + 1));
          break;
        }
      }
    }
    if (got.length !== want.length) {
      alert('No ${platform} sign-in found on this page.\\n\\n${whereHint}');
      return;
    }
    var v = got.join('; ');
    var done = function () {
      alert('${platform} key copied.\\n\\nGo back to Juke and paste it in.');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(v).then(done, function () {
        window.prompt('Copy this into Juke:', v);
      });
    } else {
      window.prompt('Copy this into Juke:', v);
    }
  } catch (e) {
    alert('Could not read the ${platform} cookies on this page.');
  }
})()`

  /* One line: a bookmark href cannot carry raw newlines, and a browser that
     keeps them will not run it. */
  return 'javascript:' + snippet.replace(/\s*\n\s*/g, ' ').trim()
}

export const CBS_BOOKMARKLET = build({
  names: ['pid'],
  platform: 'CBS',
  whereHint: 'Sign in at cbssports.com, open your league, then click this again.',
})

/* ESPN needs BOTH halves — it accepts one alone no more than it accepts
   none — so they are copied together and the dialog splits them, rather than
   asking somebody to do this twice and get the pairing right themselves. */
export const ESPN_BOOKMARKLET = build({
  names: ['SWID', 'espn_s2'],
  platform: 'ESPN',
  whereHint: 'Sign in at fantasy.espn.com, then click this again.',
})

export const BOOKMARKLET_LABEL = 'Copy my key'

/* The other half of the ESPN pair: one paste carrying `SWID=…; espn_s2=…`
   becomes two field values. Returns null for anything that is not that
   shape, so an ordinary single-value paste is left completely alone.

   Same exact-name compare as the snippet, for the same reason. */
export function splitEspnPaste(text) {
  const raw = String(text || '')
  const pick = (name) => {
    const hit = raw.split(';').find((part) => {
      const eq = part.indexOf('=')
      return eq > 0 && part.slice(0, eq).trim() === name
    })
    return hit ? hit.slice(hit.indexOf('=') + 1).trim() : ''
  }
  /* BOTH or nothing, which is the one guard rather than one of two.

     This carried an `includes('espn_s2') && includes('SWID')` early return
     as well, and the two were mutually redundant — removing either left the
     behaviour identical, so neither could be mutated red. A check that no
     test can distinguish from its own absence is not a second guard, it is a
     second reading of the first one. */
  const swid = pick('SWID')
  const espnS2 = pick('espn_s2')
  return swid && espnS2 ? { swid, espnS2 } : null
}
