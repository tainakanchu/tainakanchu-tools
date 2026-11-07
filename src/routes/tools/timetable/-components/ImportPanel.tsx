/**
 * AI 取り込みの画面。
 *
 * 旅のしおりの AiImportPanel と同じ流れ:
 * プロンプトをコピー → 自分の AI に資料と一緒に送る → 返ってきた JSON を貼る →
 * プレビューとエラー一覧を見て取り込む。アプリは外部 API を呼ばない。
 */

import { useMemo, useRef, useState } from 'react'
import { parseTimetableText } from '../../../../lib/timetable/normalize'
import {
  AI_SERVICE_LINKS,
  buildTimetablePrompt,
} from '../../../../lib/timetable/prompt'
import { SAMPLE_RAW } from '../../../../lib/timetable/sample'
import { formatDateLabel } from '../../../../lib/timetable/time'
import { btn, btnPrimary, copyText, field, sectionTitle } from '../-lib/ui'
import { IssueList } from './IssueList'
import type { TimetableDoc } from '../../../../lib/timetable/types'

interface ImportPanelProps {
  /** 渡されていれば「追記・修正」モード */
  current?: TimetableDoc
  onImport: (doc: TimetableDoc) => void
  onCancel?: () => void
}

export function ImportPanel({ current, onImport, onCancel }: ImportPanelProps) {
  const isUpdate = current !== undefined
  const [text, setText] = useState('')
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const prompt = useMemo(
    () => buildTimetablePrompt(isUpdate ? 'update' : 'new', current),
    [isUpdate, current],
  )
  const result = useMemo(
    () => (text.trim().length === 0 ? null : parseTimetableText(text)),
    [text],
  )
  const errorCount =
    result?.issues.filter((issue) => issue.level === 'error').length ?? 0

  const handleCopy = async () => {
    setCopied((await copyText(prompt)) ? 'ok' : 'fail')
  }

  const handleFile = async (file: File | undefined) => {
    if (file === undefined) return
    setText(await file.text())
  }

  return (
    <section className="space-y-5" aria-labelledby="tt-import-title">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="tt-import-title" className="text-lg font-bold text-gray-900">
          {isUpdate
            ? `「${current.title}」を AI で追記・修正`
            : 'タイムテーブルを取り込む'}
        </h2>
        {onCancel && (
          <button type="button" className={btn} onClick={onCancel}>
            閉じる
          </button>
        )}
      </div>

      <ol className="space-y-5">
        <li className="border-l-2 border-gray-300 pl-3">
          <h3 className={sectionTitle}>1. プロンプトを AI に渡す</h3>
          <p className="mt-1 text-sm text-gray-700">
            {isUpdate
              ? 'プロンプトをコピーして AI に貼り、続けて新しい資料や「◯◯の時間を直して」のような指示を送ります。'
              : 'プロンプトをコピーして AI に貼り、公式タイムテーブルの画像・PDF・URL のどれかを一緒に送ります。'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className={btnPrimary} onClick={handleCopy}>
              プロンプトをコピー
            </button>
            {AI_SERVICE_LINKS.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={btn}
              >
                {link.label} を開く
              </a>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-600" role="status">
            {copied === 'ok' &&
              'コピーしました。AI の新しい会話に貼り付けてください。'}
            {copied === 'fail' &&
              'コピーできませんでした。下の「プロンプトを見る」から選択してコピーしてください。'}
          </p>
          <details className="mt-1 text-sm">
            <summary className="cursor-pointer text-gray-700">
              プロンプトを見る
            </summary>
            <textarea
              readOnly
              value={prompt}
              className={`${field} mt-1 h-48 font-mono text-xs`}
              aria-label="AI に渡すプロンプト"
              onFocus={(event) => event.currentTarget.select()}
            />
          </details>
        </li>

        <li className="border-l-2 border-gray-300 pl-3">
          <h3 className={sectionTitle}>2. AI の返答を貼り付ける</h3>
          <p className="mt-1 text-sm text-gray-700">
            返ってきた JSON
            をそのまま貼ります。前後に説明文が付いていても構いません。 AI
            の返答はコードブロックのコピーボタンでコピーすると確実です。
          </p>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            className={`${field} mt-2 h-36 font-mono text-xs`}
            placeholder='{"version":1,"title":"…","days":[…],"venues":[…],"acts":[…]}'
            aria-label="AI の返答"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className={btn}
              onClick={() => fileRef.current?.click()}
            >
              JSON ファイルを読み込む
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json,.txt"
              className="hidden"
              onChange={(event) => {
                void handleFile(event.target.files?.[0])
                event.target.value = ''
              }}
            />
            {!isUpdate && (
              <button
                type="button"
                className={btn}
                onClick={() => setText(JSON.stringify(SAMPLE_RAW, null, 2))}
              >
                サンプルを読み込む
              </button>
            )}
            {text.length > 0 && (
              <button type="button" className={btn} onClick={() => setText('')}>
                クリア
              </button>
            )}
          </div>
        </li>

        {result !== null && (
          <li className="border-l-2 border-gray-300 pl-3">
            <h3 className={sectionTitle}>3. 確認して取り込む</h3>
            {result.doc !== null && <Preview doc={result.doc} />}
            <div className="mt-2">
              <IssueList issues={result.issues} />
            </div>
            {result.doc !== null && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={() => result.doc && onImport(result.doc)}
                >
                  {errorCount > 0
                    ? `エラーの ${errorCount} 件を除いて${isUpdate ? '更新' : '取り込む'}`
                    : isUpdate
                      ? 'この内容で更新'
                      : '取り込む'}
                </button>
                {isUpdate && (
                  <span className="text-xs text-gray-600">
                    お気に入りは同じ出演に引き継ぎます。
                  </span>
                )}
              </div>
            )}
          </li>
        )}
      </ol>
    </section>
  )
}

function Preview({ doc }: { doc: TimetableDoc }) {
  return (
    <div className="mt-2 text-sm">
      <p className="font-semibold text-gray-900">{doc.title}</p>
      <table className="mt-1 w-full max-w-md text-left text-sm">
        <tbody>
          {doc.days.map((day) => (
            <tr key={day.id} className="border-t border-gray-200">
              <th scope="row" className="py-1 pr-3 font-normal text-gray-700">
                {formatDateLabel(day.date)}
                {day.label ? ` ${day.label}` : ''}
              </th>
              <td className="py-1 tabular-nums">
                {doc.acts.filter((act) => act.dayId === day.id).length} 組
              </td>
            </tr>
          ))}
          <tr className="border-t border-gray-200">
            <th scope="row" className="py-1 pr-3 font-normal text-gray-700">
              会場・ステージ
            </th>
            <td className="py-1">
              {doc.venues.map((venue) => venue.name).join('、')}
            </td>
          </tr>
          {doc.travel && doc.travel.length > 0 && (
            <tr className="border-t border-gray-200">
              <th scope="row" className="py-1 pr-3 font-normal text-gray-700">
                移動時間
              </th>
              <td className="py-1">{doc.travel.length} 組の会場間</td>
            </tr>
          )}
          <tr className="border-t border-gray-200">
            <th scope="row" className="py-1 pr-3 font-normal text-gray-700">
              タイムゾーン
            </th>
            <td className="py-1">{doc.timezone}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
