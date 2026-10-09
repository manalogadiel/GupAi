import BarberMascot from './BarberMascot'

export type CharacterState = 'idle' | 'listening' | 'thinking' | 'happy'

/** The app's mascot slot; state comes only from real app state (recording, job running, agreement confirmed). */
export default function Character({ state = 'idle', size = 120 }: { state?: CharacterState; size?: number }) {
  return <BarberMascot state={state} size={size} />
}
