/**
 * 表示用に曲名・アーティスト名を短くする（任意のトグル）。
 * 元データは書き換えず、描画の直前にだけ掛ける。
 */

/**
 * 人名を含まない、ありふれたバージョン表記。
 * 「(Artist X Remix)」「[Someone Edit]」のような誰の手によるものかを示す表記は
 * ここに一致しないので残る。
 */
const GENERIC_VERSION = new RegExp(
  [
    '^(?:',
    [
      'original(?: mix| version)?',
      'extended(?: mix| version| edit)?',
      'club (?:mix|edit|version)',
      'radio (?:edit|mix|version)',
      'album (?:version|edit|mix)',
      'single (?:version|edit)',
      'main mix',
      'short (?:edit|mix)',
      'remaster(?:ed)?(?: version)?',
      '(?:\\d{2,4} )?(?:digital(?:ly)? )?remaster(?:ed)?(?: version)?(?: \\d{2,4})?',
      'remaster(?:ed)? \\d{2,4}',
    ].join('|'),
    ')$',
  ].join(''),
  'i',
)

function isGeneric(label: string): boolean {
  return GENERIC_VERSION.test(label.trim().replace(/\s+/g, ' '))
}

/**
 * 末尾の汎用バージョン表記を取り除く。
 * 対象は () [] で囲まれたもの、または " - " の後ろに続くもの。
 * 末尾から順に、汎用表記である限り繰り返し外す。
 */
export function stripMixSuffix(title: string): string {
  let text = title.trim()
  for (let guard = 0; guard < 6; guard++) {
    const bracket = /\s*[([]([^()[\]]+)[)\]]\s*$/.exec(text)
    if (bracket && isGeneric(bracket[1])) {
      text = text.slice(0, bracket.index).trimEnd()
      continue
    }
    const dash = /\s+[-–—]\s+([^-–—]+)$/.exec(text)
    if (dash && isGeneric(dash[1])) {
      text = text.slice(0, dash.index).trimEnd()
      continue
    }
    // 途中に挟まった汎用表記（"Title (Original Mix) (feat. X)" など）
    const inner = /\s*[([]([^()[\]]+)[)\]]/g
    const next = text.replace(inner, (whole, label: string) =>
      isGeneric(label) ? '' : whole,
    )
    if (next === text) break
    text = next
  }
  // 中身が全部消えるような曲名（"Original Mix" だけ等）は元に戻す
  return text.trim() || title.trim()
}

/** feat. / ft. / featuring 以降のゲスト表記を外す */
export function stripFeat(text: string): string {
  let out = text
    // 括弧つき: "Title (feat. X)" / "[ft. Y]"
    .replace(/\s*[([]\s*(?:feat\.?|ft\.?|featuring)\s[^)\]]*[)\]]/gi, '')
    // 括弧なし: 次の括弧・" - "・末尾まで
    .replace(
      /\s+(?:feat\.?|ft\.?|featuring)\s.*?(?=\s*[([]|\s+[-–—]\s|$)/gi,
      '',
    )
  out = out.replace(/\s{2,}/g, ' ').trim()
  return out || text.trim()
}

export type CleanOptions = { stripMix: boolean; stripFeat: boolean }

export function cleanTitle(title: string, opts: CleanOptions): string {
  let out = title
  if (opts.stripFeat) out = stripFeat(out)
  if (opts.stripMix) out = stripMixSuffix(out)
  return out
}

export function cleanArtistName(artist: string, opts: CleanOptions): string {
  return opts.stripFeat ? stripFeat(artist) : artist
}
