# sal-stt cliffnotes

One speech-to-text package for Sal's apps: one TypeScript API, a backend per platform. Phase 1 ships the node
backend (Bun, Node, Electron main) on sherpa-onnx's N-API addon with NVIDIA Parakeet TDT 0.6B v3 (int8). Iris
(`G:\code\sal-agent`, `src/ears/stt.ts`) is the first user. The plan, with the browser / server / Expo backends to
come: `plans/2026-10-14-sal-stt.md`.

Stack: Bun + strict TypeScript (`strict`, `noUncheckedIndexedAccess`), ESM, no build needed under Bun. Library only:
no CSS, no app code.

## Use

```ts
import { createStt, pcm16FromBytes } from "sal-stt/node"
const stt = await createStt({ model: "parakeet-tdt-0.6b-v3", modelDir: "G:/code/sal-agent/models", threads: 4 })
const { text, ms } = await stt.transcribe(pcm16FromBytes(bytes), { sampleRate: 16000, hotwords: ["Iris", "Frozen Ropes"] })
await stt.close()
```

- PCM is mono samples: `Int16Array`, or `Float32Array` in [-1, 1]. Raw little-endian bytes go through
  `pcm16FromBytes` first. Other sample rates are resampled by sherpa-onnx. `hotwords` is a plain `string[]`.
- `"."` (`src/index.ts`) is platform-neutral: the contract, the model catalog and the PCM helpers, no `node:`, Bun or
  addon import (test/core.test.ts enforces it), so the browser and Expo backends implement the same `SttEngine`.
  Anything node-only stays behind `"./node"`.
- Calls queue one at a time on the engine and run off the event loop (`decodeAsync`). Load takes ~1.2-2 s.
- RAM: ~1.0-1.5 GB RSS per engine (the int8 encoder is 650 MB). CPU only: the npm addon ships no CUDA provider.
- `hotwords` bias beam search (sherpa-onnx contextual biasing). Score 1.5 by default (`hotwordScore`); at ~10-20 a
  hotword starts replacing real words.

## Models

`<modelDir>/<model id>/` holds the official sherpa-onnx release files (`encoder.int8.onnx`, `decoder.int8.onnx`,
`joiner.int8.onnx`, `tokens.txt`) plus `bpe.vocab`, which `createStt` derives from `tokens.txt` on first load (the
archive has no SentencePiece vocab, and sherpa-onnx needs one to turn hotword text into tokens).

- `bun bin/sal-stt.ts fetch parakeet-tdt-0.6b-v3 <dir>`: download (~487 MB tar.bz2 from the k2-fsa
  `asr-models` release), unpack with tar (Windows' own bsdtar reads bzip2), check every file's exact size. A no-op
  when the files are there and whole. `check <model> <dir>` only reports.
- Models are never committed. Iris keeps hers in `G:\code\sal-agent\models\` (gitignored there).

## Map

```
src/index.ts          the shared contract (platform-neutral): SttEngine, TranscribeOptions, Transcript, MODELS, PCM helpers
src/pcm.ts            Pcm (Int16Array | Float32Array), pcm16FromBytes, toFloat32
src/models.ts         model catalog: archive URL, folder, file names + exact sizes
src/node/index.ts     createStt (sal-stt/node): config, hotword string, bpe.vocab, the call queue
src/node/sherpa.ts    the one typed boundary over sherpa-onnx-node (shape-checked at load; no any)
src/node/fetch.ts     fetchModel / checkModel / modelPath
bin/sal-stt.ts        CLI: fetch | check
scripts/bench.ts      speed + RSS per thread count on real clips
test/core.test.ts     PCM helpers; the core entry imports nothing platform-specific
test/node.test.ts     node backend; the real-model test runs when SAL_STT_MODEL_DIR is set
dist/                 tsc output for plain Node (`bun run build`; gitignored)
```

## Packaging

`exports` give Bun (and type checkers) the `.ts` source (`bun` / `types` conditions) and plain Node the compiled
`dist/` (`default`). Node consumers need `bun run build` first; `dist/` is gitignored, so a `github:` install for
Node needs a decision (commit `dist/`, or a `prepare` script). Bun consumers need nothing.

sal-agent depends on a packed tarball for now (`bun pm pack` → `sal-stt-0.1.0.tgz`, gitignored): a `file:../sal-stt`
folder dependency fails because bun copies the folder's `.git` and the copy of `.git/config` is denied. After a
change here: `bun pm pack`, then in sal-agent `bun remove sal-stt && bun add sal-stt@file:../sal-stt/sal-stt-0.1.0.tgz`.
The `github:dested/sal-stt` dependency replaces this once the repo is pushed.

## Test

- `bun run typecheck` · `bun test` (unit) ·
  `SAL_STT_MODEL_DIR=G:/code/sal-agent/models bun test` (adds the real model: silence → "", close())
  `SAL_STT_TEST_PCM=<clip.pcm> SAL_STT_TEST_TEXT="…"` on top checks a known clip with and without hotwords.
- Node: `bun run build`, then `node --input-type=module -e "import { createStt } from 'sal-stt/node'; …"` from this folder.
- Speed: `bun scripts/bench.ts <modelDir> <clip.pcm…> --threads 1,2,4,8`.

## Gotchas

- sherpa-onnx crashes natively (no JS error) if a stream gets hotwords while the recognizer decodes with
  `greedy_search`. sal-stt always uses `modified_beam_search` (maxActivePaths 4), ~30% slower than greedy.
- Without `modelingUnit: "bpe"` + `bpeVocab`, sherpa-onnx's default `cjkchar` unit splits `▁` off every token and
  hotwords silently do nothing.
- The NeMo model's metadata sets feature dim 128; sal-stt passes 128.
