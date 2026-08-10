/**
 * AI インポート・ウィザード。
 *
 * 「プロンプトをコピー → 結果を貼り付け → レビューして取り込み」の3ステップに
 * 分けているのは、アプリが外部 API を一切呼ばない設計(aiPrompt.ts 参照)のため、
 * 利用者自身が手でコピー&ペーストを往復する必要があるから。各ステップの
 * 見出しと進捗を明示し、いま何をすればいいかを常に1つだけ提示する。
 *
 * 取り込みそのものはハイブリッド導線にしている。AI の抽出結果はそのまま信じず、
 * 日時とタイムゾーンだけは ReviewDialog で人間の確認を必須にし、
 * それ以外のフィールドは黄色い下線(unverified)を付けたまま取り込んで
 * あとで確認できるようにする。全項目を毎回確認させると利用者が確認を
 * 面倒がって素通りするようになり、かえって事故が増えるための妥協。
 */

import { useMemo, useState } from 'react'
import {
  CalendarDays,
  ClipboardList,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { buildImportPrompt } from '../../../../lib/trip-notes/aiPrompt'
import { findBackfillGaps } from '../../../../lib/trip-notes/backfillPrompt'
import { parseImportedJson } from '../../../../lib/trip-notes/aiImport'
import { formatStamp, stampDate } from '../../../../lib/trip-notes/datetime'
import { planImport } from '../../../../lib/trip-notes/importMerge'
import {
  cardClass,
  fieldClass,
  primaryButtonClass,
  sectionTitleClass,
  subtleButtonClass,
  unverifiedFieldClass,
} from '../-lib/styles'
import {
  AiServiceLinks,
  ImportIssueDetails,
  PromptCopyBlock,
} from './AiImportParts'
import { BookingStatusBadge } from './StatusBadge'
import { ConfirmDialog } from './ConfirmDialog'
import { KindIcon } from './KindIcon'
import { ReviewDialog } from './ReviewDialog'
import type { TripNotesDispatch } from '../-lib/reducer'
import type {
  Booking,
  FieldKey,
  TripNotesState,
} from '../../../../lib/trip-notes/types'
import type { ImportResult } from '../../../../lib/trip-notes/aiImport'
import type { BackfillGaps } from '../../../../lib/trip-notes/backfillPrompt'

interface AiImportPanelProps {
  state: TripNotesState
  displayTz: string
  dispatch: TripNotesDispatch
  /**
   * 取り込み完了バナーの「日程で確認する」から、日程タブの該当日へ飛ぶ。
   * ProgressPanel の不整合カードなどと同じ、index.tsx の jumpToDate をそのまま渡してもらう
   */
  onSelectDate: (date: string) => void
}

type WizardStep = 1 | 2 | 3

/** ステップの見出しと進捗表示。中身は呼び出し側に委ねる薄いラッパー */
function StepHeading({ step, title }: { step: WizardStep; title: string }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-cyan-700">
        ステップ {step} / 3
      </p>
      <h3 className="text-base font-semibold text-gray-800">{title}</h3>
    </div>
  )
}

/**
 * 既存予約を更新することになる取り込み候補に付ける、控えめな「更新」バッジ。
 * 予約状況バッジ(BookingStatusBadge)より目立たせないのは、これは AI 取り込みの
 * 結果を説明する補助情報であって、予約そのものの状態ではないため。
 */
function UpdateBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700"
      aria-label="既存の予約を更新します"
    >
      <RefreshCw size={11} aria-hidden="true" />
      更新
    </span>
  )
}

/** 取り込み候補の1件をカードで見せる。unverified なフィールドには黄色い下線を引く */
function BookingPreviewCard({
  booking,
  displayTz,
  willUpdate,
}: {
  booking: Booking
  displayTz: string
  /** true なら既存の予約とマッチし、取り込むとその予約が更新される */
  willUpdate: boolean
}) {
  const unverified = booking.unverified ?? []
  const isUnverified = (key: FieldKey): boolean => unverified.includes(key)

  const dateText =
    booking.end === null
      ? formatStamp(booking.start, displayTz, { withDate: true })
      : `${formatStamp(booking.start, displayTz, { withDate: true })} 〜 ${formatStamp(
          booking.end,
          displayTz,
          { withDate: true },
        )}`

  return (
    <li className={cardClass}>
      <div className="flex flex-wrap items-center gap-2">
        <KindIcon kind={booking.kind} className="shrink-0 text-gray-500" />
        <span
          className={`font-semibold text-gray-800 ${isUnverified('title') ? unverifiedFieldClass : ''}`}
        >
          {booking.title}
        </span>
        <BookingStatusBadge status={booking.status} size="sm" />
        {willUpdate && <UpdateBadge />}
      </div>
      <p
        className={`mt-1 inline-block text-sm text-gray-600 ${
          isUnverified('start') || isUnverified('end')
            ? unverifiedFieldClass
            : ''
        }`}
      >
        {dateText}
      </p>
      {booking.confirmationNumber !== undefined && (
        <p
          className={`mt-1 inline-block text-xs text-gray-500 ${
            isUnverified('confirmationNumber') ? unverifiedFieldClass : ''
          }`}
        >
          確認番号: {booking.confirmationNumber}
        </p>
      )}
    </li>
  )
}

/**
 * issues から「全体の何件中、何件が取り込めなかったか」を出す。
 *
 * ImportIssue は index ごとに複数積まれうる(tz 補完の注記など、取り込みが
 * 成功した予約にも付く)ため、issue の有無だけでは失敗件数を数えられない。
 * aiImport.ts の convertBooking は、取り込みを断念する直前に必ず
 * raw 付きの issue を1件だけ積んでから null を返すので、
 * 「raw が付いた index 付き issue の件数」が失敗件数と一致する。
 */
function summarizeResult(result: ImportResult): string {
  const successCount = result.bookings.length
  const failedIndexes = new Set(
    result.issues
      .filter((issue) => issue.index !== null && issue.raw !== undefined)
      .map((issue) => issue.index),
  )
  const failedCount = failedIndexes.size
  const total = successCount + failedCount

  if (total === 0) {
    // 穴埋めプロンプトの結果が国の基本情報だけということはふつうに起こる
    // (国名だけ登録して穴埋めを回した場合)。そのときに「取り込めるものが
    // ありませんでした」と言い切ると、すぐ下に「国・地域の基本情報を2件取り込みます」
    // と出ている画面と矛盾する
    return result.countryInfos.length > 0
      ? '予約は含まれていませんでした'
      : '取り込めるものがありませんでした'
  }
  if (failedCount === 0) return `${total}件を取り込み候補として読み込みました`
  return `${total}件中${successCount}件を取り込みました。${failedCount}件は取り込めませんでした`
}

/**
 * 国の欄のキー(plugTypes など)を、画面に出す名前に直す表。
 *
 * BackfillGaps.countries が持っているのはプロンプトにそのまま載るキーなので、
 * ここで日本語にする。この details は「AI に何が送られるのか」を先に見せるために
 * あるので、読めない文字列を並べたのでは目的を果たさない。
 * 表に無いキーはキーのまま出す。プロンプト側に欄が増えたときに、ここへの
 * 追記漏れで一覧から消える(=送られるのに画面には出ない)ほうが危ない。
 */
const COUNTRY_FIELD_LABELS: Record<string, string> = {
  emergencyPolice: '警察',
  emergencyAmbulance: '救急・消防',
  plugTypes: 'プラグ形状',
  voltage: '電圧・周波数',
  tipping: 'チップの文化',
  latinName: 'ラテン文字表記',
}

function countryFieldLabel(key: string): string {
  return COUNTRY_FIELD_LABELS[key] ?? key
}

/**
 * 「何に穴が空いているのか」の書き出しを、予約と国の件数で出し分ける。
 *
 * 片方が0件のときに「以前に取り込んだ0件の予約には」という嘘の文が出るのを防ぐ。
 * 件数を必ず添えるのは、コピーする前に対象の規模が分からないと、外部のチャットへ
 * どれだけのデータを渡すことになるのかを判断できないため。
 */
function backfillScopeText(gaps: BackfillGaps): string {
  const parts: Array<string> = []
  if (gaps.bookingCount > 0) {
    parts.push(`以前に登録した${gaps.bookingCount}件の予約`)
  }
  if (gaps.countries.length > 0) {
    parts.push(`登録済みの${gaps.countries.length}件の国・地域`)
  }
  return parts.join('と')
}

/**
 * 登録済みデータに空き欄があるときの案内。
 * プロンプト自体はステップ 1 の buildImportPrompt 一本なので、ここでは
 * 「何が空いているか」と「書類なしでも埋められる」ことだけを見せる。
 * 別プロンプトのコピー UI は置かない。
 */
function GapsInfoSection({ gaps }: { gaps: BackfillGaps }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
        <ClipboardList size={16} aria-hidden="true" className="text-cyan-600" />
        登録済みの内容に空いている欄があります
      </h3>
      <p className="mt-1 text-sm text-gray-600">
        {backfillScopeText(gaps)}には、空のままの欄があります。上のプロンプト 1
        本で、
        <strong className="font-semibold text-gray-800">
          予約確認書を添付しても、しなくても
        </strong>
        実行できます。書類が無いときは、一般知識で埋められる項目(締切・ラテン文字表記・国の基本情報など)だけが対象です。荷物枠のように書類にしか無い項目は捏造しません。
      </p>

      <ul className="mt-2 space-y-1 text-sm text-gray-700">
        {gaps.countsByField.map((count) => (
          <li key={count.field.id}>
            ・{count.field.label}: {count.bookingCount}件
          </li>
        ))}
        {gaps.countries.length > 0 && (
          <li>・国・地域の基本情報: {gaps.countries.length}件</li>
        )}
      </ul>

      {gaps.bookingCount > 0 && (
        <details className="mt-2 text-sm text-gray-600">
          <summary className="cursor-pointer">
            対象の予約({gaps.bookingCount}件)
          </summary>
          <ul className="mt-1 space-y-1">
            {gaps.targets.map((target) => (
              <li key={target.booking.id} className="text-xs">
                {stampDate(target.booking.start)} {target.booking.title} —{' '}
                {target.fields.map((field) => field.label).join(' / ')}
              </li>
            ))}
          </ul>
        </details>
      )}

      {gaps.countries.length > 0 && (
        <details className="mt-2 text-sm text-gray-600">
          <summary className="cursor-pointer">
            対象の国・地域({gaps.countries.length}件)
          </summary>
          <ul className="mt-1 space-y-1">
            {gaps.countries.map((entry) => (
              <li key={entry.country.id} className="text-xs">
                {entry.country.name} —{' '}
                {entry.missingKeys.map(countryFieldLabel).join(' / ')}
              </li>
            ))}
          </ul>
        </details>
      )}

      {gaps.countryCount === 0 && (
        <p className="mt-2 text-xs text-gray-500">
          国・地域はまだ登録されていません。設定タブの「国・地域の情報」に訪問先の国名を入れておくと、
          プラグ形状・電圧・チップの文化・緊急通報番号も同じプロンプトで埋められます。
        </p>
      )}

      <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-gray-600">
        <ShieldCheck
          size={14}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-gray-500"
        />
        <span>
          空き欄の埋めだけを頼むとき、AI
          に送られる登録済みデータの中身はプロンプト内の
          「登録済みで空いている欄」に書いてある
          <strong className="font-semibold text-gray-800">
            種別・タイトル・開始日時・場所の名前
          </strong>
          と国名だけです。
          <strong className="font-semibold text-gray-800">
            確認番号は含まれません。
          </strong>
        </span>
      </p>
    </section>
  )
}

export function AiImportPanel({
  state,
  displayTz,
  dispatch,
  onSelectDate,
}: AiImportPanelProps) {
  const [step, setStep] = useState<WizardStep>(1)
  const [pastedText, setPastedText] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  // 直前の取り込みで未確認が残った予約の id。「まとめて確認する」の対象を
  // このときの取り込みぶんだけに限る(手入力ぶんの未確認まで巻き込まない)
  const [importedUnverifiedIds, setImportedUnverifiedIds] = useState<
    Array<string>
  >([])
  // 直前の取り込みで一番早い予約の日(表示タイムゾーン基準)。
  // 「日程で確認する」がどの日へ飛ぶかを決める。取り込みが0件なら null のまま
  const [importedFocusDate, setImportedFocusDate] = useState<string | null>(
    null,
  )
  const [bulkVerifyOpen, setBulkVerifyOpen] = useState(false)

  // 表示中のタイムゾーンをそのままプロンプトの基準タイムゾーンにする。
  // 画面に出ている「今どこにいる想定か」とプロンプトの前提がずれると、
  // 年またぎの日付解釈などで AI がおかしな年を補ってしまう。
  const prompt = useMemo(
    () => buildImportPrompt(state, { deviceTz: displayTz }),
    [state, displayTz],
  )

  // 空き欄の内訳表示。プロンプト本文は buildImportPrompt 一本で、
  // 穴があるときだけ UI に内訳を添える(findBackfillGaps と同じ判定)
  const backfillGaps = useMemo(() => findBackfillGaps(state), [state])
  const hasGaps =
    backfillGaps.bookingCount > 0 || backfillGaps.countries.length > 0

  // ステップ3のプレビュー一覧に「更新」バッジを出すための計画。判定は
  // importMerge.ts の planImport に必ず委ね、ここでは条件を再実装しない
  // (このプレビューと実際の取り込み結果がズレると、利用者が「更新と出ていたのに
  // 別々に増えた」ように見えて信頼を失う)。ReviewDialog で日時を直すと
  // マッチ結果が変わりうるが、それはあくまで最終確定前の見込み表示であり、
  // 実際の適用は handleConfirmImport 側で改めて確定後の値から計算し直す。
  const previewPlan = useMemo(
    () =>
      importResult === null
        ? null
        : planImport(state.bookings, importResult.bookings),
    [state.bookings, importResult],
  )

  function handleParse(): void {
    const result = parseImportedJson(pastedText, displayTz)
    setImportResult(result)
    setStep(3)
  }

  function handleConfirmImport(confirmed: Array<Booking>): void {
    // reducer が実際に適用するのと同じ計画をここでも計算する。plan.entries[].booking
    // は reducer が state へ書き込む最終形(マージ後なら既存の id を持つ)そのものなので、
    // 「まとめて確認する」対象の id や完了メッセージの件数は、取り込み前の confirmed
    // ではなくこちらを基準にする。confirmed 側の id をそのまま使うと、更新でマージされた
    // 予約は id が既存側に変わるため、あとから対象を見失って「まとめて確認する」が
    // 効かなくなる
    const plan = planImport(state.bookings, confirmed)
    // 国の基本情報は予約と同じ 1 アクションに載せる。1 回の貼り付けは
    // 1 回の Undo で戻せなければならない(reducer の importBookings のコメント参照)。
    // 別々に dispatch すると、取り消しに Undo が 2 回要る操作になってしまう
    const countryInfos = importResult?.countryInfos ?? []
    // 予約が 0 件でも国の基本情報だけ返ってくることがあるので、
    // 「予約があるときだけ dispatch」にはしない
    if (confirmed.length > 0 || countryInfos.length > 0) {
      dispatch({
        type: 'importBookings',
        bookings: confirmed,
        ...(countryInfos.length > 0 ? { countryInfos } : {}),
      })
    }
    const finalBookings = plan.entries.map((entry) => entry.booking)

    // 日時は ReviewDialog で確認済みになっているので、ここに残るのは
    // タイトル・確認番号・料金など「間違っていても乗り遅れない」項目だけ
    const unverifiedIds = finalBookings
      .filter((b) => b.unverified !== undefined && b.unverified.length > 0)
      .map((b) => b.id)
    // 「日程で確認する」の飛び先。複数日にまたがる取り込みでも、
    // 一番早い日へ飛べば残りは日程タブのスクロールで自然に見える。
    // 日付は日程タブの見出しと同じ「その予約自身の現地日付」で出す。
    // ここだけ物差しが違うと、飛んだ先の日に何も無いということが起きる
    const focusDate = finalBookings.reduce<string | null>((earliest, b) => {
      const date = stampDate(b.start)
      return earliest === null || date < earliest ? date : earliest
    }, null)

    setReviewOpen(false)
    setImportResult(null)
    setPastedText('')
    setStep(1)
    setImportedUnverifiedIds(unverifiedIds)
    setImportedFocusDate(focusDate)
    // 国の基本情報は 1 アクションで一緒に入ったので、完了メッセージも 1 本にまとめる。
    // 別の行に分けて出すと、「Undo 1 回で戻る 1 つの操作」だったことが伝わらない
    const countryNote =
      countryInfos.length > 0
        ? `国・地域の基本情報を${countryInfos.length}件取り込みました`
        : ''

    if (confirmed.length === 0) {
      // 国名だけ登録して穴埋めを回すと、予約 0 件・国だけという結果になる。
      // ここで「取り込む予約がありませんでした」だけを出すと、実際には入った
      // 国の情報が無かったことにされてしまう
      setSuccessMessage(
        countryNote === '' ? '取り込む予約がありませんでした' : countryNote,
      )
    } else {
      // 既存の予約を更新した件数があれば、新規追加ぶんと分けて伝える。
      // 「何件増えたか」だけでは、実は重複せずマージされたことに気付けない
      const updateNote =
        plan.updatedCount > 0
          ? `(うち${plan.updatedCount}件は既存の予約を更新)`
          : ''
      const unverifiedNote =
        unverifiedIds.length === 0
          ? ''
          : `。${unverifiedIds.length}件に未確認の項目があります`
      setSuccessMessage(
        [
          `${confirmed.length}件を取り込みました${updateNote}${unverifiedNote}`,
          countryNote,
        ]
          .filter((part) => part !== '')
          .join('。'),
      )
    }
  }

  /** 取り込んだぶんの未確認をまとめて外す。Undo 1 回で戻せる 1 アクション */
  function handleBulkVerify(): void {
    const count = importedUnverifiedIds.length
    dispatch({ type: 'verifyAllUnverified', ids: importedUnverifiedIds })
    setBulkVerifyOpen(false)
    setImportedUnverifiedIds([])
    setSuccessMessage(`${count}件の未確認をすべて解除しました`)
  }

  return (
    <section className={cardClass}>
      <div className={sectionTitleClass}>
        <Sparkles size={18} aria-hidden="true" className="text-cyan-600" />
        AI インポート
      </div>
      <p className="mt-1 text-sm text-gray-500">
        予約確認メールや PDF を AI
        に読み取らせて予約を取り込みます。同じプロンプトで、
        登録済みの空き欄(締切・国の基本情報など)も埋められます。返ってきた JSON
        が旅程の新しい版になります。
      </p>

      {successMessage !== null && (
        <div
          role="status"
          className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          <div className="flex items-start justify-between gap-2">
            <span>{successMessage}</span>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              aria-label="このメッセージを閉じる"
              className="shrink-0 rounded p-0.5 text-emerald-700 transition hover:bg-emerald-100"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          {/*
            取り込んだ結果を見に行きたい人と、その場でまとめて片付けたい人の
            両方の動線を残す。「日程で確認する」は取り込みがあれば常に出し、
            「まとめて確認する」は未確認が残っているときだけ添える
          */}
          {importedFocusDate !== null && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onSelectDate(importedFocusDate)}
                className={subtleButtonClass}
              >
                <CalendarDays size={15} aria-hidden="true" />
                日程で確認する
              </button>
              {importedUnverifiedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setBulkVerifyOpen(true)}
                  className={subtleButtonClass}
                  aria-label={`取り込んだ${importedUnverifiedIds.length}件の未確認をまとめて確認済みにする`}
                >
                  <ListChecks size={15} aria-hidden="true" />
                  まとめて確認する
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 space-y-4">
        {step === 1 && (
          <div className="space-y-3">
            <StepHeading step={1} title="プロンプトをコピー" />
            <PromptCopyBlock prompt={prompt} alwaysShowPrompt rows={10} />

            <p className="text-sm text-gray-600">
              コピーしたプロンプトを、下のいずれかで開いた新しい会話に貼り付けて実行してください。
              <strong className="font-semibold text-gray-800">
                予約確認メールや PDF があれば添付
              </strong>
              してください。添付が無くても、登録済みの空き欄は一般知識で埋められます。
              返ってきた JSON をステップ 2
              に貼ると、既存の旅程にマージされて新しい版になります。
            </p>
            <AiServiceLinks />

            <div className="flex justify-end">
              <button
                type="button"
                className={primaryButtonClass}
                onClick={() => setStep(2)}
              >
                次へ: 結果を貼り付ける
              </button>
            </div>

            {hasGaps && <GapsInfoSection gaps={backfillGaps} />}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <StepHeading step={2} title="結果を貼り付ける" />
            <p className="text-sm text-gray-600">
              AI が返した JSON
              をそのまま貼り付けてください。前後に説明文が付いていたり、 ```json
              のようなフェンスが付いたままでも構いません。
            </p>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              rows={12}
              placeholder="AI の出力をそのまま貼り付け"
              className={`${fieldClass} resize-y font-mono text-xs leading-relaxed`}
              aria-label="AI が返した JSON"
            />
            <div className="flex flex-wrap justify-between gap-2">
              <button
                type="button"
                className={subtleButtonClass}
                onClick={() => setStep(1)}
              >
                戻る
              </button>
              <button
                type="button"
                className={primaryButtonClass}
                onClick={handleParse}
              >
                読み込む
              </button>
            </div>
          </div>
        )}

        {step === 3 && importResult !== null && (
          <div className="space-y-3">
            <StepHeading step={3} title="レビューして取り込み" />

            <p className="text-sm font-medium text-gray-700">
              {summarizeResult(importResult)}
            </p>

            <ImportIssueDetails issues={importResult.issues} />

            {/*
              国の基本情報は件数と国名だけを見せて、1 件ずつ確認させる画面は作らない。
              確認を必須にしているのは「間違うと乗り遅れる」日時とタイムゾーンだけで
              (ReviewDialog のコメント参照)、国の基本情報は予約と違って
              unverified(黄色い下線)の仕組みも持たないため、レビュー用の編集 UI を
              作っても「見た」という記録がどこにも残らない。取り込んだあとは
              設定タブの「国・地域の情報」でいつでも直せる。
              ここで保証するのは「何が増えるのかが取り込む前に分かること」だけでよい。
            */}
            {importResult.countryInfos.length > 0 && (
              <p className="text-sm text-gray-600">
                国・地域の基本情報を{importResult.countryInfos.length}
                件取り込みます(
                {importResult.countryInfos.map((info) => info.name).join('、')}
                )。同じ国がすでに登録されていれば、新しく増えるのではなく、その国に足されます。
              </p>
            )}

            {importResult.bookings.length === 0 &&
            importResult.countryInfos.length === 0 ? (
              <div className="flex justify-start">
                <button
                  type="button"
                  className={subtleButtonClass}
                  onClick={() => setStep(2)}
                >
                  ステップ2に戻ってやり直す
                </button>
              </div>
            ) : (
              <>
                {/* 国だけの取り込みでは予約のカードが 1 枚も無いので、一覧ごと出さない */}
                {importResult.bookings.length > 0 && (
                  <ul className="space-y-2">
                    {importResult.bookings.map((booking, index) => (
                      <BookingPreviewCard
                        key={booking.id}
                        booking={booking}
                        displayTz={displayTz}
                        willUpdate={
                          previewPlan !== null &&
                          previewPlan.entries[index].replacesId !== null
                        }
                      />
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap justify-between gap-2">
                  <button
                    type="button"
                    className={subtleButtonClass}
                    onClick={() => setStep(2)}
                  >
                    戻る
                  </button>
                  <button
                    type="button"
                    className={primaryButtonClass}
                    onClick={() => {
                      // 予約が 1 件も無いなら、ReviewDialog に確認させる日時が無い。
                      // あの画面は日時とタイムゾーンだけを見せるためのものなので、
                      // 空のまま開くと「すべて確認して取り込む」ボタンだけが並ぶ
                      // 意味のない関門になる。国だけの取り込みはそのまま確定させる
                      if (importResult.bookings.length === 0) {
                        handleConfirmImport([])
                        return
                      }
                      setReviewOpen(true)
                    }}
                  >
                    取り込む
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {reviewOpen && importResult !== null && (
        <ReviewDialog
          bookings={importResult.bookings}
          displayTz={displayTz}
          tripStartDate={state.startDate}
          tripEndDate={state.endDate}
          tzFallbackIds={importResult.tzFallbackIds}
          onConfirm={handleConfirmImport}
          onCancel={() => setReviewOpen(false)}
        />
      )}

      {bulkVerifyOpen && (
        <ConfirmDialog
          title="未確認をまとめて解除しますか?"
          description={`取り込んだ${importedUnverifiedIds.length}件の黄色い下線が消え、AI が入力した値と自分で確認した値の区別が付かなくなります。取り消したいときは「元に戻す」で1回ぶん戻せます。`}
          confirmLabel="すべて解除する"
          confirmAriaLabel={`取り込んだ${importedUnverifiedIds.length}件の未確認をすべて解除する`}
          onConfirm={handleBulkVerify}
          onCancel={() => setBulkVerifyOpen(false)}
        />
      )}
    </section>
  )
}
