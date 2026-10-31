export type WavFormat = "pcm24" | "float32";

const clamp1 = (v: number) => (v > 1 ? 1 : v < -1 ? -1 : v);

/** Encodes planar float channels as an interleaved little-endian WAV (24-bit PCM, or 32-bit float). */
export function encodeWav(channels: Float32Array[], sampleRate: number, format: WavFormat = "pcm24"): ArrayBuffer {
  const nCh = channels.length, frames = nCh ? channels[0].length : 0;
  const bytes = format === "pcm24" ? 3 : 4, dataBytes = frames * nCh * bytes;
  const float = format === "float32";
  const fmtSize = 16, factSize = float ? 12 : 0;
  const buf = new ArrayBuffer(12 + 8 + fmtSize + factSize + 8 + dataBytes);
  const v = new DataView(buf);
  let o = 0;
  const str = (s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o++, s.charCodeAt(i)); };
  const u32 = (n: number) => { v.setUint32(o, n, true); o += 4; };
  const u16 = (n: number) => { v.setUint16(o, n, true); o += 2; };

  str("RIFF"); u32(buf.byteLength - 8); str("WAVE");
  str("fmt "); u32(fmtSize); u16(float ? 3 : 1); u16(nCh); u32(sampleRate); u32(sampleRate * nCh * bytes); u16(nCh * bytes); u16(bytes * 8);
  if (float) { str("fact"); u32(4); u32(frames); }
  str("data"); u32(dataBytes);

  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < nCh; c++) {
      const s = clamp1(channels[c][i]);
      if (float) { v.setFloat32(o, s, true); o += 4; }
      else {
        const n = Math.round(s * 8388607);
        v.setUint8(o++, n & 0xff); v.setUint8(o++, (n >> 8) & 0xff); v.setUint8(o++, (n >> 16) & 0xff);
      }
    }
  }
  return buf;
}

/** Saves bytes as a file download. Browser only. */
export function downloadBytes(name: string, bytes: ArrayBuffer, type = "audio/wav") {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
