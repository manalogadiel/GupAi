import { test } from 'node:test'
import assert from 'node:assert/strict'

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

async function setup() {
  const requests: { resolve: (r: Response) => void; signal: AbortSignal }[] = []
  const spoken: unknown[] = []
  const players: FakeAudio[] = []
  class FakeAudio {
    src: string
    paused = false
    played = false
    onended: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor(src: string) { this.src = src; players.push(this) }
    async play() { this.played = true }
    pause() { this.paused = true }
  }
  Object.assign(globalThis, {
    window: { speechSynthesis: { cancel() {}, getVoices: () => [{ lang: 'en-US', localService: true }, { lang: 'fil-PH', localService: false }], speak: (u: unknown) => spoken.push(u) } },
    localStorage: { getItem: () => null, setItem() {} },
    Audio: FakeAudio,
    SpeechSynthesisUtterance: class { text: string; constructor(text: string) { this.text = text } },
    fetch: (_url: string, init: { signal: AbortSignal }) => new Promise<Response>(resolve => requests.push({ resolve, signal: init.signal })),
  })
  const speech = await import(`../src/speech.ts?test=${Math.random()}`)
  return { speech, requests, spoken, players }
}

// A late WAV must never undo mute or replace a newer reply.
test('mute cancels pending speech and ignores a late response', async () => {
  const { speech, requests, players, spoken } = await setup()
  speech.speak('Kumusta', 'c', 1)
  assert.equal(requests.length, 1)
  speech.setEnabled(false)
  assert.equal(requests[0].signal.aborted, true)
  requests[0].resolve(new Response(new Blob(['wav']), { headers: { 'Content-Type': 'audio/wav' } }))
  await tick()
  assert.equal(players.length, 0)
  assert.equal(spoken.length, 0)
})

test('new reply cancels previous audio and only plays current response', async () => {
  const { speech, requests, players } = await setup()
  speech.speak('Una', 'c', 1)
  requests[0].resolve(new Response(new Blob(['wav'])))
  await tick()
  assert.equal(players[0].played, true)
  speech.speak('Pangalawa', 'c', 3)
  assert.equal(players[0].paused, true)
  requests[1].resolve(new Response(new Blob(['wav'])))
  await tick()
  assert.equal(players[1].played, true)
  speech.cancelSpeech()
  assert.equal(players[1].paused, true)
})

test('unavailable model never switches away from selected male voice', async () => {
  const { speech, requests, spoken } = await setup()
  speech.speak('Kumusta', 'c', 1)
  requests[0].resolve(new Response('', { status: 503 }))
  await tick()
  assert.equal(spoken.length, 0)
})

test('late older response cannot replace a newer voice', async () => {
  const { speech, requests, players } = await setup()
  speech.speak('Una', 'c', 1)
  speech.speak('Pangalawa', 'c', 3)
  requests[1].resolve(new Response(new Blob(['new'])))
  await tick()
  requests[0].resolve(new Response(new Blob(['old'])))
  await tick()
  assert.equal(players.length, 1)
  assert.equal(players[0].played, true)
  assert.equal(players[0].paused, false)
  speech.cancelSpeech()
})
