/**
 * 旅のしおりの設定タブ。
 *
 * 「編集の主戦場」であるタイムラインとは違い、ここに集まるのは
 * 旅行そのものの前提(期間・タイムゾーン)と、いざというときの保険
 * (共有URL・カレンダーへの書き出し・印刷・緊急連絡先・JSONバックアップ・全消去)。
 * 頻度は低いが欠けると旅先で致命傷になりうる機能を1画面にまとめている。
 */

import { useId, useState } from 'react'
import {
  AlertTriangle,
  CalendarPlus,
  Copy,
  Download,
  FileJson,
  Globe,
  Heart,
  IdCard,
  MapPin,
  MapPinCheck,
  Pencil,
  Phone,
  Plane,
  Plug,
  Plus,
  Printer,
  Share2,
  Trash2,
  Upload,
} from 'lucide-react'
import { newId } from '../../../../lib/trip-notes/id'
import {
  TRAVEL_DOC_KINDS,
  TRAVEL_DOC_STATUSES,
  parseTripNotesState,
} from '../../../../lib/trip-notes/storage'
import {
  COMMON_TIMEZONES,
  diffDays,
  isValidISODate,
} from '../../../../lib/trip-notes/datetime'
import { buildTripIcs, icsFileName } from '../../../../lib/trip-notes/ics'
import { planImport } from '../../../../lib/trip-notes/importMerge'
import { groupWishesByArea } from '../../../../lib/trip-notes/wishes'
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
import { ImportChoiceDialog } from './ImportChoiceDialog'
import { TRAVEL_DOC_KIND_LABELS, TravelDocIcon } from './KindIcon'
import { ShareDialog } from './ShareDialog'
import { TRAVEL_DOC_STATUS_LABELS, TravelDocStatusBadge } from './StatusBadge'
import type { ChangeEvent, FormEvent } from 'react'
import type { TripNotesDispatch } from '../-lib/reducer'
import type {
  CountryInfo,
  EmergencyContact,
  TravelDoc,
  TravelDocKind,
  TravelDocStatus,
  TripNotesState,
  Wish,
} from '../../../../lib/trip-notes/types'

interface SettingsPanelProps {
  state: TripNotesState
  displayTz: string
  dispatch: TripNotesDispatch
  /** AIインポート完了後、取り込んだ日へ日程タブから飛ぶための橋渡し */
  onSelectDate: (date: string) => void
  /**
   * 読み込んだ JSON を新しい旅程として追加して開く。
   * 旅程の入れ物はページ側が持つので、ここからは追加を頼むだけにする。
   */
  onAddTrip: (state: TripNotesState) => void
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

/**
 * <select> から返る値を型に戻すための番人。BookingForm.tsx と同じ考え方で、
 * TRAVEL_DOC_KINDS / TRAVEL_DOC_STATUSES から option を作っている以上
 * 実際には妥当な値しか来ないが、event.target.value の型は string でしかないので
 * アサーションで押し込まず、該当しない値は「今の選択を保つ」に倒す。
 */
const TRAVEL_DOC_KIND_SET = new Set<string>(TRAVEL_DOC_KINDS)
const TRAVEL_DOC_STATUS_SET = new Set<string>(TRAVEL_DOC_STATUSES)

function isTravelDocKind(value: string): value is TravelDocKind {
  return TRAVEL_DOC_KIND_SET.has(value)
}

function isTravelDocStatus(value: string): value is TravelDocStatus {
  return TRAVEL_DOC_STATUS_SET.has(value)
}

/**
 * 手続きフォームの入力状態。TravelDoc とほぼ同じ形だが、数値や日付も
 * すべて文字列で持つ(<input> が返す値の型に素直に合わせ、
 * 入力途中の空文字や未確定の値を型エラーなく保持できるようにするため)。
 */
interface TravelDocFormState {
  kind: TravelDocKind
  title: string
  region: string
  status: TravelDocStatus
  dueDate: string
  validFrom: string
  validUntil: string
  referenceNumber: string
  priceAmount: string
  priceCurrency: string
  url: string
  note: string
}

function emptyTravelDocForm(): TravelDocFormState {
  return {
    kind: TRAVEL_DOC_KINDS[0],
    title: '',
    region: '',
    status: TRAVEL_DOC_STATUSES[0],
    dueDate: '',
    validFrom: '',
    validUntil: '',
    referenceNumber: '',
    priceAmount: '',
    // 通貨コードは JPY を既定にしておく。海外の手続きでも申請料を円換算で
    // 控えておく人が多く、毎回打ち直させるほどのことではない
    priceCurrency: 'JPY',
    url: '',
    note: '',
  }
}

function travelDocToForm(doc: TravelDoc): TravelDocFormState {
  return {
    kind: doc.kind,
    title: doc.title,
    region: doc.region ?? '',
    status: doc.status,
    dueDate: doc.dueDate ?? '',
    validFrom: doc.validFrom ?? '',
    validUntil: doc.validUntil ?? '',
    referenceNumber: doc.referenceNumber ?? '',
    priceAmount: doc.price !== undefined ? String(doc.price.amount) : '',
    priceCurrency: doc.price?.currency ?? 'JPY',
    url: doc.url ?? '',
    note: doc.note ?? '',
  }
}

/**
 * フォームの入力から TravelDoc を組み立てる。名称が空なら null を返して
 * 呼び出し側に追加/保存をやめさせる(handleAddContact と同じ流儀)。
 * 空文字の任意フィールドはフィールドごと付けない(既存コードと同じ形)。
 */
function buildTravelDoc(
  id: string,
  form: TravelDocFormState,
): TravelDoc | null {
  const title = form.title.trim()
  if (title.length === 0) return null

  const doc: TravelDoc = { id, kind: form.kind, title, status: form.status }

  const region = form.region.trim()
  if (region.length > 0) doc.region = region

  if (form.dueDate !== '' && isValidISODate(form.dueDate)) {
    doc.dueDate = form.dueDate
  }
  if (form.validFrom !== '' && isValidISODate(form.validFrom)) {
    doc.validFrom = form.validFrom
  }
  if (form.validUntil !== '' && isValidISODate(form.validUntil)) {
    doc.validUntil = form.validUntil
  }

  const referenceNumber = form.referenceNumber.trim()
  if (referenceNumber.length > 0) doc.referenceNumber = referenceNumber

  // 数値として有限でなければ price ごと付けない。通貨コードが空欄なら
  // JPY にフォールバックしたうえで大文字化する
  if (form.priceAmount.trim() !== '') {
    const amount = Number(form.priceAmount)
    if (Number.isFinite(amount)) {
      const currency = (form.priceCurrency.trim() || 'JPY').toUpperCase()
      doc.price = { amount, currency }
    }
  }

  const url = form.url.trim()
  if (url.length > 0) doc.url = url

  const note = form.note.trim()
  if (note.length > 0) doc.note = note

  return doc
}

/**
 * 手続き1件ぶんの入力欄。追加フォームと編集フォームの両方から使い、
 * 欄の並びを二重管理しない(このファイルの決まり)。
 * 状態はフォームの外の呼び出し側(AddTravelDocSection / TravelDocRow)が持ち、
 * ここは表示と onChange の橋渡しに徹する。
 */
function TravelDocFields({
  form,
  onChange,
}: {
  form: TravelDocFormState
  onChange: <K extends keyof TravelDocFormState>(
    key: K,
    value: TravelDocFormState[K],
  ) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <label className="text-xs text-gray-500">
        種別
        <select
          className={`${fieldClass} mt-1`}
          value={form.kind}
          onChange={(e) => {
            const next = e.target.value
            if (isTravelDocKind(next)) onChange('kind', next)
          }}
        >
          {TRAVEL_DOC_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {TRAVEL_DOC_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-gray-500">
        名称
        <input
          className={`${fieldClass} mt-1`}
          value={form.title}
          onChange={(e) => onChange('title', e.target.value)}
          placeholder="例: シェンゲンビザ"
        />
      </label>
      <label className="text-xs text-gray-500">
        対象の国・地域(任意)
        <input
          className={`${fieldClass} mt-1`}
          value={form.region}
          onChange={(e) => onChange('region', e.target.value)}
          placeholder="例: マルタ"
        />
      </label>
      <label className="text-xs text-gray-500">
        状況
        <select
          className={`${fieldClass} mt-1`}
          value={form.status}
          onChange={(e) => {
            const next = e.target.value
            if (isTravelDocStatus(next)) onChange('status', next)
          }}
        >
          {TRAVEL_DOC_STATUSES.map((status) => (
            <option key={status} value={status}>
              {TRAVEL_DOC_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-gray-500">
        申請期限(任意)
        <input
          type="date"
          className={`${fieldClass} mt-1`}
          value={form.dueDate}
          onChange={(e) => onChange('dueDate', e.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-500">
          有効期間・開始(任意)
          <input
            type="date"
            className={`${fieldClass} mt-1`}
            value={form.validFrom}
            onChange={(e) => onChange('validFrom', e.target.value)}
          />
        </label>
        <label className="text-xs text-gray-500">
          有効期間・終了(任意)
          <input
            type="date"
            className={`${fieldClass} mt-1`}
            value={form.validUntil}
            onChange={(e) => onChange('validUntil', e.target.value)}
          />
        </label>
      </div>
      <label className="text-xs text-gray-500">
        参照番号(任意)
        <input
          className={`${fieldClass} mt-1 font-mono`}
          value={form.referenceNumber}
          onChange={(e) => onChange('referenceNumber', e.target.value)}
          placeholder="ビザ番号・eSIMのICCIDなど"
        />
      </label>
      <label className="text-xs text-gray-500">
        申請サイト・マイページURL(任意)
        <input
          type="url"
          className={`${fieldClass} mt-1`}
          value={form.url}
          onChange={(e) => onChange('url', e.target.value)}
          placeholder="https://..."
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-500">
          金額(任意)
          <input
            type="number"
            inputMode="decimal"
            step="any"
            className={`${fieldClass} mt-1`}
            value={form.priceAmount}
            onChange={(e) => onChange('priceAmount', e.target.value)}
          />
        </label>
        <label className="text-xs text-gray-500">
          通貨コード
          <input
            className={`${fieldClass} mt-1`}
            value={form.priceCurrency}
            onChange={(e) =>
              onChange('priceCurrency', e.target.value.toUpperCase())
            }
          />
        </label>
      </div>
      <label className="text-xs text-gray-500 sm:col-span-2">
        メモ(任意)
        <textarea
          rows={2}
          className={`${fieldClass} mt-1`}
          value={form.note}
          onChange={(e) => onChange('note', e.target.value)}
        />
      </label>
    </div>
  )
}

/**
 * 手続き1件の表示・編集。ContactRow と同じ構造(行内で完結する編集モード)を
 * 踏襲する。手続きはフィールドが多いので、編集モードの入力欄は
 * TravelDocFields をそのまま流用し、追加フォームと並びを合わせる。
 */
function TravelDocRow({
  doc,
  dispatch,
}: {
  doc: TravelDoc
  dispatch: TripNotesDispatch
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<TravelDocFormState>(() =>
    travelDocToForm(doc),
  )

  function set<K extends keyof TravelDocFormState>(
    key: K,
    value: TravelDocFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    const updated = buildTravelDoc(doc.id, form)
    if (updated === null) return
    dispatch({ type: 'updateTravelDoc', doc: updated })
    setEditing(false)
  }

  const handleCancel = () => {
    setForm(travelDocToForm(doc))
    setEditing(false)
  }

  const handleRemove = () => {
    if (!window.confirm(`「${doc.title}」を削除しますか?`)) return
    dispatch({ type: 'removeTravelDoc', id: doc.id })
  }

  if (editing) {
    return (
      <li className="rounded-xl border border-gray-200 p-3">
        <TravelDocFields form={form} onChange={set} />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className={primaryButtonClass}
            disabled={form.title.trim().length === 0}
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

  const hasValidity =
    doc.validFrom !== undefined || doc.validUntil !== undefined

  return (
    <li className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-gray-200 p-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <TravelDocIcon
            kind={doc.kind}
            size={16}
            className="shrink-0 text-gray-500"
          />
          <p className="text-sm font-semibold text-gray-800">
            {doc.title}
            {doc.region !== undefined && doc.region.length > 0 ? (
              <span className="ml-1 font-normal text-gray-500">
                ({doc.region})
              </span>
            ) : null}
          </p>
          <TravelDocStatusBadge status={doc.status} size="sm" />
        </div>
        <div className="mt-1 space-y-0.5 text-xs text-gray-600">
          {doc.referenceNumber !== undefined ? (
            <p>
              参照番号: <span className="font-mono">{doc.referenceNumber}</span>
            </p>
          ) : null}
          {doc.dueDate !== undefined ? <p>申請期限: {doc.dueDate}</p> : null}
          {hasValidity ? (
            <p>
              有効期間: {doc.validFrom ?? '未定'} 〜 {doc.validUntil ?? '未定'}
            </p>
          ) : null}
          {doc.url !== undefined ? (
            <p>
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-700 underline"
              >
                申請サイト・マイページを開く
              </a>
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          aria-label={`${doc.title}を編集`}
          className={iconButtonClass}
          onClick={() => setEditing(true)}
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          aria-label={`${doc.title}を削除`}
          className={iconButtonClass}
          onClick={handleRemove}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  )
}

/**
 * 「手続きを追加」ボタンで開閉する追加フォーム。
 *
 * 緊急連絡先は3項目だけなので常時開いた1行フォームにしているが、手続きは
 * 種別/名称/地域/状況/申請期限/有効期間(開始・終了)/参照番号/金額/URL/メモと
 * 項目が多く、常時展開すると設定タブを開いた瞬間に空欄だらけの大きなフォームが
 * 目に入ってしまう。手続きを使わない旅程のほうが多いはずなので、既定は
 * ボタン1つだけの最小の姿にしておき、使う人だけが開けばよいようにする。
 */
function AddTravelDocSection({ dispatch }: { dispatch: TripNotesDispatch }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<TravelDocFormState>(emptyTravelDocForm)

  function set<K extends keyof TravelDocFormState>(
    key: K,
    value: TravelDocFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleAdd = (e: FormEvent) => {
    e.preventDefault()
    const doc = buildTravelDoc(newId('td'), form)
    if (doc === null) return
    dispatch({ type: 'addTravelDoc', doc })
    setForm(emptyTravelDocForm())
    setOpen(false)
  }

  const handleCancel = () => {
    setForm(emptyTravelDocForm())
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        className={subtleButtonClass}
        onClick={() => setOpen(true)}
      >
        <Plus size={16} />
        手続きを追加
      </button>
    )
  }

  return (
    <form
      onSubmit={handleAdd}
      className="rounded-xl border border-gray-200 p-3"
    >
      <TravelDocFields form={form} onChange={set} />
      <div className="mt-2 flex gap-2">
        <button
          type="submit"
          className={primaryButtonClass}
          disabled={form.title.trim().length === 0}
        >
          <Plus size={16} />
          追加
        </button>
        <button
          type="button"
          className={subtleButtonClass}
          onClick={handleCancel}
        >
          キャンセル
        </button>
      </div>
    </form>
  )
}

/**
 * 国・地域の情報フォームの入力状態。TravelDocFormState と同じ理由で、
 * すべて文字列で持つ(<input> が返す値の型に素直に合わせる)。
 *
 * 並びは types.ts の CountryInfo の宣言順ではなく、画面に出す順にしてある。
 * 緊急通報番号をわざわざ上に持ち上げている理由は CountryInfoFields のコメント参照。
 */
interface CountryInfoFormState {
  name: string
  emergencyPolice: string
  emergencyAmbulance: string
  latinName: string
  plugTypes: string
  voltage: string
  tipping: string
  note: string
}

/**
 * 追加フォームの初期値。手続きの通貨コード(JPY)のような既定値は、ここには
 * 一切入れない。「よくある値」をあらかじめ入れておくと、直し忘れたときに
 * 自分で確かめた値と区別が付かなくなる。緊急通報番号でそれをやると、
 * 現地で番号を押してから間違いに気付くことになる。
 * 例示は placeholder に置く(placeholder は入力を促す例であって既定値ではない、
 * というこのファイルの流儀)。
 */
function emptyCountryInfoForm(): CountryInfoFormState {
  return {
    name: '',
    emergencyPolice: '',
    emergencyAmbulance: '',
    latinName: '',
    plugTypes: '',
    voltage: '',
    tipping: '',
    note: '',
  }
}

function countryInfoToForm(info: CountryInfo): CountryInfoFormState {
  return {
    name: info.name,
    emergencyPolice: info.emergencyPolice ?? '',
    emergencyAmbulance: info.emergencyAmbulance ?? '',
    latinName: info.latinName ?? '',
    plugTypes: info.plugTypes ?? '',
    voltage: info.voltage ?? '',
    tipping: info.tipping ?? '',
    note: info.note ?? '',
  }
}

/**
 * フォームの入力から CountryInfo を組み立てる。国・地域名が空なら null を返して
 * 呼び出し側に追加/保存をやめさせる(buildTravelDoc と同じ流儀)。
 * 空文字の任意フィールドはフィールドごと付けない(既存コードと同じ形)。
 */
function buildCountryInfo(
  id: string,
  form: CountryInfoFormState,
): CountryInfo | null {
  const name = form.name.trim()
  if (name.length === 0) return null

  const info: CountryInfo = { id, name }

  const latinName = form.latinName.trim()
  if (latinName.length > 0) info.latinName = latinName

  const plugTypes = form.plugTypes.trim()
  if (plugTypes.length > 0) info.plugTypes = plugTypes

  const voltage = form.voltage.trim()
  if (voltage.length > 0) info.voltage = voltage

  const tipping = form.tipping.trim()
  if (tipping.length > 0) info.tipping = tipping

  const emergencyPolice = form.emergencyPolice.trim()
  if (emergencyPolice.length > 0) info.emergencyPolice = emergencyPolice

  const emergencyAmbulance = form.emergencyAmbulance.trim()
  if (emergencyAmbulance.length > 0) {
    info.emergencyAmbulance = emergencyAmbulance
  }

  const note = form.note.trim()
  if (note.length > 0) info.note = note

  return info
}

/**
 * 国・地域1件ぶんの入力欄。TravelDocFields と同じく、追加フォームと編集フォームの
 * 両方から使い、欄の並びを二重管理しない。
 *
 * 並びは types.ts の宣言順ではなく「旅行者にとっての優先度」で決めている。
 * 国・地域名は必須(空だと保存できない)なので先頭に置くが、その次は必ず緊急通報番号にする。
 * 現地でいちばん効くのがこの2つで、出発前に埋めておく優先度もいちばん高い。
 * プラグ形状を調べ忘れても現地で買い直せるが、救急を呼ぶ番号は調べている余裕が
 * 無い場面でこそ要る。
 * 警察と救急・消防を必ず横に並べるのは、国によって番号の分かれ方が違う
 * (米国は911で共通、イタリアは警察113と救急118で別)ため。1欄にまとめず、
 * かつ2つ並べて見せておかないと、片方だけ入れて埋めた気になってしまう。
 * ラテン文字表記は検索やAI照合の補助でしかないので、緊急通報番号より下に置く。
 */
function CountryInfoFields({
  form,
  onChange,
}: {
  form: CountryInfoFormState
  onChange: <K extends keyof CountryInfoFormState>(
    key: K,
    value: CountryInfoFormState[K],
  ) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <label className="text-xs text-gray-500">
        国・地域名
        <input
          className={`${fieldClass} mt-1`}
          value={form.name}
          onChange={(e) => onChange('name', e.target.value)}
          placeholder="例: マルタ"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-500">
          警察(任意)
          <input
            className={`${fieldClass} mt-1`}
            value={form.emergencyPolice}
            onChange={(e) => onChange('emergencyPolice', e.target.value)}
            placeholder="例: 112"
          />
        </label>
        <label className="text-xs text-gray-500">
          救急・消防(任意)
          {/*
            placeholder を警察と別の番号にしてあるのは、両者が同じとは限らないことを
            例そのもので伝えるため。どちらも「例: 112」だと、共通番号の国だけを
            想定した欄に見えてしまう
          */}
          <input
            className={`${fieldClass} mt-1`}
            value={form.emergencyAmbulance}
            onChange={(e) => onChange('emergencyAmbulance', e.target.value)}
            placeholder="例: 118"
          />
        </label>
      </div>
      <label className="text-xs text-gray-500">
        ラテン文字表記(任意)
        <input
          className={`${fieldClass} mt-1`}
          value={form.latinName}
          onChange={(e) => onChange('latinName', e.target.value)}
          placeholder="例: Malta"
        />
      </label>
      <label className="text-xs text-gray-500">
        プラグ形状(任意)
        <input
          className={`${fieldClass} mt-1`}
          value={form.plugTypes}
          onChange={(e) => onChange('plugTypes', e.target.value)}
          placeholder="例: G"
        />
      </label>
      <label className="text-xs text-gray-500">
        電圧・周波数(任意)
        <input
          className={`${fieldClass} mt-1`}
          value={form.voltage}
          onChange={(e) => onChange('voltage', e.target.value)}
          placeholder="例: 230V 50Hz"
        />
      </label>
      <label className="text-xs text-gray-500">
        チップの文化(任意)
        <input
          className={`${fieldClass} mt-1`}
          value={form.tipping}
          onChange={(e) => onChange('tipping', e.target.value)}
          placeholder="例: 基本は不要。高級店では5〜10%"
        />
      </label>
      <label className="text-xs text-gray-500 sm:col-span-2">
        メモ(任意)
        <textarea
          rows={2}
          className={`${fieldClass} mt-1`}
          value={form.note}
          onChange={(e) => onChange('note', e.target.value)}
        />
      </label>
    </div>
  )
}

/**
 * 国・地域1件の表示・編集。TravelDocRow と同じ構造(行内で完結する編集モードと、
 * 追加フォームと共有する入力欄)をそのまま踏襲する。
 */
function CountryInfoRow({
  info,
  dispatch,
}: {
  info: CountryInfo
  dispatch: TripNotesDispatch
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<CountryInfoFormState>(() =>
    countryInfoToForm(info),
  )

  function set<K extends keyof CountryInfoFormState>(
    key: K,
    value: CountryInfoFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    const updated = buildCountryInfo(info.id, form)
    if (updated === null) return
    dispatch({ type: 'updateCountryInfo', countryInfo: updated })
    setEditing(false)
  }

  const handleCancel = () => {
    setForm(countryInfoToForm(info))
    setEditing(false)
  }

  const handleRemove = () => {
    if (!window.confirm(`「${info.name}」を削除しますか?`)) return
    dispatch({ type: 'removeCountryInfo', id: info.id })
  }

  if (editing) {
    return (
      <li className="rounded-xl border border-gray-200 p-3">
        <CountryInfoFields form={form} onChange={set} />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className={primaryButtonClass}
            disabled={form.name.trim().length === 0}
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

  const hasEmergency =
    info.emergencyPolice !== undefined || info.emergencyAmbulance !== undefined
  /**
   * 国名しか入っていない状態。AI の穴埋めで埋まることをこの行にも書いておく。
   * 設定タブしか見ない人が AI インポートの穴埋め導線にたどり着けないと、
   * 国名だけ入れたところで止まってしまい、この機能が半分も働かない。
   */
  const nameOnly =
    !hasEmergency &&
    info.plugTypes === undefined &&
    info.voltage === undefined &&
    info.tipping === undefined

  return (
    <li className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-gray-200 p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800">
          {info.name}
          {info.latinName !== undefined && info.latinName.length > 0 ? (
            <span className="ml-1 font-normal text-gray-500">
              ({info.latinName})
            </span>
          ) : null}
        </p>
        <div className="mt-1 space-y-0.5 text-xs text-gray-600">
          {/*
            緊急通報番号を先頭に出す。入力欄の並びと同じ理由で、いざというときに
            探す順がそのまま上から下になる。
            ContactRow のように tel: リンクにはしないのは、一覧の中でいちばん
            押し間違えやすい位置にある番号だから。誤タップで警察や救急に
            発信しかけるのは、番号を目で読んで自分の電話アプリに入れる手間より
            はるかに高くつく。
          */}
          {hasEmergency ? (
            <p>
              緊急通報: 警察 {info.emergencyPolice ?? '未登録'} / 救急・消防{' '}
              {info.emergencyAmbulance ?? '未登録'}
            </p>
          ) : null}
          {info.plugTypes !== undefined ? (
            <p>プラグ形状: {info.plugTypes}</p>
          ) : null}
          {info.voltage !== undefined ? <p>電圧: {info.voltage}</p> : null}
          {info.tipping !== undefined ? <p>チップ: {info.tipping}</p> : null}
          {info.note !== undefined ? <p>{info.note}</p> : null}
          {nameOnly ? (
            <p className="text-gray-500">
              プラグ形状・電圧・チップ・緊急通報番号がまだ空です。上の「AI
              インポート」の穴埋めでまとめて埋められます。
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          aria-label={`${info.name}を編集`}
          className={iconButtonClass}
          onClick={() => setEditing(true)}
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          aria-label={`${info.name}を削除`}
          className={iconButtonClass}
          onClick={handleRemove}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  )
}

/**
 * 「国・地域を追加」ボタンで開閉する追加フォーム。
 * AddTravelDocSection と同じ理由(欄が8つあり、常時展開すると設定タブを開いた
 * 瞬間に空欄だらけの大きなフォームが目に入る)で、既定はボタン1つの姿にしておく。
 */
function AddCountryInfoSection({ dispatch }: { dispatch: TripNotesDispatch }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<CountryInfoFormState>(emptyCountryInfoForm)

  function set<K extends keyof CountryInfoFormState>(
    key: K,
    value: CountryInfoFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleAdd = (e: FormEvent) => {
    e.preventDefault()
    const countryInfo = buildCountryInfo(newId('ci'), form)
    if (countryInfo === null) return
    dispatch({ type: 'addCountryInfo', countryInfo })
    setForm(emptyCountryInfoForm())
    setOpen(false)
  }

  const handleCancel = () => {
    setForm(emptyCountryInfoForm())
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        className={subtleButtonClass}
        onClick={() => setOpen(true)}
      >
        <Plus size={16} />
        国・地域を追加
      </button>
    )
  }

  return (
    <form
      onSubmit={handleAdd}
      className="rounded-xl border border-gray-200 p-3"
    >
      <CountryInfoFields form={form} onChange={set} />
      {/*
        この機能でいちばん伝えたいことなので、フォームの中にも書く。
        欄が8つ並んでいると「全部調べてから登録するもの」に見えるが、実際は
        国名の1行で足りる。空状態の案内を読んで開いた人が、ここで気を変えて
        閉じてしまうのを防ぐ
      */}
      <p className="mt-2 text-xs text-gray-500">
        国・地域名だけ入れて追加してかまいません。残りの欄は、上の「AI
        インポート」の穴埋めでまとめて埋められます。
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="submit"
          className={primaryButtonClass}
          disabled={form.name.trim().length === 0}
        >
          <Plus size={16} />
          追加
        </button>
        <button
          type="button"
          className={subtleButtonClass}
          onClick={handleCancel}
        >
          キャンセル
        </button>
      </div>
    </form>
  )
}

/**
 * 場所の入力欄。自由入力を殺さずに表記ゆれだけを減らすため <datalist> にする。
 *
 * 候補に出すのは「既に使った場所」と「旅程に出てくる場所」の 2 つ
 * (areaOptions を組み立てているのは SettingsPanel 本体)。<select> にしない理由は
 * types.ts の Wish に書いたとおりで、やりたいことは予約が 1 件も無い段階で
 * 決まることがあり、そのとき選択肢は作れない。候補が出ないからといって
 * 入力できなくなってはいけない。
 */
function AreaField({
  value,
  listId,
  onChange,
}: {
  value: string
  listId: string
  onChange: (value: string) => void
}) {
  return (
    <input
      className={`${fieldClass} mt-1`}
      value={value}
      list={listId}
      placeholder="台北 / マルタ など"
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/** areaOptions を <datalist> に流し込むだけの器。行ごとに重複して置かないための共有 */
function AreaOptions({ id, options }: { id: string; options: Array<string> }) {
  return (
    <datalist id={id}>
      {options.map((option) => (
        <option key={option} value={option} />
      ))}
    </datalist>
  )
}

/**
 * やりたいこと 1 件の表示・編集。ContactRow と同じく編集モードは行内で完結させる。
 *
 * 「今」タブでは題名と済みだけを扱うのに対し、ここでは場所・メモ・URL まで直せる。
 * 歩きながら使う画面と、座って整理する画面で扱う欄を変えているのは意図した差で、
 * 同じ欄をどちらにも出すと、片手で使う画面のほうが必ず重くなる。
 */
function WishRow({
  wish,
  areaOptions,
  dispatch,
}: {
  wish: Wish
  areaOptions: Array<string>
  dispatch: TripNotesDispatch
}) {
  const listId = useId()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(wish.title)
  const [area, setArea] = useState(wish.area ?? '')
  const [note, setNote] = useState(wish.note ?? '')
  const [url, setUrl] = useState(wish.url ?? '')

  const handleSave = () => {
    const nextTitle = title.trim()
    if (nextTitle.length === 0) return
    const nextArea = area.trim()
    const nextNote = note.trim()
    const nextUrl = url.trim()
    dispatch({
      type: 'updateWish',
      wish: {
        id: wish.id,
        title: nextTitle,
        ...(nextArea.length > 0 ? { area: nextArea } : {}),
        done: wish.done,
        ...(nextNote.length > 0 ? { note: nextNote } : {}),
        ...(nextUrl.length > 0 ? { url: nextUrl } : {}),
      },
    })
    setEditing(false)
  }

  const handleCancel = () => {
    setTitle(wish.title)
    setArea(wish.area ?? '')
    setNote(wish.note ?? '')
    setUrl(wish.url ?? '')
    setEditing(false)
  }

  const handleRemove = () => {
    if (!window.confirm(`「${wish.title}」を削除しますか?`)) return
    dispatch({ type: 'removeWish', id: wish.id })
  }

  if (editing) {
    return (
      <li className="rounded-xl border border-gray-200 p-3">
        <AreaOptions id={listId} options={areaOptions} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="text-xs text-gray-500">
            やりたいこと
            <input
              className={`${fieldClass} mt-1`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="text-xs text-gray-500">
            場所(任意)
            <AreaField value={area} listId={listId} onChange={setArea} />
          </label>
          <label className="text-xs text-gray-500">
            メモ(任意)
            <input
              className={`${fieldClass} mt-1`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <label className="text-xs text-gray-500">
            参考リンク(任意)
            <input
              className={`${fieldClass} mt-1`}
              value={url}
              inputMode="url"
              onChange={(e) => setUrl(e.target.value)}
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
      <label className="flex min-w-0 cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={wish.done}
          onChange={() => dispatch({ type: 'toggleWishDone', id: wish.id })}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
        />
        <span className="min-w-0">
          <span
            className={
              wish.done
                ? 'text-sm text-gray-400 line-through'
                : 'text-sm font-medium text-gray-800'
            }
          >
            {wish.title}
          </span>
          {wish.note !== undefined && wish.note.length > 0 ? (
            <span className="block text-xs text-gray-500">{wish.note}</span>
          ) : null}
          {wish.url !== undefined && wish.url.length > 0 ? (
            <a
              href={wish.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-xs text-cyan-700 underline"
            >
              {wish.url}
            </a>
          ) : null}
        </span>
      </label>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          aria-label={`${wish.title}を編集`}
          className={iconButtonClass}
          onClick={() => setEditing(true)}
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          aria-label={`${wish.title}を削除`}
          className={iconButtonClass}
          onClick={handleRemove}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  )
}

/**
 * やりたいことの追加。ここは「今」タブのクイック追加と違って、
 * 最初から場所とメモの欄も開いておく(座って一覧を整理している場面なので、
 * 1 タップ減らすことより、書きたいことを全部書ける欄が見えていることのほうが効く)。
 */
function AddWishSection({
  areaOptions,
  dispatch,
}: {
  areaOptions: Array<string>
  dispatch: TripNotesDispatch
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [area, setArea] = useState('')
  const [note, setNote] = useState('')
  const [url, setUrl] = useState('')

  const reset = () => {
    setTitle('')
    setArea('')
    setNote('')
    setUrl('')
  }

  const handleAdd = (e: FormEvent) => {
    e.preventDefault()
    const nextTitle = title.trim()
    if (nextTitle.length === 0) return
    const nextArea = area.trim()
    const nextNote = note.trim()
    const nextUrl = url.trim()
    dispatch({
      type: 'addWish',
      wish: {
        id: newId('w'),
        title: nextTitle,
        ...(nextArea.length > 0 ? { area: nextArea } : {}),
        done: false,
        ...(nextNote.length > 0 ? { note: nextNote } : {}),
        ...(nextUrl.length > 0 ? { url: nextUrl } : {}),
      },
    })
    reset()
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        className={subtleButtonClass}
        onClick={() => setOpen(true)}
      >
        <Plus size={16} />
        やりたいことを追加
      </button>
    )
  }

  return (
    <form
      onSubmit={handleAdd}
      className="rounded-xl border border-gray-200 p-3"
    >
      <AreaOptions id={listId} options={areaOptions} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-xs text-gray-500">
          やりたいこと
          <input
            className={`${fieldClass} mt-1`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="text-xs text-gray-500">
          場所(任意)
          <AreaField value={area} listId={listId} onChange={setArea} />
        </label>
        <label className="text-xs text-gray-500">
          メモ(任意)
          <input
            className={`${fieldClass} mt-1`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <label className="text-xs text-gray-500">
          参考リンク(任意)
          <input
            className={`${fieldClass} mt-1`}
            value={url}
            inputMode="url"
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        場所を書いておくと、その町にいる間だけ「今」タブの上に出ます。
        書かなくても「場所を決めていないもの」として残ります。
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="submit"
          className={primaryButtonClass}
          disabled={title.trim().length === 0}
        >
          <Plus size={16} />
          追加
        </button>
        <button
          type="button"
          className={subtleButtonClass}
          onClick={() => {
            reset()
            setOpen(false)
          }}
        >
          キャンセル
        </button>
      </div>
    </form>
  )
}

/**
 * 場所の入力候補。既に使った場所を先に、旅程に出てくる場所名をその後に並べる。
 *
 * 旅程側から拾うのは予約の place / from / to の name で、施設名のまま出す。
 * 都市名に寄せた形(toCityName)にしないのは、候補が「ホテル○○」ではなく
 * 「○○」に化けると、利用者が自分の予約と結び付けられなくなるためである。
 * 表記ゆれの吸収は突き合わせ側(placeNames.ts)がやるので、
 * ここは素直に見覚えのある文字を出す。
 */
function areaOptionsOf(state: TripNotesState): Array<string> {
  const used = (state.wishes ?? [])
    .map((wish) => wish.area?.trim() ?? '')
    .filter((area) => area !== '')
  const fromBookings = state.bookings
    .flatMap((booking) => [booking.place, booking.from, booking.to])
    .map((place) => place?.name.trim() ?? '')
    .filter((name) => name !== '')
  return [...new Set([...used, ...fromBookings])]
}

export function SettingsPanel({
  state,
  displayTz,
  dispatch,
  onSelectDate,
  onAddTrip,
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
  /** 読み取りに成功した JSON。取り込み先(追加か置き換えか)が決まるまでは適用しない */
  const [pendingImport, setPendingImport] = useState<TripNotesState | null>(
    null,
  )

  // 1 組も登録が無いときはフィールドごと存在しない(types.ts 参照)
  const aliases = state.placeAliases ?? []
  // 手続きも travelDocs?: Array<TravelDoc> ゆえの、同じ理由の空配列フォールバック
  const travelDocs = state.travelDocs ?? []
  // 国・地域の情報も countryInfos?: Array<CountryInfo> なので同じ扱い
  const countryInfos = state.countryInfos ?? []
  // やりたいことも wishes?: Array<Wish> なので同じ扱い。
  // 場所ごとにまとめるのは wishes.ts に委ね、ここでは並べるだけにする
  const wishGroups = groupWishesByArea(state.wishes ?? [])
  const areaOptions = areaOptionsOf(state)

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

  /**
   * .ics を書き出す。JSON の書き出しと同じ Blob → a[download] の流儀。
   * MIME は text/calendar。これで開いた先のカレンダーが「取り込むもの」だと分かる。
   */
  const handleDownloadIcs = () => {
    const blob = new Blob([buildTripIcs(state, Date.now())], {
      type: 'text/calendar;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = icsFileName(state, todayISO())
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleCopyJson = async () => {
    const ok = await copyText(JSON.stringify(state, null, 2))
    setIoMessage(
      ok
        ? { tone: 'ok', text: 'JSONをクリップボードにコピーしました。' }
        : { tone: 'error', text: 'コピーに失敗しました。' },
    )
  }

  /**
   * JSON を読み取って、取り込み先の確認ダイアログまで進める。
   *
   * 以前は window.confirm 一発で現在のデータを置き換えていたが、
   * 旅程を複数持てるようになったので「新しい旅程として追加」も選べるようにする。
   * ファイル選択と貼り付けのどちらもここを通るので、経路によって
   * 選択肢が違う(片方だけ置き換え固定)ということが起きない。
   */
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
    setIoMessage(null)
    setPendingImport(parsed)
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

  /**
   * いま開いている旅程だけを空にする。
   * 旅程を複数持てるようになったので、「すべて消す」という言い方は
   * 他の旅程まで消えると誤解される。実際に消えるのはこの旅程の中身だけ
   */
  const handleResetAll = () => {
    if (
      !window.confirm(
        'いま開いている旅程の予約と緊急連絡先をすべて削除して、この旅程を空にします。他の旅程は消えません。元に戻せません。よろしいですか?',
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
          {/*
            この設定で日付が動くと思われると、日程が 1 日ずれて見えたときに
            ここを触って直そうとしてしまう。効く範囲を先に書いておく
          */}
          <p className="text-xs text-gray-500">
            日程の日付はいつも現地の日付で並びます。この設定が効くのは、時刻の見せ方
            (日本時間を併記するかどうか)と、予約を追加するときの既定のタイムゾーンです。
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

        {/*
          カレンダーへの書き出し。共有URLと同じ「旅程を持ち出す」機能なので
          この節に置く。API 連携はせず、.ics を作って渡すところまでで手を引く
          (このツールは一切ネットワークに出ない)。
        */}
        <div className="mt-4 border-t border-gray-200 pt-4">
          <h3 className="text-sm font-semibold text-gray-800">
            カレンダーに書き出す
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            予約と申請期限を .ics
            ファイルにまとめます。パソコンのGoogleカレンダーの「設定 →
            インポート」から取り込めます。
          </p>
          <button
            type="button"
            className={`${subtleButtonClass} mt-3`}
            onClick={handleDownloadIcs}
          >
            <CalendarPlus size={16} />
            カレンダーに書き出す(.ics)
          </button>
          {/*
            この 2 つは知らないと必ずつまずくところなので、ボタンの近くに書く。
            重複は「取り込み専用カレンダーごと消す」が唯一の現実的な直し方で、
            取り込んでから気付くと予定を 1 件ずつ消すことになる。
            スマホの制約のほうは、書き出したファイルをスマホで開こうとして
            初めて分かるので、その前に 1 件ずつ登録する道を案内しておく。
          */}
          <ul className="mt-2 space-y-1 text-xs text-gray-500">
            <li>
              取り込み専用のカレンダーを1つ作って、そこへインポートするのがおすすめです。
              入れ直して予定が重複しても、そのカレンダーごと消せばやり直せます。
            </li>
            <li>
              スマホのGoogleカレンダーアプリは .ics
              を取り込めません。スマホで登録したいときは、日程タブで予約カードを開いて
              「Googleカレンダーに追加」から1件ずつ登録してください。
            </li>
          </ul>
        </div>
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

      {/* 7. 旅行前の手続き */}
      <section className={cardClass}>
        <h2 className={sectionTitleClass}>
          <IdCard size={18} className="text-cyan-600" />
          旅行前の手続き
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          ビザ・SIM/eSIM・海外旅行保険・入域許可など、出発前に済ませておく手続きを
          登録しておきましょう。期限や有効期間の抜けは進捗タブが教えてくれます。
        </p>

        {travelDocs.length === 0 ? (
          // 上の説明文と同じことを繰り返さない。空のときに足す価値があるのは
          // 「まず何を 1 件入れればいいか」の具体例だけ
          <p className="mt-3 text-sm text-gray-500">
            まだ登録がありません。まずは行き先のビザの要否と、現地の通信手段
            (SIM・eSIM)を1件ずつ入れておくと、出発直前に慌てずに済みます。
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {travelDocs.map((doc) => (
              <TravelDocRow key={doc.id} doc={doc} dispatch={dispatch} />
            ))}
          </ul>
        )}

        <div className="mt-3">
          <AddTravelDocSection dispatch={dispatch} />
        </div>
      </section>

      {/* 8. 国・地域の情報 */}
      <section className={cardClass}>
        <h2 className={sectionTitleClass}>
          <Plug size={18} className="text-cyan-600" />
          国・地域の情報
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          訪問する国・地域のプラグ形状・電圧・チップの文化・緊急通報番号をまとめておけます。
          現地で「変換プラグはどれだったか」「救急は何番か」を調べ直さずに済みます。
        </p>

        {countryInfos.length === 0 ? (
          /*
            この案内がこの機能の要になる。

            訪問国をアプリの側で推定することはしない。予約の地名から国を当てるのは
            誤爆する(「サンティアゴ」がチリなのかスペインなのかは、予約データからは
            決まらない)。そして間違った国の緊急通報番号を自信たっぷりに出すのは、
            欄が空のままよりはるかに危険で、しかも現地で番号を押してから気付く。
            だから国名の入力だけは人間の仕事だと割り切る。

            裏を返せば、人間が1行入れさえすれば、その先の欄はAIの一般知識で埋まる。
            この文はその「1行だけ入れてくれれば、残りは任せられる」を伝えるために
            置いている。ただの空状態の説明ではないので、他のセクションの空状態と違って
            「まず何を入れるか」だけでなく「入れたあとに何が起きるか」まで書く。
          */
          <p className="mt-3 text-sm text-gray-500">
            まだ登録がありません。
            <strong className="font-semibold text-gray-700">
              訪問する国・地域名を登録すると、プラグ形状・電圧・チップの文化・緊急通報番号を
              AI でまとめて埋められます。
            </strong>
            まずは国名だけ入れておけば十分です。
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {countryInfos.map((info) => (
              <CountryInfoRow key={info.id} info={info} dispatch={dispatch} />
            ))}
          </ul>
        )}

        <div className="mt-3">
          <AddCountryInfoSection dispatch={dispatch} />
        </div>
      </section>

      {/* 9. やりたいこと */}
      <section className={cardClass}>
        <h2 className={sectionTitleClass}>
          <Heart size={18} className="text-cyan-600" />
          やりたいこと
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          滞在先でやりたいことを町ごとに書いておけます。場所を書いておくと、
          その町にいる間だけ「今」タブの上に出ます。
        </p>

        {wishGroups.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            まだ登録がありません。行きたい店や見たいものを、思い付いた順に
            1行ずつ足しておけば十分です。「今」タブからも足せます。
          </p>
        ) : (
          <div className="mt-3 space-y-4">
            {wishGroups.map((group) => (
              <div key={group.area ?? ''}>
                <h3 className="flex items-center gap-1 text-sm font-semibold text-gray-700">
                  <MapPin
                    size={14}
                    className="shrink-0 text-gray-400"
                    aria-hidden="true"
                  />
                  {group.area ?? '場所を決めていないもの'}
                  <span className="text-xs font-normal text-gray-400">
                    {group.wishes.length}件
                  </span>
                </h3>
                <ul className="mt-1 space-y-2">
                  {group.wishes.map((wish) => (
                    <WishRow
                      key={wish.id}
                      wish={wish}
                      areaOptions={areaOptions}
                      dispatch={dispatch}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3">
          <AddWishSection areaOptions={areaOptions} dispatch={dispatch} />
        </div>
      </section>

      {/*
        10. 同じ場所として扱う組。
        進捗タブの警告カードから押した判断の置き場で、登録が無ければ何も出さない
        (使っていない人にとっては存在しない機能なので、説明ごと出す意味がない)。
        取り消せる場所をここに必ず設けているのは、押し間違えたまま放置すると
        その組の警告が二度と戻らず、本物の食い違いを見落とすため。
      */}
      {aliases.length > 0 ? (
        <section className={cardClass}>
          <h2 className={sectionTitleClass}>
            <MapPinCheck size={18} className="text-cyan-600" />
            同じ場所として扱う組
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            旅程の不整合で「同じ場所として扱う」を押した組です。この組は場所の食い違いとして
            警告されなくなります。押し間違えたときは削除すると元どおり警告が出ます。
          </p>
          <ul className="mt-3 space-y-2">
            {aliases.map((alias) => (
              <li
                key={alias.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 p-3"
              >
                <p className="min-w-0 text-sm text-gray-800">
                  <span className="font-semibold">{alias.names[0]}</span>
                  <span className="mx-1.5 text-gray-400" aria-hidden="true">
                    ＝
                  </span>
                  <span className="font-semibold">{alias.names[1]}</span>
                </p>
                <button
                  type="button"
                  aria-label={`${alias.names[0]} と ${alias.names[1]} を同じ場所として扱うのをやめる`}
                  className={iconButtonClass}
                  onClick={() =>
                    dispatch({ type: 'removePlaceAlias', id: alias.id })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 11. JSON入出力 */}
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

      {/* 12. いまの旅程を空にする */}
      <section className={cardClass}>
        <h2 className={sectionTitleClass}>
          <AlertTriangle size={18} className="text-rose-600" />
          いまの旅程を空にする
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          いま開いている旅程の予約と緊急連絡先をすべて削除して、最初からやり直します。
          他の旅程は消えません。旅程そのものを消したいときは、画面上部の旅程セレクタから「削除」を選んでください。
          元に戻せないので、必要なら先にJSONで書き出しておいてください。
        </p>
        <button
          type="button"
          className={`${dangerButtonClass} mt-3`}
          onClick={handleResetAll}
        >
          <Trash2 size={16} />
          いまの旅程を空にする
        </button>
      </section>

      {pendingImport !== null ? (
        <ImportChoiceDialog
          title="読み込んだ旅のしおりをどう取り込みますか？"
          incomingLabel="読み込んだ予約"
          incoming={pendingImport}
          current={state}
          onCancel={() => setPendingImport(null)}
          onAddAsNew={() => {
            onAddTrip(pendingImport)
            setPendingImport(null)
            setImportText('')
            setIoMessage({
              tone: 'ok',
              text: '新しい旅程として読み込みました。',
            })
          }}
          onReplace={() => {
            dispatch({ type: 'replaceState', state: pendingImport })
            setPendingImport(null)
            setImportText('')
            setIoMessage({
              tone: 'ok',
              text: 'いまの旅程を読み込んだ内容で置き換えました。',
            })
          }}
          onMerge={() => {
            // 判定も件数も planImport から出す。reducer が実際に適用するのと
            // 同じ計画なので、ダイアログのプレビューと結果の数字がズレない
            const plan = planImport(state.bookings, pendingImport.bookings)
            dispatch({ type: 'mergeTrip', incoming: pendingImport })
            setPendingImport(null)
            setImportText('')
            setIoMessage({
              tone: 'ok',
              text: `いまの旅程に合流しました。予約を${plan.addedCount}件追加、${plan.updatedCount}件更新しました。`,
            })
          }}
        />
      ) : null}
    </div>
  )
}
