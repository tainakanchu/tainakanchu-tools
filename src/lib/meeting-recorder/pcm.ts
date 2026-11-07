/**
 * 録音 PCM の変換ユーティリティ（純粋ロジック）。
 * 原本は「L=マイク / R=相手」の 16bit インターリーブ・ステレオで持ち、
 * 書き出しのモードに応じてここで分解・ミックスする。
 * 長時間録音を扱うので、どれも出力先バッファを受け取れる形にして
 * チャンクごとの再確保を避けられるようにしている。
 */

/** 録音原本のチャンネル順 */
export const MIC_CHANNEL = 0
export const SYSTEM_CHANNEL = 1
export const RECORDED_CHANNELS = 2
export const BYTES_PER_SAMPLE = 2
/** 1 フレーム（L+R）あたりのバイト数 */
export const BYTES_PER_FRAME = RECORDED_CHANNELS * BYTES_PER_SAMPLE

/**
 * float [-1, 1] → int16。範囲外はクリップする。
 * NaN は無音として扱う（AudioWorklet の入力が壊れていても録音は止めない）。
 */
export function floatToInt16(sample: number): number {
  if (Number.isNaN(sample)) return 0
  if (sample <= -1) return -0x8000
  if (sample >= 1) return 0x7fff
  return Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff)
}

export function int16ToFloat(sample: number): number {
  return sample < 0 ? sample / 0x8000 : sample / 0x7fff
}

/**
 * 2 本のモノラル float 列を int16 インターリーブ・ステレオへ書き込む。
 * right が無い（入力が切れた）場合は無音で埋める。
 */
export function interleaveToInt16(
  left: Float32Array,
  right: Float32Array | undefined,
  out: Int16Array,
  frameOffset: number,
): void {
  const frames = left.length
  let o = frameOffset * 2
  for (let i = 0; i < frames; i++) {
    out[o++] = floatToInt16(left[i])
    out[o++] = right ? floatToInt16(right[i]) : 0
  }
}

/** int16 インターリーブ・ステレオから 1 チャンネルだけ取り出す（int16 のまま） */
export function extractChannelInt16(
  interleaved: Int16Array,
  channel: number,
  out: Int16Array<ArrayBuffer> = new Int16Array(interleaved.length / 2),
): Int16Array<ArrayBuffer> {
  const frames = interleaved.length >> 1
  for (let i = 0; i < frames; i++) out[i] = interleaved[i * 2 + channel]
  return out
}

/**
 * int16 ステレオを平均してモノラル int16 にする。
 * 和ではなく平均にしているのは、両者が同時に話したときのクリップを避けるため。
 */
export function mixToMonoInt16(
  interleaved: Int16Array,
  out: Int16Array<ArrayBuffer> = new Int16Array(interleaved.length / 2),
): Int16Array<ArrayBuffer> {
  const frames = interleaved.length >> 1
  for (let i = 0; i < frames; i++) {
    // 平均は必ず int16 の範囲に収まる
    out[i] = (interleaved[i * 2] + interleaved[i * 2 + 1]) >> 1
  }
  return out
}

/** int16 列（モノラル or インターリーブ）を同じ並びの float へ */
export function int16ArrayToFloat(
  input: Int16Array,
  out: Float32Array<ArrayBuffer> = new Float32Array(input.length),
): Float32Array<ArrayBuffer> {
  for (let i = 0; i < input.length; i++) out[i] = int16ToFloat(input[i])
  return out
}

/** バイト列を BYTES_PER_FRAME の倍数に切り詰めたフレーム数 */
export function framesFromBytes(bytes: number): number {
  return Math.max(0, Math.floor(bytes / BYTES_PER_FRAME))
}
