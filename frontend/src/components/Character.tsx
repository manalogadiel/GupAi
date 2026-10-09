import BarberMascot, { type MascotState } from './BarberMascot'

export type CharacterState = MascotState

/** The app's mascot slot; state comes only from real app state (recording, job running, reply streaming, agreement). */
export default function Character({ state = 'idle', size = 240 }: { state?: CharacterState; size?: number }) {
  return <BarberMascot state={state} size={size} />
}
