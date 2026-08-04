import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  CalendarDays,
  Gauge,
  Plus,
  Redo2,
  Settings,
  Undo2,
  Zap,
} from 'lucide-react'
import { computeSummary } from '../../../lib/trip-notes/derive'
import { getDeviceTz } from '../../../lib/trip-notes/datetime'
import { newId } from '../../../lib/trip-notes/id'
import { decodeShareState } from '../../../lib/trip-notes/share'
import {
  createInitialState,
  requestPersistentStorage,
} from '../../../lib/trip-notes/storage'
import {
  activeStateOf,
  loadLibrary,
  saveLibrary,
  withActiveState,
} from '../../../lib/trip-notes/trips'
import { ConfirmDialog } from './-components/ConfirmDialog'
import { ImportChoiceDialog } from './-components/ImportChoiceDialog'
import { NowPanel } from './-components/NowPanel'
import { Onboarding } from './-components/Onboarding'
import { PrintSheet } from './-components/PrintSheet'
import { ProgressPanel } from './-components/ProgressPanel'
import { SchedulePanel } from './-components/SchedulePanel'
import { SettingsPanel } from './-components/SettingsPanel'
import { TripSwitcher, tripLabel } from './-components/TripSwitcher'
import { createHistory, historyReducer } from './-lib/reducer'
import { useDialogFocus } from './-lib/focusTrap'
import { todayISO } from './-lib/format'
import {
  fieldClass,
  labelClass,
  primaryButtonClass,
  subtleButtonClass,
} from './-lib/styles'
import type { FormEvent } from 'react'
import type { TripEntry, TripLibrary } from '../../../lib/trip-notes/trips'
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

/** 新しい旅程 1 件ぶんの入れ物。id は旅程の入れ物側でだけ使う */
function newTripEntry(state: TripNotesState): TripEntry {
  return { id: newId('trip'), state }
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
  /**
   * 旅程の入れ物。編集そのものは従来どおり historyReducer が持ち、
   * こちらは「どの旅程を開いているか」と「開いていない旅程の中身」だけを持つ。
   * 2 つに分けているのは、Undo/Redo が旅程 1 つの中で閉じているべきだからで、
   * 入れ物ごと履歴に載せると「切り替えを取り消す」という無意味な 1 手が積まれる。
   */
  const [library, setLibrary] = useState<TripLibrary>(() =>
    loadLibrary(todayISO()),
  )
  const [history, dispatch] = useReducer(historyReducer, library, (initial) =>
    createHistory(activeStateOf(initial)),
  )
  const state = history.present

  const [tab, setTab] = useState<TabId>('progress')
  /** 進捗タブから日程タブの特定の日へ飛ぶための受け渡し */
  const [focusDate, setFocusDate] = useState<string | null>(null)
  /**
   * 日程タブをマウントした直後に予約追加フォームまで開くか。
   * オンボーディングの「予約を1件登録する」だけが true にする。
   * 日程タブは表示中しかマウントされないので、SchedulePanel 側は
   * マウント時に一度読むだけでよい。
   */
  const [openAddOnSchedule, setOpenAddOnSchedule] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  /** 共有URLから復元した状態。取り込み先の確認が済むまでは適用しない */
  const [incomingShare, setIncomingShare] = useState<TripNotesState | null>(
    null,
  )
  /** 旅程セレクタから開くダイアログ。同時に 1 枚しか出さない */
  const [tripDialog, setTripDialog] = useState<'rename' | 'delete' | null>(null)

  /**
   * 画面にも保存にも、library をそのまま使わずこちらを使う。
   *
   * 編集中の旅程の中身は historyReducer 側の state のほうが常に新しく、
   * library に入っているのは最後に書き戻した時点の写しでしかない。
   * 素の library を画面に出すと、旅程の名前を変えてもセレクタの表示が
   * 変わらない(保存されて開き直すまで古い名前のまま)といったズレが出る。
   * 「表示と保存に使う入れ物はいつも書き戻し済み」を 1 箇所で保証しておけば、
   * そのズレは構造的に起こらなくなる。
   */
  const liveLibrary = useMemo(
    () => withActiveState(library, state),
    [library, state],
  )

  const displayTz = useMemo(
    () => state.pinnedTz ?? getDeviceTz(),
    [state.pinnedTz],
  )
  const summary = useMemo(() => computeSummary(state, nowMs), [state, nowMs])

  // 予約を入力してから旅行に出るまで数ヶ月空くのが普通で、
  // その間 iOS Safari に localStorage を消される可能性がある。ダメ元で永続化を頼む
  useEffect(() => {
    void requestPersistentStorage()
  }, [])

  // 保存は入れ物ごと。開いていない旅程も一緒に書き出す
  useEffect(() => {
    const timer = window.setTimeout(
      () => saveLibrary(liveLibrary),
      SAVE_DEBOUNCE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [liveLibrary])

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

  /**
   * タブの切り替え。
   * 予約追加フォームの自動オープンはオンボーディングからの1回きりなので、
   * 通常のタブ移動では必ず解除する(日程タブに戻るたびに開いては邪魔になる)。
   */
  const selectTab = useCallback((next: TabId) => {
    setOpenAddOnSchedule(false)
    setTab(next)
  }, [])

  /**
   * オンボーディングの「予約を1件登録する」。
   * 日程タブへ移るだけだと「予約を追加」をもう一度押させることになるので、
   * 遷移と同時にフォームまで開く。
   */
  const startAddBooking = useCallback(() => {
    setOpenAddOnSchedule(true)
    setTab('schedule')
  }, [])

  /** 夜カバレッジ帯や移動の穴から、日程タブの該当日へ飛ばす */
  const jumpToDate = useCallback(
    (date: string) => {
      setFocusDate(date)
      selectTab('schedule')
    },
    [selectTab],
  )

  const jumpToUnverified = useCallback(() => {
    selectTab('schedule')
  }, [selectTab])

  /**
   * 開いている旅程を入れ替える共通処理。
   * 渡す入れ物は必ず liveLibrary 由来にする(= 編集中の state を書き戻し済みにする)。
   * そうしないと、切り替えの直前に打った 1 文字が debounce の谷間で消える。
   */
  const openTrip = useCallback(
    (nextLibrary: TripLibrary, nextState: TripNotesState) => {
      setLibrary(nextLibrary)
      dispatch({ type: 'loadTrip', state: nextState })
    },
    [],
  )

  const selectTrip = useCallback(
    (id: string) => {
      if (id === liveLibrary.activeTripId) return
      const target = liveLibrary.trips.find((trip) => trip.id === id)
      if (target === undefined) return
      openTrip({ ...liveLibrary, activeTripId: id }, target.state)
    },
    [liveLibrary, openTrip],
  )

  /** 新しい旅程を末尾に足して、そのまま開く */
  const addTrip = useCallback(
    (tripState: TripNotesState) => {
      const entry = newTripEntry(tripState)
      openTrip(
        {
          ...liveLibrary,
          trips: [...liveLibrary.trips, entry],
          activeTripId: entry.id,
        },
        entry.state,
      )
    },
    [liveLibrary, openTrip],
  )

  const createTrip = useCallback(() => {
    addTrip(createInitialState(todayISO()))
    selectTab('progress')
  }, [addTrip, selectTab])

  /**
   * いま開いている旅程の複製。
   * 予約の id は振り直さない。id は旅程の中で一意であればよく
   * (夜の充足や移動の抜けはすべて state から計算し直す導出値で、
   *  旅程をまたいで id を参照する場所はどこにも無い)、
   * 振り直すと共有URLの復元と同じで差分だけが増える。
   */
  const duplicateTrip = useCallback(() => {
    const title = state.tripTitle.trim()
    addTrip({
      ...structuredClone(state),
      tripTitle: title.length > 0 ? `${title} のコピー` : '旅程のコピー',
    })
  }, [state, addTrip])

  /**
   * いま開いている旅程の削除。
   * 最後の 1 件でも 0 件にはせず、新しい空の旅程へ置き換える
   * (旅程が 1 つも無い状態を作らない理由は trips.ts の冒頭コメントを参照)。
   */
  const deleteTrip = useCallback(() => {
    setTripDialog(null)
    const remaining = liveLibrary.trips.filter(
      (trip) => trip.id !== liveLibrary.activeTripId,
    )
    if (remaining.length === 0) {
      const entry = newTripEntry(createInitialState(todayISO()))
      openTrip(
        { schemaVersion: 1, activeTripId: entry.id, trips: [entry] },
        entry.state,
      )
      return
    }
    openTrip(
      { ...liveLibrary, trips: remaining, activeTripId: remaining[0].id },
      remaining[0].state,
    )
  }, [liveLibrary, openTrip])

  const renameTrip = useCallback((title: string) => {
    setTripDialog(null)
    dispatch({ type: 'setTripTitle', title })
  }, [])

  const isEmpty = state.bookings.length === 0

  return (
    <>
      {/*
        カンバン(KanbanBoard)は列幅 w-64(256px) x 4列 + gap-3(12px) x 3 で
        1060px が必要。sm:px-6 のページ余白とカードの p-4 sm:p-5 を差し引くと
        max-w-6xl(1152px)ではわずか数px しか余らず崩れやすいため、
        余裕を持って max-w-7xl(1280px)まで広げる
      */}
      <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-6 text-gray-900 sm:px-6 md:pb-10 print:hidden">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {/*
              「いまどの旅程を編集しているか」は常時見えていないといけないので、
              タブや設定の中ではなく見出しの真横に置く。
              狭い画面では折り返して 2 段になる(flex-wrap)
            */}
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold sm:text-3xl">旅のしおり</h1>
              <TripSwitcher
                library={liveLibrary}
                onSelect={selectTrip}
                onCreate={createTrip}
                onDuplicate={duplicateTrip}
                onRename={() => setTripDialog('rename')}
                onDelete={() => setTripDialog('delete')}
              />
              <button
                type="button"
                onClick={createTrip}
                className={subtleButtonClass}
                aria-label="新しい旅程を作る"
                title="新しい旅程を作る"
              >
                <Plus size={16} />
                <span className="hidden sm:inline">新規</span>
              </button>
            </div>
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
              onClick={() => selectTab(item.id)}
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
              onGoToSchedule={() => selectTab('schedule')}
            />
          )}

          {tab === 'schedule' && (
            <SchedulePanel
              state={state}
              displayTz={displayTz}
              dispatch={dispatch}
              focusDate={focusDate}
              onFocusHandled={() => setFocusDate(null)}
              openAddOnMount={openAddOnSchedule}
            />
          )}

          {tab === 'progress' &&
            (isEmpty ? (
              <Onboarding
                state={state}
                dispatch={dispatch}
                onAddBooking={startAddBooking}
                onOpenSettings={() => selectTab('settings')}
              />
            ) : (
              <ProgressPanel
                state={state}
                summary={summary}
                displayTz={displayTz}
                dispatch={dispatch}
                onSelectDate={jumpToDate}
                onJumpToUnverified={jumpToUnverified}
              />
            ))}

          {tab === 'settings' && (
            <SettingsPanel
              state={state}
              displayTz={displayTz}
              dispatch={dispatch}
              onSelectDate={jumpToDate}
              onAddTrip={addTrip}
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
            onClick={() => selectTab(item.id)}
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

      {/*
        共有URLで開かれたときの取り込み先の確認。
        黙って読み込むと自分で入れた予約が一瞬で消えるので、
        「いま何件あって、読み込むと何件になるのか」を先に見せてから決めさせる。
        主導線は非破壊の「新しい旅程として追加」(ImportChoiceDialog 参照)
      */}
      {incomingShare !== null && (
        <ImportChoiceDialog
          title="共有された旅のしおりを読み込みますか？"
          incomingLabel="共有された予約"
          incoming={incomingShare}
          current={state}
          onCancel={() => setIncomingShare(null)}
          onAddAsNew={() => {
            addTrip(incomingShare)
            setIncomingShare(null)
            selectTab('progress')
          }}
          onReplace={() => {
            dispatch({ type: 'replaceState', state: incomingShare })
            setIncomingShare(null)
            selectTab('progress')
          }}
        />
      )}

      {tripDialog === 'rename' && (
        <RenameTripDialog
          title={state.tripTitle}
          onSave={renameTrip}
          onCancel={() => setTripDialog(null)}
        />
      )}

      {tripDialog === 'delete' && (
        <ConfirmDialog
          title="この旅程を削除しますか？"
          description={`「${tripLabel(state.tripTitle)}」の予約 ${state.bookings.length}件と緊急連絡先 ${state.emergencyContacts.length}件がまとめて消えます。元に戻せません。${
            liveLibrary.trips.length === 1
              ? 'これが最後の旅程なので、削除すると新しい空の旅程に置き換わります。'
              : '他の旅程は残ります。'
          }`}
          confirmLabel="削除する"
          confirmAriaLabel={`「${tripLabel(state.tripTitle)}」の予約 ${state.bookings.length}件を削除する`}
          onConfirm={deleteTrip}
          onCancel={() => setTripDialog(null)}
        />
      )}
    </>
  )
}

interface RenameTripDialogProps {
  title: string
  onSave: (title: string) => void
  onCancel: () => void
}

/**
 * 旅程の名前を変えるだけの小さなダイアログ。
 *
 * 設定タブにも同じ入力欄はあるが、そこまで潜らせると
 * 「セレクタで名前を確認 → 設定タブへ移動 → 直す → 戻る」という往復になる。
 * 旅程が増えるほど名前を付け直す頻度は上がるので、セレクタの中で完結させる。
 * 空のまま保存できるようにしてあるのは、名前は必須の情報ではないため
 * (一覧では「名称未設定」として出る)。
 */
function RenameTripDialog({ title, onSave, onCancel }: RenameTripDialogProps) {
  const titleId = useId()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useDialogFocus<HTMLFormElement>({
    onClose: onCancel,
    initialFocusRef: inputRef,
  })
  const [draft, setDraft] = useState(title)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSave(draft.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center print:hidden">
      <form
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl outline-none"
      >
        <h2 id={titleId} className="text-base font-semibold text-gray-900">
          旅程の名前を変える
        </h2>
        <label htmlFor={inputId} className={`${labelClass} mt-3 block`}>
          旅行のタイトル
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          className={`${fieldClass} mt-1`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="例: 初夏のポルトガル一周"
        />
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className={subtleButtonClass}
          >
            キャンセル
          </button>
          <button type="submit" className={primaryButtonClass}>
            保存
          </button>
        </div>
      </form>
    </div>
  )
}
