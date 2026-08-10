/**
 * 分版ワーカーのクライアント側ラッパー。
 * React からは Promise + onProgress だけ見えれば十分なので、
 * postMessage のやり取りをここに閉じ込めて部品交換可能にしている。
 */
import type {
  GamutMapMode,
  InkId,
  PressProfile,
} from '../../../../lib/risograph/types'
import type {
  LutQuality,
  SeparateRequest,
  SeparateResponse,
} from './separation.worker'

export type SeparationInput = {
  inkIds: Array<InkId>
  rgba: Uint8ClampedArray
  width: number
  height: number
  lutSize: 17 | 33
  gamutMap: GamutMapMode
}

export type SeparationResult = {
  inkIds: Array<InkId>
  profile: PressProfile
  warnings: Array<string>
  lutQuality: LutQuality
  /** inkIds 順の coverage map（分版解像度） */
  maps: Array<Float32Array>
  width: number
  height: number
}

export type ProgressHandler = (fraction: number, message: string) => void

function createWorker(): Worker {
  return new Worker(new URL('./separation.worker.ts', import.meta.url), {
    type: 'module',
  })
}

export class SeparationClient {
  private worker: Worker | null = null

  /** 実行中のジョブがあれば捨てて、新しい分版を始める */
  run(input: SeparationInput, onProgress?: ProgressHandler) {
    this.dispose()
    const worker = createWorker()
    this.worker = worker

    return new Promise<SeparationResult>((resolve, reject) => {
      worker.addEventListener(
        'message',
        (event: MessageEvent<SeparateResponse>) => {
          const data = event.data
          if (data.type === 'progress') {
            onProgress?.(data.fraction, data.message)
            return
          }
          if (data.type === 'error') {
            reject(new Error(data.message))
            worker.terminate()
            if (this.worker === worker) this.worker = null
            return
          }
          resolve({
            inkIds: input.inkIds,
            profile: data.profile,
            warnings: data.warnings,
            lutQuality: data.lutQuality,
            maps: data.maps.map((buffer) => new Float32Array(buffer)),
            width: data.width,
            height: data.height,
          })
          worker.terminate()
          if (this.worker === worker) this.worker = null
        },
      )
      worker.addEventListener('error', (event) => {
        reject(new Error(event.message || 'ワーカーの実行に失敗しました'))
      })

      // rgba は転送してしまうので、呼び出し側の配列は再利用しない前提でコピーを渡す
      const copy = Uint8ClampedArray.from(input.rgba)
      const request: SeparateRequest = {
        type: 'separate',
        inkIds: input.inkIds,
        rgba: copy.buffer,
        width: input.width,
        height: input.height,
        lutSize: input.lutSize,
        gamutMap: input.gamutMap,
      }
      worker.postMessage(request, [request.rgba])
    })
  }

  dispose(): void {
    this.worker?.terminate()
    this.worker = null
  }
}
