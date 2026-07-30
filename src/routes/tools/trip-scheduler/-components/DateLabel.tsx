import {
  isValidISODate,
  weekdayIndex,
  weekdayJa,
} from '../../../../lib/trip-scheduler/dates'
import { weekdayToneClass } from '../-lib/palette'

interface DateLabelProps {
  /** YYYY-MM-DD */
  iso: string
  /** 追加クラス(サイズや基本の文字色は呼び出し側の文脈に合わせる) */
  className?: string
}

/**
 * '6/12(金)' 形式の日付。曜日のカッコ部分だけ土=青・日=赤にする。
 * 「この街にいるのは月曜(休館日かも)」「週末は混む」を目で拾えるようにするための最小単位。
 */
export function DateLabel({ iso, className }: DateLabelProps) {
  if (!isValidISODate(iso)) {
    return <span className={className}>{iso}</span>
  }
  const [, month, day] = iso.split('-').map(Number)

  return (
    <span className={`tabular-nums ${className ?? ''}`}>
      {month}/{day}
      <span className={weekdayToneClass(weekdayIndex(iso))}>
        ({weekdayJa(iso)})
      </span>
    </span>
  )
}
