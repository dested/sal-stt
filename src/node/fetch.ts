/**
 * `fetchModel(id, modelDir)`: download a model's official sherpa-onnx archive, unpack it into `<modelDir>/<id>/` and
 * check every file's size. A no-op when the files are already there and whole.
 */
import { spawn } from "node:child_process"
import { closeSync, existsSync, mkdirSync, openSync, renameSync, rmSync, statSync, writeSync } from "node:fs"
import { join } from "node:path"
import { MODELS, type ModelId, type ModelSpec } from "../models.ts"

export const modelPath = (id: ModelId, modelDir: string) => join(modelDir, id)

/** Each file that is missing or the wrong size, with why. Empty when the model is whole. */
export function checkModel(id: ModelId, modelDir: string): string[] {
  const dir = modelPath(id, modelDir)
  const bad: string[] = []
  for (const f of Object.values(MODELS[id].files)) {
    const p = join(dir, f.name)
    if (!existsSync(p)) bad.push(`${f.name}: missing`)
    else if (statSync(p).size !== f.bytes) bad.push(`${f.name}: ${statSync(p).size} bytes, expected ${f.bytes}`)
  }
  return bad
}

export interface FetchResult {
  dir: string
  /** False when the model was already there. */
  downloaded: boolean
}

export async function fetchModel(id: ModelId, modelDir: string, log: (m: string) => void = () => {}): Promise<FetchResult> {
  const spec: ModelSpec = MODELS[id]
  const dir = modelPath(id, modelDir)
  if (checkModel(id, modelDir).length === 0) return { dir, downloaded: false }

  mkdirSync(modelDir, { recursive: true })
  const work = join(modelDir, `.${id}.fetch`)
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  try {
    const archive = join(work, "model.tar.bz2")
    log(`downloading ${spec.url}`)
    const res = await fetch(spec.url, { redirect: "follow" })
    if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`)
    const total = Number(res.headers.get("content-length") ?? 0)
    let got = 0
    let shown = 0
    // A plain reader loop: Readable.fromWeb would tie the types to one of DOM / Node's ReadableStream.
    const reader = res.body.getReader()
    const fd = openSync(archive, "w")
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        writeSync(fd, value)
        got += value.length
        if (total && got - shown > total / 10) {
          shown = got
          log(`  ${Math.round((got / total) * 100)}%`)
        }
      }
    } finally {
      closeSync(fd)
    }
    if (total && got !== total) throw new Error(`download truncated: ${got} of ${total} bytes`)

    log("unpacking")
    await untar(archive, work)
    const unpacked = join(work, spec.archiveDir)
    if (!existsSync(unpacked)) throw new Error(`the archive has no ${spec.archiveDir}/`)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    for (const f of Object.values(spec.files)) renameSync(join(unpacked, f.name), join(dir, f.name))
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
  const bad = checkModel(id, modelDir)
  if (bad.length) throw new Error(`${id} is incomplete after unpacking: ${bad.join("; ")}`)
  return { dir, downloaded: true }
}

/** tar.bz2 → dir. Windows' own bsdtar reads bzip2; elsewhere the system tar does. */
async function untar(archive: string, into: string): Promise<void> {
  const tar = process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar"
  await new Promise<void>((resolve, reject) => {
    const p = spawn(tar, ["-xjf", archive, "-C", into], { stdio: ["ignore", "ignore", "pipe"] })
    let err = ""
    p.stderr.on("data", (d: Buffer) => (err += d.toString()))
    p.on("error", reject)
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`tar exited ${code}: ${err.trim()}`))))
  })
}
