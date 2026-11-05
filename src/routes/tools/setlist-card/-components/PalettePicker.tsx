import { useState } from 'react'
import { assignRoles, parseColorList, parseHex } from '../-lib/palette-parse'
import {
  CONTRAST,
  PALETTE_ROLES,
  PRESET_PALETTES,
  ROLE_LABELS,
  contrastReport,
  fixPalette,
  sameColors,
} from '../-lib/palettes'
import { Field, radioKeys, radioTabIndex } from './ui'
import type { ReactNode } from 'react'
import type { Palette, PaletteRole } from '../-lib/palettes'
import type { Swatch as PhotoSwatch } from '../-lib/palette-extract'

/** 丸の中身: 背景・文字・差し色を斜めに切って見せる */
function swatchBackground(p: Palette): string {
  return `linear-gradient(135deg, ${p.bg} 0 52%, ${p.fg} 52% 78%, ${p.accent} 78%)`
}

function Swatch({
  palette,
  checked,
  tabIndex,
  onClick,
  label,
}: {
  palette: Palette
  checked: boolean
  tabIndex: 0 | -1
  onClick: () => void
  label?: string
}) {
  const name = label ?? palette.name
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={name}
      title={name}
      tabIndex={tabIndex}
      className="slc-swatch"
      onClick={onClick}
    >
      <span style={{ background: swatchBackground(palette) }} />
    </button>
  )
}

/** 読みにくい配色か（文字・補助の文字が背景に対して薄すぎる） */
export function isHardToRead(p: Palette): boolean {
  const r = contrastReport(p)
  return r.fg < CONTRAST.fgMin || r.muted < 3
}

/**
 * 配色は丸の 1 列。写真があれば写真から作った 4 色を先頭に。
 * 自分で作った配色を選んでいるときは、その丸も先頭に出す（選んでいるものが見えるように）。
 */
export function PalettePicker({
  palette,
  onChange,
  photoPalettes,
  aside,
}: {
  palette: Palette
  onChange: (palette: Palette) => void
  /** 写真から作った配色（写真があるときだけ） */
  photoPalettes: ReadonlyArray<Palette>
  aside?: ReactNode
}) {
  // 「写真から自動」は写真の配色のどれかと同じ色なので、その丸を選んでいることにする
  const isCurrent = (p: Palette) =>
    p.id === palette.id ||
    (palette.id === 'photo-auto' &&
      p.id.startsWith('photo-') &&
      sameColors(p, palette))
  const inRow = photoPalettes.some(isCurrent) || PRESET_PALETTES.some(isCurrent)
  const items: Array<{ p: Palette; label?: string }> = [
    ...(inRow ? [] : [{ p: palette }]),
    ...photoPalettes.map((p) => ({ p, label: p.name })),
    ...PRESET_PALETTES.map((p) => ({ p })),
  ]
  const presetStart = items.length - PRESET_PALETTES.length
  return (
    <div>
      <div className="flex items-center justify-between">
        <span id="slc-palette-label" className="slc-label">
          配色
        </span>
        {aside}
      </div>
      <div
        role="radiogroup"
        aria-labelledby="slc-palette-label"
        className="slc-strip gap-0!"
        onKeyDown={radioKeys}
      >
        {items.map((it, i) => (
          <SwatchWithSep
            key={it.p.id}
            sep={photoPalettes.length > 0 && i === presetStart}
          >
            <Swatch
              palette={it.p}
              label={it.label}
              checked={isCurrent(it.p)}
              tabIndex={radioTabIndex(isCurrent(it.p), i, true)}
              onClick={() => onChange(it.p)}
            />
          </SwatchWithSep>
        ))}
      </div>
      {isHardToRead(palette) ? (
        <p className="slc-note" data-tone="alert">
          読みにくい配色です
        </p>
      ) : null}
    </div>
  )
}

function SwatchWithSep({
  sep,
  children,
}: {
  sep: boolean
  children: ReactNode
}) {
  if (!sep) return children
  return (
    <>
      <span className="slc-strip-sep" aria-hidden />
      {children}
    </>
  )
}

/**
 * 自分の色で作る（詳細設定）: 役割ごとの色・色の並びの貼り付け・写真の色の割り当て・
 * マイパレットの保存 / 名前の変更 / 削除。
 */
export function PaletteEditor({
  palette,
  onChange,
  myPalettes,
  onSaveMine,
  onRenameMine,
  onDeleteMine,
  photoSwatches,
}: {
  palette: Palette
  onChange: (palette: Palette) => void
  myPalettes: ReadonlyArray<Palette>
  onSaveMine: (palette: Palette, name: string) => boolean
  onRenameMine: (id: string, name: string) => void
  onDeleteMine: (id: string) => void
  /** 写真の代表色（写真があるときだけ） */
  photoSwatches: ReadonlyArray<PhotoSwatch>
}) {
  const [paste, setPaste] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [saveName, setSaveName] = useState('')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [hexDraft, setHexDraft] = useState<
    Partial<Record<PaletteRole, string>>
  >({})

  const edit = (role: PaletteRole, hex: string) =>
    onChange({ ...palette, id: 'custom', name: 'カスタム', [role]: hex })

  const applyPaste = () => {
    const roles = assignRoles(parseColorList(paste))
    if (!roles) {
      setPasteError('色を読み取れません。#0b0b0b か coolors.co の URL を')
      return
    }
    setPasteError(null)
    onChange({ ...roles, id: 'custom', name: 'カスタム' })
  }

  return (
    <div className="space-y-6">
      <Field label="マイパレット">
        {myPalettes.length === 0 ? (
          <p className="text-(--muted)">まだありません</p>
        ) : (
          <ul>
            {myPalettes.map((p) => (
              <li
                key={p.id}
                className="slc-row-soft flex min-h-11 items-center gap-2"
              >
                <span
                  className="h-5 w-5 shrink-0 rounded-full"
                  style={{ background: swatchBackground(p) }}
                  aria-hidden
                />
                {renaming === p.id ? (
                  <input
                    className="slc-input min-h-9!"
                    defaultValue={p.name}
                    autoFocus
                    maxLength={40}
                    aria-label="パレットの名前"
                    onBlur={(event) => {
                      onRenameMine(p.id, event.target.value.trim() || p.name)
                      setRenaming(null)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                      if (event.key === 'Escape') setRenaming(null)
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="min-h-11 min-w-0 flex-1 truncate text-left"
                    aria-pressed={palette.id === p.id}
                    onClick={() => onChange(p)}
                  >
                    {p.name}
                    {palette.id === p.id ? (
                      <span className="text-(--accent)"> ●</span>
                    ) : null}
                  </button>
                )}
                <button
                  type="button"
                  className="slc-btn"
                  data-variant="ghost"
                  onClick={() => setRenaming(p.id)}
                  aria-label={`${p.name} の名前を変える`}
                >
                  名前
                </button>
                <button
                  type="button"
                  className="slc-btn"
                  data-variant="ghost"
                  data-size="icon"
                  onClick={() => onDeleteMine(p.id)}
                  aria-label={`${p.name} を削除`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </Field>

      <Field label="自分の色で作る">
        <div>
          {PALETTE_ROLES.map((role) => (
            <div
              key={role}
              className="slc-row-soft flex min-h-11 items-center gap-3"
            >
              <input
                type="color"
                value={palette[role]}
                onChange={(event) => edit(role, event.target.value)}
                className="h-7 w-7 shrink-0 cursor-pointer rounded-[2px] border border-(--line) bg-transparent"
                aria-label={`${ROLE_LABELS[role]}の色`}
              />
              <span className="flex-1">{ROLE_LABELS[role]}</span>
              <input
                type="text"
                className="slc-track-field mono w-28!"
                value={hexDraft[role] ?? palette[role]}
                spellCheck={false}
                aria-label={`${ROLE_LABELS[role]}の 16 進コード`}
                onChange={(event) => {
                  const v = event.target.value
                  setHexDraft((d) => ({ ...d, [role]: v }))
                  const hex = parseHex(v)
                  if (hex) edit(role, hex)
                }}
                onBlur={() => setHexDraft((d) => ({ ...d, [role]: undefined }))}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="slc-input mono"
            placeholder="#0b0b0b #f2efe9 #e8552f"
            aria-label="色の並びを貼り付け（16 進の色か coolors.co の URL）"
            title="いちばんコントラストの高い 2 色を背景と文字に、彩度の高い色を差し色に"
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && paste.trim()) applyPaste()
            }}
          />
          <button
            type="button"
            className="slc-btn"
            onClick={applyPaste}
            disabled={!paste.trim()}
          >
            使う
          </button>
        </div>
        {pasteError ? (
          <p className="slc-note" data-tone="alert">
            {pasteError}
          </p>
        ) : null}
        {photoSwatches.length > 0 ? (
          <div className="space-y-1">
            <div
              className="flex flex-wrap"
              role="group"
              aria-label="写真の色（選んで役割に割り当てる）"
            >
              {photoSwatches.map((sw) => (
                <button
                  key={sw.hex}
                  type="button"
                  aria-pressed={picked === sw.hex}
                  className="slc-swatch"
                  onClick={() => setPicked(picked === sw.hex ? null : sw.hex)}
                  title={`${sw.hex}（面積 ${Math.round(sw.share * 100)}%）`}
                  aria-label={`写真の色 ${sw.hex}`}
                >
                  <span
                    style={{
                      background: sw.hex,
                      boxShadow:
                        picked === sw.hex
                          ? '0 0 0 2px var(--bg), 0 0 0 4px var(--fg)'
                          : undefined,
                    }}
                  />
                </button>
              ))}
            </div>
            {picked ? (
              <div className="flex flex-wrap items-center gap-1">
                <span className="mono text-[12px] text-(--muted)">
                  {picked} →
                </span>
                {PALETTE_ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    className="slc-btn px-2!"
                    data-variant="ghost"
                    onClick={() => {
                      onChange(
                        fixPalette({
                          ...palette,
                          id: 'custom',
                          name: 'カスタム',
                          [role]: picked,
                        }),
                      )
                      setPicked(null)
                    }}
                  >
                    {ROLE_LABELS[role]}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex gap-2">
          <input
            type="text"
            className="slc-input"
            placeholder={`マイパレット ${myPalettes.length + 1}`}
            value={saveName}
            maxLength={40}
            onChange={(event) => setSaveName(event.target.value)}
            aria-label="保存する名前"
          />
          <button
            type="button"
            className="slc-btn"
            onClick={() => {
              const name =
                saveName.trim() || `マイパレット ${myPalettes.length + 1}`
              const ok = onSaveMine(palette, name)
              setSaveMessage(
                ok
                  ? `「${name}」を保存`
                  : 'この端末には保存できません（開いている間だけ使えます）',
              )
              if (ok) setSaveName('')
            }}
          >
            登録
          </button>
        </div>
        {saveMessage ? (
          <p className="slc-note" role="status">
            {saveMessage}
          </p>
        ) : null}
      </Field>
    </div>
  )
}
