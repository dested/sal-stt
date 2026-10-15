/**
 * sal-stt's shared contract: one speech-to-text API for every backend (`sal-stt/node` today; browser, server and
 * Expo later). Platform-neutral: types, the model catalog and typed-array helpers only; no node:, Bun or addon import
 * reaches this entry, so every backend implements the same SttEngine as-is.
 */
import type { Pcm } from "./pcm.ts"

export { MODELS, type ModelFile, type ModelId, type ModelSpec, isModelId } from "./models.ts"
export { type Pcm, pcm16FromBytes, toFloat32 } from "./pcm.ts"

export interface TranscribeOptions {
  /** Sample rate of the PCM, Hz. Default 16000; other rates are resampled by the engine. */
  sampleRate?: number
  /**
   * Words and names to bias towards ("Iris", "Frozen Ropes"). Backends that can't bias accept and ignore them
   * (`SttEngine.hotwords` says which).
   */
  hotwords?: string[]
}

export interface Transcript {
  /** The text, whitespace collapsed and trimmed. Empty when nothing was said. */
  text: string
  /** Wall time the engine spent on this call, milliseconds. */
  ms: number
}

export interface SttEngine {
  /** The model's id, e.g. "parakeet-tdt-0.6b-v3". */
  readonly model: string
  /** Whether `hotwords` change decoding on this backend (false: accepted and ignored). */
  readonly hotwords: boolean
  /** Mono PCM: 16-bit samples (Int16Array) or floats in [-1, 1] (Float32Array). Raw bytes: pcm16FromBytes first. */
  transcribe(pcm: Pcm, options?: TranscribeOptions): Promise<Transcript>
  /** Release the model. Later calls throw. */
  close(): Promise<void>
}
