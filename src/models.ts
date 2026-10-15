/**
 * The models sal-stt knows: where each one's official archive lives and which files make it whole. A model lives in
 * `<modelDir>/<id>/`; `sal-stt fetch <id> <modelDir>` puts it there.
 */
export interface ModelFile {
  name: string
  /** Exact size in bytes as published; a mismatch means a truncated or wrong file. */
  bytes: number
}

export interface ModelSpec {
  id: string
  /** The sherpa-onnx release archive (tar.bz2) holding the files. */
  url: string
  /** The folder inside the archive. */
  archiveDir: string
  files: { encoder: ModelFile; decoder: ModelFile; joiner: ModelFile; tokens: ModelFile }
}

export const MODELS = {
  /** NVIDIA Parakeet TDT 0.6B v3 (multilingual, 25 languages), int8, as a NeMo transducer for sherpa-onnx. */
  "parakeet-tdt-0.6b-v3": {
    id: "parakeet-tdt-0.6b-v3",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2",
    archiveDir: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8",
    files: {
      encoder: { name: "encoder.int8.onnx", bytes: 652_184_281 },
      decoder: { name: "decoder.int8.onnx", bytes: 11_845_275 },
      joiner: { name: "joiner.int8.onnx", bytes: 6_355_277 },
      tokens: { name: "tokens.txt", bytes: 93_939 },
    },
  },
} as const satisfies Record<string, ModelSpec>

export type ModelId = keyof typeof MODELS

export function isModelId(id: string): id is ModelId {
  return Object.hasOwn(MODELS, id)
}
