import { useEffect, useId, useRef, useState } from 'react'
import { Download, Share2 } from 'lucide-react'
import { FORMAT_CHOICES, formatBytes } from '../-lib/export'
import { Field, Segmented } from './ui'
import type { ExportScale } from '../-lib/export'
import type { ExportState } from './useSetlistRender'

/** 解像度は 2 択（3x はやめた。既定は 2x） */
const SCALES: ReadonlyArray<{ value: ExportScale; label: string }> = [
  { value: 1, label: '標準' },
  { value: 2, label: '高解像度' },
]

/**
 * 保存・共有。phone では画面の下に固定（CSS）、desktop では操作の列の中。
 * 形式と解像度は横の小さなメニューにまとめる。
 */
export function SaveBar({ state }: { state: ExportState }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const multi = state.pageCount > 1
  const formatLabel = state.format.ext === 'jpg' ? 'JPEG' : 'PNG'

  // メニューの外を押す・Esc で閉じる
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        wrapRef.current?.contains(event.target)
      )
        return
      setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const tips = [
    state.hasPhoto && state.format.ext === 'png' ? 'JPEG' : '',
    state.scale > 1 ? '標準の解像度' : '',
  ].filter(Boolean)

  return (
    <div className="slc-savebar">
      {state.message ? (
        <p className="slc-note mb-2" role="status">
          {state.message}
        </p>
      ) : null}
      {state.tooLarge ? (
        <p className="slc-note mb-2" data-tone="alert">
          {multi ? '1 枚が' : ''}5MB 超（{formatBytes(state.largest)}）。X
          では再圧縮されます
          {tips.length > 0 ? `。${tips.join(' か ')}で小さくなる` : ''}
        </p>
      ) : null}
      <div ref={wrapRef} className="relative flex items-stretch gap-2">
        <button
          type="button"
          className="slc-btn flex-1"
          data-variant="primary"
          onClick={() => void state.download()}
          disabled={state.busy}
        >
          <Download size={18} aria-hidden />
          {multi ? `${state.pageCount} 枚を保存` : '保存'}
        </button>
        {state.shareSupported ? (
          <button
            type="button"
            className="slc-btn"
            onClick={state.share}
            disabled={state.busy || state.shareStatus === 'no'}
            title={
              state.shareStatus === 'no'
                ? 'この端末ではこの画像を共有できません'
                : undefined
            }
          >
            <Share2 size={18} aria-hidden />
            共有
          </button>
        ) : null}
        <button
          ref={buttonRef}
          type="button"
          className="slc-btn mono text-[12px]!"
          data-variant="ghost"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label={`形式と解像度: ${formatLabel}・${state.scale}x`}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {formatLabel} · {state.scale}x<span aria-hidden>▾</span>
        </button>
        {menuOpen ? (
          <div
            id={menuId}
            role="dialog"
            aria-label="形式と解像度"
            className="slc-popover space-y-4"
          >
            <Field label="形式">
              <Segmented
                label="形式"
                value={state.hasPhoto ? state.formatChoice : 'png'}
                options={FORMAT_CHOICES.map((o) => ({
                  value: o.value,
                  label: o.label,
                  disabled: !state.hasPhoto && o.value !== 'png',
                  title:
                    o.value === 'auto'
                      ? '写真入りは JPEG、写真なしは PNG'
                      : !state.hasPhoto && o.value === 'jpeg'
                        ? '写真が無いときは PNG の方がくっきり小さい'
                        : undefined,
                }))}
                onChange={state.setFormatChoice}
              />
            </Field>
            <Field label="解像度">
              <Segmented
                label="解像度"
                value={state.scale}
                options={SCALES.map((o) => ({
                  value: o.value,
                  label: o.label,
                  title: `${o.value}x`,
                }))}
                onChange={state.setScaleChoice}
              />
            </Field>
          </div>
        ) : null}
      </div>
    </div>
  )
}
