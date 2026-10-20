/**
 * Web会議レコーダーが使う、TypeScript の lib.dom にまだ載っていない
 * （または worker 用 lib にしか無い）ブラウザ API の型。
 * どれも Chromium で実装済みのものだけを、実際に使う面に限って宣言している。
 * 実行時には support.ts で存在を確かめてから使う。
 *
 * import / export を持たないスクリプト形式の .d.ts なので、ここの interface は
 * そのまま lib.dom のグローバル宣言にマージされる。
 */

/** OPFS の同期アクセスハンドル（Dedicated Worker 内でのみ使える） */
interface FileSystemSyncAccessHandle {
  read: (buffer: AllowSharedBufferSource, options?: { at?: number }) => number
  write: (buffer: AllowSharedBufferSource, options?: { at?: number }) => number
  truncate: (newSize: number) => void
  getSize: () => number
  flush: () => void
  close: () => void
}

interface FileSystemFileHandle {
  createSyncAccessHandle: () => Promise<FileSystemSyncAccessHandle>
}

/** lib.dom.asynciterable を入れていないので、使う反復だけ足す */
interface FileSystemDirectoryHandle {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>
}

type FilePickerStartIn =
  'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos'

interface SaveFilePickerOptions {
  suggestedName?: string
  id?: string
  startIn?: FilePickerStartIn
  types?: Array<{
    description?: string
    accept: Record<string, Array<string>>
  }>
}

interface DirectoryPickerOptions {
  id?: string
  mode?: 'read' | 'readwrite'
  startIn?: FilePickerStartIn
}

interface Window {
  showSaveFilePicker?: (
    options?: SaveFilePickerOptions,
  ) => Promise<FileSystemFileHandle>
  showDirectoryPicker?: (
    options?: DirectoryPickerOptions,
  ) => Promise<FileSystemDirectoryHandle>
}

/** Screen Capture の Chromium 拡張オプション */
interface DisplayMediaStreamOptions {
  systemAudio?: 'include' | 'exclude'
  selfBrowserSurface?: 'include' | 'exclude'
  surfaceSwitching?: 'include' | 'exclude'
  preferCurrentTab?: boolean
}

interface MediaTrackConstraintSet {
  suppressLocalAudioPlayback?: ConstrainBoolean
}

interface MediaTrackSupportedConstraints {
  suppressLocalAudioPlayback?: boolean
}

/** WebCodecs Opus Registration の音声向けヒント（未対応ブラウザは無視する） */
interface OpusEncoderConfig {
  application?: 'voip' | 'audio' | 'lowdelay'
  signal?: 'auto' | 'music' | 'voice'
}
