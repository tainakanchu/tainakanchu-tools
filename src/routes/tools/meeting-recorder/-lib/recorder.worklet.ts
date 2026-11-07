/**
 * 録音用 AudioWorkletProcessor。
 * 2ch 入力（L=マイク / R=相手）を Int16 インターリーブに詰め、batchFrames
 * たまるごとに書き込みワーカーへ直接送る（ArrayBuffer は transfer）。
 *
 * `?worker&url` でワーカーと同じく単体バンドルされ、audioWorklet.addModule() に渡る。
 */
import { floatToInt16 } from '../../../../lib/meeting-recorder/pcm'
import { RECORDER_PROCESSOR_NAME } from './protocol'
import type { PcmMessage, WorkletCommand } from './protocol'

// AudioWorkletGlobalScope の型は lib.dom に無いので、使う分だけ宣言する
/** 入力が未接続のときは空になる。型でも欠けうることを表しておく */
type ProcessInputs = Array<Array<Float32Array | undefined> | undefined>

declare class AudioWorkletProcessor {
  readonly port: MessagePort
}
declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor & {
    process: (inputs: ProcessInputs) => boolean
  },
): void

class RecorderProcessor extends AudioWorkletProcessor {
  private out: MessagePort | null = null
  private batchFrames = 0
  private buffer: Int16Array<ArrayBuffer> | null = null
  private filled = 0

  constructor() {
    super()
    this.port.addEventListener(
      'message',
      (event: MessageEvent<WorkletCommand>) => {
        const command = event.data
        if (command.type === 'start') {
          this.out = command.port
          this.batchFrames = command.batchFrames
          this.buffer = new Int16Array(command.batchFrames * 2)
          this.filled = 0
          return
        }
        // 停止: 端数を吐き出してから終端を送る。同じポートなので順序は保たれる
        this.flush()
        this.send({ type: 'end' })
        this.out = null
        this.buffer = null
      },
    )
    this.port.start()
  }

  private send(message: PcmMessage, transfer: Array<Transferable> = []) {
    this.out?.postMessage(message, transfer)
  }

  private flush() {
    if (!this.buffer || this.filled === 0) return
    const chunk = this.buffer.slice(0, this.filled * 2)
    this.send({ type: 'pcm', buffer: chunk.buffer }, [chunk.buffer])
    this.filled = 0
  }

  process(inputs: ProcessInputs): boolean {
    if (!this.buffer) return true
    // ChannelMerger の出力は常に 2ch。未接続などで空なら 1 quantum 分の無音にする
    const input = inputs[0]
    const left = input?.[0]
    const right = input?.[1]
    const frames = left ? left.length : 128
    let buffer = this.buffer
    for (let i = 0; i < frames; i++) {
      const o = this.filled * 2
      buffer[o] = left ? floatToInt16(left[i]) : 0
      buffer[o + 1] = right ? floatToInt16(right[i]) : 0
      this.filled++
      if (this.filled === this.batchFrames) {
        // 送ったバッファは手放すので、次のバッチ用に作り直す
        this.send({ type: 'pcm', buffer: buffer.buffer }, [buffer.buffer])
        buffer = new Int16Array(this.batchFrames * 2)
        this.buffer = buffer
        this.filled = 0
      }
    }
    return true
  }
}

registerProcessor(RECORDER_PROCESSOR_NAME, RecorderProcessor)
