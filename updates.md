# updates

- 2026-10-14: phase 1, the node backend. `createStt` on sherpa-onnx-node 1.13.8 (N-API, loads under Bun and Node),
  Parakeet TDT 0.6B v3 int8, hotwords via beam search + a bpe.vocab derived from tokens.txt, `sal-stt fetch|check`,
  bench script, tests. Iris (sal-agent) runs on it behind `ears.stt`.
- 2026-10-14: PCM is samples now (`Int16Array | Float32Array`, `pcm16FromBytes` for raw bytes); `"."` stays
  platform-neutral, enforced by test/core.test.ts.
