/**
 * 録音の音声グラフ。
 *
 *   マイク MediaStreamSource ─┬─▶ Analyser（メーター）
 *                             └─▶ ChannelMerger 入力0（L）
 *   共有音声 MediaStreamSource ┬─▶ Analyser（メーター）
 *                             └─▶ ChannelMerger 入力1（R）
 *   ChannelMerger ─▶ AudioWorklet（PCM 化）─▶ Gain(0) ─▶ destination
 *
 * Merger の各入力はモノラルへ自動でダウンミックスされる（channelCount=1 固定）。
 * Worklet の出力は無音の Gain を挟んで destination に繋ぐ。destination に
 * 繋がっていないとレンダリング対象から外れることがあるので確実に回すため。
 * 音そのものは鳴らさない（イヤホンの相手の声が二重に聞こえる・ハウリングを防ぐ）。
 *
 * AudioContext は「共有」ボタンのクリック内で作る（自動再生ポリシーで止められないよう）。
 */
import {
  createSessionId,
  createSessionMeta,
} from '../../../../lib/meeting-recorder/session'
import { RECORDER_PROCESSOR_NAME } from './protocol'
// oxlint-disable-next-line import/default -- Vite の ?worker&url は vite/client の型宣言で default export を持つが、oxlint の import 解決はクエリ付き specifier を辿れない
import workletUrl from './recorder.worklet.ts?worker&url'
import type { SessionMeta } from '../../../../lib/meeting-recorder/session'
import type { WriterCommand, WriterEvent } from './protocol'

/** Worklet → ワーカーへ送るバッチの長さ（秒）。短いほどクラッシュ時に失う量が減る */
const BATCH_SECONDS = 0.5

function createAnalyser(context: AudioContext): AnalyserNode {
  const analyser = context.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0
  return analyser
}

export class CaptureGraph {
  readonly context: AudioContext
  readonly micAnalyser: AnalyserNode
  readonly systemAnalyser: AnalyserNode
  private readonly merger: ChannelMergerNode
  private micSource: MediaStreamAudioSourceNode | null = null
  private systemSource: MediaStreamAudioSourceNode | null = null

  /** ユーザー操作のハンドラ内から同期的に呼ぶこと */
  constructor(sampleRate: number) {
    this.context = new AudioContext({ sampleRate, latencyHint: 'interactive' })
    this.merger = this.context.createChannelMerger(2)
    this.micAnalyser = createAnalyser(this.context)
    this.systemAnalyser = createAnalyser(this.context)
  }

  get sampleRate(): number {
    return this.context.sampleRate
  }

  setMicStream(stream: MediaStream) {
    this.micSource?.disconnect()
    const source = this.context.createMediaStreamSource(stream)
    source.connect(this.micAnalyser)
    source.connect(this.merger, 0, 0)
    this.micSource = source
  }

  setSystemStream(stream: MediaStream) {
    this.systemSource?.disconnect()
    const source = this.context.createMediaStreamSource(stream)
    source.connect(this.systemAnalyser)
    source.connect(this.merger, 0, 1)
    this.systemSource = source
  }

  /** Merger の出力を録音ノードへ繋ぐ */
  connectRecorder(node: AudioNode) {
    this.merger.connect(node)
  }

  async dispose() {
    this.micSource?.disconnect()
    this.systemSource?.disconnect()
    this.merger.disconnect()
    if (this.context.state !== 'closed') await this.context.close()
  }
}

export type RecorderCallbacks = {
  onStats: (stats: { durationSamples: number; bytes: number }) => void
  onError: (message: string) => void
}

/** 停止後、書き込みワーカーの完了報告を待つ上限（ミリ秒） */
const CLOSE_TIMEOUT_MS = 10_000

/**
 * 1 回の録音（= 1 セッション）。AudioWorklet と書き込みワーカーを束ねる。
 */
export class Recorder {
  readonly meta: SessionMeta
  private readonly worker: Worker
  private node: AudioWorkletNode | null = null
  private sink: GainNode | null = null
  private closed: Promise<SessionMeta>
  private resolveClosed: (meta: SessionMeta) => void = () => {}

  private constructor(
    private readonly graph: CaptureGraph,
    meta: SessionMeta,
    private readonly callbacks: RecorderCallbacks,
  ) {
    this.meta = meta
    this.worker = new Worker(
      new URL('./opfs-writer.worker.ts', import.meta.url),
      { type: 'module' },
    )
    this.closed = new Promise((resolve) => {
      this.resolveClosed = resolve
    })
  }

  static async start(
    graph: CaptureGraph,
    labels: { micLabel?: string; sourceLabel?: string },
    callbacks: RecorderCallbacks,
  ): Promise<Recorder> {
    const now = new Date()
    const meta = createSessionMeta({
      id: createSessionId(now, Math.random),
      createdAt: now,
      sampleRate: graph.sampleRate,
      ...labels,
    })
    const recorder = new Recorder(graph, meta, callbacks)
    try {
      await recorder.begin()
    } catch (error) {
      recorder.teardown()
      throw error
    }
    return recorder
  }

  private async begin() {
    const { context } = this.graph
    await context.audioWorklet.addModule(workletUrl)
    if (context.state === 'suspended') await context.resume()

    const opened = new Promise<void>((resolve, reject) => {
      this.worker.addEventListener(
        'message',
        (event: MessageEvent<WriterEvent>) => {
          const data = event.data
          if (data.type === 'opened') resolve()
          else if (data.type === 'stats') this.callbacks.onStats(data)
          else if (data.type === 'closed') this.resolveClosed(data.meta)
          else {
            reject(new Error(data.message))
            this.callbacks.onError(data.message)
          }
        },
      )
      this.worker.addEventListener('error', (event) => {
        const message = `書き込みワーカーでエラーが発生しました: ${event.message}`
        reject(new Error(message))
        this.callbacks.onError(message)
      })
    })

    const channel = new MessageChannel()
    const openCommand: WriterCommand = {
      type: 'open',
      meta: this.meta,
      port: channel.port2,
    }
    this.worker.postMessage(openCommand, [channel.port2])
    await opened

    const node = new AudioWorkletNode(context, RECORDER_PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
    })
    const sink = context.createGain()
    sink.gain.value = 0
    node.connect(sink)
    sink.connect(context.destination)
    this.graph.connectRecorder(node)
    this.node = node
    this.sink = sink

    node.port.postMessage(
      {
        type: 'start',
        port: channel.port1,
        batchFrames: Math.round(context.sampleRate * BATCH_SECONDS),
      },
      [channel.port1],
    )
  }

  /** 停止して OPFS への書き込み完了を待つ。完了した meta を返す */
  async stop(): Promise<SessionMeta> {
    this.node?.port.postMessage({ type: 'stop' }, [])
    const timeout = new Promise<SessionMeta>((_, reject) =>
      window.setTimeout(
        () => reject(new Error('録音データの保存完了を確認できませんでした')),
        CLOSE_TIMEOUT_MS,
      ),
    )
    try {
      return await Promise.race([this.closed, timeout])
    } finally {
      this.teardown()
    }
  }

  private teardown() {
    this.node?.disconnect()
    this.sink?.disconnect()
    this.node = null
    this.sink = null
    this.worker.terminate()
  }
}
