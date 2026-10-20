import { checkboxClass, fieldClass, labelClass } from '../-lib/styles'
import type { MicOptions } from '../-lib/capture'

type Props = {
  options: MicOptions
  devices: Array<{ deviceId: string; label: string }>
  disabled: boolean
  onChange: (next: MicOptions) => void
}

const TOGGLES: ReadonlyArray<{
  key: 'echoCancellation' | 'noiseSuppression' | 'autoGainControl'
  label: string
  note: string
}> = [
  {
    key: 'echoCancellation',
    label: 'エコー除去',
    note: 'イヤホンなら不要。スピーカーで聞くときだけオン',
  },
  { key: 'noiseSuppression', label: 'ノイズ抑制', note: '' },
  { key: 'autoGainControl', label: '自動音量調整', note: '' },
]

export function MicSettings({ options, devices, disabled, onChange }: Props) {
  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className={labelClass}>マイク</span>
        <select
          className={fieldClass}
          value={options.deviceId}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...options, deviceId: event.target.value })
          }
        >
          <option value="">既定のマイク</option>
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {TOGGLES.map((toggle) => (
          <label
            key={toggle.key}
            className="inline-flex items-center gap-2 text-sm text-gray-700"
          >
            <input
              type="checkbox"
              className={checkboxClass}
              checked={options[toggle.key]}
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...options, [toggle.key]: event.target.checked })
              }
            />
            <span>
              {toggle.label}
              {toggle.note && (
                <span className="ml-1 text-xs text-gray-500">
                  （{toggle.note}）
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
