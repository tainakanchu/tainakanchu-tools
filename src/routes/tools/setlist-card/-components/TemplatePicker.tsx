import { useEffect, useRef, useState } from 'react'
import { LAYOUTS } from '../-lib/layouts'
import { renderPage, resetMeasureCache } from '../-lib/render'
import { createSampleSetlist } from '../-lib/sample'
import { templateStyle } from '../-lib/tpl-common'
import { radioKeys, radioTabIndex } from './ui'
import type { ReactNode } from 'react'
import type { CanvasSize, LayoutId } from '../-lib/layouts'
import type { RenderInput } from '../-lib/render'

/** 見本の組み方の大きさ（4:5 を 1/5 に）。描くのは表示の幅 × 端末の画素密度 */
const THUMB_SIZE: CanvasSize = {
  id: 'portrait',
  label: '4:5',
  note: '',
  width: 216,
  height: 270,
}
/** サムネの表示の幅（CSS px） */
const THUMB_CSS_WIDTH = 96

type Props = {
  layout: LayoutId
  onChange: (layout: LayoutId) => void
  /** 見本を描くための今の設定（テンプレートとサイズは見本ごとに差し替える） */
  input: RenderInput
  /** 見出しの右に置くもの（ランダムの「固定」） */
  aside?: ReactNode
}

const fallbackSetlist = createSampleSetlist()

function Thumb({
  id,
  input,
  epoch,
}: {
  id: LayoutId
  input: RenderInput
  epoch: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const canvas = ref.current
      const c = canvas?.getContext('2d')
      if (!canvas || !c) return
      // 端末の画素密度で描いてにじませない（2x の画面なら 192×240 px）
      const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1))
      const scale = (THUMB_CSS_WIDTH * dpr) / THUMB_SIZE.width
      const w = Math.round(THUMB_SIZE.width * scale)
      const h = Math.round(THUMB_SIZE.height * scale)
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      const setlist =
        input.setlist.tracks.length > 0 ? input.setlist : fallbackSetlist
      // 描くのは先頭 12 曲だけ（軽くするため）。曲数・セットの長さは全曲から出すので、
      // 見本でも本当と違う数は書かない
      const end = Math.min(12, setlist.tracks.length)
      const thumbInput: RenderInput = {
        ...input,
        layout: id,
        size: THUMB_SIZE,
        style:
          id === input.layout ? input.style : templateStyle(id, input.style),
        setlist,
        split: { ...input.split, enabled: false },
        display: { ...input.display, credit: false },
      }
      try {
        renderPage(
          c,
          thumbInput,
          { index: 0, count: 1, start: 0, end },
          undefined,
          false,
          scale,
        )
      } catch {
        // 見本が描けなくても本体には影響させない
      }
    }, 180)
    return () => window.clearTimeout(timer)
  }, [id, input, epoch])
  return <canvas ref={ref} aria-hidden />
}

/** テンプレートはサムネの横 1 列（名前はサムネの下、説明は title） */
export function TemplatePicker({ layout, onChange, input, aside }: Props) {
  const [epoch, setEpoch] = useState(0)
  useEffect(() => {
    const bump = () => {
      resetMeasureCache()
      setEpoch((n) => n + 1)
    }
    document.fonts.addEventListener('loadingdone', bump)
    return () => document.fonts.removeEventListener('loadingdone', bump)
  }, [])
  return (
    <div>
      <div className="flex items-center justify-between">
        <span id="slc-template-label" className="slc-label">
          テンプレート
        </span>
        {aside}
      </div>
      <div
        role="radiogroup"
        aria-labelledby="slc-template-label"
        className="slc-strip"
        onKeyDown={radioKeys}
      >
        {LAYOUTS.map((item, i) => {
          const checked = layout === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={radioTabIndex(checked, i, true)}
              className="slc-thumb"
              onClick={() => onChange(item.id)}
              title={item.note}
            >
              <Thumb id={item.id} input={input} epoch={epoch} />
              <span>{item.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
