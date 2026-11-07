import { Checkbox, Field, Select } from '../../../../components/ui'
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
      <Field label="マイク">
        <Select
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
        </Select>
      </Field>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {TOGGLES.map((toggle) => (
          <Checkbox
            key={toggle.key}
            checked={options[toggle.key]}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...options, [toggle.key]: event.target.checked })
            }
            label={
              <>
                {toggle.label}
                {toggle.note && (
                  <span className="ml-1 text-xs text-ink-muted">
                    （{toggle.note}）
                  </span>
                )}
              </>
            }
          />
        ))}
      </div>
    </div>
  )
}
