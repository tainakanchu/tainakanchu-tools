import { useState } from 'react'
import { Check, Pencil, Save, Trash2 } from 'lucide-react'
import { assignRoles, parseColorList, parseHex } from '../-lib/palette-parse'
import {
  CONTRAST,
  PALETTE_ROLES,
  PRESET_PALETTES,
  ROLE_LABELS,
  contrastReport,
} from '../-lib/palettes'
import {
  choiceClass,
  fieldClass,
  labelClass,
  subtleButtonClass,
} from '../-lib/styles'
import type { Palette, PaletteRole } from '../-lib/palettes'

type Props = {
  palette: Palette
  onChange: (palette: Palette) => void
  myPalettes: ReadonlyArray<Palette>
  onSaveMine: (palette: Palette, name: string) => boolean
  onRenameMine: (id: string, name: string) => void
  onDeleteMine: (id: string) => void
  /** 写真から自動で作った配色（写真があるときだけ） */
  photoAuto: Palette | null
}

/** 配色の見本（背景に文字の色で Aa、差し色の点） */
export function PaletteSwatch({ palette }: { palette: Palette }) {
  return (
    <span
      className="relative flex h-8 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/20 text-[13px] font-semibold"
      style={{ background: palette.bg, color: palette.fg }}
      aria-hidden
    >
      Aa
      <span
        className="absolute right-1 bottom-1 h-1.5 w-1.5 rounded-full"
        style={{ background: palette.accent }}
      />
      <span
        className="absolute bottom-0 left-0 h-0.5 w-full"
        style={{ background: palette.muted }}
      />
    </span>
  )
}

function PaletteButton({
  palette,
  active,
  onClick,
  label,
}: {
  palette: Palette
  active: boolean
  onClick: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`${choiceClass(active)} flex-row! items-center! gap-2! px-2! py-1.5!`}
      onClick={onClick}
    >
      <PaletteSwatch palette={palette} />
      <span className="min-w-0 truncate text-xs font-medium">
        {label ?? palette.name}
      </span>
    </button>
  )
}

function ContrastBadge({
  label,
  value,
  min,
}: {
  label: string
  value: number
  min: number
}) {
  const ok = value >= min
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] tabular-nums ${ok ? 'border-white/15 text-gray-300' : 'border-amber-400/40 text-amber-200'}`}
      title={`背景とのコントラスト（${min}:1 以上が目安）`}
    >
      {label} {value.toFixed(1)}:1
    </span>
  )
}

export function PalettePicker({
  palette,
  onChange,
  myPalettes,
  onSaveMine,
  onRenameMine,
  onDeleteMine,
  photoAuto,
}: Props) {
  const [paste, setPaste] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [saveName, setSaveName] = useState('')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [hexDraft, setHexDraft] = useState<
    Partial<Record<PaletteRole, string>>
  >({})

  const report = contrastReport(palette)

  const edit = (role: PaletteRole, hex: string) =>
    onChange({
      ...palette,
      id: 'custom',
      name: 'カスタム',
      [role]: hex,
    })

  const applyPaste = () => {
    const colors = parseColorList(paste)
    const roles = assignRoles(colors)
    if (!roles) {
      setPasteError(
        '色を読み取れませんでした。#0b0b0b のような 16 進の色か、coolors.co の URL を貼ってください。',
      )
      return
    }
    setPasteError(null)
    onChange({ ...roles, id: 'custom', name: 'カスタム' })
  }

  return (
    <fieldset className="space-y-3">
      <legend className={labelClass}>パレット</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {photoAuto ? (
          <PaletteButton
            palette={photoAuto}
            active={palette.id === photoAuto.id}
            onClick={() => onChange(photoAuto)}
            label="写真から自動"
          />
        ) : null}
        {PRESET_PALETTES.map((p) => (
          <PaletteButton
            key={p.id}
            palette={p}
            active={palette.id === p.id}
            onClick={() => onChange(p)}
          />
        ))}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-gray-500">マイパレット</p>
        {myPalettes.length === 0 ? (
          <p className="text-xs text-gray-500">
            下の「自分の色で作る」で作った配色を保存すると、ここに並びます（この端末のブラウザに保存）。
          </p>
        ) : (
          <ul className="space-y-1.5">
            {myPalettes.map((p) => (
              <li key={p.id} className="flex items-center gap-1.5">
                {renaming === p.id ? (
                  <input
                    className={`${fieldClass} py-1!`}
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
                  <div className="min-w-0 flex-1">
                    <PaletteButton
                      palette={p}
                      active={palette.id === p.id}
                      onClick={() => onChange(p)}
                    />
                  </div>
                )}
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-gray-300 hover:bg-white/10"
                  onClick={() => setRenaming(p.id)}
                  aria-label={`${p.name} の名前を変える`}
                >
                  <Pencil size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-gray-300 hover:border-rose-400/50 hover:bg-rose-500/10 hover:text-rose-200"
                  onClick={() => onDeleteMine(p.id)}
                  aria-label={`${p.name} を削除`}
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className="rounded-xl border border-white/10 bg-gray-950/40 p-3 [&[open]>summary]:mb-3">
        <summary className="cursor-pointer text-sm font-medium text-gray-200">
          自分の色で作る
        </summary>
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {PALETTE_ROLES.map((role) => (
              <label
                key={role}
                className="flex items-center gap-2 text-sm text-gray-300"
              >
                <input
                  type="color"
                  value={palette[role]}
                  onChange={(event) => edit(role, event.target.value)}
                  className="h-8 w-10 shrink-0 cursor-pointer rounded border border-white/15 bg-transparent"
                  aria-label={`${ROLE_LABELS[role]}の色`}
                />
                <span className="w-20 shrink-0 text-xs">
                  {ROLE_LABELS[role]}
                </span>
                <input
                  type="text"
                  className={`${fieldClass} py-1! font-mono text-xs!`}
                  value={hexDraft[role] ?? palette[role]}
                  spellCheck={false}
                  aria-label={`${ROLE_LABELS[role]}の 16 進コード`}
                  onChange={(event) => {
                    const v = event.target.value
                    setHexDraft((d) => ({ ...d, [role]: v }))
                    const hex = parseHex(v)
                    if (hex) edit(role, hex)
                  }}
                  onBlur={() =>
                    setHexDraft((d) => ({ ...d, [role]: undefined }))
                  }
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <ContrastBadge
              label="文字"
              value={report.fg}
              min={CONTRAST.fgMin}
            />
            <ContrastBadge
              label="補助"
              value={report.muted}
              min={CONTRAST.muted}
            />
            <ContrastBadge
              label="差し色"
              value={report.accent}
              min={CONTRAST.accent}
            />
          </div>

          <div className="space-y-1.5">
            <label
              className="block text-sm text-gray-300"
              htmlFor="palette-paste"
            >
              色の並びを貼り付け
            </label>
            <textarea
              id="palette-paste"
              rows={2}
              className={`${fieldClass} font-mono text-xs!`}
              placeholder="#0b0b0b #f2efe9 #c8553d　または　https://coolors.co/0b0b0b-f2efe9-c8553d"
              value={paste}
              onChange={(event) => setPaste(event.target.value)}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={subtleButtonClass}
                onClick={applyPaste}
                disabled={!paste.trim()}
              >
                <Check size={14} aria-hidden />
                役割を割り当てて使う
              </button>
            </div>
            <p className="text-xs text-gray-500">
              カンマ・空白・改行で区切れます。いちばんコントラストの高い 2
              色を背景と文字に（先に書いた方が背景）、彩度の高い色を差し色にして、足りないコントラストは明るさだけ直します。
            </p>
            {pasteError ? (
              <p className="text-xs text-amber-200/90">{pasteError}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              className={`${fieldClass} w-auto! flex-1 py-1.5!`}
              placeholder={`マイパレット ${myPalettes.length + 1}`}
              value={saveName}
              maxLength={40}
              onChange={(event) => setSaveName(event.target.value)}
              aria-label="保存する名前"
            />
            <button
              type="button"
              className={subtleButtonClass}
              onClick={() => {
                const name =
                  saveName.trim() || `マイパレット ${myPalettes.length + 1}`
                const ok = onSaveMine(palette, name)
                setSaveMessage(
                  ok
                    ? `「${name}」を保存しました`
                    : 'この端末では保存できませんでした（プライベートブラウズなど）。この画面を開いている間は使えます。',
                )
                if (ok) setSaveName('')
              }}
            >
              <Save size={14} aria-hidden />
              マイパレットに保存
            </button>
          </div>
          {saveMessage ? (
            <p className="text-xs text-cyan-100">{saveMessage}</p>
          ) : null}
        </div>
      </details>
    </fieldset>
  )
}
