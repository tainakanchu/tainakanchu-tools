/**
 * 旅程(同行者全員で共通)の入力欄。
 *
 * 公式テンプレートは入国日も便名も宿泊先も 1 人ずつの列として持っているが、
 * 同行者は同じ便で入って同じ宿に泊まるのが普通なので、ここで 1 度だけ入力させ、
 * 書き出すときに全員の行へ配る(xlsx.ts の buildRowValues)。
 *
 * 手段(AIR / SEA)で入力欄そのものを出し分けているのは、テンプレートの
 * 条件付き書式が「AIR のときは船便番号を書くな、SEA のときは航空会社と便番号を
 * 書くな」と塗り分けているのに合わせるため。両方に値が入った行は向こうで弾かれる。
 */

import { useState } from 'react'
import { History, MapPin, PlaneLanding, PlaneTakeoff } from 'lucide-react'
import { formatSavedAt, summarizePastTrip } from '../-lib/pastTrips'
import {
  ACCOMMODATION_OPTIONS,
  FLIGHT_CODE_OPTIONS,
  MODE_OF_TRAVEL_OPTIONS,
  PURPOSE_OPTIONS,
  PURPOSE_OTHERS,
  PURPOSE_VISIT_RELATIVE,
} from '../-lib/options'
import {
  cardClass,
  labelClass,
  sectionTitleClass,
  subtleButtonClass,
} from '../-lib/styles'
import { LIST_IDS, ListField, SelectField, TextField } from './Fields'
import type {
  Accommodation,
  ModeOfTravel,
  PastTrip,
  TripInfo,
} from '../-lib/types'

interface TripFormProps {
  trip: TripInfo
  onChange: <K extends keyof TripInfo>(key: K, value: TripInfo[K]) => void
  /** 新しいものが先頭。空なら「過去の旅程からコピー」自体を出さない */
  pastTrips: ReadonlyArray<PastTrip>
  onApplyPastTrip: (past: PastTrip) => void
}

/**
 * 滞在先の種別に添える日本語。値そのもの(テンプレートに書き込む文字列)は
 * 英語のまま扱い、ここでは画面に出す説明だけを足す。
 */
const ACCOMMODATION_LABELS: Record<Accommodation, string> = {
  'Hotel Name': 'Hotel Name(ホテル)',
  'Residential Address': 'Residential Address(住居)',
  Transfer: 'Transfer(乗り継ぎ・滞在しない)',
}

function isMode(value: string): value is ModeOfTravel {
  return value === 'AIR' || value === 'SEA'
}

function isAccommodation(value: string): value is Accommodation {
  return (
    value === 'Residential Address' ||
    value === 'Hotel Name' ||
    value === 'Transfer'
  )
}

/** 入国側・出国側で同じ形の 3 欄(手段・便・便番号)を出す */
function LegFields({
  mode,
  flightCode,
  flightNumber,
  vesselNumber,
  onModeChange,
  onFlightCodeChange,
  onFlightNumberChange,
  onVesselNumberChange,
}: {
  mode: ModeOfTravel
  flightCode: string
  flightNumber: string
  vesselNumber: string
  onModeChange: (value: ModeOfTravel) => void
  onFlightCodeChange: (value: string) => void
  onFlightNumberChange: (value: string) => void
  onVesselNumberChange: (value: string) => void
}) {
  return (
    <>
      <label className="block space-y-1">
        <span className={labelClass}>手段</span>
        <select
          value={mode}
          onChange={(event) => {
            if (isMode(event.target.value)) onModeChange(event.target.value)
          }}
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
        >
          {MODE_OF_TRAVEL_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === 'AIR' ? 'AIR(航空)' : 'SEA(船舶)'}
            </option>
          ))}
        </select>
      </label>

      {mode === 'AIR' ? (
        <>
          <ListField
            label="航空会社"
            value={flightCode}
            onChange={onFlightCodeChange}
            listId={LIST_IDS.flightCode}
            options={FLIGHT_CODE_OPTIONS}
            placeholder="BR と打つと絞り込めます"
            hint="例: BR : EVA Air"
          />
          <TextField
            label="便番号(数字のみ)"
            value={flightNumber}
            onChange={onFlightNumberChange}
            placeholder="190"
            hint="BR190 なら 190。航空会社コードは含めません"
          />
        </>
      ) : (
        <TextField
          label="船便番号"
          value={vesselNumber}
          onChange={onVesselNumberChange}
          placeholder="船名・便名"
        />
      )}
    </>
  )
}

/**
 * 過去の旅程の一覧。開いて 1 件選ぶとその内容がコピーされる。
 *
 * インラインで開くだけにしてモーダルにはしない。ここは「下書きを選ぶ」だけの
 * 操作で、選び直しも取り消しも画面を閉じずにできるほうがよい。
 * 各行に日付・便・宿泊先を出しておくのは、保存日時だけでは
 * どれがどの旅行だったかを思い出せないため。
 */
function PastTripPicker({
  pastTrips,
  onApply,
}: {
  pastTrips: ReadonlyArray<PastTrip>
  onApply: (past: PastTrip) => void
}) {
  const [open, setOpen] = useState(false)
  if (pastTrips.length === 0) return null

  return (
    <div className="mt-3">
      <button
        type="button"
        className={subtleButtonClass}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <History size={16} aria-hidden="true" />
        過去の旅程からコピー({pastTrips.length}件)
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-600">
            便名・渡航目的・宿泊先などをコピーします。
            <strong className="font-semibold text-gray-800">
              入国日と出国予定日はコピーしません。
            </strong>
            前回の日付がそのまま残ったまま書き出されるのを防ぐためです。
          </p>
          <ul className="mt-2 space-y-1">
            {pastTrips.map((past) => (
              <li key={past.id}>
                <button
                  type="button"
                  onClick={() => {
                    onApply(past)
                    setOpen(false)
                  }}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm transition hover:border-cyan-400 hover:bg-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
                >
                  <span className="block font-medium text-gray-800">
                    {summarizePastTrip(past)}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {formatSavedAt(past.savedAt)} に保存
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function TripForm({
  trip,
  onChange,
  pastTrips,
  onApplyPastTrip,
}: TripFormProps) {
  /*
    渡航目的と滞在先の種別を切り替えたら、それにぶら下がる欄も消す。

    欄は画面から消えるが、値は state に残り続ける。探親を選んで親族名を書いてから
    観光に戻すと、画面には出ていない親族名が残ったまま書き出される
    (xlsx.ts の buildRowValues も同じ組を落とすので二重の守りだが、
    こちらで消しておけば「消したはずの値が保存され続ける」ことも避けられる)。
    値の残骸を localStorage や過去の旅程の履歴まで持ち回らないために、
    切り替えた時点で消す。
  */
  const handlePurposeChange = (value: string): void => {
    onChange('purpose', value)
    if (value !== PURPOSE_VISIT_RELATIVE) {
      onChange('relativesName', '')
      onChange('relativesMobile', '')
    }
    if (value !== PURPOSE_OTHERS) onChange('reason', '')
  }

  const handleAccommodationChange = (value: Accommodation): void => {
    onChange('accommodation', value)
    // 乗り継ぎのみなら住所もホテル名も書かない欄になる
    if (value === 'Transfer') onChange('addressOrHotel', '')
  }

  return (
    <section className={cardClass}>
      <h2 className={sectionTitleClass}>
        <PlaneLanding size={18} aria-hidden="true" className="text-cyan-600" />
        旅程(同行者全員で共通)
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        同じ便で入国し、同じ宿に泊まる前提です。書き出すときに全員の行へ同じ値が入ります。
      </p>

      <PastTripPicker pastTrips={pastTrips} onApply={onApplyPastTrip} />

      <fieldset className="mt-4 space-y-3 rounded-xl border border-gray-200 p-3">
        <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-gray-700">
          <PlaneLanding size={15} aria-hidden="true" />
          台湾に入る
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="入国日"
            type="date"
            value={trip.dateOfEntry}
            onChange={(value) => onChange('dateOfEntry', value)}
            hint="深夜便は台湾に着いた側の日付"
          />
          <LegFields
            mode={trip.entryMode}
            flightCode={trip.entryFlightCode}
            flightNumber={trip.entryFlightNumber}
            vesselNumber={trip.entryVesselNumber}
            onModeChange={(value) => onChange('entryMode', value)}
            onFlightCodeChange={(value) => onChange('entryFlightCode', value)}
            onFlightNumberChange={(value) =>
              onChange('entryFlightNumber', value)
            }
            onVesselNumberChange={(value) =>
              onChange('entryVesselNumber', value)
            }
          />
        </div>
      </fieldset>

      <fieldset className="mt-3 space-y-3 rounded-xl border border-gray-200 p-3">
        <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-gray-700">
          <PlaneTakeoff size={15} aria-hidden="true" />
          台湾から出る
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="出国予定日"
            type="date"
            value={trip.exitDate}
            onChange={(value) => onChange('exitDate', value)}
          />
          <LegFields
            mode={trip.exitMode}
            flightCode={trip.exitFlightCode}
            flightNumber={trip.exitFlightNumber}
            vesselNumber={trip.exitVesselNumber}
            onModeChange={(value) => onChange('exitMode', value)}
            onFlightCodeChange={(value) => onChange('exitFlightCode', value)}
            onFlightNumberChange={(value) =>
              onChange('exitFlightNumber', value)
            }
            onVesselNumberChange={(value) =>
              onChange('exitVesselNumber', value)
            }
          />
        </div>
      </fieldset>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <SelectField
          label="渡航目的"
          value={trip.purpose}
          onChange={handlePurposeChange}
          options={PURPOSE_OPTIONS}
          emptyLabel="選択してください"
        />
      </div>

      {/*
        テンプレートの条件付き書式に合わせて、目的が探親のときだけ親族の欄を、
        其他のときだけ理由の欄を出す。常に出しておくと「自分に関係のある欄か」を
        毎回考えることになり、関係ないのに埋めてしまう人が出る
      */}
      {trip.purpose === PURPOSE_VISIT_RELATIVE && (
        <div className="mt-3 grid gap-3 rounded-xl border border-gray-200 p-3 sm:grid-cols-2">
          <TextField
            label="親族の氏名"
            value={trip.relativesName}
            onChange={(value) => onChange('relativesName', value)}
          />
          <TextField
            label="親族の電話番号"
            type="tel"
            value={trip.relativesMobile}
            onChange={(value) => onChange('relativesMobile', value)}
          />
        </div>
      )}

      {trip.purpose === PURPOSE_OTHERS && (
        <div className="mt-3 rounded-xl border border-gray-200 p-3">
          <TextField
            label="理由"
            value={trip.reason}
            onChange={(value) => onChange('reason', value)}
            hint="渡航目的が「其他」のときだけ必要です"
          />
        </div>
      )}

      <fieldset className="mt-3 space-y-3 rounded-xl border border-gray-200 p-3">
        <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-gray-700">
          <MapPin size={15} aria-hidden="true" />
          台湾での滞在先
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className={labelClass}>滞在先の種別</span>
            <select
              value={trip.accommodation}
              onChange={(event) => {
                if (isAccommodation(event.target.value)) {
                  handleAccommodationChange(event.target.value)
                }
              }}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
            >
              {ACCOMMODATION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {ACCOMMODATION_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
          {trip.accommodation !== 'Transfer' && (
            <TextField
              label={trip.accommodation === 'Hotel Name' ? 'ホテル名' : '住所'}
              value={trip.addressOrHotel}
              onChange={(value) => onChange('addressOrHotel', value)}
              placeholder={
                trip.accommodation === 'Hotel Name'
                  ? 'Grand Hyatt Taipei'
                  : 'No. 1, Sec. 1, ... Taipei City'
              }
              hint="ラテン文字(英語表記)で入力してください"
            />
          )}
        </div>
        {trip.accommodation === 'Transfer' && (
          <p className="text-xs text-gray-500">
            乗り継ぎのみの場合、住所やホテル名の入力は不要です。
          </p>
        )}
      </fieldset>
    </section>
  )
}
