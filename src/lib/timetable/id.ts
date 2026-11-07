/**
 * アクト id の安定生成。
 *
 * お気に入りはアクト id の集合として保存する。AI はたいてい id を書かない
 * (書かなくてよいとプロンプトで伝えている)ので、取り込み側で振る必要がある。
 * 連番にすると、AI に「1 組追加して」と頼んで再取り込みしただけで以降の番号が
 * ずれ、お気に入りが別の出演を指すようになる。
 * そこで「日付 + 会場名 + 開始時刻 + 出演名」というアクトの中身から決まる
 * ハッシュにする。中身が変わらない限り同じ id になるので、再取り込みでも
 * お気に入りが残る。時刻や名前が直された場合は remapFavorites(favorites.ts)が
 * 名前と日付で拾い直す。
 *
 * 会場や日付も AI が付けた id ではなく名前・日付を材料にするのは、
 * AI が "venue1" と "o-east" のように実行ごとに違う id を振るため。
 */

/** NFKC + 小文字 + 空白除去。全角英数や大文字小文字の揺れで別 id にならないように */
export function normalizeKey(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

/** FNV-1a 32bit。暗号強度は要らず、短く安定していればよい */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function hashId(prefix: string, parts: ReadonlyArray<string>): string {
  const text = parts.map(normalizeKey).join('\u0000')
  return `${prefix}${fnv1a(text).toString(36)}`
}

export function stableActId(
  date: string,
  venueName: string,
  start: string,
  title: string,
): string {
  return hashId('a', [date, venueName, start, title])
}

/** 既に使われている id と重ならないよう、末尾に -2, -3 … を付ける */
export function uniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) return base
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`
    if (!used.has(candidate)) return candidate
  }
}
