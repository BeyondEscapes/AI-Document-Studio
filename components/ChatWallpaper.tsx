import { useId } from 'react'
import { Camera, Compass, MapPin, Mountain, Palmtree, Plane, Route, Sailboat, Ticket, Waves } from 'lucide-react'

export function ChatWallpaper() {
  const patternId = useId()

  return (
    <svg aria-hidden="true" focusable="false" className="chat-wallpaper">
      <defs>
        <pattern id={patternId} width="236" height="208" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <Plane x={20} y={25} size={25} strokeWidth={1.25} />
            <Compass x={101} y={12} size={23} strokeWidth={1.25} />
            <Palmtree x={183} y={32} size={26} strokeWidth={1.25} />
            <Ticket x={60} y={68} size={23} strokeWidth={1.25} />
            <Mountain x={143} y={77} size={27} strokeWidth={1.25} />
            <Sailboat x={17} y={120} size={25} strokeWidth={1.25} />
            <MapPin x={99} y={121} size={21} strokeWidth={1.25} />
            <Camera x={197} y={126} size={23} strokeWidth={1.25} />
            <Waves x={57} y={170} size={26} strokeWidth={1.25} />
            <Route x={153} y={168} size={24} strokeWidth={1.25} />
            <path d="M69 32h6m-3-3v6M129 52h6m-3-3v6M205 90h6m-3-3v6M54 143h6m-3-3v6M116 183h6m-3-3v6M21 188h6m-3-3v6" />
            <path d="M26 80h.1M91 102h.1M165 19h.1M162 137h.1M207 181h.1M223 59h.1" strokeWidth="3" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  )
}
