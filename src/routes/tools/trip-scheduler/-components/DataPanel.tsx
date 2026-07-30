import { useState } from 'react'
import { Download, RotateCcw, Save, Upload } from 'lucide-react'
import { parseTripState } from '../../../../lib/trip-scheduler/storage'
import { todayISO } from '../-lib/format'
import { cardClass, sectionTitleClass, subtleButtonClass } from '../-lib/styles'
import type { ChangeEvent } from 'react'
import type { TripDispatch } from '../-lib/reducer'
import type { TripState } from '../../../../lib/trip-scheduler/types'

interface DataPanelProps {
  state: TripState
  dispatch: TripDispatch
}

/** JSON の書き出し・読み込みと、最初からやり直す導線 */
export function DataPanel({ state, dispatch }: DataPanelProps) {
  const [message, setMessage] = useState<{
    tone: 'ok' | 'error'
    text: string
  } | null>(null)

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'trip-plan.json'
    anchor.click()
    URL.revokeObjectURL(url)
    setMessage({ tone: 'ok', text: 'trip-plan.json を書き出しました。' })
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const parsed = parseTripState(JSON.parse(await file.text()))
      if (!parsed) {
        setMessage({
          tone: 'error',
          text: '旅程データとして読み取れませんでした。このツールで書き出した JSON を選んでください。',
        })
        return
      }
      dispatch({ type: 'replaceState', state: parsed })
      setMessage({ tone: 'ok', text: '旅程を読み込みました。' })
    } catch {
      setMessage({
        tone: 'error',
        text: 'ファイルを読み込めませんでした(JSON として解析できません)。',
      })
    }
  }

  const handleReset = () => {
    if (!window.confirm('いまの日程をすべて破棄して最初からやり直しますか?')) {
      return
    }
    dispatch({ type: 'resetAll', today: todayISO() })
    setMessage({ tone: 'ok', text: '最初からやり直しました。' })
  }

  return (
    <section className={cardClass}>
      <h2 className={sectionTitleClass}>
        <Save size={18} className="text-cyan-600" />
        データ
      </h2>
      <p className="mt-2 text-sm text-gray-600">
        編集内容はこのブラウザにだけ保存され、サーバーには送信されません。
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleExport}
          className={subtleButtonClass}
        >
          <Download size={16} />
          JSONで書き出す
        </button>
        <label className={`${subtleButtonClass} cursor-pointer`}>
          <Upload size={16} />
          JSONを読み込む
          <input
            type="file"
            accept="application/json,.json"
            onChange={handleImport}
            className="hidden"
          />
        </label>
        <button
          type="button"
          onClick={handleReset}
          className={`${subtleButtonClass} text-red-600 hover:bg-red-50`}
        >
          <RotateCcw size={16} />
          最初からやり直す
        </button>
      </div>

      {message ? (
        <p
          className={`mt-3 rounded-xl px-3 py-2 text-sm ${
            message.tone === 'ok'
              ? 'bg-emerald-50 text-emerald-800'
              : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </section>
  )
}
