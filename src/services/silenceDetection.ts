/**
 * Decide when a spoken recording has finished, so a driver never has to press
 * the button a second time.
 *
 * The rules are deliberately conservative: cutting someone off mid-sentence is
 * worse than recording two extra seconds of road noise.
 */

export interface SilenceState {
  /** Loud enough that we are sure the person started talking. */
  heardSpeech: boolean
  /** Milliseconds of continuous quiet since the last speech. */
  quietMs: number
  /** Milliseconds since recording began. */
  elapsedMs: number
}

export interface SilenceConfig {
  /** Volume above which we consider the mic is picking up a voice (0..1). */
  speechThreshold: number
  /** Quiet time that ends the recording once the person has spoken. */
  trailingSilenceMs: number
  /** Give up if nobody says anything at all. */
  noSpeechTimeoutMs: number
  /** Hard cap so a forgotten recording cannot run forever. */
  maxDurationMs: number
}

/**
 * Road noise sits well below speech, but a car is not a quiet room, so the
 * threshold is higher than a desktop app would use.
 */
export const DEFAULT_SILENCE_CONFIG: SilenceConfig = {
  speechThreshold: 0.045,
  trailingSilenceMs: 2000,
  noSpeechTimeoutMs: 8000,
  maxDurationMs: 120000,
}

export type StopReason = 'silence' | 'no-speech' | 'max-duration' | null

/**
 * Root mean square of a waveform buffer: a stable loudness measure that does
 * not spike on a single click the way peak amplitude does.
 */
export function computeRms(samples: Float32Array | number[]): number {
  if (!samples || samples.length === 0) return 0

  let sum = 0
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index]
    sum += value * value
  }

  return Math.sqrt(sum / samples.length)
}

export function isSpeech(level: number, config: SilenceConfig = DEFAULT_SILENCE_CONFIG): boolean {
  return Number.isFinite(level) && level >= config.speechThreshold
}

/**
 * Whether the recording should stop now, and why.
 *
 * Returning the reason lets the UI explain itself: stopping because nobody
 * spoke deserves a different message from stopping after a finished sentence.
 */
export function shouldStopRecording(
  state: SilenceState,
  config: SilenceConfig = DEFAULT_SILENCE_CONFIG
): StopReason {
  if (state.elapsedMs >= config.maxDurationMs) return 'max-duration'

  if (!state.heardSpeech) {
    return state.elapsedMs >= config.noSpeechTimeoutMs ? 'no-speech' : null
  }

  return state.quietMs >= config.trailingSilenceMs ? 'silence' : null
}

/**
 * Advance the state with one loudness reading.
 *
 * Kept pure so the whole stop decision can be tested without a microphone.
 */
export function advanceSilenceState(
  state: SilenceState,
  level: number,
  deltaMs: number,
  config: SilenceConfig = DEFAULT_SILENCE_CONFIG
): SilenceState {
  const elapsedMs = state.elapsedMs + deltaMs

  if (isSpeech(level, config)) {
    return { heardSpeech: true, quietMs: 0, elapsedMs }
  }

  return {
    heardSpeech: state.heardSpeech,
    // Quiet only counts once there has been something to be quiet after.
    quietMs: state.heardSpeech ? state.quietMs + deltaMs : 0,
    elapsedMs,
  }
}

export function initialSilenceState(): SilenceState {
  return { heardSpeech: false, quietMs: 0, elapsedMs: 0 }
}

/** Countdown shown while the recording is about to end by itself. */
export function remainingSilenceSeconds(
  state: SilenceState,
  config: SilenceConfig = DEFAULT_SILENCE_CONFIG
): number | null {
  if (!state.heardSpeech || state.quietMs === 0) return null

  const remaining = config.trailingSilenceMs - state.quietMs
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0
}
