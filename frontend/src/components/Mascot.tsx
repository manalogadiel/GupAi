// Original flat barber bust: neat side part, apron, comb. Decorative; equivalent text is always nearby.
export default function Mascot({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" aria-hidden="true" focusable="false">
      <circle cx="40" cy="40" r="40" fill="#EAE5DA" />
      {/* shoulders + apron */}
      <path d="M12 80c2-15 13-22 28-22s26 7 28 22z" fill="#365846" />
      <path d="M31 58h18l-3 22H34z" fill="#FFFDFA" />
      {/* neck + head */}
      <rect x="35" y="47" width="10" height="11" rx="3" fill="#B98563" />
      <ellipse cx="40" cy="37" rx="13" ry="15" fill="#C9946F" />
      {/* side-part hair */}
      <path d="M27 35c-1-11 6-17 14-17 9 0 14 6 13 15-3-5-7-8-12-8l-3 4c-4-1-8 1-12 6z" fill="#252821" />
      {/* face */}
      <circle cx="35" cy="38" r="1.6" fill="#252821" />
      <circle cx="45" cy="38" r="1.6" fill="#252821" />
      <path d="M35.5 44.5c2.6 2.2 6.4 2.2 9 0" stroke="#252821" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {/* comb in apron pocket */}
      <rect x="49" y="63" width="12" height="4" rx="1" fill="#252821" />
      <path d="M50 67v3M52.5 67v3M55 67v3M57.5 67v3M60 67v3" stroke="#252821" strokeWidth="1" />
    </svg>
  )
}
