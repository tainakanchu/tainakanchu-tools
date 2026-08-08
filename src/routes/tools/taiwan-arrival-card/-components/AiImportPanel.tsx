/**
 * AI インポート・ウィザード。
 *
 * 「プロンプトをコピー → 結果を貼り付け → プレビューして取り込み」の 3 ステップに
 * 分けているのは、アプリが外部 API を一切呼ばない設計(aiPrompt.ts 参照)のため、
 * 利用者自身が手でコピー&ペーストを往復する必要があるから。各ステップの
 * 見出しと進捗を明示し、いま何をすればいいかを常に 1 つだけ提示する。
 *
 * ステップ 3 では「何がどう変わるか」を必ず先に見せる。この画面が扱うのは
 * 入国審査に出す情報で、AI が読み違えた便名や生年月日がそのまま入っても
 * 画面上は普通に見える。取り込む前に差分の形で見せるのが唯一の関門になる。
 */

import { useMemo, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { buildImportPrompt } from '../-lib/aiPrompt'
import { parseArrivalJson, planArrivalImport } from '../-lib/aiImport'
import {
  cardClass,
  fieldClass,
  primaryButtonClass,
  sectionTitleClass,
  subtleButtonClass,
} from '../-lib/styles'
import {
  AiServiceLinks,
  ImportIssueDetails,
  PromptCopyBlock,
} from './AiImportParts'
import type { ArrivalCardState } from '../-lib/types'
import type {
  ExtractedArrivalInfo,
  ImportIssue,
  ImportPlan,
} from '../-lib/aiImport'

interface AiImportPanelProps {
  state: ArrivalCardState
  /**
   * 取り込みの適用。**更新関数を渡す**形にしてある。
   *
   * 「取り込む」を押した時点の最新の state に対して当てないと、プレビューを
   * 見ている間にフォームで直した内容が巻き戻る。呼び出し側の setState を
   * そのまま渡してもらい、React に順序を保証させる。
   */
  onApply: (update: (prev: ArrivalCardState) => ArrivalCardState) => void
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

/** 空欄だったことが分かるように、空文字は「(未入力)」と書く */
function displayValue(value: string): string {
  return value.length > 0 ? value : '(未入力)'
}

/** 変更 1 行。「入国日: (未入力) → 2026-03-15」 */
function ChangeRow({
  label,
  before,
  after,
}: {
  label: string
  before: string
  after: string
}) {
  return (
    <li className="text-sm text-gray-700">
      <span className="font-medium">{label}</span>: {displayValue(before)}
      <span className="mx-1 text-gray-400">→</span>
      <span className="font-semibold text-gray-900">{after}</span>
    </li>
  )
}

/** ステップ 3 のプレビュー。取り込むと何が起きるかだけを書く */
function ImportPreview({ plan }: { plan: ImportPlan }) {
  const nothingToDo =
    plan.tripChanges.length === 0 && plan.travelerChanges.length === 0

  if (nothingToDo) {
    return (
      <p className="text-sm text-gray-600">
        取り込める変更はありませんでした。すでに入力済みの欄は AI
        の抽出結果で上書きしません。
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {plan.tripChanges.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="text-sm font-semibold text-gray-800">旅程</p>
          <ul className="mt-1 space-y-1">
            {plan.tripChanges.map((change) => (
              <ChangeRow key={change.label} {...change} />
            ))}
          </ul>
        </div>
      )}

      {plan.travelerChanges.map((traveler, index) => (
        <div
          key={`${traveler.name}-${index}`}
          className="rounded-xl border border-gray-200 bg-gray-50 p-3"
        >
          <p className="text-sm font-semibold text-gray-800">
            {traveler.name}
            {traveler.isNew && (
              <span className="ml-2 rounded-full border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                新しく追加
              </span>
            )}
          </p>
          {traveler.fields.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {traveler.fields.map((change) => (
                <ChangeRow key={change.label} {...change} />
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-gray-600">
              読み取れた項目はありませんでした(空の行として追加します)
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

/** ステップ 3 で保持するのは「AI が何を読み取ったか」だけ。当て先は持たない */
interface ParsedImport {
  extracted: ExtractedArrivalInfo
  /** 読み取りの時点で出た問題。当てはめ時の問題は plan 側から来る */
  parseIssues: Array<ImportIssue>
}

export function AiImportPanel({ state, onApply }: AiImportPanelProps) {
  const [step, setStep] = useState<WizardStep>(1)
  const [pastedText, setPastedText] = useState('')
  const [parsed, setParsed] = useState<ParsedImport | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // プロンプトは入力内容に依存しない。予約書類だけを読ませるための文面で、
  // すでに入力済みのパスポート番号などを外部の AI に渡す理由が無い
  const prompt = useMemo(() => buildImportPrompt(), [])

  /*
    プレビューは「いまの state に当てたらどうなるか」を毎回計算し直す。
    読み込んだ時点の結果を抱え込むと、プレビューを見ながらフォームを直したときに
    画面の差分が古いままになり、「取り込む」で直した内容ごと巻き戻る。
    計算は純関数(planArrivalImport)なので、state が変わるたびにやり直して差し支えない。
  */
  const plan: ImportPlan | null = useMemo(() => {
    if (parsed === null) return null
    const planned = planArrivalImport(state, parsed.extracted)
    // パース時の問題と適用時の問題は、利用者から見れば同じ 1 回の取り込みで
    // 起きたこと。1 つの一覧にまとめて出す
    return { ...planned, issues: [...parsed.parseIssues, ...planned.issues] }
  }, [parsed, state])

  function handleParse(): void {
    const { extracted, issues } = parseArrivalJson(pastedText)
    setParsed({ extracted, parseIssues: issues })
    setStep(3)
  }

  function handleConfirm(): void {
    if (parsed === null || plan === null) return
    const changed = plan.tripChanges.length + plan.travelerChanges.length
    const { extracted } = parsed
    // 画面に出ている plan.next ではなく、**適用の瞬間の state** から計算し直す。
    // プレビューを描いてから押されるまでの間にフォームが変わっていても、
    // その変更を残したまま取り込める
    onApply((prev) => planArrivalImport(prev, extracted).next)
    setParsed(null)
    setPastedText('')
    setStep(1)
    setSuccessMessage(
      changed === 0
        ? '取り込める変更はありませんでした'
        : `${changed}件を取り込みました。内容が正しいか、入力欄で確認してください`,
    )
  }

  return (
    <section className={cardClass}>
      <div className={sectionTitleClass}>
        <Sparkles size={18} aria-hidden="true" className="text-cyan-600" />
        AI でまとめて入力
      </div>
      <p className="mt-1 text-sm text-gray-500">
        航空券の e チケットやホテルの予約確認メールを AI
        に読み取らせて、入国日・便名・宿泊先をまとめて入力します。
        このアプリ自体は外部の API を呼びません。
      </p>

      {successMessage !== null && (
        <div
          role="status"
          className="mt-3 flex items-start justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
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
      )}

      <div className="mt-4 space-y-4">
        {step === 1 && (
          <div className="space-y-3">
            <StepHeading step={1} title="プロンプトをコピー" />
            <PromptCopyBlock prompt={prompt} alwaysShowPrompt rows={10} />

            <p className="text-sm text-gray-600">
              コピーしたプロンプトを、下のいずれかで開いた新しい会話に貼り付けたあと、
              <strong className="font-semibold text-gray-800">
                航空券の e
                チケット控えやホテルの予約確認メールを添付して実行してください。
              </strong>
              AI が内容を読み取り、入国カードに必要な情報を JSON
              形式で返します。
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
              onChange={(event) => setPastedText(event.target.value)}
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

        {step === 3 && plan !== null && (
          <div className="space-y-3">
            <StepHeading step={3} title="内容を確認して取り込み" />
            <ImportPreview plan={plan} />
            <ImportIssueDetails issues={plan.issues} />
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
                onClick={handleConfirm}
              >
                取り込む
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
