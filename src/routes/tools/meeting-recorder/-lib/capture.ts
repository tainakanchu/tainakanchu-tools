/**
 * 入力ストリームの取得（画面共有の音声とマイク）。
 * ここで返すのは MediaStream だけで、音声グラフへのつなぎ込みは audio-graph.ts が持つ。
 */

export class NoDisplayAudioError extends Error {
  constructor() {
    super(
      '共有に音声が含まれていません。もう一度共有し、タブなら「タブの音声も共有」、画面全体なら「システム音声を共有」をオンにしてください。',
    )
    this.name = 'NoDisplayAudioError'
  }
}

/**
 * 会議タブ / 画面の音声を取る。
 * video は API の都合で必須なので最小限で要求し、取れたらすぐ止める（音声だけ残す）。
 * 音声処理（エコー除去など）はすべて切る。相手の声は加工せずそのまま録りたいため。
 */
export async function requestDisplayAudio(): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 1 },
    audio: {
      // 共有中もタブの音はいつも通り聞こえるようにする
      suppressLocalAudioPlayback: false,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    systemAudio: 'include',
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
    preferCurrentTab: false,
  })
  for (const track of stream.getVideoTracks()) {
    track.stop()
    stream.removeTrack(track)
  }
  if (stream.getAudioTracks().length === 0) {
    stopStream(stream)
    throw new NoDisplayAudioError()
  }
  return stream
}

export type MicOptions = {
  /** 空文字は既定のマイク */
  deviceId: string
  echoCancellation: boolean
  noiseSuppression: boolean
  autoGainControl: boolean
}

/**
 * イヤホン前提なので echoCancellation は既定で切る（相手の声がマイクに回り込まない上、
 * エコーキャンセラは自分の声も削りがち）。スピーカーで聞く場合だけオンにする。
 */
export const DEFAULT_MIC_OPTIONS: MicOptions = {
  deviceId: '',
  echoCancellation: false,
  noiseSuppression: true,
  autoGainControl: true,
}

export async function requestMic(options: MicOptions): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
      echoCancellation: options.echoCancellation,
      noiseSuppression: options.noiseSuppression,
      autoGainControl: options.autoGainControl,
    },
    video: false,
  })
}

/** 許可前はラベルが空になるので、そのときは番号で呼ぶ */
export async function listMicDevices(): Promise<
  Array<{ deviceId: string; label: string }>
> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((d) => d.kind === 'audioinput' && d.deviceId !== '')
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `マイク ${i + 1}`,
    }))
}

export function stopStream(stream: MediaStream | null | undefined): void {
  if (!stream) return
  for (const track of stream.getTracks()) track.stop()
}

/** getDisplayMedia / getUserMedia の失敗を利用者向けの文に直す */
export function describeCaptureError(error: unknown, kind: 'display' | 'mic') {
  if (error instanceof NoDisplayAudioError) return error.message
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError') {
    return kind === 'display'
      ? '画面共有がキャンセルされたか、許可されませんでした。'
      : 'マイクの使用が許可されていません。アドレスバーのサイト設定から許可してください。'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return kind === 'display'
      ? '共有できる画面が見つかりませんでした。'
      : '選んだマイクが見つかりません。接続を確認して選び直してください。'
  }
  if (name === 'NotReadableError') {
    return kind === 'display'
      ? '画面共有を開始できませんでした。'
      : 'マイクを開けませんでした。ほかのアプリが使用中の可能性があります。'
  }
  return error instanceof Error ? error.message : String(error)
}
