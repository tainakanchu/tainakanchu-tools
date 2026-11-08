/**
 * 配色の切り替え(自動 / ライト / ダーク)。ThemeScope の内側に置く。
 * 3 つしか無いので、メニューに畳まず並べて、いまの選択を aria-pressed で示す。
 */

import { THEME_SETTINGS, THEME_SETTING_LABELS } from '../../lib/theme/theme'
import { useTheme } from './ThemeScope'

export function ThemeSwitch({ className = '' }: { className?: string }) {
  const { setting, setSetting } = useTheme()
  return (
    <div
      role="group"
      aria-label="配色"
      className={`inline-flex overflow-hidden rounded-md border border-gray-300 text-xs dark:border-gray-600 ${className}`}
    >
      {THEME_SETTINGS.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={setting === value}
          onClick={() => setSetting(value)}
          className={`px-2 py-1 whitespace-nowrap focus-visible:relative focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan-600 dark:focus-visible:outline-cyan-400 ${
            setting === value
              ? 'bg-gray-900 font-bold text-white dark:bg-gray-100 dark:text-gray-900'
              : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
          }`}
        >
          {THEME_SETTING_LABELS[value]}
        </button>
      ))}
    </div>
  )
}
