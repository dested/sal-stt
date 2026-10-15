import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { checkModel, createStt, ensureBpeVocab, hotwordsLine, isModelId, pcm16FromBytes } from "../src/node/index.ts"

describe("hotwordsLine", () => {
  test("joins phrases with '/', dedupes, drops empties", () => {
    expect(hotwordsLine(["Iris", "Frozen Ropes", "Iris", "  ", ""])).toBe("Iris/Frozen Ropes")
  })
  test("separators inside a phrase can't split it or set a score", () => {
    expect(hotwordsLine(["a/b", "c :9", "d\ne"])).toBe("a b/c 9/d e")
  })
  test("nothing → undefined (plain stream)", () => {
    expect(hotwordsLine([])).toBeUndefined()
  })
})

describe("models", () => {
  test("ids", () => {
    expect(isModelId("parakeet-tdt-0.6b-v3")).toBe(true)
    expect(isModelId("toString")).toBe(false)
  })

  test("checkModel names every missing file", () => {
    const dir = mkdtempSync(join(tmpdir(), "sal-stt-"))
    expect(checkModel("parakeet-tdt-0.6b-v3", dir)).toHaveLength(4)
  })

  test("createStt refuses a model that isn't there", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sal-stt-"))
    await expect(createStt({ model: "parakeet-tdt-0.6b-v3", modelDir: dir })).rejects.toThrow(/sal-stt fetch/)
  })

  test("the BPE vocab skips special tokens and scores pieces by -id", () => {
    const dir = mkdtempSync(join(tmpdir(), "sal-stt-"))
    writeFileSync(join(dir, "tokens.txt"), "<unk> 0\n<pad> 1\n▁the 2\ns 3\n<blk> 4\n")
    const vocab = ensureBpeVocab(join(dir, "tokens.txt"), join(dir, "bpe.vocab"))
    expect(readFileSync(vocab, "utf8")).toBe("▁the\t-2\ns\t-3\n")
  })
})

/**
 * The real model, when it's on disk: SAL_STT_MODEL_DIR=<dir holding parakeet-tdt-0.6b-v3/>. With SAL_STT_TEST_PCM
 * (16 kHz mono s16le) and SAL_STT_TEST_TEXT it also checks a known recording.
 */
const modelDir = process.env.SAL_STT_MODEL_DIR
describe.skipIf(!modelDir)("parakeet (real model)", () => {
  test("silence is empty, a known clip is right, hotwords are accepted", async () => {
    if (!modelDir) return
    const stt = await createStt({ model: "parakeet-tdt-0.6b-v3", modelDir })
    expect(stt.hotwords).toBe(true)
    expect((await stt.transcribe(new Int16Array(16000))).text).toBe("")
    const pcm = process.env.SAL_STT_TEST_PCM
    const want = process.env.SAL_STT_TEST_TEXT
    if (pcm && want) {
      const audio = pcm16FromBytes(new Uint8Array(readFileSync(pcm)))
      const floats = Float32Array.from(audio, (s) => s / 32768)
      const [plain, biased, fromFloats] = await Promise.all([stt.transcribe(audio), stt.transcribe(audio, { hotwords: ["Iris"] }), stt.transcribe(floats)])
      expect(plain.text).toBe(want)
      expect(biased.text).toBe(want)
      expect(fromFloats.text).toBe(want)
    }
    await stt.close()
    await expect(stt.transcribe(new Int16Array(160))).rejects.toThrow(/after close/)
  }, 60_000)
})
