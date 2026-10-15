#!/usr/bin/env bun
/**
 * sal-stt fetch <model> <dir>   download and unpack a model into <dir>/<model>/ (no-op when it's there and whole)
 * sal-stt check <model> <dir>   say whether it's there and whole
 */
import { MODELS, isModelId } from "../src/models.ts"
import { checkModel, fetchModel } from "../src/node/fetch.ts"

const [cmd, id, dir] = process.argv.slice(2)
const usage = `usage: sal-stt fetch|check <model> <dir>\nmodels: ${Object.keys(MODELS).join(", ")}`

if ((cmd !== "fetch" && cmd !== "check") || !id || !dir) {
  console.error(usage)
  process.exit(2)
}
if (!isModelId(id)) {
  console.error(`unknown model "${id}"\n${usage}`)
  process.exit(2)
}

if (cmd === "check") {
  const bad = checkModel(id, dir)
  console.log(bad.length ? `${id}: ${bad.join("; ")}` : `${id}: ok`)
  process.exit(bad.length ? 1 : 0)
}

try {
  const r = await fetchModel(id, dir, (m) => console.log(m))
  console.log(r.downloaded ? `${id}: fetched into ${r.dir}` : `${id}: already in ${r.dir}`)
} catch (err: unknown) {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
}
