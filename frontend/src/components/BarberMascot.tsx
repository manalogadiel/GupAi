import './BarberMascot.css'

export type MascotState = 'idle' | 'listening' | 'thinking' | 'talking' | 'happy'
const POSES: MascotState[] = ['idle', 'listening', 'thinking', 'talking', 'happy']

const SKIN = '#C68A64', SKIN_SHADE = '#A8704F', INK = '#26241F', GREEN = '#2F5443', CREAM = '#FFFCF7', STEEL = '#B8B9AE'

/** Kuya Gup, full body (head to knees): fade + quiff, barber apron with a comb in the pocket, scissors in hand. */
export default function BarberMascot({ state = 'idle', size = 240, bust = false }: { state?: MascotState; size?: number; bust?: boolean }) {
  return (
    <svg width={bust ? size : (size * 200) / 300} height={size} viewBox={bust ? '48 14 104 104' : '0 0 200 300'} aria-hidden="true" focusable="false" className={`bm-root${bust ? " bm-bust" : ""}`}>
      <ellipse cx="100" cy="292" rx="58" ry="6" fill={INK} opacity=".12" />
      {POSES.map(pose => (
        <g key={pose} className={`bm-pose bm-${pose}${state === pose ? ' bm-active' : ''}`}>
          <g className="bm-hop">
            <g className="bm-sway">
              {/* legs */}
              <path fill="#3A3A40" d="M70 228h28l-2 56H74Zm32 0h28l-4 56h-22Z" />
              <path fill={INK} d="M70 282h28v6c0 3-2 5-5 5H68c-2 0-3-2-2-4Zm32 0h28l4 7c1 2 0 4-2 4h-25c-3 0-5-2-5-5Z" />
              <g className="bm-breathe">
                {/* torso: shirt */}
                <path fill={CREAM} d="M62 124c10-6 24-9 38-9s28 3 38 9c10 6 15 18 16 32l2 74H44l2-74c1-14 6-26 16-32Z" />
                {/* apron */}
                <path fill={GREEN} d="M66 150h68l4 88c0 4-3 7-7 7H69c-4 0-7-3-7-7Z" />
                <path d="M74 150 88 120M126 150 112 120" stroke={GREEN} strokeWidth="5" strokeLinecap="round" />
                <path d="M62 170h76" stroke="#264537" strokeWidth="2" />
                <text x="100" y="230" textAnchor="middle" fontFamily="var(--font-display)" fontSize="15" fill={CREAM} opacity=".9">GupAi</text>
                {/* pocket with comb */}
                <g className="bm-pocket">
                  <rect x="108" y="170" width="10" height="26" rx="2" fill={INK} transform="rotate(8 113 183)" />
                  <path d="m110 174 6 1m-6 4 6 1m-6 4 6 1m-6 4 6 1" stroke={CREAM} strokeWidth="1.4" transform="rotate(8 113 183)" />
                  <path fill="#264537" stroke={CREAM} strokeOpacity=".5" strokeWidth="1.5" d="M102 184h26v14c0 5-4 8-9 8h-8c-5 0-9-3-9-8Z" />
                </g>
                {/* collar */}
                <path fill={CREAM} stroke="#E3D9CB" strokeWidth="1.5" d="m84 118 16 14 16-14 6 10-22 12-22-12Z" />
                {/* left arm, holding a comb */}
                <g className="bm-arm-left">
                  <path d="M58 134c-8 18-10 44-6 66" fill="none" stroke={CREAM} strokeWidth="20" strokeLinecap="round" />
                  <circle cx="52" cy="206" r="9" fill={SKIN} />
                  <path fill={INK} d="M37 203l22 5-1.6 6.8-22-5Z" /><path d="M36 210l-1.5 5.5m5.4-4.6-1.5 5.5m5.4-4.6-1.5 5.5m5.4-4.6-1.5 5.5m5.4-4.6-1.5 5.5" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
                </g>
              </g>
              {/* neck + head */}
              <g className="bm-head">
                <path fill={SKIN} d="M88 98h24v22c-6 8-18 8-24 0Z" />
                <path fill={SKIN_SHADE} d="M88 104h24v8c-7 5-17 4-24-1Z" />
                <g fill={SKIN}><ellipse cx="66" cy="74" rx="8" ry="11" /><ellipse cx="134" cy="74" rx="8" ry="11" /></g>
                <path fill={SKIN} d="M66 56c0-26 68-26 68 0v22c0 25-16 38-34 38S66 103 66 78Z" />
                <path fill={SKIN_SHADE} d="M128 58v20c0 19-11 32-28 36 21 0 34-14 34-36V58Z" />
                {/* hair: low fade sides, textured quiff on top */}
                <g className="bm-hair">
                  <path fill="#51483C" d="M65 72V58h6v18Zm70 0V58h-6v18Z" opacity=".7" />
                  <path fill={INK} d="M64 62c-2-22 12-36 32-38 10-8 30-6 38 4 10 6 12 18 8 28l-6 8-4-12c-10 6-24 7-36 3-10 6-20 6-28 4l-2 9Z" />
                  <path d="M92 26c8-6 22-6 30 2M100 36c8-4 18-4 26 2" fill="none" stroke="#51483C" strokeWidth="2.5" strokeLinecap="round" />
                </g>
                <g className="bm-brows" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round">
                  <path d="M78 64q6-4 12-1M110 63q6-3 12 1" />
                </g>
                <g className="bm-eyes" fill={INK}>
                  {pose === 'happy' ? (
                    <g fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round"><path d="M79 75q5-7 10 0M111 75q5-7 10 0" /></g>
                  ) : (
                    <><ellipse cx="84" cy="74" rx="3.2" ry="3.8" /><ellipse cx="116" cy="74" rx="3.2" ry="3.8" />
                      <circle cx="85" cy="72.6" r="1" fill={CREAM} /><circle cx="117" cy="72.6" r="1" fill={CREAM} /></>
                  )}
                </g>
                <g className="bm-eyelids" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round"><path d="M80 75q4 2 8 0M112 75q4 2 8 0" /></g>
                <path d="M99 78v8h4" fill="none" stroke={SKIN_SHADE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                {/* moustache: a barber's trademark */}
                <path fill={INK} d="M88 92c4-4 9-4 12-1 3-3 8-3 12 1-4 2-8 3-12 1-4 2-8 1-12-1Z" />
                <g className="bm-mouth">
                  {pose === 'happy' ? (
                    <g><path fill={INK} d="M89 96h22c-1 13-21 13-22 0Z" /><path fill={CREAM} d="M92 97h16l-2 4H94Z" /></g>
                  ) : pose === 'talking' ? (
                    <ellipse className="bm-talk" cx="100" cy="99" rx="6" ry="4" fill={INK} />
                  ) : (
                    <path d="M93 98q7 5 14 0" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
                  )}
                </g>
              </g>
              {/* right arm with scissors */}
              <g className="bm-arm">
                <path d="M142 134c10 14 14 30 12 46" fill="none" stroke={CREAM} strokeWidth="20" strokeLinecap="round" />
                <path d="m148 170 12-4" stroke={GREEN} strokeWidth="3" />
                <g className="bm-scissors" fill="none" stroke={STEEL} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="150" cy="198" r="5" /><circle cx="162" cy="196" r="5" />
                  <path d="m153 193 15-30m-9 28-4-30" />
                  <circle cx="157" cy="182" r="2" fill={INK} stroke="none" />
                </g>
                <circle cx="154" cy="190" r="8.5" fill={SKIN} />
                {pose === 'happy' && <g className="bm-sparkle" fill={GREEN}><path d="m174 150 2-6 2 6 6 2-6 2-2 6-2-6-6-2Z" /></g>}
              </g>
            </g>
          </g>
          <g className="bm-extras">
            {pose === 'listening' && (
              <g fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round">
                <g className="bm-sound"><path d="M148 64q7 9 0 18" /></g>
                <g className="bm-sound bm-sound-second"><path d="M157 58q12 15 0 30" /></g>
              </g>
            )}
            {pose === 'thinking' && (
              <g fill={GREEN}>
                <g className="bm-dot"><circle cx="88" cy="12" r="3.5" /></g>
                <g className="bm-dot bm-dot-second"><circle cx="100" cy="12" r="3.5" /></g>
                <g className="bm-dot bm-dot-third"><circle cx="112" cy="12" r="3.5" /></g>
              </g>
            )}
          </g>
        </g>
      ))}
    </svg>
  )
}
