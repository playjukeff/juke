/* "Copy my CBS key" — a bookmarklet, and why it is one.

   CBS publishes no OAuth for third parties (its own token-minting endpoints
   are hard 404s), so reading a private league means reading it AS the
   reader, and the only thing that carries that is one cookie: `pid`. The
   first version of the connect dialog therefore asked people to open
   developer tools, find Application → Cookies → cbssports.com, and copy a
   value out by hand. That is a real barrier in front of the one thing a
   paying subscriber is trying to do.

   ---- Why a bookmarklet is possible here and might not be elsewhere ----

   **`pid` is not HttpOnly.** Measured off the league host's own
   `Set-Cookie` on 15 September 2026 — `path`, `domain` and an `expires` in
   2037, and no `HttpOnly`. So page JavaScript can read it, which is the
   whole reason this works without an extension.

   Do not assume that of another platform. ESPN's `espn_s2` is the case this
   cannot serve if it turns out to be HttpOnly, and the strongest evidence
   that it is comes from FantasyPros forcing a browser extension on every
   web user in 2020 rather than shipping something like this. An extension's
   `chrome.cookies` API reads HttpOnly cookies; `document.cookie` never
   does. **Check the flag before writing the next one of these.**

   And it runs under the PLATFORM's Content-Security-Policy rather than
   ours, which is the other thing that decides whether a bookmarklet is
   viable at all. CBS sends `default-src https: blob: wss: 'unsafe-inline'
   'unsafe-eval'`, and `'unsafe-inline'` is what lets a `javascript:` URL
   execute. A site without it would refuse this silently, in some browsers
   and not others.

   ---- What it deliberately does not do ----

   It reads one named cookie and copies it. It does not send anything
   anywhere, does not touch the page, and does not read any other cookie —
   the reader's CBS session carries a good deal more than `pid` and none of
   the rest is Juke's business. The value goes to the clipboard and the
   reader chooses whether to paste it.

   **The value is NOT decoded.** `document.cookie` hands back the raw,
   percent-encoded form, which is exactly the form a browser sends and
   exactly what the worker puts back into a `cookie:` header. Decoding it
   here would produce a value that looks tidier and authenticates against
   nothing. */

/* One cookie, by name, with a word-boundary match so `anon_pid` or
   `pid_something` can never satisfy it. */
const SNIPPET = `(function(){
  try {
    var m = document.cookie.match(/(?:^|;\\s*)pid=([^;]*)/);
    if (!m) {
      alert('No CBS sign-in found on this page.\\n\\nSign in at cbssports.com, open your league, then click this again.');
      return;
    }
    var v = m[1];
    var done = function () {
      alert('CBS key copied.\\n\\nGo back to Juke and paste it into the "pid cookie" box.');
    };
    /* Clipboard access wants a secure context and a gesture. A bookmarklet
       click is a gesture, and every CBS page is https — but a browser that
       refuses still has to leave the reader with the value, so the fallback
       is a selectable prompt rather than a dead end. */
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(v).then(done, function () {
        window.prompt('Copy this into Juke:', v);
      });
    } else {
      window.prompt('Copy this into Juke:', v);
    }
  } catch (e) {
    alert('Could not read the CBS cookie on this page.');
  }
})()`

/* Collapsed to one line: a bookmark href cannot carry raw newlines, and a
   browser that keeps them will not run it. */
export const CBS_BOOKMARKLET = 'javascript:' + SNIPPET.replace(/\s*\n\s*/g, ' ').trim()

export const CBS_BOOKMARKLET_LABEL = 'Copy my CBS key'
