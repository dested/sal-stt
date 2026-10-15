/**
 * The one typed boundary over sherpa-onnx-node (an N-API addon with JSDoc types only). Everything else in sal-stt
 * sees these interfaces; the module's shape is checked once at load, so a breaking addon upgrade fails here, loudly.
 */
import { createRequire } from "node:module"

export interface OfflineRecognizerConfig {
  featConfig: { sampleRate: number; featureDim: number }
  modelConfig: {
    transducer: { encoder: string; decoder: string; joiner: string }
    tokens: string
    numThreads: number
    provider: string
    debug: number
    modelType: string
    modelingUnit?: string
    bpeVocab?: string
  }
  decodingMethod: "greedy_search" | "modified_beam_search"
  maxActivePaths?: number
  hotwordsScore?: number
}

export interface OfflineStream {
  acceptWaveform(wave: { samples: Float32Array; sampleRate: number }): void
}

export interface OfflineRecognizer {
  createStream(hotwords?: string): OfflineStream
  /** The addon's result object (text, tokens, timestamps…): read it with resultText. */
  decodeAsync(stream: OfflineStream): Promise<unknown>
}

interface SherpaModule {
  version: string
  OfflineRecognizer: { createAsync(config: OfflineRecognizerConfig): Promise<unknown> }
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null

function isSherpaModule(x: unknown): x is SherpaModule {
  if (!isObject(x) || typeof x.version !== "string") return false
  const R = x.OfflineRecognizer
  return typeof R === "function" && "createAsync" in R && typeof R.createAsync === "function"
}

function isRecognizer(x: unknown): x is OfflineRecognizer {
  return isObject(x) && typeof x.createStream === "function" && typeof x.decodeAsync === "function"
}

let loaded: SherpaModule | null = null

/** The addon, loaded on first use (it pulls in onnxruntime's DLLs). */
export function sherpa(): SherpaModule {
  if (loaded) return loaded
  const mod: unknown = createRequire(import.meta.url)("sherpa-onnx-node")
  if (!isSherpaModule(mod)) throw new Error("sherpa-onnx-node loaded but doesn't look like the API sal-stt was written against")
  loaded = mod
  return mod
}

export async function createRecognizer(config: OfflineRecognizerConfig): Promise<OfflineRecognizer> {
  const r: unknown = await sherpa().OfflineRecognizer.createAsync(config)
  if (!isRecognizer(r)) throw new Error("sherpa-onnx returned an unexpected recognizer")
  return r
}

/** The decode result's text, whatever else the addon puts next to it. */
export function resultText(r: unknown): string {
  return isObject(r) && typeof r.text === "string" ? r.text : ""
}
