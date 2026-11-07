/**
 * Web会議レコーダーで共有する Tailwind クラス。
 * 見た目は docs/design.md の部品（input / btn / field）に揃える。
 * 手順の区切りは箱を積まず、青インクの罫で上を区切る。通知帯は Note を使う。
 */
import { buttonClass } from '../../../../components/ui'

export const sectionClass = 'ink-line-t pt-5'

export const sectionTitleClass = 'text-lg font-bold'

export const noteClass = 'text-sm leading-relaxed text-ink-muted'

export const labelClass = 'field-label'

export const primaryButtonClass = buttonClass('primary')

export const subtleButtonClass = buttonClass('secondary')

export const dangerButtonClass = buttonClass('danger')
