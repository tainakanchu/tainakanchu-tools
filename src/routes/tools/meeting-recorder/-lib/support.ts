/**
 * ブラウザ対応の判定。
 * 必要なのは「タブ/システム音声のキャプチャ」「AudioWorklet」「OPFS」「WebCodecs の
 * AudioEncoder」の 4 つで、現状そろっているのはデスクトップ版の Chromium 系
 * （Chrome / Edge など）だけ。Firefox / Safari は getDisplayMedia で音声を取れない。
 */

export type SupportCheck = {
  ok: boolean
  /** 足りない機能の日本語ラベル */
  missing: Array<string>
}

export function checkSupport(): SupportCheck {
  if (typeof window === 'undefined') return { ok: false, missing: [] }
  const missing: Array<string> = []
  const media = 'mediaDevices' in navigator ? navigator.mediaDevices : null

  if (!media || typeof media.getDisplayMedia !== 'function') {
    missing.push('画面共有（getDisplayMedia）')
  } else if (!media.getSupportedConstraints().suppressLocalAudioPlayback) {
    // 「共有した音声を取れるか」は直接は調べられない。タブ音声キャプチャと
    // 同時期に Chromium だけが実装した制約の有無を目安にする
    missing.push('タブ / システム音声のキャプチャ')
  }
  if (typeof AudioWorkletNode === 'undefined') missing.push('AudioWorklet')
  if (typeof AudioEncoder === 'undefined') {
    missing.push('音声エンコーダー（WebCodecs）')
  }
  if (
    !('storage' in navigator) ||
    typeof navigator.storage.getDirectory !== 'function'
  ) {
    missing.push('ブラウザ内ストレージ（OPFS）')
  }
  if (typeof Worker === 'undefined') missing.push('Web Worker')
  return { ok: missing.length === 0, missing }
}

export function hasSaveFilePicker(): boolean {
  return typeof window.showSaveFilePicker === 'function'
}

export function hasDirectoryPicker(): boolean {
  return typeof window.showDirectoryPicker === 'function'
}
