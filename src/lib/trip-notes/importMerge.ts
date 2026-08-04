/**
 * AI インポートで、取り込み側の予約を既存の予約とどう突き合わせるかを決める層。
 *
 * 設計判断:
 * - 同じ予約確認メールをもう一度 AI に読ませて貼り付けると、素朴に「足すだけ」の
 *   取り込みでは同じ予定が重複して増える。かといって取り込みのたびに手作業で
 *   重複を探して消すのは面倒すぎて誰もやらなくなる。だから取り込み時に
 *   既存の予約と同一とみなせるものは自動でマージし、それ以外だけを新規に足す。
 * - 判定ロジックは UI(AiImportPanel のプレビュー)と reducer(実際の取り込み)の
 *   両方から呼ばれる。判定を二重に実装すると「プレビューでは更新と出たのに
 *   実際には新規で入った」のようなズレが起き、利用者の信頼を失う。だから
 *   判定と結果生成をこの1関数(planImport)に集約し、双方が同じ計画を
 *   そのまま使う。
 * - マッチ条件は上から「確認番号」→「開始日+タイトル」→「開始日+場所名
 *   (宿泊のみ)」の3段階で、後段ほど確度が落ちる。全条件をゆるく OR で
 *   まとめると別々の予約を同一だと誤判定して上書きしてしまう。
 *   誤って別の予約を潰すほうが、取り込み漏れで重複が1件増えるより害が大きい
 *   (前者は確認番号やメモが消える取り返しのつかない事故になるが、後者は
 *   見た目が二重になるだけで実害が薄く、手動でも直せる)。だから確度の高い
 *   条件から順に試し、どれにも当たらなければ新規として足す。
 * - status === 'cancelled' の既存予約はマッチ対象から外す。キャンセル済みの
 *   宿を後日また AI に読ませて取り込むと、確認番号やタイトルが一致して
 *   マッチしうるが、それを黙って復活させると「キャンセルしたはずの宿が
 *   確定済みとして戻ってくる」という、実際に旅先で困る事故に直結する。
 *   キャンセル済みかどうかは人間が明示的に選んだ状態なので、AI 取り込みでは
 *   絶対に上書きしない。
 * - 既に別の取り込み予約とマッチ済みの既存予約は、以降の取り込み予約からは
 *   見えないようにする(consumed で消費する)。1つの既存予約が複数の取り込み
 *   予約に二重にマッチすると、後から処理したほうの更新が前の更新を
 *   握りつぶしてしまうため。
 */

import { DEFAULT_PAYMENT, DEFAULT_STATUS } from './aiImport'
import { stampDate } from './datetime'
import type { Booking, FieldKey, Place } from './types'

export interface ImportPlanEntry {
  /** 取り込む予約。既存と同一とみなした場合はマージ後の値(id は既存のものを保つ) */
  booking: Booking
  /** 同一とみなした既存予約の id。新規なら null */
  replacesId: string | null
}

export interface ImportPlan {
  entries: Array<ImportPlanEntry>
  addedCount: number
  updatedCount: number
}

/**
 * 確認番号の正規化。前後の空白を除いて大文字化し、英数字以外を取り除く。
 * ハイフンやスペースの入り方("ABC-123" / "ABC 123" / "abc123")は
 * 予約サイトや AI の書き起こしごとに揺れるが、同一の予約を指していることが
 * ほとんどなので、区切り文字の違いだけで別予約と判定したくない。
 * 正規化した結果が空文字になる(記号だけの値だった)場合は null を返す。
 * 空文字同士を一致させてしまうと、無意味な値を持つ別々の予約を
 * 誤ってマッチさせる事故になるため。
 */
function normalizeConfirmationNumber(raw: string): string | null {
  const normalized = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  return normalized.length > 0 ? normalized : null
}

/**
 * タイトル・場所名の正規化。NFKC で全角/半角や合成文字の表記揺れを吸収し、
 * 小文字化して大小文字の違いを無視し、空白をすべて取り除いて詰め方の違い
 * (「Hotel Le Marais」と「Hotel  Le Marais」等)を無視する。
 */
function normalizeText(raw: string): string {
  return raw.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

/** ルール1: kind が一致し、双方の確認番号を正規化した結果が一致する */
function matchByConfirmationNumber(
  incoming: Booking,
  pool: Array<Booking>,
): Booking | null {
  if (incoming.confirmationNumber === undefined) return null
  const incomingNumber = normalizeConfirmationNumber(
    incoming.confirmationNumber,
  )
  if (incomingNumber === null) return null

  return (
    pool.find((existing) => {
      if (existing.kind !== incoming.kind) return false
      if (existing.confirmationNumber === undefined) return false
      const existingNumber = normalizeConfirmationNumber(
        existing.confirmationNumber,
      )
      return existingNumber !== null && existingNumber === incomingNumber
    }) ?? null
  )
}

/** ルール2: kind が一致し、開始日(その予約自身のタイムゾーンでの現地日付)とタイトルの正規化が一致する */
function matchByStartAndTitle(
  incoming: Booking,
  pool: Array<Booking>,
): Booking | null {
  const incomingDate = stampDate(incoming.start)
  const incomingTitle = normalizeText(incoming.title)

  return (
    pool.find((existing) => {
      if (existing.kind !== incoming.kind) return false
      if (stampDate(existing.start) !== incomingDate) return false
      return normalizeText(existing.title) === incomingTitle
    }) ?? null
  )
}

/**
 * ルール3: 宿泊予約に限り、開始日と場所名の正規化が一致する。
 * 宿の予約はタイトルを利用者や AI が「〇〇ホテル」「Hotel 〇〇 予約確認」のように
 * 揺らして書きがちで、タイトル一致(ルール2)だけでは拾いきれないことがある。
 * 場所名のほうが表記が安定しやすいので、宿泊だけ追加の手がかりとして使う。
 * 宿泊以外に広げないのは、移動系の予約は同一性の手がかりが from/to の組み合わせに
 * 分散していて、単一の place だけでは同一性の根拠として弱いため。
 */
function matchByStartAndPlace(
  incoming: Booking,
  pool: Array<Booking>,
): Booking | null {
  if (incoming.kind !== 'lodging') return null
  if (incoming.place === undefined) return null
  const incomingDate = stampDate(incoming.start)
  const incomingPlace = normalizeText(incoming.place.name)

  return (
    pool.find((existing) => {
      if (existing.kind !== 'lodging') return false
      if (existing.place === undefined) return false
      if (stampDate(existing.start) !== incomingDate) return false
      return normalizeText(existing.place.name) === incomingPlace
    }) ?? null
  )
}

function findMatch(
  incoming: Booking,
  pool: Array<Booking>,
  consumed: Set<string>,
): Booking | null {
  const available = pool.filter((booking) => !consumed.has(booking.id))
  return (
    matchByConfirmationNumber(incoming, available) ??
    matchByStartAndTitle(incoming, available) ??
    matchByStartAndPlace(incoming, available)
  )
}

/**
 * confirmationNumber/provider/price/freeCancelUntil/
 * checkInClosesMinutesBefore/bagDropClosesMinutesBefore/note の
 * 共通ルール: 取り込み側に値があれば採用し、undefined なら既存を維持する。
 * from/to/place だけは中身をフィールド単位でマージするので mergePlace が受け持つ。
 * fromIncoming も一緒に返し、unverified の引き継ぎ判定に使う。
 * K を呼び出しごとに具体的なリテラルへ固定して使うので、Booking[K] は
 * 各呼び出しで正しい型に解決される。
 */
function pickOptional<K extends keyof Booking>(
  existing: Booking,
  incoming: Booking,
  key: K,
): { value: Booking[K]; fromIncoming: boolean } {
  const incomingValue = incoming[key]
  return incomingValue !== undefined
    ? { value: incomingValue, fromIncoming: true }
    : { value: existing[key], fromIncoming: false }
}

/**
 * from / to / place は、Place オブジェクトごと差し替えるのではなく
 * **フィールド単位**でマージする。取り込み側に値があればそれを採り、
 * 無ければ既存を維持する(ファイル冒頭の「取り込み側が空の項目は既存を維持する」
 * という方針を、Place の中身にもそのまま適用する)。
 *
 * オブジェクトごと差し替えていると、name と latinName だけを持つ取り込み側の値で
 * 既存の address / lat / lng / localName が黙って消える。とくに座標は
 * AI 取り込みが一度も出力しない欄(aiImport.ts の toPlace は lat/lng を読まない)なので、
 * 手で入れた座標が再取り込みのたびに失われることになる。
 * 消えたことは画面のどこにも出ず、地図リンクが効かなくなって初めて気付く。
 *
 * name だけは取り込み側を採る。kind / title / start と同じ「その予約が何であるか」に
 * 属する値で、既存と混ぜる意味が無いため。
 *
 * unverified の引き継ぎ判定(fromIncoming)は、これまでどおり
 * 「取り込み側がこの欄を持っていたか」で決める。unverified は from / to / place という
 * 欄の単位でしか持てず、Place の中身ごとに分けられない。中身のどれか 1 つでも
 * AI 由来の値が混ざったなら、その欄は人間が未確認だとみなすほうが安全である。
 */
function mergePlace(
  existing: Place | undefined,
  incoming: Place | undefined,
): { value: Place | undefined; fromIncoming: boolean } {
  if (incoming === undefined) return { value: existing, fromIncoming: false }
  if (existing === undefined) return { value: incoming, fromIncoming: true }

  const merged: Place = { name: incoming.name }
  const localName = incoming.localName ?? existing.localName
  if (localName !== undefined) merged.localName = localName
  const latinName = incoming.latinName ?? existing.latinName
  if (latinName !== undefined) merged.latinName = latinName
  const address = incoming.address ?? existing.address
  if (address !== undefined) merged.address = address
  const lat = incoming.lat ?? existing.lat
  if (lat !== undefined) merged.lat = lat
  const lng = incoming.lng ?? existing.lng
  if (lng !== undefined) merged.lng = lng

  return { value: merged, fromIncoming: true }
}

/**
 * evidence はフィールドごとにマージし、取り込み側を優先する。
 * 「値をどちらから採ったか」で unverified の引き継ぎ先が変わる他のフィールドと
 * 違い、evidence はあくまで抽出根拠の参考情報でしかないので、単純に
 * 取り込み側で上書きしてよい。
 */
function mergeEvidence(
  existing: Partial<Record<FieldKey, string>> | undefined,
  incoming: Partial<Record<FieldKey, string>> | undefined,
): Partial<Record<FieldKey, string>> | undefined {
  if (existing === undefined && incoming === undefined) return undefined
  const merged = { ...existing, ...incoming }
  return Object.keys(merged).length > 0 ? merged : undefined
}

/**
 * 既存予約 1 件と取り込み予約 1 件をマージする。
 * id は既存のものを保つ(予約の同一性を壊さない)。フィールドごとの採用規則は
 * ファイル冒頭のコメントを参照。
 */
export function mergeBooking(existing: Booking, incoming: Booking): Booking {
  const existingUnverified = new Set<FieldKey>(existing.unverified ?? [])
  const incomingUnverified = new Set<FieldKey>(incoming.unverified ?? [])
  const unverified: Array<FieldKey> = []

  /**
   * 実際に採用した側(取り込み/既存)の unverified 状態だけを引き継ぐ。
   * 単純な和集合にしないのは、既存の予約側で既に人間が確認済み(unverified に
   * 入っていない)フィールドまで、無関係な取り込み側の未確認状態と混ぜてしまうと
   * 「確認したはずの項目に黄色い下線が復活する」という逆行が起きるため。
   */
  function markUnverified(key: FieldKey, fromIncoming: boolean): void {
    const source = fromIncoming ? incomingUnverified : existingUnverified
    if (source.has(key)) unverified.push(key)
  }

  // kind / title / start は常に取り込み側を採用する
  markUnverified('kind', true)
  markUnverified('title', true)
  markUnverified('start', true)

  // end は取り込み側が null なら既存を維持する。AI が到着時刻・チェックアウトを
  // 読み取れなかっただけで、既存の値を消してよい理由にはならない
  const endFromIncoming = incoming.end !== null
  markUnverified('end', endFromIncoming)

  // status/payment は取り込み側を採用するが、取り込み側が既定値(AI が読み取れ
  // なかったときに入る値。aiImport.ts の DEFAULT_STATUS/DEFAULT_PAYMENT 参照)
  // なら既存を維持する。そのまま採用すると、利用者が自分で「確定」に
  // 変えた予約が、確認番号だけ更新したいだけの再取り込みのたびに
  // 「検討中」へ巻き戻ってしまう
  const statusFromIncoming = incoming.status !== DEFAULT_STATUS
  markUnverified('status', statusFromIncoming)
  const paymentFromIncoming = incoming.payment !== DEFAULT_PAYMENT
  markUnverified('payment', paymentFromIncoming)

  const merged: Booking = {
    id: existing.id,
    kind: incoming.kind,
    title: incoming.title,
    start: incoming.start,
    end: endFromIncoming ? incoming.end : existing.end,
    status: statusFromIncoming ? incoming.status : existing.status,
    payment: paymentFromIncoming ? incoming.payment : existing.payment,
  }

  // 場所だけは Place の中身をフィールド単位でマージする(mergePlace 参照)
  const from = mergePlace(existing.from, incoming.from)
  markUnverified('from', from.fromIncoming)
  if (from.value !== undefined) merged.from = from.value

  const to = mergePlace(existing.to, incoming.to)
  markUnverified('to', to.fromIncoming)
  if (to.value !== undefined) merged.to = to.value

  const place = mergePlace(existing.place, incoming.place)
  markUnverified('place', place.fromIncoming)
  if (place.value !== undefined) merged.place = place.value

  const confirmationNumber = pickOptional(
    existing,
    incoming,
    'confirmationNumber',
  )
  markUnverified('confirmationNumber', confirmationNumber.fromIncoming)
  if (confirmationNumber.value !== undefined) {
    merged.confirmationNumber = confirmationNumber.value
  }

  const provider = pickOptional(existing, incoming, 'provider')
  markUnverified('provider', provider.fromIncoming)
  if (provider.value !== undefined) merged.provider = provider.value

  const price = pickOptional(existing, incoming, 'price')
  markUnverified('price', price.fromIncoming)
  if (price.value !== undefined) merged.price = price.value

  const freeCancelUntil = pickOptional(existing, incoming, 'freeCancelUntil')
  markUnverified('freeCancelUntil', freeCancelUntil.fromIncoming)
  if (freeCancelUntil.value !== undefined) {
    merged.freeCancelUntil = freeCancelUntil.value
  }

  // 締切は「出発の何分前か」という相対値なので、start を取り込み側で
  // 上書きしても意味がずれない。むしろ出発時刻を直した再取り込みでこそ
  // 生き残ってほしい値なので、他の任意フィールドと同じ規則でよい
  const checkInCloses = pickOptional(
    existing,
    incoming,
    'checkInClosesMinutesBefore',
  )
  markUnverified('checkInClosesMinutesBefore', checkInCloses.fromIncoming)
  if (checkInCloses.value !== undefined) {
    merged.checkInClosesMinutesBefore = checkInCloses.value
  }

  const bagDropCloses = pickOptional(
    existing,
    incoming,
    'bagDropClosesMinutesBefore',
  )
  markUnverified('bagDropClosesMinutesBefore', bagDropCloses.fromIncoming)
  if (bagDropCloses.value !== undefined) {
    merged.bagDropClosesMinutesBefore = bagDropCloses.value
  }

  const note = pickOptional(existing, incoming, 'note')
  markUnverified('note', note.fromIncoming)
  if (note.value !== undefined) merged.note = note.value

  if (unverified.length > 0) merged.unverified = unverified

  const evidence = mergeEvidence(existing.evidence, incoming.evidence)
  if (evidence !== undefined) merged.evidence = evidence

  return merged
}

/**
 * 既存の予約群と取り込み予約群を突き合わせ、それぞれの取り込み予約が
 * 新規追加になるか既存の更新(マージ)になるかを決める。
 *
 * 戻り値の entries は incoming と同じ順序・同じ件数を保つ。呼び出し側
 * (reducer / UI のプレビュー)はこの計画をそのまま適用すればよく、
 * マッチ条件を再実装する必要はない。
 */
export function planImport(
  existing: Array<Booking>,
  incoming: Array<Booking>,
): ImportPlan {
  // status === 'cancelled' の予約はマッチ対象から外す。理由はファイル冒頭を参照
  const pool = existing.filter((booking) => booking.status !== 'cancelled')
  const consumed = new Set<string>()

  const entries: Array<ImportPlanEntry> = incoming.map((candidate) => {
    const match = findMatch(candidate, pool, consumed)
    if (match === null) {
      return { booking: candidate, replacesId: null }
    }
    consumed.add(match.id)
    return { booking: mergeBooking(match, candidate), replacesId: match.id }
  })

  const updatedCount = entries.filter(
    (entry) => entry.replacesId !== null,
  ).length

  return {
    entries,
    addedCount: entries.length - updatedCount,
    updatedCount,
  }
}
