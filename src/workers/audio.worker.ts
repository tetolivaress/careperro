/// <reference lib="webworker" />
import { expose, transfer } from "comlink";

/** Pure audio helpers that run off the main thread. No DOM, no React. */

export interface Analysis {
  /** Peak absolute sample value, 0..1+ */
  peak: number;
  /** Root mean square over all channels, 0..1 */
  rms: number;
  /** Peak in dBFS */
  peakDb: number;
  /** RMS in dBFS */
  rmsDb: number;
}

function toDb(v: number): number {
  return v <= 0 ? -Infinity : 20 * Math.log10(v);
}

function analyze(channels: Float32Array[]): Analysis {
  let peak = 0;
  let sumSq = 0;
  let count = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const v = Math.abs(ch[i]);
      if (v > peak) peak = v;
      sumSq += v * v;
    }
    count += ch.length;
  }
  const rms = count ? Math.sqrt(sumSq / count) : 0;
  return { peak, rms, peakDb: toDb(peak), rmsDb: toDb(rms) };
}

/** Interleaves channels into 16-bit PCM WAV. Returns the file bytes (transferred). */
function encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const numChannels = channels.length;
  const frames = channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return transfer(buffer, [buffer]);
}

/** Downsampled peaks for drawing a static waveform (e.g. merge list thumbnails). */
function peaks(channel: Float32Array, buckets: number): Float32Array {
  const out = new Float32Array(buckets);
  const step = channel.length / buckets;
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * step);
    const end = Math.min(channel.length, Math.floor((b + 1) * step));
    let max = 0;
    for (let i = start; i < end; i++) {
      const v = Math.abs(channel[i]);
      if (v > max) max = v;
    }
    out[b] = max;
  }
  return transfer(out, [out.buffer]);
}

const api = { analyze, encodeWav, peaks };
export type AudioWorkerApi = typeof api;

expose(api);
