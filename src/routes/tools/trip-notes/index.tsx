import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useState,
} from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  CalendarDays,
  Download,
  Gauge,
  Redo2,
  Settings,
  Undo2,
  Zap,
} from 'lucide-react'
import { computeSummary } from '../../../lib/trip-notes/derive'
import { getDeviceTz } from '../../../lib/trip-notes/datetime'
import { decodeShareState } from '../../../lib/trip-notes/share'
import {
  createInitialState,
  loadFromStorage,
  requestPersistentStorage,
  saveToStorage,
} from '../../../lib/trip-notes/storage'
import { NowPanel } from './-components/NowPanel'
import { Onboarding } from './-components/Onboarding'
import { PrintSheet } from './-components/PrintSheet'
import { ProgressPanel } from './-components/ProgressPanel'
import { SchedulePanel } from './-components/SchedulePanel'
import { SettingsPanel } from './-components/SettingsPanel'
import { createHistory, historyReducer } from './-lib/reducer'
import { useDialogFocus } from './-lib/focusTrap'
import { todayISO } from './-lib/format'
import { primaryButtonClass, subtleButtonClass } from './-lib/styles'
import type { HistoryState } from './-lib/reducer'
import type { TripNotesState } from '../../../lib/trip-notes/types'

export const Route = createFileRoute('/tools/trip-notes/')({
  head: () => ({
    meta: [{ title: '旅のしおり | かんちゅツールズ' }],
  }),
  component: TripNotesPage,
})

const SAVE_DEBOUNCE_MS = 500

/** 進捗タブのキャンセル期限やカウントダウンの基準時刻を更新する間隔 */
const CLOCK_TICK_MS = 60_000

type TabId = 'now' | 'schedule' | 'progress' | 'settings'

const TABS: Array<{
  id: TabId
  label: string
  icon: typeof Zap
  hint: string
}> = [
  { id: 'now', label: '今', icon: Zap, hint: '進行中と次の予定' },
  { id: 'schedule', label: '日程', icon: CalendarDays, hint: '日付順の一覧' },
  { id: 'progress', label: '進捗', icon: Gauge, hint: '予約の穴を潰す' },
  { id: 'settings', label: '設定', icon: Settings, hint: '共有・印刷・AI' },
]

function initHistory(): HistoryState {
  return createHistory(loadFromStorage() ?? createInitialState(todayISO()))
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}

function TripNotesPage() {
  const [history, dispatch] = useReducer(historyReducer, undefined, initHistory)
  const state = history.present

  const [tab, setTab] = useState<TabId>('progress')
  /** 進捗タブから日程タブの特定の日へ飛ぶための受け渡し */
  const [focusDate, setFocusDate] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  /** 共有URLから復元した状態。上書きの確認が済むまでは適用しない */
  const [incomingShare, setIncomingShare] = useState<TripNotesState | null>(
    null,
  )

  const displayTz = useMemo(
    () => state.pinnedTz ?? getDeviceTz(),
    [state.pinnedTz],
  )
  const summary = useMemo(
    () => computeSummary(state, nowMs, displayTz),
    [state, nowMs, displayTz],
  )

  // 予約を入力してから旅行に出るまで数ヶ月空くのが普通で、
  // その間 iOS Safari に localStorage を消される可能性がある。ダメ元で永続化を頼む
  useEffect(() => {
    void requestPersistentStorage()
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(
      () => saveToStorage(state),
      SAVE_DEBOUNCE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [state])

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  // 共有URLで開かれたときは、まず読み取って確認ダイアログに載せる。
  // ハッシュは読んだ時点で消す。再読み込みのたびに同じ確認が出ると、
  // 「同行者のデータを取り込んだあと自分で編集した内容」を誤って捨てかねない
  useEffect(() => {
    const hash = window.location.hash
    if (hash.length <= 1) return
    let cancelled = false
    void decodeShareState(hash).then((decoded) => {
      if (cancelled || decoded === null) return
      setIncomingShare(decoded)
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search,
      )
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return
      if (event.key.toLowerCase() !== 'z') return
      // 入力欄の中はブラウザ標準の取り消しに任せる
      if (isEditableTarget(event.target)) return
      event.preventDefault()
      dispatch({ type: event.shiftKey ? 'redo' : 'undo' })
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  /** 夜カバレッジ帯や移動の穴から、日程タブの該当日へ飛ばす */
  const jumpToDate = useCallback((date: string) => {
    setFocusDate(date)
    setTab('schedule')
  }, [])

  const jumpToUnverified = useCallback(() => {
    setTab('schedule')
  }, [])

  const isEmpty = state.bookings.length === 0

  return (
    <>
      <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-6 text-gray-900 sm:px-6 md:pb-10 print:hidden">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold sm:text-3xl">旅のしおり</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-gray-600">
              予約の抜けを旅行前に潰し、旅行中は必要な予約情報だけをすぐ出すためのツールです。
              行き先が決まる前は
              <a
                href="/tools/trip-scheduler"
                className="mx-1 text-cyan-700 underline underline-offset-2 hover:text-cyan-800"
              >
                旅程パズル
              </a>
              が担当します。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => dispatch({ type: 'undo' })}
              disabled={history.past.length === 0}
              className={subtleButtonClass}
              title="元に戻す (Ctrl/⌘ + Z)"
            >
              <Undo2 size={16} />
              <span className="hidden sm:inline">元に戻す</span>
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'redo' })}
              disabled={history.future.length === 0}
              className={subtleButtonClass}
              title="やり直す (Ctrl/⌘ + Shift + Z)"
            >
              <Redo2 size={16} />
              <span className="hidden sm:inline">やり直す</span>
            </button>
          </div>
        </header>

        {/* デスクトップは上部タブ。狭い画面では下部固定のタブバーに任せる */}
        <div
          role="tablist"
          aria-label="旅のしおりの表示切り替え"
          className="mt-6 hidden gap-1 rounded-2xl border border-gray-200 bg-white p-1 shadow-sm md:flex"
        >
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 ${
                tab === item.id
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <item.icon size={16} />
              {item.label}
              <span
                className={`text-xs font-normal ${
                  tab === item.id ? 'text-cyan-100' : 'text-gray-400'
                }`}
              >
                {item.hint}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 md:mt-6">
          {tab === 'now' && (
            <NowPanel
              state={state}
              displayTz={displayTz}
              dispatch={dispatch}
              onGoToSchedule={() => setTab('schedule')}
            />
          )}

          {tab === 'schedule' && (
            <SchedulePanel
              state={state}
              displayTz={displayTz}
              dispatch={dispatch}
              focusDate={focusDate}
              onFocusHandled={() => setFocusDate(null)}
            />
          )}

          {tab === 'progress' &&
            (isEmpty ? (
              <Onboarding
                state={state}
                dispatch={dispatch}
                onAddBooking={() => setTab('schedule')}
                onOpenSettings={() => setTab('settings')}
              />
            ) : (
              <ProgressPanel
                state={state}
                summary={summary}
                displayTz={displayTz}
                onSelectDate={jumpToDate}
                onJumpToUnverified={jumpToUnverified}
              />
            ))}

          {tab === 'settings' && (
            <SettingsPanel
              state={state}
              displayTz={displayTz}
              dispatch={dispatch}
            />
          )}
        </div>
      </main>

      {/* 旅行中はスマホの親指が届く下端に置く。デスクトップでは上部タブに任せて隠す */}
      <nav
        aria-label="旅のしおりの表示切り替え"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-gray-200 bg-white/95 backdrop-blur md:hidden print:hidden"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => setTab(item.id)}
            className={`relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan-500 ${
              tab === item.id ? 'text-cyan-700' : 'text-gray-500'
            }`}
          >
            <item.icon size={20} />
            {item.label}
            {/* 未確保の夜があることは、どのタブにいても分かるようにする */}
            {item.id === 'progress' && summary.uncoveredNights > 0 && (
              <span
                className="absolute right-1/4 top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white"
                aria-label={`寝る場所が未確保の夜が ${summary.uncoveredNights} 泊`}
              >
                {summary.uncoveredNights}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* 画面には出さず、印刷したときだけ紙のしおりとして現れる */}
      <PrintSheet state={state} displayTz={displayTz} />

      {incomingShare !== null && (
        <ShareImportConfirm
          incoming={incomingShare}
          current={state}
          onCancel={() => setIncomingShare(null)}
          onApply={() => {
            dispatch({ type: 'replaceState', state: incomingShare })
            setIncomingShare(null)
            setTab('progress')
          }}
        />
      )}
    </>
  )
}

interface ShareImportConfirmProps {
  incoming: TripNotesState
  current: TripNotesState
  onApply: () => void
  onCancel: () => void
}

/**
 * 共有URLで開かれたときの上書き確認。
 *
 * 黙って読み込むと、自分で入れた予約が一瞬で消える。
 * 取り消せる(Undo が効く)とはいえ、それを知らない人が大半なので、
 * 「いま何件あって、読み込むと何件になるのか」を先に見せてから決めさせる。
 */
function ShareImportConfirm({
  incoming,
  current,
  onApply,
  onCancel,
}: ShareImportConfirmProps) {
  const titleId = useId()
  const panelRef = useDialogFocus<HTMLDivElement>({ onClose: onCancel })

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center print:hidden">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl outline-none"
      >
        <h2
          id={titleId}
          className="flex items-center gap-2 text-base font-semibold text-gray-900"
        >
          <Download size={18} className="text-cyan-600" />
          共有された旅のしおりを読み込みますか？
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          読み込むと、この端末に保存されている内容は
          <strong className="text-gray-900">すべて置き換わります</strong>。
          読み込んだあとでも「元に戻す」で戻せます。
        </p>
        <dl className="mt-4 space-y-1 rounded-xl bg-gray-50 p-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-600">いまの予約</dt>
            <dd className="font-semibold">{current.bookings.length}件</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">共有された予約</dt>
            <dd className="font-semibold">{incoming.bookings.length}件</dd>
          </div>
          {incoming.tripTitle.length > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-gray-600">旅行の名前</dt>
              <dd className="truncate font-semibold">{incoming.tripTitle}</dd>
            </div>
          )}
        </dl>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className={subtleButtonClass}
          >
            読み込まない
          </button>
          <button
            type="button"
            onClick={onApply}
            className={primaryButtonClass}
          >
            読み込んで置き換える
          </button>
        </div>
      </div>
    </div>
  )
}
