import { forwardRef, useImperativeHandle, useRef, useState } from 'react'

// Replaces the legacy #soonDlg (app.js's notYet()) for anything triggered
// from web/src — that dialog is styled .dlg/.primary, which is the legacy
// stylesheet's own teal CTA system (--teal-cta, orange until 20 August
// 2026), not this palette. #soonDlg itself is untouched and still serves
// whatever legacy DOM still calls notYet() directly.
const ComingSoonModal = forwardRef(function ComingSoonModal(_props, ref) {
  const dialogRef = useRef(null)
  const [content, setContent] = useState({ title: '', body: '' })

  useImperativeHandle(ref, () => ({
    open(title, body) {
      setContent({ title, body })
      dialogRef.current?.showModal()
    },
  }))

  return (
    <dialog
      ref={dialogRef}
      className="coming-soon-dialog m-auto rounded-2xl border border-white/10 bg-charcoal p-0 text-white"
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current.close()
      }}
    >
      <div className="w-[min(90vw,26rem)] p-6 sm:p-7">
        <h3 className="font-display text-lg font-bold text-white">{content.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-white/60">{content.body}</p>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="mt-6 w-full rounded-full bg-cta py-2.5 text-sm font-semibold text-white
                     shadow-glass transition-all duration-200 hover:scale-105"
        >
          Got it
        </button>
      </div>
    </dialog>
  )
})

export default ComingSoonModal
