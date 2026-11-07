/**
 * 16bit PCM WAV のヘッダー生成（純粋ロジック）。
 * 録音の原本は OPFS 上の生 PCM なので、WAV は書き出し時に総サイズが
 * 確定してからヘッダーだけ先頭に付ければよい。
 */

export const WAV_HEADER_BYTES = 44

/** RIFF のサイズ欄は 32bit。これを超える data は WAV として表現できない */
export const WAV_MAX_DATA_BYTES = 0xffffffff - (WAV_HEADER_BYTES - 8)

export type WavHeaderParams = {
  sampleRate: number
  channels: number
  /** data チャンクのバイト数（ヘッダーを含まない） */
  dataBytes: number
}

const BITS_PER_SAMPLE = 16

export function createWavHeader({
  sampleRate,
  channels,
  dataBytes,
}: WavHeaderParams): Uint8Array<ArrayBuffer> {
  if (!Number.isInteger(dataBytes) || dataBytes < 0) {
    throw new RangeError(`dataBytes が不正です: ${dataBytes}`)
  }
  if (dataBytes > WAV_MAX_DATA_BYTES) {
    throw new RangeError('WAV の上限（約 4GB）を超えるため書き出せません')
  }
  const blockAlign = channels * (BITS_PER_SAMPLE / 8)
  const header = new Uint8Array(WAV_HEADER_BYTES)
  const view = new DataView(header.buffer)
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i))
    }
  }

  ascii(0, 'RIFF')
  view.setUint32(4, WAV_HEADER_BYTES - 8 + dataBytes, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt チャンク長
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true) // byte rate
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, BITS_PER_SAMPLE, true)
  ascii(36, 'data')
  view.setUint32(40, dataBytes, true)
  return header
}
