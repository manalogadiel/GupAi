import Mascot from './Mascot'

export type CharacterState = 'idle' | 'listening' | 'thinking' | 'happy'

// shortcut: placeholder until Codex D1 BarberMascot lands; then this file re-exports it.
export default function Character({ size = 120 }: { state?: CharacterState; size?: number }) {
  return <Mascot size={size} />
}
