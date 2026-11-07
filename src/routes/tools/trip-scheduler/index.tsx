import { useEffect, useMemo, useReducer, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Button, Page, PageTitle } from '../../../components/ui'
import { getToolMeta, toolPageTitle } from '../../../lib/site-meta'
import { deriveTrip } from '../../../lib/trip-scheduler/derive'
import {
  createInitialState,
  loadFromStorage,
  saveToStorage,
} from '../../../lib/trip-scheduler/storage'
import { CityPool } from './-components/CityPool'
import { ConstraintPanel } from './-components/ConstraintPanel'
import { DataPanel } from './-components/DataPanel'
import { HandoffPanel } from './-components/HandoffPanel'
import { MetricsPanel } from './-components/MetricsPanel'
import { NightsBudget } from './-components/NightsBudget'
import { RouteMap } from './-components/RouteMap'
import { SetupPanel } from './-components/SetupPanel'
import { StayList } from './-components/StayList'
import { Timeline } from './-components/Timeline'
import { TripDragArea } from './-components/TripDragArea'
import { createHistory, historyReducer } from './-lib/reducer'
import { buildCityColorMap } from './-lib/palette'
import { todayISO } from './-lib/format'
import type { HistoryState } from './-lib/reducer'

// head() と静的 OG HTML で同じ文言を使うため site-meta を単一ソースにする
const tool = getToolMeta('trip-scheduler')!

export const Route = createFileRoute('/tools/trip-scheduler/')({
  head: () => ({
    meta: [
      { title: toolPageTitle(tool.name) },
      { name: 'description', content: tool.description },
    ],
  }),
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

  const pendingRef = useRef<typeof state | null>(null)

  useEffect(() => {
    pendingRef.current = state
    const timer = window.setTimeout(() => {
      saveToStorage(state)
      pendingRef.current = null
    }, SAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [state])

  useEffect(() => {
    return () => {
      if (pendingRef.current !== null) {
        saveToStorage(pendingRef.current)
        pendingRef.current = null
      }
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

  return (
    // 横に長いほど価値が出るツール(タイムライン / 日ごとのストリップ / 3カラム編集)なので広幅の枠を使う
    <Page width="wide">
      <PageTitle
        lead="航空券で決まった期間と発着都市を先に固定して、残りの泊をどの都市に配るかを、移動にかかる時間を見ながら 2 人で考えます。"
        actions={
          <>
            <Button
              size="sm"
              onClick={() => dispatch({ type: 'undo' })}
              disabled={history.past.length === 0}
              title="Ctrl/⌘ + Z"
            >
              元に戻す
            </Button>
            <Button
              size="sm"
              onClick={() => dispatch({ type: 'redo' })}
              disabled={history.future.length === 0}
              title="Ctrl/⌘ + Shift + Z"
            >
              やり直す
            </Button>
          </>
        }
      >
        旅程パズル
      </PageTitle>

      <div className="sticky top-16 z-20">
        <NightsBudget derived={derived} />
      </div>

      <div className="mt-8 space-y-8">
        <SetupPanel state={state} dispatch={dispatch} />

        {/*
          タイムラインは横に長いほど読みやすく、ルートマップは正方形寄りが映える。
          xl 以上でだけ 2:1 の横並びにして、狭い画面では縦に積む。
        */}
        <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] [&>*]:min-w-0">
          <Timeline state={state} derived={derived} colors={colors} />
          <RouteMap state={state} derived={derived} colors={colors} />
        </div>

        {/* 滞在リストの並べ替えと、候補プールからの差し込みを同じドラッグ空間で扱う */}
        <TripDragArea state={state} colors={colors} dispatch={dispatch}>
          {/*
            lg まで: 左に滞在リスト(2/3)、右に候補プール〜データを積んだ1本のサイドカラム。
            xl 以上: サイドカラムを display:contents で解いて 3 カラム(1:2:1)にする。
            左=候補プール / 中央=滞在リスト(編集の主役なので最も広い2カラムぶん) / 右=条件・指標・データ。
            候補プールを滞在リストの真横に置き、プールから滞在リストまでのドラッグ距離を短く保つ。
            滞在リストの col-span-2 は lg 指定がそのまま xl にも効く。
          */}
          <div className="grid gap-8 lg:grid-cols-3 xl:grid-cols-4 [&>*]:min-w-0">
            <div className="lg:col-span-2 xl:order-2">
              <StayList
                state={state}
                derived={derived}
                colors={colors}
                dispatch={dispatch}
              />
            </div>
            <div className="flex flex-col gap-8 xl:contents">
              <div className="xl:order-1">
                <CityPool state={state} dispatch={dispatch} />
              </div>
              <div className="flex flex-col gap-8 xl:order-3">
                <ConstraintPanel
                  state={state}
                  derived={derived}
                  dispatch={dispatch}
                />
                <MetricsPanel derived={derived} />
                {/*
                  指標のすぐ下に置く。「この案でよさそう」と納得した直後が、
                  しおりへ渡したくなる瞬間だからである
                  (データ書き出しより前に目に入る位置でもある)
                */}
                <HandoffPanel state={state} />
                <DataPanel state={state} dispatch={dispatch} />
              </div>
            </div>
          </div>
        </TripDragArea>
      </div>
    </Page>
  )
}
