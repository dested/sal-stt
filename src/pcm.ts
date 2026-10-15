/**
 * PCM helpers every backend shares. Platform-neutral: typed arrays only.
 */

/** Mono audio: 16-bit samples, or float samples in [-1, 1]. */
export type Pcm = Int16Array | Float32Array

/** Raw little-endian 16-bit bytes (a socket frame, a file) → samples. A trailing odd byte is dropped. */
export function pcm16FromBytes(bytes: Uint8Array): Int16Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out = new Int16Array(bytes.byteLength >> 1)
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true)
  return out
}

/** Float samples in [-1, 1): Float32Array passes through, Int16Array is scaled by 1/32768. */
export function toFloat32(pcm: Pcm): Float32Array {
  if (pcm instanceof Float32Array) return pcm
  const out = new Float32Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) out[i] = (pcm[i] ?? 0) / 32768
  return out
}
