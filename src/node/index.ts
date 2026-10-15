/**
 * sal-stt/node: speech to text in Bun, Node and Electron main, on sherpa-onnx's N-API addon (CPU; the npm build
 * ships no CUDA provider). One recognizer per engine, loaded once; calls run one at a time off the event loop.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { SttEngine, TranscribeOptions, Transcript } from "../index.ts"
import { MODELS, type ModelId } from "../models.ts"
import { type Pcm, toFloat32 } from "../pcm.ts"
import { checkModel, modelPath } from "./fetch.ts"
import { createRecognizer, type OfflineRecognizer, resultText } from "./sherpa.ts"

export type { SttEngine, TranscribeOptions, Transcript } from "../index.ts"
export { MODELS, type ModelId, isModelId } from "../models.ts"
export { type Pcm, pcm16FromBytes, toFloat32 } from "../pcm.ts"
export { checkModel, fetchModel, type FetchResult, modelPath } from "./fetch.ts"

export interface NodeSttOptions {
  model: ModelId
  /** The folder holding `<model>/` (what `sal-stt fetch <model> <dir>` was given). */
  modelDir: string
  /** onnxruntime intra-op threads. Default 4. */
  threads?: number
  /** onnxruntime execution provider. Default "cpu" (the npm addon has no other). */
  provider?: "cpu" | "cuda" | "coreml"
  /** How much a hotword is boosted in beam search. Default 1.5; past ~3 it starts eating real words. */
  hotwordScore?: number
}

const SAMPLE_RATE = 16000

export async function createStt(opts: NodeSttOptions): Promise<SttEngine> {
  const spec = MODELS[opts.model]
  const bad = checkModel(opts.model, opts.modelDir)
  if (bad.length) throw new Error(`${opts.model} isn't ready in ${opts.modelDir} (${bad.join("; ")}): run sal-stt fetch ${opts.model} <dir>`)
  const dir = modelPath(opts.model, opts.modelDir)
  const file = (f: { name: string }) => join(dir, f.name)

  let recognizer: OfflineRecognizer | null = await createRecognizer({
    featConfig: { sampleRate: SAMPLE_RATE, featureDim: 128 },
    modelConfig: {
      transducer: { encoder: file(spec.files.encoder), decoder: file(spec.files.decoder), joiner: file(spec.files.joiner) },
      tokens: file(spec.files.tokens),
      numThreads: opts.threads ?? 4,
      provider: opts.provider ?? "cpu",
      debug: 0,
      modelType: "nemo_transducer",
      // Hotwords are typed as words: sherpa-onnx encodes them with this vocab (derived from tokens.txt).
      modelingUnit: "bpe",
      bpeVocab: ensureBpeVocab(file(spec.files.tokens), join(dir, "bpe.vocab")),
    },
    // Beam search is what lets hotwords bias decoding (greedy ignores them); it costs ~30% over greedy.
    decodingMethod: "modified_beam_search",
    maxActivePaths: 4,
    hotwordsScore: opts.hotwordScore ?? 1.5,
  })

  // One decode at a time: callers queue behind each other, never race on the recognizer.
  let chain: Promise<unknown> = Promise.resolve()

  return {
    model: opts.model,
    hotwords: true,
    transcribe(pcm: Pcm, options: TranscribeOptions = {}): Promise<Transcript> {
      const run = chain.then(async () => {
        if (!recognizer) throw new Error("sal-stt: transcribe after close()")
        const started = performance.now()
        const stream = recognizer.createStream(hotwordsLine(options.hotwords ?? []))
        stream.acceptWaveform({ samples: toFloat32(pcm), sampleRate: options.sampleRate ?? SAMPLE_RATE })
        const text = resultText(await recognizer.decodeAsync(stream)).replace(/\s+/g, " ").trim()
        return { text, ms: Math.round(performance.now() - started) }
      })
      chain = run.catch(() => {})
      return run
    },
    async close(): Promise<void> {
      await chain
      // The addon frees the native recognizer when its handle is collected; dropping it is all there is.
      recognizer = null
    },
  }
}

/** sherpa-onnx's per-stream hotword string: phrases joined by '/' ('/' and ':' inside a phrase become spaces). */
export function hotwordsLine(words: string[]): string | undefined {
  const phrases = [...new Set(words.map((w) => w.replace(/[\s/:]+/g, " ").trim()).filter((w) => w.length > 0))]
  return phrases.length ? phrases.join("/") : undefined
}

/**
 * The model ships tokens.txt ("piece id") but no SentencePiece vocab, which sherpa-onnx needs to turn hotword text
 * into tokens. BPE pieces are numbered in merge order, so -id is the piece's score. Written once next to the model.
 */
export function ensureBpeVocab(tokensFile: string, vocabFile: string): string {
  if (existsSync(vocabFile)) return vocabFile
  const lines: string[] = []
  for (const line of readFileSync(tokensFile, "utf8").split(/\r?\n/)) {
    const m = /^(.+) (\d+)$/.exec(line)
    if (!m || !m[1] || !m[2] || /^<.*>$/.test(m[1])) continue
    lines.push(`${m[1]}\t${-Number(m[2])}`)
  }
  const tmp = `${vocabFile}.${process.pid}.tmp`
  writeFileSync(tmp, lines.join("\n") + "\n")
  renameSync(tmp, vocabFile)
  return vocabFile
}
