/**
 * 共有URLの「面白い版」(marker '3')で使う CJK-16384 エンコーディング。
 *
 * 目的は圧縮ではなく見た目。base64url が 1 文字あたり 6bit しか運べないのに対し、
 * 16384 文字の集合を使えば 1 文字あたり 14bit 運べるので、
 * アドレスバーに並ぶ文字数がおよそ 4 割強になる。
 * そのぶん「漢字がびっしり並んだURL」というキモい見た目になるのが狙いで、
 * 実際に送れるデータ量が増えるわけではない(%エンコードすると
 * 1 文字 3 バイトなので、URL のバイト数はむしろ増える)。
 *
 * 文字集合は CJK統合漢字の先頭 16384 字(U+4E00 〜 U+8DFF)を機械的に取る。
 * すべて BMP に収まるのでサロゲートペアが発生せず、
 * String.length と文字数が一致する。簡体字が混ざるのは承知のうえで、
 * 「最も混沌としている」という理由でこの並びを選んでいる。
 */

/** ArrayBuffer 由来であることを型で明示した Uint8Array(share.ts と同じ理由) */
type Bytes = Uint8Array<ArrayBuffer>

/** 文字集合の先頭。U+4E00 = 「一」 */
const CJK_BASE = 0x4e00

/** 文字集合の大きさ。2^14 */
const CJK_COUNT = 16384

/** 1 文字が運ぶビット数 */
const BITS_PER_CHAR = 14

const CHAR_MASK = CJK_COUNT - 1

/**
 * バイト列を CJK-16384 の文字列に変換する。
 *
 * 端数(パディング)の扱い:
 * バイト列を MSB 先頭のビット列とみなし、先頭から 14bit ずつ切り出す。
 * 8 と 14 の最小公倍数は 56 なので、7 バイトの倍数でない限り末尾に端数が出る。
 * 端数は 0 で埋めて 14bit に揃えるが、埋めたビット数を復号側が知らないと
 * 元のバイト長を一意に決められない(文字数だけでは 2 通りの解釈が残る)。
 * そこで **先頭 1 文字に「末尾を何ビット 0 で埋めたか(0〜13)」を持たせる**。
 * この 1 文字ぶんの増加は全体の 0.1% 未満なので、
 * ビットを節約するより復号の一意性を優先している。
 */
export function bytesToCjk(bytes: Bytes): string {
  const padBits =
    (BITS_PER_CHAR - ((bytes.length * 8) % BITS_PER_CHAR)) % BITS_PER_CHAR

  const chars: Array<string> = [String.fromCodePoint(CJK_BASE + padBits)]

  // acc に上位側からビットを積み、14bit 貯まるたびに 1 文字吐く。
  // acc に残るのは常に 13bit 以下なので、1 バイト積んでも 21bit を超えず
  // 32bit のビット演算で安全に扱える。
  let acc = 0
  let accBits = 0
  for (const byte of bytes) {
    acc = (acc << 8) | byte
    accBits += 8
    if (accBits >= BITS_PER_CHAR) {
      accBits -= BITS_PER_CHAR
      chars.push(
        String.fromCodePoint(CJK_BASE + ((acc >>> accBits) & CHAR_MASK)),
      )
      acc &= (1 << accBits) - 1
    }
  }
  if (accBits > 0) {
    const last = (acc << (BITS_PER_CHAR - accBits)) & CHAR_MASK
    chars.push(String.fromCodePoint(CJK_BASE + last))
  }

  return chars.join('')
}

/**
 * CJK-16384 の文字列をバイト列に戻す。
 * 文字集合の外の文字・矛盾したパディング指定は Error を投げる
 * (呼び出し元の decodeShareState が catch して null に落とす)。
 */
export function cjkToBytes(text: string): Bytes {
  const values: Array<number> = []
  for (const char of text) {
    const code = char.codePointAt(0)
    if (code === undefined) throw new Error('CJK payload: 文字を読めない')
    const value = code - CJK_BASE
    if (value < 0 || value >= CJK_COUNT) {
      throw new Error('CJK payload: 文字集合の外の文字が含まれる')
    }
    values.push(value)
  }

  const padBits = values.shift()
  if (padBits === undefined) throw new Error('CJK payload: 空文字列')
  if (padBits >= BITS_PER_CHAR) {
    throw new Error('CJK payload: パディングビット数が不正')
  }

  const dataBits = values.length * BITS_PER_CHAR - padBits
  if (dataBits < 0 || dataBits % 8 !== 0) {
    throw new Error('CJK payload: バイト境界に揃っていない')
  }

  const byteCount = dataBits / 8
  const bytes = new Uint8Array(byteCount)
  let acc = 0
  let accBits = 0
  let index = 0
  for (const value of values) {
    acc = (acc << BITS_PER_CHAR) | value
    accBits += BITS_PER_CHAR
    while (accBits >= 8 && index < byteCount) {
      accBits -= 8
      bytes[index] = (acc >>> accBits) & 0xff
      index += 1
      acc &= (1 << accBits) - 1
    }
  }

  return bytes
}
