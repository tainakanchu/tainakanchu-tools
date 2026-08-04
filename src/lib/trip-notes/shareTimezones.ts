/**
 * 共有URL(marker '2' 以降)専用のタイムゾーン辞書。
 *
 * datetime.ts の COMMON_TIMEZONES をそのまま使わないのは、あちらが
 * 「UI の選択肢一覧」であって、見せ方の都合で並び替え・削除が起こりうるため。
 * 共有URLはサーバに保存していないので、一度発行したURLを回収できない。
 * 添字が 1 つずれただけで、既存URLの予約が別のタイムゾーンとして復元され、
 * 「現地時刻の数字は同じなのに指している瞬間が数時間ずれる」という
 * 一番気づきにくい壊れ方をする。だから共有フォーマット用の並びは
 * このファイルで独立に固定し、UI 側の都合から切り離す。
 *
 * 【変更禁止】既存要素の並び替え・削除をしてはいけない。
 * 追加は末尾にのみ許される(末尾追加なら、古いビルドが新しい添字を
 * 復元できずにその予約を落とすだけで済み、取り違えは起きない)。
 *
 * 辞書に無い IANA 名は生文字列としてそのまま載せるので、
 * ここに全世界のタイムゾーンを網羅する必要はない。
 */
export const SHARE_TIMEZONES: Array<string> = [
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Taipei',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'Asia/Bangkok',
  'Asia/Ho_Chi_Minh',
  'Asia/Jakarta',
  'Asia/Kuala_Lumpur',
  'Asia/Manila',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Europe/Istanbul',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Lisbon',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Brussels',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/Zurich',
  'Europe/Vienna',
  'Europe/Prague',
  'Europe/Rome',
  'Europe/Athens',
  'Europe/Helsinki',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Vancouver',
  'America/Toronto',
  'Pacific/Honolulu',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'Australia/Sydney',
  'Australia/Perth',
  'Pacific/Auckland',
  'Africa/Cairo',
  'UTC',
]

const TZ_TO_INDEX: Map<string, number> = new Map(
  SHARE_TIMEZONES.map((tz, index) => [tz, index]),
)

/**
 * 辞書にあれば添字(数値)、無ければ生の IANA 名を返す。
 * 利用者は UI の自由入力で任意の IANA 名を入れられるので、
 * 辞書に無い名前を「無かったこと」にはできない。
 */
export function encodeShareTz(tz: string): number | string {
  const index = TZ_TO_INDEX.get(tz)
  return index === undefined ? tz : index
}

/**
 * 添字または生文字列を IANA 名に戻す。復元できないときは null。
 *
 * 未知の添字(将来のビルドが末尾に足した番号を、古いビルドが受け取った場合)は
 * 推測で近い値に寄せず null を返す。ここで適当なタイムゾーンに落とすと
 * 時刻が静かにずれるので、呼び出し側でその予約ごと落としてもらう。
 */
export function decodeShareTz(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value !== 'number' || !Number.isInteger(value)) return null
  if (value < 0 || value >= SHARE_TIMEZONES.length) return null
  return SHARE_TIMEZONES[value]
}
