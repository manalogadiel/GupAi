import { useSyncExternalStore } from 'react'

/** Fixed Kuya Gup reference voice, generated locally on the shop laptop. */
const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
const listeners = new Set<() => void>()
let speaking = false
let enabled = (() => { try { return localStorage.getItem('gupai-tts') !== 'off' } catch { return true } })()
let request: AbortController | undefined
let player: HTMLAudioElement | undefined
let audioUrl: string | undefined
let generation = 0
let status = ''
let lastBlob: Blob | undefined
let lastKey = ''

const emit = () => listeners.forEach(l => l())
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

function releaseAudio() {
  if (player) {
    player.onended = player.onerror = null
    player.pause()
    player = undefined
  }
  if (audioUrl) URL.revokeObjectURL(audioUrl)
  audioUrl = undefined
}

export function cancelSpeech() {
  generation++
  request?.abort()
  request = undefined
  releaseAudio()
  synth?.cancel()
  speaking = false
  status = ''
  emit()
}

function failed() {
  speaking = false
  status = 'Hindi tumunog? Pindutin ang “Pakinggan”.'
  emit()
}

async function playBlob(blob: Blob, current: number) {
  audioUrl = URL.createObjectURL(blob)
  const audio = new Audio(audioUrl)
  player = audio
  audio.onended = () => {
    if (current !== generation) return
    releaseAudio()
    speaking = false
    emit()
  }
  audio.onerror = () => { if (current === generation) { releaseAudio(); failed() } }
  await audio.play()
  if (current === generation) { speaking = true; status = ''; emit() }
}

export async function speak(text: string, consultationId: string, turnIndex: number) {
  if (!enabled || !text.trim()) return
  cancelSpeech()
  const current = generation
  const key = `${consultationId}:${turnIndex}`
  if (lastBlob && lastKey === key) {
    try { await playBlob(lastBlob, current) } catch { if (current === generation) failed() }
    return
  }
  status = 'Inihahanda ang boses…'
  emit()
  const controller = new AbortController()
  request = controller
  const timeout = setTimeout(() => controller.abort(), 90000)
  try {
    let response = await fetch(`/api/consultations/${encodeURIComponent(consultationId)}/speech`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turn_index: turnIndex }), signal: controller.signal,
    })
    if (response.status === 409 && current === generation && enabled) {
      response = await fetch(`/api/consultations/${encodeURIComponent(consultationId)}/speech`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turn_index: turnIndex }), signal: controller.signal,
      })
    }
    if (!response.ok) throw new Error('Local voice unavailable')
    const blob = await response.blob()
    if (current !== generation || !enabled) return
    lastBlob = blob
    lastKey = key
    await playBlob(blob, current)
  } catch {
    if (current !== generation || !enabled) return
    releaseAudio()
    failed()
  } finally {
    clearTimeout(timeout)
    if (current === generation) request = undefined
  }
}

export function setEnabled(on: boolean) {
  enabled = on
  try { localStorage.setItem('gupai-tts', on ? 'on' : 'off') } catch { /* private mode: keep in memory */ }
  if (!on) cancelSpeech()
  emit()
}

export const useSpeaking = () => useSyncExternalStore(subscribe, () => speaking)
export const useTtsEnabled = () => useSyncExternalStore(subscribe, () => enabled)
export const ttsAvailable = typeof Audio !== 'undefined' || !!synth

export const useSpeechStatus = () => useSyncExternalStore(subscribe, () => status)
