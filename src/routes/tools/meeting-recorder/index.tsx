import { useCallback, useEffect, useRef, useState } from 'react'
import { createFileRoute, useBlocker } from '@tanstack/react-router'
import { ShieldCheck } from 'lucide-react'
import { getToolMeta, toolPageTitle } from '../../../lib/site-meta'
import { DEFAULT_SAMPLE_RATE } from '../../../lib/meeting-recorder/session'
import { CaptureGraph, Recorder } from './-lib/audio-graph'
import {
  DEFAULT_MIC_OPTIONS,
  describeCaptureError,
  listMicDevices,
  requestDisplayAudio,
  requestMic,
  stopStream,
} from './-lib/capture'
import {
  clearExportTemp,
  deleteSession,
  listSessions,
  requestPersistence,
  storageInfo,
} from './-lib/sessions'
import { checkSupport } from './-lib/support'
import { errorClass } from './-lib/styles'
import { RecordingSection } from './-components/RecordingSection'
import { SessionsSection } from './-components/SessionsSection'
import { SetupSection } from './-components/SetupSection'
import type { RecordingSampleRate } from '../../../lib/meeting-recorder/session'
import type { MicOptions } from './-lib/capture'
import type { SessionSummary, StorageInfo } from './-lib/sessions'
import type { SetupPhase } from './-components/SetupSection'

// head() と静的 OG HTML で同じ文言を使うため site-meta を単一ソースにする
const tool = getToolMeta('meeting-recorder')!

export const Route = createFileRoute('/tools/meeting-recorder/')({
  head: () => ({
    meta: [
      { title: toolPageTitle(tool.name) },
      { name: 'description', content: tool.description },
    ],
  }),
  component: MeetingRecorderPage,
})

type Phase = SetupPhase | 'recording' | 'stopping'

type Analysers = { mic: AnalyserNode | null; system: AnalyserNode | null }

function MeetingRecorderPage() {
  const [support] = useState(checkSupport)
  const [phase, setPhase] = useState<Phase>('idle')
  const [sampleRate, setSampleRate] =
    useState<RecordingSampleRate>(DEFAULT_SAMPLE_RATE)
  const [micOptions, setMicOptions] = useState<MicOptions>(DEFAULT_MIC_OPTIONS)
  const [micDevices, setMicDevices] = useState<
    Array<{ deviceId: string; label: string }>
  >([])
  const [analysers, setAnalysers] = useState<Analysers>({
    mic: null,
    system: null,
  })
  const [sourceLabel, setSourceLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [displayEnded, setDisplayEnded] = useState(false)
  const [micEnded, setMicEnded] = useState(false)
  const [startedAt, setStartedAt] = useState(0)
  const [saved, setSaved] = useState({ durationSamples: 0, bytes: 0 })
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [sessions, setSessions] = useState<Array<SessionSummary> | null>(null)
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)

  const graphRef = useRef<CaptureGraph | null>(null)
  const displayRef = useRef<MediaStream | null>(null)
  const micRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<Recorder | null>(null)

  const recording = phase === 'recording' || phase === 'stopping'

  const refreshSessions = useCallback(async () => {
    try {
      const [list, info] = await Promise.all([listSessions(), storageInfo()])
      setSessions(list)
      setStorage(info)
    } catch {
      setSessions([])
    }
  }, [])

  useEffect(() => {
    if (!support.ok) return
    void refreshSessions()
    // 前回のダウンロード用一時ファイルが残っていれば片付ける
    void clearExportTemp()
  }, [support.ok, refreshSessions])

  // 録音中は容量の目安と一覧（録音中セッションの長さ）を数秒ごとに更新する
  useEffect(() => {
    if (!recording) return
    const id = window.setInterval(() => void refreshSessions(), 5000)
    return () => window.clearInterval(id)
  }, [recording, refreshSessions])

  // 録音中にページを離れようとしたら止める（リロード / タブを閉じるも含む）
  useBlocker({
    shouldBlockFn: () =>
      recording &&
      !window.confirm(
        '録音中です。ページを移動すると録音を停止します。よろしいですか？',
      ),
    enableBeforeUnload: () => recording,
  })

  /** 共有・マイク・グラフを全部片付ける（録音は別途止めておくこと） */
  const releaseCapture = useCallback(() => {
    stopStream(displayRef.current)
    stopStream(micRef.current)
    displayRef.current = null
    micRef.current = null
    const graph = graphRef.current
    graphRef.current = null
    void graph?.dispose()
    setAnalysers({ mic: null, system: null })
    setSourceLabel(null)
    setDisplayEnded(false)
    setMicEnded(false)
  }, [])

  // ページを離れたら、録音中でも最後まで書き切ってから片付ける
  useEffect(
    () => () => {
      const recorder = recorderRef.current
      recorderRef.current = null
      if (recorder) {
        void recorder.stop().finally(releaseCapture)
      } else {
        releaseCapture()
      }
    },
    [releaseCapture],
  )

  const attachDisplay = (graph: CaptureGraph, stream: MediaStream) => {
    stopStream(displayRef.current)
    displayRef.current = stream
    graph.setSystemStream(stream)
    const track = stream.getAudioTracks()[0]
    setSourceLabel(track.label || null)
    setDisplayEnded(false)
    track.addEventListener('ended', () => {
      // 差し替え済みの古いトラックの終了は無視する
      if (displayRef.current === stream) setDisplayEnded(true)
    })
  }

  const attachMic = async (graph: CaptureGraph, options: MicOptions) => {
    const stream = await requestMic(options)
    stopStream(micRef.current)
    micRef.current = stream
    graph.setMicStream(stream)
    setMicEnded(false)
    stream.getAudioTracks()[0]?.addEventListener('ended', () => {
      if (micRef.current === stream) setMicEnded(true)
    })
    // 許可が取れたのでラベル付きの一覧に更新する
    setMicDevices(await listMicDevices())
  }

  const handleShare = async () => {
    setError(null)
    // AudioContext と getDisplayMedia はクリックの同期部分で呼ぶ（ユーザー操作扱いにするため）
    const graph = new CaptureGraph(sampleRate)
    graphRef.current = graph
    setPhase('preparing')
    try {
      attachDisplay(graph, await requestDisplayAudio())
    } catch (e) {
      setError(describeCaptureError(e, 'display'))
      releaseCapture()
      setPhase('idle')
      return
    }
    try {
      await attachMic(graph, micOptions)
    } catch (e) {
      setError(describeCaptureError(e, 'mic'))
      releaseCapture()
      setPhase('idle')
      return
    }
    if (graph.context.state === 'suspended') await graph.context.resume()
    setAnalysers({ mic: graph.micAnalyser, system: graph.systemAnalyser })
    setPhase('ready')
  }

  const handleReshare = async () => {
    const graph = graphRef.current
    if (!graph) return
    setError(null)
    try {
      attachDisplay(graph, await requestDisplayAudio())
    } catch (e) {
      // 失敗しても元の共有（または終了済みの状態）のまま続ける
      setError(describeCaptureError(e, 'display'))
    }
  }

  const handleMicOptionsChange = async (next: MicOptions) => {
    setMicOptions(next)
    const graph = graphRef.current
    if (!graph) return
    try {
      await attachMic(graph, next)
    } catch (e) {
      setError(describeCaptureError(e, 'mic'))
    }
  }

  const handleStart = async () => {
    const graph = graphRef.current
    if (!graph) return
    setError(null)
    setPhase('starting')
    void requestPersistence()
    try {
      const recorder = await Recorder.start(
        graph,
        {
          micLabel: micRef.current?.getAudioTracks()[0]?.label || undefined,
          sourceLabel: sourceLabel ?? undefined,
        },
        {
          onStats: setSaved,
          onError: (message) => {
            setError(message)
            // 書き込めなくなったら録音を続けても意味がないので止める
            void handleStopRef.current()
          },
        },
      )
      recorderRef.current = recorder
      setSaved({ durationSamples: 0, bytes: 0 })
      setStartedAt(Date.now())
      setPhase('recording')
      void refreshSessions()
    } catch (e) {
      setError(
        `録音を開始できませんでした: ${e instanceof Error ? e.message : String(e)}`,
      )
      setPhase('ready')
    }
  }

  const handleStop = async () => {
    const recorder = recorderRef.current
    if (!recorder) return
    recorderRef.current = null
    setPhase('stopping')
    try {
      const meta = await recorder.stop()
      setOpenSessionId(meta.id)
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : String(e)}。録音は「中断（復元可能）」として一覧に残っています。`,
      )
      setOpenSessionId(recorder.meta.id)
    }
    releaseCapture()
    setPhase('idle')
    await refreshSessions()
  }
  // onError から最新の handleStop を呼ぶための参照
  const handleStopRef = useRef(handleStop)
  handleStopRef.current = handleStop

  const handleDelete = async (id: string) => {
    try {
      await deleteSession(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    await refreshSessions()
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 text-gray-900 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold sm:text-3xl">{tool.name}</h1>
        <p className="text-sm text-gray-600">
          イヤホンで会議に出たまま、
          <strong className="font-semibold text-gray-800">
            相手の音声（タブ / システム音声）と自分のマイクを左右別のチャンネル
          </strong>
          で録音します。書き出しは文字起こしに向いた軽量な Opus が既定です。
        </p>
        <p className="flex items-start gap-1.5 rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <ShieldCheck
            size={14}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-gray-500"
          />
          <span>
            録音・書き出しはすべて
            <strong className="font-semibold text-gray-800">
              このブラウザの中だけ
            </strong>
            で行い、音声がサーバーへ送られることはありません。
          </span>
        </p>
      </header>

      {!support.ok ? (
        <div role="alert" className={`${errorClass} mt-6 space-y-2`}>
          <p className="font-semibold">
            このブラウザでは使えません。パソコン版の Chrome または Edge
            で開いてください。
          </p>
          {support.missing.length > 0 && (
            <p className="text-xs">
              足りない機能: {support.missing.join('、')}
            </p>
          )}
          <p className="text-xs">
            Firefox と Safari は画面共有で音声を取得できないため対象外です。
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {recording ? (
            <RecordingSection
              startedAt={startedAt}
              savedSeconds={
                saved.durationSamples /
                (graphRef.current?.sampleRate ?? sampleRate)
              }
              savedBytes={saved.bytes}
              storage={storage}
              stopping={phase === 'stopping'}
              displayEnded={displayEnded}
              micEnded={micEnded}
              error={error}
              micOptions={micOptions}
              micDevices={micDevices}
              onMicOptionsChange={(next) => void handleMicOptionsChange(next)}
              micAnalyser={analysers.mic}
              systemAnalyser={analysers.system}
              onReshare={() => void handleReshare()}
              onStop={() => void handleStop()}
            />
          ) : (
            <SetupSection
              phase={phase}
              sampleRate={sampleRate}
              onSampleRateChange={setSampleRate}
              micOptions={micOptions}
              micDevices={micDevices}
              onMicOptionsChange={(next) => void handleMicOptionsChange(next)}
              micAnalyser={analysers.mic}
              systemAnalyser={analysers.system}
              sourceLabel={sourceLabel}
              error={error}
              onShare={() => void handleShare()}
              onReshare={() => void handleReshare()}
              onCancel={() => {
                releaseCapture()
                setPhase('idle')
              }}
              onStart={() => void handleStart()}
            />
          )}

          <SessionsSection
            sessions={sessions}
            storage={storage}
            openId={openSessionId}
            onOpenChange={setOpenSessionId}
            onRefresh={() => void refreshSessions()}
            onDelete={(id) => void handleDelete(id)}
          />
        </div>
      )}
    </main>
  )
}
