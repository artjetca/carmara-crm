import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_SILENCE_CONFIG,
  advanceSilenceState,
  computeRms,
  initialSilenceState,
  isSpeech,
  remainingSilenceSeconds,
  shouldStopRecording,
} from './silenceDetection'

// Loudness values standing in for a real microphone.
const SPEECH = 0.2
const ROAD_NOISE = 0.01

/** Feed a sequence of readings, 100 ms apart, and return the final state. */
function play(levels: number[], stepMs = 100) {
  let state = initialSilenceState()
  for (const level of levels) {
    state = advanceSilenceState(state, level, stepMs)
  }
  return state
}

test('loudness is measured as RMS, not as a single peak', () => {
  assert.equal(computeRms([0, 0, 0, 0]), 0)
  assert.equal(computeRms([0.5, -0.5, 0.5, -0.5]), 0.5)
  assert.equal(computeRms([]), 0)

  // One click among silence stays quiet overall.
  const withClick = computeRms([0, 0, 1, 0, 0, 0, 0, 0])
  assert.ok(withClick < 0.4, `un pico aislado no debe contar como voz: ${withClick}`)
})

test('speech is told apart from engine and road noise', () => {
  assert.equal(isSpeech(SPEECH), true)
  assert.equal(isSpeech(ROAD_NOISE), false)
  assert.equal(isSpeech(DEFAULT_SILENCE_CONFIG.speechThreshold), true)
  assert.equal(isSpeech(Number.NaN), false)
})

test('quiet before the first word never ends the recording', () => {
  // The driver takes a moment to start: three seconds of silence so far.
  const state = play(Array(30).fill(ROAD_NOISE))

  assert.equal(state.heardSpeech, false)
  assert.equal(state.quietMs, 0)
  assert.equal(shouldStopRecording(state), null)
})

test('two seconds of quiet after speaking ends the recording', () => {
  const state = play([...Array(20).fill(SPEECH), ...Array(20).fill(ROAD_NOISE)])

  assert.equal(state.heardSpeech, true)
  assert.equal(state.quietMs, 2000)
  assert.equal(shouldStopRecording(state), 'silence')
})

test('a pause mid-sentence does not cut the person off', () => {
  // Speaking, a one second breath, then speaking again.
  const state = play([
    ...Array(20).fill(SPEECH),
    ...Array(10).fill(ROAD_NOISE),
    ...Array(10).fill(SPEECH),
  ])

  assert.equal(state.quietMs, 0)
  assert.equal(shouldStopRecording(state), null)
})

test('a pause just under the limit keeps recording', () => {
  const state = play([...Array(20).fill(SPEECH), ...Array(19).fill(ROAD_NOISE)])

  assert.equal(state.quietMs, 1900)
  assert.equal(shouldStopRecording(state), null)
})

test('saying nothing at all stops after the no-speech timeout', () => {
  const almost = play(Array(79).fill(ROAD_NOISE))
  assert.equal(shouldStopRecording(almost), null)

  const timedOut = play(Array(80).fill(ROAD_NOISE))
  assert.equal(shouldStopRecording(timedOut), 'no-speech')
})

test('a forgotten recording is capped instead of running forever', () => {
  const state = {
    heardSpeech: true,
    quietMs: 0,
    elapsedMs: DEFAULT_SILENCE_CONFIG.maxDurationMs,
  }

  assert.equal(shouldStopRecording(state), 'max-duration')
})

test('the countdown only appears once the person has stopped talking', () => {
  assert.equal(remainingSilenceSeconds(initialSilenceState()), null)

  const speaking = play(Array(10).fill(SPEECH))
  assert.equal(remainingSilenceSeconds(speaking), null)

  const pausing = play([...Array(10).fill(SPEECH), ...Array(5).fill(ROAD_NOISE)])
  assert.equal(remainingSilenceSeconds(pausing), 2)

  const almostDone = play([...Array(10).fill(SPEECH), ...Array(15).fill(ROAD_NOISE)])
  assert.equal(remainingSilenceSeconds(almostDone), 1)
})

test('elapsed time keeps running whether or not anyone speaks', () => {
  const state = play([...Array(10).fill(SPEECH), ...Array(10).fill(ROAD_NOISE)])
  assert.equal(state.elapsedMs, 2000)
})
