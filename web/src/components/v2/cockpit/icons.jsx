/* The cockpit's glyphs: 16-unit boxes, 1.5 stroke, currentColor. Inline
   rather than an icon package so the v2 build brings no dependency the
   live site does not already have, and so every icon draws at the stroke
   weight the brief names. */

function Svg({ className = 'h-4 w-4', children, fill = 'none' }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill={fill} aria-hidden="true" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

export const IconStar = ({ className, filled }) => (
  <Svg className={className} fill={filled ? 'currentColor' : 'none'}>
    <path d="M8 1.9l1.85 3.77 4.15.6-3 2.93.7 4.13L8 11.4l-3.7 1.93.7-4.13-3-2.93 4.15-.6z" />
  </Svg>
)
export const IconBookmark = ({ className, filled }) => (
  <Svg className={className} fill={filled ? 'currentColor' : 'none'}>
    <path d="M4 2.5h8v11L8 10.8 4 13.5z" />
  </Svg>
)
export const IconSearch = ({ className }) => (
  <Svg className={className}><circle cx="7" cy="7" r="4.25" /><path d="M10.2 10.2 13.5 13.5" /></Svg>
)
export const IconPause = ({ className }) => (
  <Svg className={className}><path d="M5.5 3.5v9M10.5 3.5v9" /></Svg>
)
export const IconPlay = ({ className }) => (
  <Svg className={className}><path d="M5 3.2v9.6L12.5 8z" /></Svg>
)
export const IconSound = ({ className }) => (
  <Svg className={className}><path d="M2.5 6.2h2.4L8.5 3.3v9.4L4.9 9.8H2.5z" /><path d="M11 5.6a3.4 3.4 0 0 1 0 4.8M12.8 3.9a5.8 5.8 0 0 1 0 8.2" /></Svg>
)
export const IconMute = ({ className }) => (
  <Svg className={className}><path d="M2.5 6.2h2.4L8.5 3.3v9.4L4.9 9.8H2.5z" /><path d="M10.8 6.2l3.4 3.6M14.2 6.2l-3.4 3.6" /></Svg>
)
export const IconDots = ({ className }) => (
  <Svg className={className}><path d="M3.5 8h.01M8 8h.01M12.5 8h.01" strokeWidth="2.4" /></Svg>
)
export const IconClose = ({ className }) => (
  <Svg className={className}><path d="M4 4l8 8M12 4l-8 8" /></Svg>
)
export const IconBack = ({ className }) => (
  <Svg className={className}><path d="M10 3.5 5.5 8l4.5 4.5" /></Svg>
)
export const IconUp = ({ className }) => (
  <Svg className={className}><path d="M4 10l4-4 4 4" /></Svg>
)
export const IconDown = ({ className }) => (
  <Svg className={className}><path d="M4 6l4 4 4-4" /></Svg>
)
export const IconTarget = ({ className }) => (
  <Svg className={className}><circle cx="8" cy="8" r="4.5" /><path d="M8 1.5v2.5M8 12v2.5M1.5 8H4M12 8h2.5" /></Svg>
)
export const IconFlag = ({ className }) => (
  <Svg className={className}><path d="M3.5 14V2.5M3.5 3h8l-1.6 2.6L11.5 8h-8" /></Svg>
)
export const IconTrash = ({ className }) => (
  <Svg className={className}><path d="M2.8 4.2h10.4M6.2 4.2V2.8h3.6v1.4M4.2 4.2l.6 9h6.4l.6-9" /></Svg>
)
export const IconExternal = ({ className }) => (
  <Svg className={className}><path d="M9 2.8h4.2V7M13.2 2.8 7.4 8.6M11.5 9.5v3.7H2.8V4.5h3.7" /></Svg>
)
export const IconCheck = ({ className }) => (
  <Svg className={className}><path d="M3 8.4l3.2 3.1L13 4.6" /></Svg>
)
export const IconCopy = ({ className }) => (
  <Svg className={className}><rect x="5" y="5" width="8.5" height="8.5" rx="1.6" /><path d="M11 5V3.8A1.3 1.3 0 0 0 9.7 2.5H3.8a1.3 1.3 0 0 0-1.3 1.3v5.9A1.3 1.3 0 0 0 3.8 11H5" /></Svg>
)
export const IconDownload = ({ className }) => (
  <Svg className={className}><path d="M8 2.5v8M4.8 7.3 8 10.5l3.2-3.2M2.8 13.2h10.4" /></Svg>
)
export const IconShare = ({ className }) => (
  <Svg className={className}><circle cx="4" cy="8" r="1.8" /><circle cx="12" cy="4" r="1.8" /><circle cx="12" cy="12" r="1.8" /><path d="M5.6 7.1 10.4 4.9M5.6 8.9l4.8 2.2" /></Svg>
)
export const IconBolt = ({ className }) => (
  <Svg className={className}><path d="M8.8 1.8 3.8 9h4l-.6 5.2 5-7.2h-4z" /></Svg>
)
export const IconList = ({ className }) => (
  <Svg className={className}><path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" /></Svg>
)
export const IconGrid = ({ className }) => (
  <Svg className={className}><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" /><rect x="9" y="9" width="4.5" height="4.5" rx="1" /></Svg>
)
export const IconCompass = ({ className }) => (
  <Svg className={className}><circle cx="8" cy="8" r="5.8" /><path d="m10.4 5.6-1.5 3.3-3.3 1.5 1.5-3.3z" /></Svg>
)
export const IconChart = ({ className }) => (
  <Svg className={className}><path d="M2.5 13.5h11M4.5 11V7.5M8 11V4.5M11.5 11V8.8" /></Svg>
)
export const IconUsers = ({ className }) => (
  <Svg className={className}><circle cx="6" cy="5.5" r="2.4" /><path d="M1.8 13.2a4.2 4.2 0 0 1 8.4 0M10.6 3.3a2.4 2.4 0 0 1 0 4.4M12 9.4a4.2 4.2 0 0 1 2.2 3.8" /></Svg>
)
