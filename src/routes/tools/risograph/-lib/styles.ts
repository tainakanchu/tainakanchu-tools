/**
 * リソグラフ分版ツールで共有する Tailwind クラス。
 * 見た目は docs/design.md の部品（input / btn / range）に揃える。
 * 手順の区切りは箱を積まず、青インクの罫で上を区切る。
 * 刷り上がりを見る面（canvas の枠）は紙の色を問わず形が分かるよう、
 * 青インクの細線で囲んだ白地にしている。
 */
import { buttonClass } from '../../../../components/ui'

export const sectionClass = 'ink-line-t pt-5'

export const sectionTitleClass = 'text-lg font-bold'

export const sectionNoteClass = 'text-sm leading-relaxed text-ink-muted'

export const labelClass = 'field-label'

export const fieldClass = 'input'

export const primaryButtonClass = buttonClass('primary')

export const subtleButtonClass = buttonClass('secondary')

/** 上下ボタンなど、記号だけの小さいボタン */
export const iconButtonClass = `${buttonClass('secondary', 'sm')} size-10 min-h-0 p-0`

/** 刷り上がり・原画を載せる枠 */
export const previewFrameClass = 'border border-ink bg-paper'

/** 罫で区切った一覧の行（ul に rowListClass、li に rowClass） */
export const rowListClass = 'divide-y divide-rule border-y border-rule'

export const rowClass = 'py-2'

export const statValueClass = 'text-lg font-bold tabular-nums'

export const sliderClass = 'range'
