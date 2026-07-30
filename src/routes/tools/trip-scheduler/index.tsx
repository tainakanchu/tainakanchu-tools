import { useEffect, useMemo, useReducer } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Redo2, Undo2 } from 'lucide-react'
import { deriveTrip } from '../../../lib/trip-scheduler/derive'
import {
  createInitialState,
  loadFromStorage,
  saveToStorage,
} from '../../../lib/trip-scheduler/storage'
import { CityPool } from './-components/CityPool'
import { ConstraintPanel } from './-components/ConstraintPanel'
import { DataPanel } from './-components/DataPanel'
import { MetricsPanel } from './-components/MetricsPanel'
import { NightsBudget } from './-components/NightsBudget'
import { SetupPanel } from './-components/SetupPanel'
import { StayList } from './-components/StayList'
import { Timeline } from './-components/Timeline'
import { createHistory, historyReducer } from './-lib/reducer'
import { buildCityColorMap } from './-lib/palette'
import { todayISO } from './-lib/format'
import { subtleButtonClass } from './-lib/styles'
import type { HistoryState } from './-lib/reducer'

export const Route = createFileRoute('/tools/trip-scheduler/')({
  component: TripSchedulerPage,
})

const SAVE_DEBOUNCE_MS = 500

function initHistory(): HistoryState {
  return createHistory(loadFromStorage() ?? createInitialState(todayISO()))
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  )
}

function TripSchedulerPage() {
  const [history, dispatch] = useReducer(historyReducer, undefined, initHistory)
  const state = history.present

  const derived = useMemo(() => deriveTrip(state), [state])
  const colors = useMemo(
    () => buildCityColorMap(state.stays.map((stay) => stay.cityId)),
    [state.stays],
  )

  useEffect(() => {
    const timer = window.setTimeout(
      () => saveToStorage(state),
      SAVE_DEBOUNCE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [state])

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

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 text-gray-900">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">旅程パズル</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-gray-600">
            限られた泊数を、移動という見えないコストを見ながら2人で配り切るためのツールです。
            航空券で決まっている期間と発着都市を先に固定し、「残りの泊をどこに置くか」だけに集中します。
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
            元に戻す
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'redo' })}
            disabled={history.future.length === 0}
            className={subtleButtonClass}
            title="やり直す (Ctrl/⌘ + Shift + Z)"
          >
            <Redo2 size={16} />
            やり直す
          </button>
        </div>
      </header>

      <div className="sticky top-16 z-20 mt-6">
        <NightsBudget derived={derived} />
      </div>

      <div className="mt-6 space-y-6">
        <SetupPanel state={state} dispatch={dispatch} />

        <Timeline state={state} derived={derived} colors={colors} />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <StayList
              state={state}
              derived={derived}
              colors={colors}
              dispatch={dispatch}
            />
          </div>
          <div className="space-y-6">
            <CityPool state={state} dispatch={dispatch} />
            <ConstraintPanel
              state={state}
              derived={derived}
              dispatch={dispatch}
            />
            <MetricsPanel derived={derived} />
            <DataPanel state={state} dispatch={dispatch} />
          </div>
        </div>
      </div>
    </main>
  )
}
