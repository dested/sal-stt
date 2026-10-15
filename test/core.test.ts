import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { pcm16FromBytes, toFloat32 } from "../src/index.ts"

describe("pcm", () => {
  test("Int16 samples scale to [-1, 1)", () => {
    expect([...toFloat32(new Int16Array([0, 16384, -32768, 32767, -1]))]).toEqual([0, 0.5, -1, 32767 / 32768, -1 / 32768])
  })

  test("Float32 passes through untouched", () => {
    const f = new Float32Array([0.25, -0.5])
    expect(toFloat32(f)).toBe(f)
  })

  test("bytes read as little-endian pairs, at any offset; a trailing odd byte is dropped", () => {
    const buf = new Uint8Array([9, 0x00, 0x40, 0xff, 0xff, 7])
    expect([...pcm16FromBytes(buf.subarray(1))]).toEqual([16384, -1])
  })
})

describe("the core entry stays platform-neutral", () => {
  // Everything "." can reach: src/*.ts (not src/node). None may import node:, bun or the addon.
  const core = readdirSync(join(import.meta.dir, "..", "src")).filter((f) => f.endsWith(".ts"))
  test.each(core)("%s", (f) => {
    const src = readFileSync(join(import.meta.dir, "..", "src", f), "utf8")
    const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1] ?? "")
    expect(imports.filter((i) => !/^\.\/[\w-]+\.ts$/.test(i))).toEqual([])
  })
})
