/**
 * GupAi wordmark. "Gup" in the display serif; the "A" is an open pair of barber scissors (blades are the legs,
 * finger rings at the foot, the pivot screw is the crossbar) and the "i" is a barber comb with a barber-pole dot.
 */
import { useId } from 'react'

export default function Wordmark({ height = 34, className = '' }: { height?: number; className?: string }) {
  const clip = useId()
  return (
    <svg role="img" aria-label="GupAi" viewBox="0 0 136 56" height={height} width={(height * 136) / 56} className={`block overflow-visible ${className}`}>
      <text x="0" y="44" fontFamily="var(--font-display)" fontSize="56" fill="var(--color-ink)" letterSpacing="-1">Gup</text>
      {/* A = scissors */}
      <g transform="translate(76 3)" fill="none" stroke="var(--color-action)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 2 6.5 36" strokeWidth="5" />
        <path d="M17 2 27.5 36" strokeWidth="5" />
        <path d="M17 2 15 9" stroke="var(--color-surface)" strokeWidth="1.4" opacity=".7" />
        <circle cx="6" cy="44" r="5.6" strokeWidth="3.4" />
        <circle cx="28" cy="44" r="5.6" strokeWidth="3.4" />
        <path d="M9.5 24h15" strokeWidth="3" />
        <circle cx="17" cy="24" r="3.2" fill="var(--color-voice)" stroke="none" />
      </g>
      {/* i = comb */}
      <g transform="translate(116 3)">
        <rect x="0" y="15" width="7" height="34" rx="2.4" fill="var(--color-ink)" />
        {[19, 24, 29, 34, 39, 44].map(y => <rect key={y} x="7" y={y} width="7" height="2.4" rx="1" fill="var(--color-ink)" />)}
        <clipPath id={clip}><circle cx="3.5" cy="5" r="4.6" /></clipPath>
        <circle cx="3.5" cy="5" r="5" fill="#FFFFFF" stroke="var(--color-ink)" strokeWidth="1.2" />
        <g clipPath={`url(#${clip})`}>
          <path d="M-1 3.2 8 1.2M-1.3 6.6 8.3 4.4M-.4 9.4 7.6 7.6" stroke="#C8352E" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M0 5.2 7.8 3.4" stroke="#2C5AA0" strokeWidth="1.3" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  )
}
