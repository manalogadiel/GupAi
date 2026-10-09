import { motion } from 'motion/react'

/**
 * Pal.Do-style round voice button. Orange is reserved for voice.
 * While recording, the outer ring scales with the REAL input level; when idle it is still (no fake pulse).
 */
export default function MicButton({ recording, level, onPress, disabled, size = 76, label }: {
  recording: boolean; level: number; onPress: () => void; disabled?: boolean; size?: number; label: string
}) {
  return (
    <div className="relative grid place-items-center" style={{ width: size + 24, height: size + 24 }}>
      {recording && (
        <motion.span aria-hidden className="absolute rounded-full bg-voice/20"
          style={{ width: size, height: size }}
          animate={{ scale: 1.08 + level * 0.35 }} transition={{ type: 'spring', stiffness: 300, damping: 20, mass: 0.4 }} />
      )}
      <motion.button
        type="button" onClick={onPress} disabled={disabled} aria-label={label} aria-pressed={recording}
        whileTap={{ scale: 0.93 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="relative grid place-items-center rounded-full bg-voice text-white shadow-[0_8px_24px_-6px_rgb(217_103_58/.55)] transition-colors duration-150 hover:bg-voice-hover disabled:opacity-45"
        style={{ width: size, height: size }}
      >
        {recording ? (
          <span aria-hidden className="block size-6 rounded-[6px] bg-white" />
        ) : (
          <svg aria-hidden width={size * 0.36} height={size * 0.36} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
          </svg>
        )}
      </motion.button>
    </div>
  )
}
