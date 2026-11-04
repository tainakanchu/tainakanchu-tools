import {
  fieldClass,
  labelClass,
  sectionClass,
  sectionTitleClass,
} from '../-lib/styles'
import type { Setlist } from '../-lib/types'

type MetaKey = 'title' | 'djName' | 'date' | 'venue'

type Props = {
  setlist: Setlist
  onChange: (key: MetaKey, value: string) => void
}

const FIELDS: ReadonlyArray<{
  key: MetaKey
  label: string
  placeholder: string
}> = [
  { key: 'title', label: 'イベント名', placeholder: 'NIGHT DRIVE vol.12' },
  { key: 'djName', label: 'DJ名', placeholder: 'DJ KANCHU' },
  { key: 'date', label: '日付', placeholder: '2026.11.03' },
  { key: 'venue', label: '会場', placeholder: 'SHIBUYA SOUND LAB' },
]

export function MetaSection({ setlist, onChange }: Props) {
  return (
    <section className={sectionClass}>
      <h2 className={sectionTitleClass}>
        <span className="text-cyan-400">2.</span> イベント情報
      </h2>
      <p className="mt-2 text-sm text-gray-400">
        すべて任意です。ファイルに入っていた日付やセッション名は先に埋めてあります。
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <label key={field.key} className="space-y-1">
            <span className={labelClass}>{field.label}</span>
            <input
              type="text"
              className={fieldClass}
              value={setlist[field.key] ?? ''}
              placeholder={field.placeholder}
              onChange={(event) => onChange(field.key, event.target.value)}
            />
          </label>
        ))}
      </div>
    </section>
  )
}
