import BarberMascot from '../components/BarberMascot'

export default function MascotStates() {
  return (
    <main style={{ minHeight: '100dvh', background: '#F6F1E9', color: '#26241F', padding: 32 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Barber mascot states</h1>
      <p style={{ marginBottom: 32 }}>Idle, recording, processing, and agreement confirmed.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}>
        {(['idle', 'listening', 'thinking', 'happy'] as const).map((state) => (
          <figure key={state} style={{ margin: 0, textAlign: 'center' }}>
            <BarberMascot state={state} size={180} />
            <figcaption style={{ marginTop: 16, fontWeight: 600 }}>
              {state[0].toUpperCase() + state.slice(1)}
            </figcaption>
          </figure>
        ))}
      </div>
    </main>
  )
}
