import { useState } from 'react'
import { Button, Note } from '../../../../components/ui'
import { parseTripState } from '../../../../lib/trip-scheduler/storage'
import { todayISO } from '../-lib/format'
import { panelClass, sectionLeadClass, sectionTitleClass } from '../-lib/styles'
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
    <section className={panelClass}>
      <h2 className={sectionTitleClass}>データ</h2>
      <p className={sectionLeadClass}>
        編集内容はこのブラウザに自動保存されます。
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={handleExport}>JSONで書き出す</Button>
        <label className="btn btn-secondary cursor-pointer has-[:focus-visible]:shadow-[3px_3px_0_0_var(--color-pink)]">
          JSONを読み込む
          <input
            type="file"
            accept="application/json,.json"
            onChange={handleImport}
            className="sr-only"
          />
        </label>
        <Button variant="danger" onClick={handleReset}>
          最初からやり直す
        </Button>
      </div>

      {message ? (
        message.tone === 'ok' ? (
          <Note className="mt-4" role="status">
            {message.text}
          </Note>
        ) : (
          <Note tone="error" className="mt-4" role="alert">
            {message.text}
          </Note>
        )
      ) : null}
    </section>
  )
}
