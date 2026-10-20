/**
 * 書き出しのメインスレッド側。
 * 保存先の選択（ファイル / フォルダのピッカー）はユーザー操作の直後にしか呼べないので
 * ここで行い、選ばれたハンドルをワーカーへ渡す。ピッカーが無いブラウザでは
 * ワーカーが OPFS の一時ファイルへ書き、ここからダウンロードさせる。
 */
import {
  exportFormatInfo,
  numberedFileName,
} from '../../../../lib/meeting-recorder/export-options'
import { hasDirectoryPicker, hasSaveFilePicker } from './support'
import { readExportTemp } from './sessions'
import type {
  ExportFormat,
  ExportTarget,
} from '../../../../lib/meeting-recorder/export-options'
import type { ExportRequest, ExportResponse, ExportSink } from './export.worker'

export type ExportOutput = { target: ExportTarget; sink: ExportSink }

export type ExportResult = Extract<ExportResponse, { type: 'done' }>

/** ピッカーで保存先を選ばせる。キャンセルされたら null */
export async function chooseDestinations(
  targets: Array<ExportTarget>,
  format: ExportFormat,
): Promise<Array<ExportOutput> | null> {
  const info = exportFormatInfo(format)
  try {
    if (
      targets.length > 1 &&
      hasDirectoryPicker() &&
      window.showDirectoryPicker
    ) {
      const dir = await window.showDirectoryPicker({
        id: 'meeting-recorder',
        mode: 'readwrite',
        startIn: 'downloads',
      })
      const outputs: Array<ExportOutput> = []
      for (const target of targets) {
        const fileName = await freeName(dir, target.fileName)
        const handle = await dir.getFileHandle(fileName, { create: true })
        outputs.push({
          target: { ...target, fileName },
          sink: { kind: 'handle', handle },
        })
      }
      return outputs
    }
    if (
      targets.length === 1 &&
      hasSaveFilePicker() &&
      window.showSaveFilePicker
    ) {
      const handle = await window.showSaveFilePicker({
        id: 'meeting-recorder',
        startIn: 'downloads',
        suggestedName: targets[0].fileName,
        types: [
          {
            description: info.label,
            accept: { [info.mimeType]: [`.${info.extension}`] },
          },
        ],
      })
      return [
        {
          target: { ...targets[0], fileName: handle.name },
          sink: { kind: 'handle', handle },
        },
      ]
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return null
    }
    throw error
  }
  // ピッカーが無い → 一時ファイル経由のダウンロード
  return targets.map((target, i) => ({
    target,
    sink: { kind: 'temp', name: `${Date.now()}-${i}-${target.fileName}` },
  }))
}

/** フォルダ内で同名ファイルを上書きしないよう、空いている名前を探す */
async function freeName(
  dir: FileSystemDirectoryHandle,
  fileName: string,
): Promise<string> {
  for (let n = 1; n < 100; n++) {
    const candidate = numberedFileName(fileName, n)
    try {
      await dir.getFileHandle(candidate)
    } catch {
      return candidate
    }
  }
  return fileName
}

export type ExportJob = {
  promise: Promise<ExportResult>
  cancel: () => void
}

export function startExport(
  request: Omit<ExportRequest, 'type'>,
  onProgress: (fraction: number) => void,
): ExportJob {
  const worker = new Worker(new URL('./export.worker.ts', import.meta.url), {
    type: 'module',
  })
  let cancelJob: (() => void) | null = null
  const promise = new Promise<ExportResult>((resolve, reject) => {
    cancelJob = () => {
      // ピッカーで選んだファイルは close 前に止めれば中身が確定しない
      worker.terminate()
      reject(new DOMException('canceled', 'AbortError'))
    }
    worker.addEventListener(
      'message',
      (event: MessageEvent<ExportResponse>) => {
        const data = event.data
        if (data.type === 'progress') {
          onProgress(data.fraction)
          return
        }
        worker.terminate()
        if (data.type === 'done') resolve(data)
        else reject(new Error(data.message))
      },
    )
    worker.addEventListener('error', (event) => {
      worker.terminate()
      reject(
        new Error(`書き出しワーカーでエラーが発生しました: ${event.message}`),
      )
    })
  })
  const message: ExportRequest = { type: 'export', ...request }
  worker.postMessage(message, [])
  return { promise, cancel: () => cancelJob?.() }
}

/** 一時ファイルに書いた結果を順にダウンロードさせる */
export async function downloadTempOutputs(result: ExportResult): Promise<void> {
  for (const output of result.outputs) {
    if (output.sink.kind !== 'temp') continue
    const file = await readExportTemp(output.sink.name)
    const url = URL.createObjectURL(file)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = output.fileName
    anchor.click()
    // ダウンロードの開始を待ってから解放する（すぐ revoke すると失敗することがある）
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    // 連続ダウンロードがブラウザにまとめて弾かれないよう少し間を空ける
    await new Promise((resolve) => window.setTimeout(resolve, 400))
  }
}

/**
 * この録音（サンプリング周波数）で選べる圧縮形式。
 * AAC はブラウザ / OS のエンコーダー次第なので実際に問い合わせる。
 */
export async function probeCodecSupport(
  format: 'opus' | 'aac',
  sampleRate: number,
  numberOfChannels: number,
  bitrate: number,
): Promise<boolean> {
  if (typeof AudioEncoder === 'undefined') return false
  try {
    const support = await AudioEncoder.isConfigSupported({
      codec: format === 'opus' ? 'opus' : 'mp4a.40.2',
      sampleRate,
      numberOfChannels,
      bitrate,
    })
    return support.supported === true
  } catch {
    return false
  }
}
