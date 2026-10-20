/**
 * 録音パイプライン（メインスレッド / AudioWorklet / 書き込みワーカー）の
 * メッセージ型と共有定数。
 *
 *   AudioWorklet ──(MessageChannel: PCM バッチ)──▶ opfs-writer ワーカー
 *        ▲                                              │
 *        └── start / stop ── メインスレッド ◀── 進捗 ──┘
 *
 * PCM はメインスレッドを経由させない。UI が重くなっても録音が途切れないように。
 */
import type { SessionMeta } from '../../../../lib/meeting-recorder/session'

/** registerProcessor / new AudioWorkletNode で使う名前 */
export const RECORDER_PROCESSOR_NAME = 'meeting-recorder-processor'

/** メイン → AudioWorklet（node.port） */
export type WorkletCommand =
  { type: 'start'; port: MessagePort; batchFrames: number } | { type: 'stop' }

/** AudioWorklet → 書き込みワーカー（MessageChannel） */
export type PcmMessage =
  /** Int16 インターリーブ・ステレオ（L=マイク / R=相手） */
  { type: 'pcm'; buffer: ArrayBuffer } | { type: 'end' }

/** メイン → 書き込みワーカー */
export type WriterCommand = {
  type: 'open'
  meta: SessionMeta
  port: MessagePort
}

/** 書き込みワーカー → メイン */
export type WriterEvent =
  | { type: 'opened' }
  | { type: 'stats'; durationSamples: number; bytes: number }
  | { type: 'closed'; meta: SessionMeta }
  | { type: 'error'; message: string }
