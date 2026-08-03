/**
 * Stamp(現地の壁時計時刻 + IANA タイムゾーン)を扱う層。実体は Temporal。
 *
 * 設計判断:
 * - 壁時計 → UTC の逆変換を自前で書かない。Date と Intl の組み合わせでこれをやると
 *   DST の切替日や、同じ壁時計時刻が 2 回訪れる/存在しない時間帯で静かに 1 時間ずれる。
 *   1 時間ずれると利用者が列車に乗り遅れるので、標準仕様に寄せる。
 * - 日付の加減算も Temporal.PlainDate に任せる。epoch に 86400000ms 足す方式は
 *   DST でその日が 23 時間/25 時間になる日を跨ぐと壊れる。
 * - タイムゾーンの検証を自前の一覧で持たない。Temporal が未知のゾーンで RangeError を
 *   投げるので、それをそのまま検証に使う。独自リストだと IANA 側の追加に追随できない。
 *
 * 旅程パズル(trip-scheduler)にも似た日付ユーティリティがあるが、
 * 別ツールとして独立させるため import せず再実装している。
 */

import type { Stamp } from './types'

/** 併記する日本時間側は常にこれ。利用者は日本在住前提 */
export const JAPAN_TZ = 'Asia/Tokyo'

/** タイムゾーンがどうしても決まらないときの最終手段 */
export const FALLBACK_TZ = 'Asia/Tokyo'

// --- Stamp の解釈 ---

/**
 * Stamp を ZonedDateTime に戻す。不正な文字列なら例外を投げる。
 *
 * offset: 'prefer' にしているのが肝。
 * 保存済みの文字列にはオフセット(+02:00 等)が焼き込まれているので、
 * 秋の「同じ壁時計時刻が 2 回来る 1 時間」でもどちらだったかを復元できる。
 * 一方で、保存から実際の旅行まで数ヶ月空くあいだに IANA のルールが変わる
 * (国が夏時間を廃止する等)ことがある。'reject' だとその瞬間に予約が全部
 * 読めなくなるので、ルールと食い違ったときは壁時計時刻のほうを正とする。
 * 「14:20 発の列車」は制度が変わっても現地の 14:20 発だからである。
 */
export function parseStamp(stamp: Stamp): Temporal.ZonedDateTime {
  return Temporal.ZonedDateTime.from(stamp.zdt, { offset: 'prefer' })
}

/** 検証用。不正な Stamp なら null。保存データの読み込みで使う */
export function tryParseStamp(stamp: Stamp): Temporal.ZonedDateTime | null {
  try {
    return parseStamp(stamp)
  } catch {
    return null
  }
}

/** UI の入力(YYYY-MM-DD / HH:mm / IANA 名)から組み立てる。不正なら例外 */
export function makeStamp(date: string, time: string, tz: string): Stamp {
  const zdt = Temporal.ZonedDateTime.from(`${date}T${time}:00[${tz}]`)
  return { zdt: zdt.toString(), allDay: false }
}

/** 終日の予定。時刻は現地 00:00 に寄せる */
export function makeAllDayStamp(date: string, tz: string): Stamp {
  const zdt = Temporal.ZonedDateTime.from(`${date}T00:00:00[${tz}]`)
  return { zdt: zdt.toString(), allDay: true }
}

/** 例外を投げない版。UI のフォーム入力の検証に使う */
export function tryMakeStamp(
  date: string,
  time: string | null,
  tz: string,
): Stamp | null {
  try {
    return time === null ? makeAllDayStamp(date, tz) : makeStamp(date, time, tz)
  } catch {
    return null
  }
}

export function stampToEpoch(stamp: Stamp): number {
  return parseStamp(stamp).epochMilliseconds
}

/**
 * 終日の予定を「期間の終わり」として扱うとき用。
 * 終日なら現地のその日の末尾(翌日の始まりの 1ms 前)を返す。
 * DST でその日が 23 時間や 25 時間になっても正しく日末になる。
 */
export function stampToEndEpoch(stamp: Stamp): number {
  const zdt = parseStamp(stamp)
  if (!stamp.allDay) return zdt.epochMilliseconds
  return zdt.startOfDay().add({ days: 1 }).epochMilliseconds - 1
}

/** その予定が置かれている現地タイムゾーン */
export function stampTz(stamp: Stamp): string {
  return parseStamp(stamp).timeZoneId
}

/** 現地タイムゾーンでの日付 (YYYY-MM-DD) */
export function stampDate(stamp: Stamp): string {
  return parseStamp(stamp).toPlainDate().toString()
}

/**
 * その予定が表示タイムゾーンではどの日付に属するか。
 * 終日は「暦の日付」そのものが事実なので、タイムゾーン変換で日付をずらさない。
 */
export function stampDateInTz(stamp: Stamp, displayTz: string): string {
  const zdt = parseStamp(stamp)
  if (stamp.allDay) return zdt.toPlainDate().toString()
  return zdt.withTimeZone(displayTz).toPlainDate().toString()
}

// --- タイムゾーン ---

export function getDeviceTz(): string {
  try {
    return Temporal.Now.timeZoneId()
  } catch {
    return FALLBACK_TZ
  }
}

/** IANA タイムゾーン名の検証。Temporal が未知のゾーンで投げるのを利用する */
export function isValidTz(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0) return false
  try {
    Temporal.Now.zonedDateTimeISO(tz)
    return true
  } catch {
    return false
  }
}

/** その瞬間に 2 つのタイムゾーンの実効オフセットが一致するか(= 時差がないか) */
export function isSameOffset(a: string, b: string, atMs: number): boolean {
  if (a === b) return true
  const instant = Temporal.Instant.fromEpochMilliseconds(atMs)
  return (
    instant.toZonedDateTimeISO(a).offsetNanoseconds ===
    instant.toZonedDateTimeISO(b).offsetNanoseconds
  )
}

// --- 日付文字列レベルのユーティリティ ---

export function isValidISODate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  try {
    Temporal.PlainDate.from(iso, { overflow: 'reject' })
    return true
  } catch {
    return false
  }
}

/** 'HH:mm' 形式の妥当性 */
export function isValidTime(time: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(time)) return false
  try {
    Temporal.PlainTime.from(time, { overflow: 'reject' })
    return true
  } catch {
    return false
  }
}

export function addDays(iso: string, days: number): string {
  return Temporal.PlainDate.from(iso).add({ days }).toString()
}

/** from から to までの日数差(to - from)。同日は 0 */
export function diffDays(fromISO: string, toISO: string): number {
  return Temporal.PlainDate.from(fromISO).until(toISO).days
}

/** ISO の曜日番号は 1 = 月曜 〜 7 = 日曜 */
const WEEKDAY_JA = ['月', '火', '水', '木', '金', '土', '日'] as const

export function weekdayJa(iso: string): string {
  return WEEKDAY_JA[Temporal.PlainDate.from(iso).dayOfWeek - 1]
}

/** '6/12(金)' 形式 */
export function formatDateJa(iso: string): string {
  const date = Temporal.PlainDate.from(iso)
  return `${date.month}/${date.day}(${WEEKDAY_JA[date.dayOfWeek - 1]})`
}

// --- 表示 ---

function formatHm(zdt: Temporal.ZonedDateTime): string {
  const h = String(zdt.hour).padStart(2, '0')
  const m = String(zdt.minute).padStart(2, '0')
  return `${h}:${m}`
}

export interface FormatStampOptions {
  /** 日付を含めるか (既定: false = 時刻だけ) */
  withDate?: boolean
  /** 現地時刻ではなく表示タイムゾーンに変換して出すか (既定: false = 現地時刻) */
  inDisplayTz?: boolean
  /** 終日のときの表記 */
  allDayLabel?: string
}

/** 表示用フォーマット。'14:20' / '6/12(金) 14:20' / '6/12(金) 終日' */
export function formatStamp(
  stamp: Stamp,
  displayTz: string,
  opts: FormatStampOptions = {},
): string {
  const { withDate = false, inDisplayTz = false, allDayLabel = '終日' } = opts
  const base = parseStamp(stamp)

  // 終日は暦の日付が事実なので、表示タイムゾーンに変換して日付をずらさない
  const zdt = stamp.allDay || !inDisplayTz ? base : base.withTimeZone(displayTz)
  const datePart = formatDateJa(zdt.toPlainDate().toString())

  if (stamp.allDay) return withDate ? `${datePart} ${allDayLabel}` : allDayLabel
  return withDate ? `${datePart} ${formatHm(zdt)}` : formatHm(zdt)
}

/**
 * 「14:20 現地 / 21:20 JST」形式。
 *
 * 日本にいる家族と予定をすり合わせたり、日本時間の感覚で組んだ予定を
 * 現地時刻に落とし込むために併記する。併記側は Asia/Tokyo 固定。
 *
 * 併記しないのは次の 2 つの場合。
 * - 現地と日本に時差がない: 同じ数字が 2 つ並ぶだけで情報量がない
 * - 表示タイムゾーンが日本時間ではない: 利用者がすでに現地時間で生活しているので、
 *   日本時間を出しても読み替えの手間が増えるだけ
 */
export function formatDualTime(stamp: Stamp, displayTz: string): string {
  if (stamp.allDay) return formatStamp(stamp, displayTz)

  const zdt = parseStamp(stamp)
  const local = formatHm(zdt)
  const atMs = zdt.epochMilliseconds
  if (
    isSameOffset(zdt.timeZoneId, JAPAN_TZ, atMs) ||
    !isSameOffset(displayTz, JAPAN_TZ, atMs)
  ) {
    return local
  }

  return `${local} 現地 / ${formatHm(zdt.withTimeZone(JAPAN_TZ))} JST`
}

export interface TimezoneOption {
  tz: string
  label: string
}

/**
 * タイムゾーン選択の候補。
 * Intl.supportedValuesOf('timeZone') は 400 件超あって選べたものではないので、
 * 日本人の旅行先として現実的な範囲に絞った一覧を持つ。
 * ここにない国へ行く人のために、UI 側では自由入力も残すこと。
 */
export const COMMON_TIMEZONES: Array<TimezoneOption> = [
  { tz: 'Asia/Tokyo', label: '日本 (東京)' },
  { tz: 'Asia/Seoul', label: '韓国 (ソウル)' },
  { tz: 'Asia/Shanghai', label: '中国 (上海・北京)' },
  { tz: 'Asia/Taipei', label: '台湾 (台北)' },
  { tz: 'Asia/Hong_Kong', label: '香港' },
  { tz: 'Asia/Singapore', label: 'シンガポール' },
  { tz: 'Asia/Bangkok', label: 'タイ (バンコク)' },
  { tz: 'Asia/Ho_Chi_Minh', label: 'ベトナム (ホーチミン)' },
  { tz: 'Asia/Jakarta', label: 'インドネシア (ジャカルタ)' },
  { tz: 'Asia/Kuala_Lumpur', label: 'マレーシア (クアラルンプール)' },
  { tz: 'Asia/Manila', label: 'フィリピン (マニラ)' },
  { tz: 'Asia/Kolkata', label: 'インド (デリー・ムンバイ)' },
  { tz: 'Asia/Dubai', label: 'UAE (ドバイ)' },
  { tz: 'Europe/Istanbul', label: 'トルコ (イスタンブール)' },
  { tz: 'Europe/London', label: 'イギリス (ロンドン)' },
  { tz: 'Europe/Dublin', label: 'アイルランド (ダブリン)' },
  { tz: 'Europe/Lisbon', label: 'ポルトガル (リスボン)' },
  { tz: 'Europe/Madrid', label: 'スペイン (マドリード・バルセロナ)' },
  { tz: 'Europe/Paris', label: 'フランス (パリ)' },
  { tz: 'Europe/Brussels', label: 'ベルギー (ブリュッセル)' },
  { tz: 'Europe/Amsterdam', label: 'オランダ (アムステルダム)' },
  { tz: 'Europe/Berlin', label: 'ドイツ (ベルリン・ミュンヘン)' },
  { tz: 'Europe/Zurich', label: 'スイス (チューリッヒ)' },
  { tz: 'Europe/Vienna', label: 'オーストリア (ウィーン)' },
  { tz: 'Europe/Prague', label: 'チェコ (プラハ)' },
  { tz: 'Europe/Rome', label: 'イタリア (ローマ・ミラノ)' },
  { tz: 'Europe/Athens', label: 'ギリシャ (アテネ)' },
  { tz: 'Europe/Helsinki', label: 'フィンランド (ヘルシンキ)' },
  { tz: 'Europe/Moscow', label: 'ロシア (モスクワ)' },
  { tz: 'America/New_York', label: '米国 東部 (ニューヨーク)' },
  { tz: 'America/Chicago', label: '米国 中部 (シカゴ)' },
  { tz: 'America/Denver', label: '米国 山岳部 (デンバー)' },
  { tz: 'America/Los_Angeles', label: '米国 西部 (ロサンゼルス)' },
  { tz: 'America/Vancouver', label: 'カナダ 西部 (バンクーバー)' },
  { tz: 'America/Toronto', label: 'カナダ 東部 (トロント)' },
  { tz: 'Pacific/Honolulu', label: 'ハワイ (ホノルル)' },
  { tz: 'America/Mexico_City', label: 'メキシコ (メキシコシティ)' },
  { tz: 'America/Sao_Paulo', label: 'ブラジル (サンパウロ)' },
  { tz: 'Australia/Sydney', label: 'オーストラリア 東部 (シドニー)' },
  { tz: 'Australia/Perth', label: 'オーストラリア 西部 (パース)' },
  { tz: 'Pacific/Auckland', label: 'ニュージーランド (オークランド)' },
  { tz: 'Africa/Cairo', label: 'エジプト (カイロ)' },
  { tz: 'UTC', label: 'UTC' },
]
