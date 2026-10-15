/**
 * Speed and memory of the node backend on real clips:
 *
 *   bun scripts/bench.ts <modelDir> <clip.pcm…> [--threads 1,2,4,8] [--provider cpu] [--runs 3] [--hotwords Iris,Sal]
 *
 * Clips are 16 kHz mono s16le. Prints, per thread count: load time, median ms per clip (after one warm-up), the
 * real-time factor, and the process's RSS after loading and after the runs.
 */
import { readFileSync } from "node:fs"
import { basename } from "node:path"
import { createStt, pcm16FromBytes } from "../src/node/index.ts"

const args = process.argv.slice(2)
const flag = (name: string, d: string) => {
  const i = args.indexOf(name)
  const v = i >= 0 ? args[i + 1] : undefined
  if (i >= 0) args.splice(i, 2)
  return v ?? d
}
const threads = flag("--threads", "1,2,4,8").split(",").map(Number)
const provider = flag("--provider", "cpu")
const runs = Number(flag("--runs", "3"))
const hotwords = flag("--hotwords", "").split(",").filter((w) => w)
const [modelDir, ...clips] = args
if (!modelDir || !clips.length || (provider !== "cpu" && provider !== "cuda" && provider !== "coreml")) {
  console.error("usage: bun scripts/bench.ts <modelDir> <clip.pcm…> [--threads 1,2,4,8] [--provider cpu|cuda|coreml] [--runs 3]")
  process.exit(2)
}
const audio = clips.map((f) => ({ name: basename(f), pcm: pcm16FromBytes(new Uint8Array(readFileSync(f))) }))
const mb = () => Math.round(process.memoryUsage.rss() / 2 ** 20)

for (const n of threads) {
  const t = performance.now()
  const stt = await createStt({ model: "parakeet-tdt-0.6b-v3", modelDir, threads: n, provider })
  console.log(`threads ${n} (${provider}): load ${Math.round(performance.now() - t)} ms, rss ${mb()} MB`)
  for (const a of audio) {
    const secs = a.pcm.length / 16000
    await stt.transcribe(a.pcm, { hotwords })
    const ms: number[] = []
    let text = ""
    for (let i = 0; i < runs; i++) {
      const r = await stt.transcribe(a.pcm, { hotwords })
      ms.push(r.ms)
      text = r.text
    }
    ms.sort((x, y) => x - y)
    const med = ms[Math.floor(ms.length / 2)] ?? 0
    console.log(`  ${a.name} ${secs.toFixed(1)} s: ${med} ms (RTF ${(med / 1000 / secs).toFixed(3)}) "${text.slice(0, 60)}"`)
  }
  console.log(`  rss after runs ${mb()} MB`)
  await stt.close()
}
