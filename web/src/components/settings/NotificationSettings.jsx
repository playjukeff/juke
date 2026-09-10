import { ChevronLeft } from 'lucide-react'
import { Switch } from './SettingsControls.jsx'
import { useNotificationPrefs } from '../../hooks/useDraftNotifications.js'

/* Draft notifications — its own screen rather than two rows inside Draft
   Settings, because it is the one thing on that menu that is about this
   BROWSER rather than about this draft. Every other setting behind the gear
   describes the league and travels with it into a room; these two are a
   preference belonging to the device you are holding, and putting them
   under "Draft Settings" would make them look like something a room could
   broadcast at you.

   A back chevron rather than an X, and the title is the destination's own
   — this is a screen you came to FROM the menu, and it goes back there.

   See useDraftNotifications.js for what is actually behind the switches.
   The short version is that they are real: the Notification API, fired on
   the turn-change while the tab is in the background, with no push service
   and no backend because none is needed for a page that is open and just
   not in front.
*/
export default function NotificationSettings({ onBack }) {
  const { prefs, permission, supported, setAllow, setMentions } = useNotificationPrefs()

  /* Four states, four different sentences, and the difference between them
     is the whole reason this is not just a switch.

     "Blocked" in particular is not something the app can undo — once a
     browser has been told no for a site, only the reader can reverse it,
     from the site settings — so saying "turn it on" there would be a
     control pointing at itself. */
  const note = !supported
    ? "This browser can't show notifications. On an iPhone they only work once Juke is added to your Home Screen — open the share sheet and choose Add to Home Screen."
    : permission === 'denied'
      ? "Notifications are blocked for this site in your browser settings. Juke can't undo that from here — you'll need to allow them for jukeff.com and come back."
      : prefs.allow
        ? "You'll get a notification when your pick comes up and this tab isn't the one you're looking at. Nothing is sent while you're watching the draft — the sound cue is what covers that."
        : 'Juke will ask your browser for permission when you turn this on.'

  const locked = !supported || permission === 'denied'

  return (
    <div className="fixed inset-0 z-[75] flex flex-col bg-slate">
      <div className="flex shrink-0 items-center gap-1 border-b border-slate-rule px-2 pb-2 pt-[env(safe-area-inset-top)]">
        <button
          type="button" onClick={onBack} aria-label="Back to the draft menu" title="Back"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-ink"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h2 className="min-w-0 flex-1 truncate pr-11 text-center font-display text-[21px] font-bold text-white">
          Draft Notifications
        </h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[env(safe-area-inset-bottom)] pt-5">
        <p className="mb-4 font-plex text-[11px] font-semibold uppercase tracking-[0.11em] text-ink-soft">
          Draft notification settings
        </p>

        <div className="flex items-start justify-between gap-4 border-b border-slate-rule/50 py-4">
          <span className="min-w-0">
            <span className="block text-[17px] text-ink">Allow notifications</span>
            <span className="mt-0.5 block text-meta leading-snug text-ink-muted">
              Tell me when I&rsquo;m on the clock
            </span>
          </span>
          <Switch
            checked={prefs.allow && !locked}
            disabled={locked}
            label="Allow notifications"
            onChange={() => setAllow(!prefs.allow)}
          />
        </div>

        <div className="flex items-start justify-between gap-4 border-b border-slate-rule/50 py-4">
          <span className="min-w-0">
            <span className="block text-[17px] text-ink">Draft mentions</span>
            <span className="mt-0.5 block text-meta leading-snug text-ink-muted">
              Someone says your name in the draft chat
            </span>
          </span>
          {/* Gated on the switch above rather than standing alone: a
              mentions preference that is on while notifications are off is a
              setting that cannot do anything, and a reader turning it on
              would reasonably expect it to work. */}
          <Switch
            checked={prefs.mentions && prefs.allow && !locked}
            disabled={locked || !prefs.allow}
            label="Draft mentions"
            onChange={() => setMentions(!prefs.mentions)}
          />
        </div>

        <p className="mt-5 max-w-[52ch] text-meta leading-relaxed text-ink-muted">{note}</p>
      </div>
    </div>
  )
}
