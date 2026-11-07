import { Select } from '../../../../components/ui'
import { cityCatalog } from '../../../../lib/trip-scheduler/cities'
import type { City } from '../../../../lib/trip-scheduler/types'

const cityGroups: Array<{ country: string; cities: Array<City> }> = (() => {
  const map = new Map<string, Array<City>>()
  for (const city of cityCatalog) {
    const list = map.get(city.country)
    if (list) {
      list.push(city)
    } else {
      map.set(city.country, [city])
    }
  }
  return [...map.entries()].map(([country, cities]) => ({ country, cities }))
})()

interface CitySelectProps {
  value: string | null
  onChange: (cityId: string | null) => void
  placeholder?: string
  /** Field の外で使うときの aria-label。Field の中なら不要 */
  label?: string
  className?: string
}

/** 国名でグループ化した都市セレクタ。空文字 = 未選択 (null) */
export function CitySelect({
  value,
  onChange,
  placeholder = '都市を選ぶ',
  label,
  className,
}: CitySelectProps) {
  return (
    <Select
      aria-label={label}
      value={value ?? ''}
      onChange={(event) =>
        onChange(event.target.value === '' ? null : event.target.value)
      }
      className={className}
    >
      <option value="">{placeholder}</option>
      {cityGroups.map((group) => (
        <optgroup key={group.country} label={group.country}>
          {group.cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  )
}
