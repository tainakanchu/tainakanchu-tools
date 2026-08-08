/**
 * 台湾入国カードメーカー。
 *
 * 台湾のオンライン入国カード(TWAC)には、複数人ぶんをまとめて登録できる
 * 公式の一括アップロード用 Excel テンプレートがある。このツールは、そのテンプレートを
 * Web フォームで埋めて、**公式テンプレートと構造が完全に一致する xlsx** を
 * ダウンロードできるようにするもの。
 *
 * 3 つの前提でできている:
 * 1. 旅程は同行者全員で共有する(同じ便で入国し、同じ宿に泊まる)。
 *    人別に入力するのは個人情報だけ。
 * 2. AI はアプリに組み込まない。プロンプトをコピーして各自の AI に投げ、
 *    返ってきた JSON を貼り付けて取り込む(-lib/aiPrompt.ts の方針)。
 * 3. 入力内容はこの端末の localStorage にしか残さない。どこにも送らない。
 */

import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Download,
  ExternalLink,
  FileSpreadsheet,
  ShieldCheck,
  TriangleAlert,
  UserPlus,
  Users,
} from 'lucide-react'
import { getToolMeta, toolPageTitle } from '../../../lib/site-meta'
import { AiImportPanel } from './-components/AiImportPanel'
import { DataLists } from './-components/Fields'
import { TravelerCard } from './-components/TravelerCard'
import { TripForm } from './-components/TripForm'
import { todayISO } from './-lib/format'
import { applyPastTrip, isPristineTrip, pushPastTrip } from './-lib/pastTrips'
import {
  SAVE_DEBOUNCE_MS,
  clearState,
  createEmptyTraveler,
  createEmptyTrip,
  createInitialState,
  loadState,
  saveState,
} from './-lib/storage'
import {
  cardClass,
  dangerButtonClass,
  primaryButtonClass,
  sectionTitleClass,
  subtleButtonClass,
} from './-lib/styles'
import { TWAC_OFFICIAL_URL, TWAC_SCAM_NOTE } from './-lib/twac'
import { MAX_TRAVELERS } from './-lib/types'
import { collectWarnings } from './-lib/warnings'
import { fillTemplate } from './-lib/xlsx'
import type {
  ArrivalCardState,
  PastTrip,
  Traveler,
  TripInfo,
} from './-lib/types'

// head() と静的 OG HTML で同じ文言を使うため site-meta を単一ソースにする
const tool = getToolMeta('taiwan-arrival-card')!

/**
 * 公式テンプレートの置き場所。
 * オフラインでも書き出せるよう、vite.config.ts の includeAssets で
 * precache に名指しで載せてある。
 */
const TEMPLATE_URL = '/assets/taiwan-arrival-card/template.xlsx'

/**
 * ObjectURL を無効化するまでの待ち時間。
 * click の直後に revoke するとブラウザがダウンロードを始める前に URL が
 * 消えることがあるので、次のタスク以降まで生かしておく。
 */
const REVOKE_DELAY_MS = 1000

export const Route = createFileRoute('/tools/taiwan-arrival-card/')({
  head: () => ({
    meta: [
      { title: toolPageTitle(tool.name) },
      { name: 'description', content: tool.description },
    ],
  }),
  component: TaiwanArrivalCardPage,
})

/**
 * TWAC 公式サイトへの外部リンク。URL は -lib/twac.ts の 1 か所にまとめてある。
 * 偽サイト対策として、リンクの近くには必ず TWAC_SCAM_NOTE を添える
 * (この部品を使えば添え忘れない)。
 */
function TwacOfficialLink({ label }: { label: string }) {
  return (
    <a
      href={TWAC_OFFICIAL_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-semibold text-cyan-700 underline decoration-cyan-300 underline-offset-2 transition hover:text-cyan-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
    >
      <ExternalLink size={13} aria-hidden="true" />
      {label}
    </a>
  )
}

type DownloadStatus =
  | { tone: 'idle' }
  | { tone: 'ok'; text: string }
  | { tone: 'error'; text: string }

function TaiwanArrivalCardPage() {
  // 初期値は空のまま立ち上げ、保存済みデータの復元は effect で行う。
  // useState の初期化関数で localStorage を読むと、サーバー側レンダリングや
  // localStorage の無い環境で落ちる
  const [state, setState] = useState<ArrivalCardState>(createInitialState)
  const [restored, setRestored] = useState(false)
  // 保存データが読めず、生データを退避キーに逃がしたか(storage.ts の loadState)
  const [rescued, setRescued] = useState(false)
  const [download, setDownload] = useState<DownloadStatus>({ tone: 'idle' })
  const [busy, setBusy] = useState(false)
  // 復元が終わる前に保存すると、空の初期状態で保存済みデータを潰してしまう
  const canSaveRef = useRef(false)
  // 保存待ちの最新状態。ページを閉じられたときに書き出すために持つ
  const pendingRef = useRef<ArrivalCardState | null>(null)

  useEffect(() => {
    const result = loadState()
    if (result.state !== null) setState(result.state)
    canSaveRef.current = true
    setRestored(result.state !== null)
    setRescued(result.rescued)
  }, [])

  // 1 文字打つたびに書き出す必要はないのでデバウンスする
  useEffect(() => {
    if (!canSaveRef.current) return
    pendingRef.current = state
    const timer = window.setTimeout(() => {
      saveState(state)
      pendingRef.current = null
    }, SAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [state])

  /*
    ページを離れるときに、デバウンス待ちの内容を取りこぼさない。

    最後の 1 文字を打った直後にタブを閉じたりアプリを切り替えたりすると、
    500ms のタイマーが発火する前にページが破棄され、その入力は消える。
    パスポート番号を打ち終えた直後がまさにその瞬間になりやすい。

    beforeunload ではなく pagehide と visibilitychange を使うのは、モバイルの
    ブラウザが「タブを閉じる」ではなく「バックグラウンドに送る」形でページを
    捨てることがあり、そちらでは beforeunload が呼ばれないため。
  */
  useEffect(() => {
    const flush = (): void => {
      const pending = pendingRef.current
      if (pending === null) return
      saveState(pending)
      pendingRef.current = null
    }
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  const updateTrip = useCallback(
    <K extends keyof TripInfo>(key: K, value: TripInfo[K]) => {
      setState((prev) => ({ ...prev, trip: { ...prev.trip, [key]: value } }))
    },
    [],
  )

  const updateTraveler = useCallback(
    <K extends keyof Traveler>(id: string, key: K, value: Traveler[K]) => {
      setState((prev) => ({
        ...prev,
        travelers: prev.travelers.map((traveler) =>
          traveler.id === id ? { ...traveler, [key]: value } : traveler,
        ),
      }))
    },
    [],
  )

  const addTraveler = useCallback(() => {
    setState((prev) =>
      prev.travelers.length >= MAX_TRAVELERS
        ? prev
        : { ...prev, travelers: [...prev.travelers, createEmptyTraveler()] },
    )
  }, [])

  const removeTraveler = useCallback((id: string) => {
    setState((prev) => {
      const travelers = prev.travelers.filter((traveler) => traveler.id !== id)
      // 全員消えると何も入力できない画面になるので、最後の 1 人は空の行に戻す
      return {
        ...prev,
        travelers: travelers.length > 0 ? travelers : [createEmptyTraveler()],
      }
    })
  }, [])

  /**
   * 旅程だけを消す。捨てる前に履歴へ退避しておく。
   * 「次の旅行のために消したい、でも便名や宿は同じ」は普通に起きるので、
   * クリアが取り返しのつかない操作にならないようにする
   */
  const clearTripOnly = useCallback(() => {
    setState((prev) => ({
      ...prev,
      trip: createEmptyTrip(),
      pastTrips: isPristineTrip(prev.trip)
        ? prev.pastTrips
        : pushPastTrip(prev.pastTrips, prev.trip),
    }))
    setDownload({
      tone: 'ok',
      text: '旅程をクリアしました(内容は「過去の旅程からコピー」に残しています)。',
    })
  }, [])

  /**
   * 履歴を現在の旅程に写す。入国日と出国日は applyPastTrip が空にする
   * (前回の日付のまま書き出す事故を防ぐため。理由は -lib/pastTrips.ts)
   */
  const handleApplyPastTrip = useCallback(
    (past: PastTrip) => {
      // confirm は setState の更新関数の中では出さない。React は開発時に
      // 更新関数を 2 回呼ぶことがあり、確認ダイアログが 2 回出てしまう
      if (
        !isPristineTrip(state.trip) &&
        !window.confirm(
          'いま入力されている旅程を、選んだ過去の旅程で置き換えます。よろしいですか?',
        )
      ) {
        return
      }
      setState((prev) => ({ ...prev, trip: applyPastTrip(past) }))
      setDownload({
        tone: 'ok',
        text: '過去の旅程をコピーしました。入国日と出国予定日だけは入力し直してください。',
      })
    },
    [state.trip],
  )

  const clearAll = useCallback(() => {
    if (
      !window.confirm(
        'パスポート番号を含むすべての入力内容をこの端末から削除します。元に戻せません。よろしいですか?',
      )
    ) {
      return
    }
    clearState()
    setState(createInitialState())
    setRestored(false)
    // 退避データも clearState が消しているので、その案内も引っ込める
    setRescued(false)
    setDownload({ tone: 'ok', text: 'すべての入力内容を削除しました。' })
  }, [])

  const warnings = useMemo(() => collectWarnings(state), [state])

  const handleDownload = useCallback(async () => {
    setBusy(true)
    setDownload({ tone: 'idle' })
    try {
      const response = await fetch(TEMPLATE_URL)
      if (!response.ok) {
        throw new Error(
          `テンプレートを取得できませんでした (${response.status})`,
        )
      }
      const template = new Uint8Array(await response.arrayBuffer())
      /*
        取れたのが本当に xlsx か確かめる。SPA のホスティングは知らないパスに
        index.html を返すのが普通で、テンプレートが配置されていなくても
        fetch は 200 で成功する。そのまま unzip に渡すと
        「Invalid zip data」のような英語の例外が出るだけで、
        利用者には何が起きたのか分からない。
        zip は必ず 'PK' で始まるので、そこだけ見れば取り違えは判別できる。
      */
      if (template[0] !== 0x50 || template[1] !== 0x4b) {
        throw new Error(
          'テンプレートファイルを読み込めませんでした。ページを再読み込みしてから、もう一度お試しください。',
        )
      }
      const filled = fillTemplate(template, state.trip, state.travelers)
      // Blob は SharedArrayBuffer に載った Uint8Array を受け付けないので、
      // 素の ArrayBuffer に載せ直してから渡す。型を騙して通すより、
      // 実際に載せ替えるほうが実行時の挙動と型が一致する
      const bytes = new Uint8Array(new ArrayBuffer(filled.byteLength))
      bytes.set(filled)
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      /*
        ダウンロードの起動。anchor を DOM に入れてから click し、
        revoke は次のタスクまで待つ。

        Safari は「文書に繋がっていない a 要素」の click を無視することがあり、
        また click の直後に同期で revokeObjectURL すると、ダウンロードが
        始まる前に URL が無効になって**何も起きずに終わる**。
        エラーも出ないので利用者にはボタンが壊れているようにしか見えない。
      */
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `台湾入国カード-${todayISO()}.xlsx`
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      window.setTimeout(() => {
        URL.revokeObjectURL(url)
        anchor.remove()
      }, REVOKE_DELAY_MS)
      // 書き出せた旅程だけを履歴に残す。ここまで来た旅程は実際に使われたもので、
      // 次の旅行の下書きとしていちばん役に立つ
      setState((prev) => ({
        ...prev,
        pastTrips: pushPastTrip(prev.pastTrips, prev.trip),
      }))
      setDownload({
        tone: 'ok',
        text: `${state.travelers.length}名ぶんの Excel を書き出しました。`,
      })
    } catch (error) {
      setDownload({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Excel の書き出しに失敗しました。',
      })
    } finally {
      setBusy(false)
    }
  }, [state])

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 text-gray-900 sm:px-6">
      <DataLists />

      <header className="space-y-2">
        <h1 className="text-2xl font-bold sm:text-3xl">{tool.name}</h1>
        <p className="text-sm text-gray-600">
          <TwacOfficialLink label="TWAC 公式サイト" />
          (台湾のオンライン入国カード)の
          <strong className="font-semibold text-gray-800">
            一括アップロード用 Excel
          </strong>
          を作ります。旅程は同行者全員で共有し、個人情報だけ人ごとに入力します(最大
          {MAX_TRAVELERS}名)。
        </p>
        <p className="text-xs text-amber-700">{TWAC_SCAM_NOTE}</p>
        <p className="flex items-start gap-1.5 rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <ShieldCheck
            size={14}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-gray-500"
          />
          <span>
            入力内容(パスポート番号・住所を含む)は
            <strong className="font-semibold text-gray-800">
              この端末のブラウザ内にのみ保存され、どこにも送信されません。
            </strong>
            Excel
            の生成もブラウザの中だけで完結します。共用のパソコンで使った場合は、
            下の「すべての入力内容を削除」で消してください。
          </span>
        </p>
        {restored && (
          <p className="text-xs text-gray-500">
            前回の入力内容をこの端末から復元しました。
          </p>
        )}
        {rescued && (
          <p
            role="status"
            className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          >
            前回の入力内容を読み取れなかったため、空の状態で開いています。
            <strong className="font-semibold">
              読めなかったデータは消さずに
            </strong>
            このブラウザの保存領域(キー
            <code className="mx-1 rounded bg-amber-100 px-1">
              taiwan-arrival-card:v1:backup
            </code>
            )へ退避してあります。「すべての入力内容を削除」を押すと、退避したぶんも
            まとめて消えます。
          </p>
        )}
      </header>

      <div className="mt-6 space-y-6">
        {/* 更新関数をそのまま渡す。取り込みは押した瞬間の state に当てる
          (AiImportPanel の onApply のコメント参照) */}
        <AiImportPanel state={state} onApply={setState} />

        <TripForm
          trip={state.trip}
          onChange={updateTrip}
          pastTrips={state.pastTrips}
          onApplyPastTrip={handleApplyPastTrip}
        />

        <section className={cardClass}>
          <h2 className={sectionTitleClass}>
            <Users size={18} aria-hidden="true" className="text-cyan-600" />
            旅行者({state.travelers.length} / {MAX_TRAVELERS}名)
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            パスポートの表記どおりに入力してください。次回の旅行でもそのまま使い回せます。
          </p>
          <ul className="mt-4 space-y-4">
            {state.travelers.map((traveler, index) => (
              <TravelerCard
                key={traveler.id}
                traveler={traveler}
                position={index + 1}
                canRemove={state.travelers.length > 1}
                onRemove={() => removeTraveler(traveler.id)}
                onChange={(key, value) =>
                  updateTraveler(traveler.id, key, value)
                }
              />
            ))}
          </ul>
          <div className="mt-4">
            <button
              type="button"
              onClick={addTraveler}
              disabled={state.travelers.length >= MAX_TRAVELERS}
              className={subtleButtonClass}
            >
              <UserPlus size={16} aria-hidden="true" />
              旅行者を追加
            </button>
          </div>
        </section>

        <section className={cardClass}>
          <h2 className={sectionTitleClass}>
            <FileSpreadsheet
              size={18}
              aria-hidden="true"
              className="text-cyan-600"
            />
            Excel を書き出す
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            書き出したファイルは、
            <TwacOfficialLink label="TWAC 公式サイト" />
            の一括アップロード(Excel
            の取り込み)にそのまま読み込めます。公式テンプレートの構造を一切変えずに、
            値だけを入れているためです。
          </p>
          <p className="mt-1 text-xs text-amber-700">{TWAC_SCAM_NOTE}</p>

          {warnings.length > 0 && (
            <details className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
                <TriangleAlert size={15} aria-hidden="true" />
                未入力・確認したい項目({warnings.length}件)
              </summary>
              <p className="mt-2 text-xs text-amber-800">
                書き出しは止めません。TWAC
                側の検証規則をこのツールが完全に写せているとは限らないため、
                最終的な判断は入力した本人に委ねています。
              </p>
              <ul className="mt-2 space-y-1">
                {warnings.map((warning, index) => (
                  <li key={index}>
                    {warning.travelerIndex !== null
                      ? `${warning.travelerIndex + 1}人目: `
                      : '旅程: '}
                    {warning.message}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={busy}
              className={primaryButtonClass}
            >
              <Download size={16} aria-hidden="true" />
              {busy ? '書き出し中…' : 'Excel をダウンロード'}
            </button>
            <button
              type="button"
              onClick={clearTripOnly}
              className={subtleButtonClass}
            >
              旅程だけクリア
            </button>
            <button
              type="button"
              onClick={clearAll}
              className={dangerButtonClass}
            >
              すべての入力内容を削除
            </button>
          </div>

          {download.tone !== 'idle' && (
            <p
              role="status"
              className={`mt-3 rounded-xl px-3 py-2 text-sm ${
                download.tone === 'ok'
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-rose-50 text-rose-800'
              }`}
            >
              {download.text}
            </p>
          )}
        </section>
      </div>
    </main>
  )
}
