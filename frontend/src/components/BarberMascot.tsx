import './BarberMascot.css'

export default function BarberMascot({
  state = 'idle',
  size = 120,
}: {
  state?: 'idle' | 'listening' | 'thinking' | 'happy'
  size?: number
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true" focusable="false" className="bm-root">
      <path fill="#F4D9C4" d="M24 119C17 86 35 49 67 41c31-9 48-2 66 6 31 13 49 37 47 68-2 37-30 67-77 68-43 1-71-22-79-64Z" />
      {(['idle', 'listening', 'thinking', 'happy'] as const).map((pose) => (
        <g key={pose} className={`bm-pose bm-${pose}${state === pose ? ' bm-active' : ''}`}>
          <g className="bm-hop">
            <g className="bm-sway">
              <g className="bm-breathe">
                <g className="bm-body">
                  <path fill="#FFFCF7" d="M83 114h34c23 0 41 19 43 42l2 22H38l3-22c3-23 19-42 42-42Z" />
                  <path fill="#C68A64" d="M87 104h26v21c-6 9-20 9-26 0Z" />
                  <path fill="#A8704F" d="M87 108h26v9c-7 5-19 4-26-1Z" />
                  <path fill="#2F5443" d="m83 116 17 13-12 11-13-19Zm34 0-17 13 12 11 13-19Z" />
                  <path d="M100 139v39" stroke="#2F5443" strokeWidth="3" />
                  <circle cx="106" cy="147" r="1.5" fill="#2F5443" />
                  <circle cx="106" cy="158" r="1.5" fill="#2F5443" />
                  <path d="M40 165h14m91 0h15" stroke="#2F5443" strokeWidth="4" />
                  <g className="bm-pocket">
                    <rect x="64" y="139" width="11" height="22" rx="2" fill="#26241F" transform="rotate(-9 69 150)" />
                    <path d="m65 142 6 1m-6 3 6 1m-6 3 6 1m-6 3 6 1" stroke="#FFFCF7" strokeWidth="1.5" />
                    <path fill="#FFFCF7" stroke="#2F5443" strokeWidth="2" d="M60 152h23v12c0 10-23 10-23 0Z" />
                  </g>
                </g>
                <g className="bm-head">
                  <g className="bm-ears" fill="#C68A64">
                    <ellipse cx="68" cy="86" rx="8" ry="10" />
                    <ellipse cx="132" cy="86" rx="8" ry="10" />
                  </g>
                  <path fill="#C68A64" d="M67 66c0-23 66-23 66 0v21c0 23-15 34-33 34S67 110 67 87Z" />
                  <path fill="#A8704F" d="M128 70v19c0 17-11 29-28 32 21 0 33-13 33-34V70Z" />
                  <g className="bm-hair" fill="#26241F">
                    <path d="M66 80V64c0-20 12-30 34-30 24 0 35 13 34 33v13l-6-10-3-13c-8 5-15 6-23 3-12 7-22 6-29 5l-2 12Z" />
                    <path d="M67 70h5v16h-5Zm61 0h5v16h-5Z" />
                    <path d="m111 41 7 15" stroke="#A8704F" strokeWidth="2.5" strokeLinecap="round" />
                  </g>
                  <g className="bm-brows" fill="none" stroke="#26241F" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M80 75q5-3 10-1M110 74q5-2 10 1" />
                  </g>
                  <g className="bm-eyes" fill="#26241F">
                    {pose === 'happy' ? (
                      <g fill="none" stroke="#26241F" strokeWidth="3" strokeLinecap="round">
                        <path d="M80 85q5-7 10 0M110 85q5-7 10 0" />
                      </g>
                    ) : (
                      <><circle cx="85" cy="84" r="3" /><circle cx="115" cy="84" r="3" /></>
                    )}
                  </g>
                  <g className="bm-eyelids" fill="none" stroke="#26241F" strokeWidth="2" strokeLinecap="round">
                    <path d="M81 85q4 2 8 0M111 85q4 2 8 0" />
                  </g>
                  <path d="M99 88v7h4" fill="none" stroke="#A8704F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  <g className="bm-mouth">
                    {pose === 'happy' ? (
                      <g className="bm-mouth-happy">
                        <path fill="#26241F" d="M87 100h26c-1 17-24 17-26 0Z" />
                        <path fill="#FFFCF7" d="M90 101h20l-2 5H92Z" />
                      </g>
                    ) : (
                      <g className="bm-mouth-small">
                        <path d="M92 102q8 7 16 0" fill="none" stroke="#26241F" strokeWidth="2.5" strokeLinecap="round" />
                      </g>
                    )}
                  </g>
                </g>
                <g className="bm-arm">
                  <path d="M144 136q6 16 17 17" fill="none" stroke="#FFFCF7" strokeWidth="17" strokeLinecap="round" />
                  <path d="m153 148 5-9" stroke="#2F5443" strokeWidth="4" />
                  <g className="bm-scissors" fill="none" stroke="#B8B9AE" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="164" cy="155" r="4" /><circle cx="174" cy="151" r="4" />
                    <path d="m166 151 12-26m-6 22-9-20" />
                    <circle cx="170" cy="142" r="2" fill="#26241F" stroke="none" />
                  </g>
                  <ellipse cx="160" cy="151" rx="5" ry="6" fill="#C68A64" />
                  {pose === 'happy' && (
                    <g className="bm-sparkle" fill="#2F5443">
                      <path d="m184 120 2-5 2 5 5 2-5 2-2 5-2-5-5-2Z" />
                    </g>
                  )}
                </g>
              </g>
            </g>
          </g>
          <g className="bm-extras">
            {pose === 'listening' && (
              <g fill="none" stroke="#2F5443" strokeWidth="2.5" strokeLinecap="round">
                <g className="bm-sound"><path d="M146 77q6 7 0 14" /></g>
                <g className="bm-sound bm-sound-second"><path d="M154 72q10 12 0 24" /></g>
              </g>
            )}
            {pose === 'thinking' && (
              <g fill="#2F5443">
                <g className="bm-dot"><circle cx="90" cy="21" r="3" /></g>
                <g className="bm-dot bm-dot-second"><circle cx="101" cy="21" r="3" /></g>
                <g className="bm-dot bm-dot-third"><circle cx="112" cy="21" r="3" /></g>
              </g>
            )}
          </g>
        </g>
      ))}
    </svg>
  )
}
