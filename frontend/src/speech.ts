import { useSyncExternalStore } from 'react'

/** Kuya Gup's voice: the browser's built-in, on-device speech synthesis (no network, no install). */
const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
const listeners = new Set<() => void>()
let speaking = false
let enabled = (() => { try { return localStorage.getItem('gupai-tts') !== 'off' } catch { return true } })()

const emit = () => listeners.forEach(l => l())
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

/** On-device voices only (cloud voices like Chrome's "Google …" break offline): Filipino, else PH English, else English. */
function pickVoice() {
  const local = (synth?.getVoices() ?? []).filter(v => v.localService)
  return local.find(v => /^(fil|tl)/i.test(v.lang)) ?? local.find(v => v.lang === 'en-PH')
    ?? local.find(v => v.lang.startsWith('en')) ?? local[0]
}

export function speak(text: string) {
  if (!synth || !enabled || !text.trim()) return
  synth.cancel()
  const voice = pickVoice()
  if (!voice) return  // no on-device voice: stay silent rather than reach a cloud voice
  const u = new SpeechSynthesisUtterance(text)
  u.voice = voice; u.lang = voice.lang
  u.rate = 1.02
  u.onstart = () => { speaking = true; emit() }
  u.onend = u.onerror = () => { speaking = false; emit() }
  synth.speak(u)
}

export function setEnabled(on: boolean) {
  enabled = on
  try { localStorage.setItem('gupai-tts', on ? 'on' : 'off') } catch { /* private mode: keep in memory */ }
  if (!on) synth?.cancel()
  speaking = false
  emit()
}

export const useSpeaking = () => useSyncExternalStore(subscribe, () => speaking)
export const useTtsEnabled = () => useSyncExternalStore(subscribe, () => enabled)
export const ttsAvailable = !!synth
