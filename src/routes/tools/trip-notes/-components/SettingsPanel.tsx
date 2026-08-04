/**
 * 旅のしおりの設定タブ。
 *
 * 「編集の主戦場」であるタイムラインとは違い、ここに集まるのは
 * 旅行そのものの前提(期間・タイムゾーン)と、いざというときの保険
 * (共有URL・印刷・緊急連絡先・JSONバックアップ・全消去)。
 * 頻度は低いが欠けると旅先で致命傷になりうる機能を1画面にまとめている。
 */

import { useId, useState } from 'react'
import {
  AlertTriangle,
  Copy,
  Download,
  FileJson,
  Globe,
  Pencil,
  Phone,
  Plane,
  Plus,
  Printer,
  Share2,
  Trash2,
  Upload,
} from 'lucide-react'
import { newId } from '../../../../lib/trip-notes/id'
import { parseTripNotesState } from '../../../../lib/trip-notes/storage'
import { COMMON_TIMEZONES, diffDays } from '../../../../lib/trip-notes/datetime'
import { copyText, todayISO } from '../-lib/format'
import {
  cardClass,
  dangerButtonClass,
  fieldClass,
  iconButtonClass,
  labelClass,
  primaryButtonClass,
  sectionTitleClass,
  subtleButtonClass,
} from '../-lib/styles'
import { AiImportPanel } from './AiImportPanel'
import { ShareDialog } from './ShareDialog'
import type { ChangeEvent, FormEvent } from 'react'
import type { TripNotesDispatch } from '../-lib/reducer'
import type {
  EmergencyContact,
  TripNotesState,
} from '../../../../lib/trip-notes/types'

interface SettingsPanelProps {
  state: TripNotesState
  displayTz: string
  dispatch: TripNotesDispatch
  /** AIインポート完了後、取り込んだ日へ日程タブから飛ぶための橋渡し */
  onSelectDate: (date: string) => void
}

interface Message {
  tone: 'ok' | 'error'
  text: string
}

/** 電話番号らしさの簡易判定。国番号・ハイフン・空白・括弧程度は許容する */
function looksLikePhoneNumber(value: string): boolean {
  return /^[+\d][\d\s\-()]{3,}$/.test(value.trim())
}

function telHref(value: string): string {
  return `tel:${value.replace(/[\s\-()]/g, '')}`
}

/**
 * 緊急連絡先1件の表示・編集。
 * 追加フォームと編集フォームで見た目を揃えるため、編集モードは行内で完結させる。
 */
function ContactRow({
  contact,
  dispatch,
}: {
  contact: EmergencyContact
  dispatch: TripNotesDispatch
}) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(contact.label)
  const [value, setValue] = useState(contact.value)
  const [note, setNote] = useState(contact.note ?? '')

  const handleSave = () => {
    const nextLabel = label.trim()
    const nextValue = value.trim()
    if (nextLabel.length === 0 || nextValue.length === 0) return
    const nextNote = note.trim()
    dispatch({
      type: 'updateContact',
      contact: {
        id: contact.id,
        label: nextLabel,
        value: nextValue,
        ...(nextNote.length > 0 ? { note: nextNote } : {}),
      },
    })
    setEditing(false)
  }

  const handleCancel = () => {
    setLabel(contact.label)
    setValue(contact.value)
    setNote(contact.note ?? '')
    setEditing(false)
  }

  const handleRemove = () => {
    if (!window.confirm(`「${contact.label}」を削除しますか?`)) return
    dispatch({ type: 'removeContact', id: contact.id })
  }

  if (editing) {
    return (
      <li className="rounded-xl border border-gray-200 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="text-xs text-gray-500">
            名称
            <input
              className={`${fieldClass} mt-1`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <label className="text-xs text-gray-500">
            連絡先
            <input
              className={`${fieldClass} mt-1`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <label className="text-xs text-gray-500">
            メモ(任意)
            <input
              className={`${fieldClass} mt-1`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className={primaryButtonClass}
            onClick={handleSave}
          >
            保存
          </button>
          <button
            type="button"
            className={subtleButtonClass}
            onClick={handleCancel}
          >
            キャンセル
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-gray-200 p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800">{contact.label}</p>
        <p className="text-sm text-gray-700">
          {looksLikePhoneNumber(contact.value) ? (
            <a
              href={telHref(contact.value)}
              className="text-cyan-700 underline"
            >
              {contact.value}
            </a>
          ) : (
            contact.value
          )}
        </p>
        {contact.note !== undefined && contact.note.length > 0 ? (
          <p className="text-xs text-gray-500">{contact.note}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          aria-label={`${contact.label}を編集`}
          className={iconButtonClass}
          onClick={() => setEditing(true)}
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          aria-label={`${contact.label}を削除`}
          className={iconButtonClass}
          onClick={handleRemove}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  )
}

export function SettingsPanel({
  state,
  displayTz,
  dispatch,
  onSelectDate,
}: SettingsPanelProps) {
  const titleId = useId()
  const startId = useId()
  const endId = useId()
  const tzSelectId = useId()
  const contactLabelId = useId()
  const contactValueId = useId()
  const contactNoteId = useId()
  const pasteId = useId()

  const [shareOpen, setShareOpen] = useState(false)

  const [newLabel, setNewLabel] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newNote, setNewNote] = useState('')

  const [importText, setImportText] = useState('')
  const [ioMessage, setIoMessage] = useState<Message | null>(null)

  // 終了日が開始日以前だと夜の計算(nights.ts)が破綻するので、その場で警告する
  let nights: number | null = null
  try {
    nights = diffDays(state.startDate, state.endDate)
  } catch {
    nights = null
  }
  const invalidRange = nights === null || nights <= 0

  const handleAddContact = (e: FormEvent) => {
    e.preventDefault()
    const label = newLabel.trim()
    const value = newValue.trim()
    if (label.length === 0 || value.length === 0) return
    const note = newNote.trim()
    dispatch({
      type: 'addContact',
      contact: {
        id: newId('ec'),
        label,
        value,
        ...(note.length > 0 ? { note } : {}),
      },
    })
    setNewLabel('')
    setNewValue('')
    setNewNote('')
  }

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `旅のしおり-${todayISO()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setIoMessage({ tone: 'ok', text: 'JSONファイルを書き出しました。' })
  }

  const handleCopyJson = async () => {
    const ok = await copyText(JSON.stringify(state, null, 2))
    setIoMessage(
      ok
        ? { tone: 'ok', text: 'JSONをクリップボードにコピーしました。' }
        : { tone: 'error', text: 'コピーに失敗しました。' },
    )
  }

  const applyImportedJson = (raw: string) => {
    let parsed: TripNotesState | null = null
    try {
      parsed = parseTripNotesState(JSON.parse(raw))
    } catch {
      parsed = null
    }
    if (parsed === null) {
      setIoMessage({
        tone: 'error',
        text: '旅のしおりのデータとして読み取れませんでした。このツールで書き出したJSONを使ってください。',
      })
      return
    }
    if (!window.confirm('現在のデータを上書きします。よろしいですか?')) return
    dispatch({ type: 'replaceState', state: parsed })
    setIoMessage({ tone: 'ok', text: '読み込みました。' })
    setImportText('')
  }

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      applyImportedJson(await file.text())
    } catch {
      setIoMessage({
        tone: 'error',
        text: 'ファイルを読み込めませんでした。',
      })
    }
  }

  const handleResetAll = () => {
    if (
      !window.confirm(
        'すべてのデータ(旅程・緊急連絡先を含む)を削除して最初からやり直します。元に戻せません。よろしいですか?',
      )
    ) {
      return
    }
    dispatch({ type: 'resetAll', today: todayISO() })
  }

  return (
    // フォームの縦積みなので、main を広げても横いっぱいには伸ばさない
    <div className="mx-auto w-full max-w-3xl space-y-4">
      {/* 1. 旅行の基本情報 */}
      <section className={cardClass}>
        <h2 className={sectionTitleClass}>
          <Plane size={18} className="text-cyan-600" />
          旅行の基本情報
        </h2>
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor={titleId} className={labelClass}>
              旅行のタイトル
            </label>
            <input
              id={titleId}
              type="text"
              className={`${fieldClass} mt-1`}
              value={state.tripTitle}
              onChange={(e) =>
                dispatch({ type: 'setTripTitle', title: e.target.value })
              }
              placeholder="例: 初夏のポルトガル一周"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={startId} className={labelClass}>
                開始日
              </label>
              <input
                id={startId}
                type="date"
                className={`${fieldClass} mt-1`}
                value={state.startDate}
                onChange={(e) => {
                  if (e.target.value.length === 0) return
                  dispatch({ type: 'setStartDate', date: e.target.value })
                }}
              />
            </div>
            <div>
              <label htmlFor={endId} className={labelClass}>
                終了日
              </label>
              <input
                id={endId}
                type="date"
                className={`${fieldClass} mt-1`}
                value={state.endDate}
                onChange={(e) => {
                  if (e.target.value.length === 0) return
                  dispatch({ type: 'setEndDate', date: e.target.value })
                }}
              />
            </div>
          </div>
          {invalidRange ? (
            <p
              role="alert"
              className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              終了日は開始日より後の日付にしてください。
            </p>
          ) : (
            <p className="text-sm text-gray-600">
              {nights}泊{(nights ?? 0) + 1}日
            </p>
          )}
        </div>
      </section>

      {/* 2. 表示タイムゾーン */}
      <section className={cardClass}>
        <h2 className={sectionTitleClass}>
          <Globe size={18} className="text-cyan-600" />
          表示タイムゾーン
        </h2>
        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              name="pinnedTzMode"
              checked={state.pinnedTz === null}
              onChange={() => dispatch({ type: 'setPinnedTz', tz: null })}
            />
            デバイスの時計に従う
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              name="pinnedTzMode"
              checked={state.pinnedTz !== null}
              onChange={() =>
                dispatch({
                  type: 'setPinnedTz',
                  tz: state.pinnedTz ?? displayTz,
                })
              }
            />
            固定する
          </label>
          {state.pinnedTz !== null ? (
            <div>
              <label htmlFor={tzSelectId} className="sr-only">
                固定するタイムゾーン
              </label>
              <select
                id={tzSelectId}
                className={`${fieldClass} mt-1`}
                value={state.pinnedTz}
                onChange={(e) =>
                  dispatch({ type: 'setPinnedTz', tz: e.target.value })
                }
              >
                {COMMON_TIMEZONES.map((opt) => (
                  <option key={opt.tz} value={opt.tz}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <p className="text-xs text-gray-500">
            現在の表示タイムゾーン:{' '}
            <span className="font-mono">{displayTz}</span>
          </p>
        </div>
      </section>

      {/* 3. AIインポート */}
      <AiImportPanel
        state={state}
        displayTz={displayTz}
        dispatch={dispatch}
        onSelectDate={onSelectDate}
      />

      {/* 4. 共有・バックアップ */}
      <section className={cardClass}>
        <h2 className={sectionTitleClass}>
          <Share2 size={18} className="text-cyan-600" />
          共有・バックアップ
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          同行者に旅程を渡したいときも、自分のスマホが壊れたときの保険にしたいときも、
          共有URLひとつで済みます。サーバーには保存されません。
        </p>
        <button
          type="button"
          className={`${primaryButtonClass} mt-3`}
          onClick={() => setShareOpen(true)}
        >
          <Share2 size={16} />
          共有URLを作る
        </button>
        {shareOpen ? (
          <ShareDialog state={state} onClose={() => setShareOpen(false)} />
        ) : null}
      </section>

      {/* 5. 印刷しおり */}
      <section className={cardClass}>
        <h2 className={sectionTitleClass}>
          <Printer size={18} className="text-cyan-600" />
          印刷しおり
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          スマホが壊れても電池が切れてもゼロにならない保険です。予定と緊急連絡先を
          1枚(複数ページになる場合もあります)にまとめて印刷し、紙でも持ち歩けるようにします。
        </p>
        <button
          type="button"
          className={`${subtleButtonClass} mt-3`}
          onClick={() => window.print()}
        >
          <Printer size={16} />
          印刷する
        </button>
      </section>

      {/* 6. 緊急連絡先 */}
      <section className={cardClass}>
        <h2 className={sectionTitleClass}>
          <Phone size={18} className="text-cyan-600" />
          緊急連絡先
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          大使館・カード紛失窓口・海外旅行保険会社の連絡先を登録しておきましょう。
        </p>
        <form
          onSubmit={handleAddContact}
          className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1.2fr_1.2fr_1fr_auto]"
        >
          <div>
            <label htmlFor={contactLabelId} className="sr-only">
              名称
            </label>
            <input
              id={contactLabelId}
              className={fieldClass}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="例: 在ポルトガル日本国大使館"
            />
          </div>
          <div>
            <label htmlFor={contactValueId} className="sr-only">
              連絡先
            </label>
            <input
              id={contactValueId}
              className={fieldClass}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="例: +351-21-000-0000"
            />
          </div>
          <div>
            <label htmlFor={contactNoteId} className="sr-only">
              メモ
            </label>
            <input
              id={contactNoteId}
              className={fieldClass}
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="メモ(任意。例: カード紛失窓口・24時間対応)"
            />
          </div>
          <button type="submit" className={primaryButtonClass}>
            <Plus size={16} />
            追加
          </button>
        </form>

        {state.emergencyContacts.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            緊急連絡先が未登録です。まずは大使館やクレジットカードの紛失窓口を1件登録しておくと安心です。
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {state.emergencyContacts.map((contact) => (
              <ContactRow
                key={contact.id}
                contact={contact}
                dispatch={dispatch}
              />
            ))}
          </ul>
        )}
      </section>

      {/* 7. JSON入出力 */}
      <section className={cardClass}>
        <h2 className={sectionTitleClass}>
          <FileJson size={18} className="text-cyan-600" />
          JSON入出力
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          旅程データ全体をファイルやテキストでやり取りできます。共有URLが長すぎて
          QRコードが使えないときの代替手段としても使えます。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={subtleButtonClass}
            onClick={handleDownloadJson}
          >
            <Download size={16} />
            ファイルに書き出す
          </button>
          <button
            type="button"
            className={subtleButtonClass}
            onClick={() => {
              void handleCopyJson()
            }}
          >
            <Copy size={16} />
            JSONをコピー
          </button>
          <label className={`${subtleButtonClass} cursor-pointer`}>
            <Upload size={16} />
            ファイルを読み込む
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                void handleFileChange(e)
              }}
            />
          </label>
        </div>

        <div className="mt-3">
          <label htmlFor={pasteId} className={labelClass}>
            またはJSONを貼り付けて読み込む
          </label>
          <textarea
            id={pasteId}
            className={`${fieldClass} mt-1 h-24 font-mono text-xs`}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='{"schemaVersion": 1, ...}'
          />
          <button
            type="button"
            className={`${subtleButtonClass} mt-2`}
            disabled={importText.trim().length === 0}
            onClick={() => applyImportedJson(importText)}
          >
            貼り付けた内容を読み込む
          </button>
        </div>

        {ioMessage !== null ? (
          <p
            role={ioMessage.tone === 'error' ? 'alert' : 'status'}
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${
              ioMessage.tone === 'ok'
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-rose-50 text-rose-700'
            }`}
          >
            {ioMessage.text}
          </p>
        ) : null}
      </section>

      {/* 8. すべて消す */}
      <section className={cardClass}>
        <h2 className={sectionTitleClass}>
          <AlertTriangle size={18} className="text-rose-600" />
          すべて消す
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          旅程・緊急連絡先を含むすべてのデータを削除し、最初からやり直します。
          元に戻せないので、必要なら先にJSONで書き出しておいてください。
        </p>
        <button
          type="button"
          className={`${dangerButtonClass} mt-3`}
          onClick={handleResetAll}
        >
          <Trash2 size={16} />
          すべて消して最初からやり直す
        </button>
      </section>
    </div>
  )
}
