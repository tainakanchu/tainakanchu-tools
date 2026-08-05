/**
 * 旅のしおりの「複数の旅程を持てる」保存層。
 *
 * これまでは localStorage の 1 キーに TripNotesState を 1 つだけ置いていた。
 * 旅程が 1 つしかないという前提が、共有URLや JSON の読み込みを
 * 「いまのデータを丸ごと捨てて入れ替える」以外に作れなくしていたので、
 * 旅程の入れ物(TripLibrary)を 1 段かぶせる。
 *
 * 設計判断:
 *
 * - 旧キー(trip-notes:v1)を上書きも削除もしない。
 *   保存のキーを差し替える変更は、間違えたときに「利用者の数ヶ月ぶんの入力が
 *   一瞬で消えた」という形でしか失敗が現れない。旧キーを残しておけば、
 *   移行の実装を間違えても devtools から手で救い出せる最後の綱になる。
 *   容量にしても旅程 1 つぶんで、残しておく代償はほぼ無い。
 *   一方で旧キーへの二重書き込みはしない。新旧が静かに食い違ったまま
 *   どちらが正しいのか誰にも分からなくなるほうが、消えるより厄介だからである。
 *   移行後の旧キーは「凍結されたスナップショット」であって、現役のデータではない。
 *
 * - 旅程が 0 件の状態を作らない。
 *   最後の 1 件を消したときは空にせず、新しい空の旅程に置き換える。
 *   0 件を許すと「アクティブな旅程が無い」状態が生まれ、画面(何を編集するのか)も
 *   保存層(activeTripId が指す先が無い)も、そのためだけの分岐を全域に抱えることになる。
 *   利用者から見ても、旅程を消した先にあるのは「まっさらな旅のしおり」であって
 *   「何も無い画面」ではない。
 *
 * - 検証の流儀は storage.ts に揃える。トップレベル(バージョン・trips が配列か)が
 *   壊れていれば復元を諦めて null、trips の要素は 1 件ずつ parseTripNotesState に
 *   かけて不正な要素だけ落とす。1 つの旅程が壊れているせいで他の旅程まで
 *   読めなくなるのは、旅行直前の利用者にとって最悪の体験になる。
 *
 * - 履歴(Undo/Redo)はこの層では持たない。旅程の切り替えは「別の旅程を開く」
 *   ことであって現在の旅程への編集ではないので、切り替え時に履歴ごと捨てる。
 *   理由の本体は -lib/reducer.ts の loadTrip のコメントを参照。
 */

import { newId } from './id'
import {
  createInitialState,
  loadFromStorage,
  parseTripNotesState,
} from './storage'
import type { TripNotesState } from './types'

const LIBRARY_KEY = 'trip-notes:trips:v1'

export interface TripEntry {
  id: string
  state: TripNotesState
}

export interface TripLibrary {
  schemaVersion: 1
  activeTripId: string
  trips: Array<TripEntry>
}

/** 旅程 1 件だけの、まっさらな入れ物 */
export function createInitialLibrary(today: string): TripLibrary {
  const entry: TripEntry = {
    id: newId('trip'),
    state: createInitialState(today),
  }
  return { schemaVersion: 1, activeTripId: entry.id, trips: [entry] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseTripEntry(raw: unknown): TripEntry | null {
  if (!isRecord(raw)) return null
  if (typeof raw.id !== 'string') return null
  const state = parseTripNotesState(raw.state)
  if (state === null) return null
  return { id: raw.id, state }
}

/**
 * 外部由来 JSON(localStorage)を検証・正規化する。
 *
 * 生き残った旅程が 0 件になったときは null を返し、初期状態の生成は
 * loadLibrary に任せる。初期状態には「今日」が要るのに対して、この関数は
 * 引数に today を取らない純粋な検証器でいてほしいためである
 * (テストから時刻に依存せず呼べることも含めて、その形のほうが扱いやすい)。
 */
export function parseTripLibrary(raw: unknown): TripLibrary | null {
  if (!isRecord(raw)) return null
  if (raw.schemaVersion !== 1) return null
  if (!Array.isArray(raw.trips)) return null

  const trips = raw.trips
    .map(parseTripEntry)
    .filter((entry): entry is TripEntry => entry !== null)
  if (trips.length === 0) return null

  // activeTripId が指す旅程が(壊れて落ちたなどで)無いときは先頭に寄せる。
  // 「どれも開いていない」状態を作らないための最後の受け皿
  const requested = raw.activeTripId
  const active =
    typeof requested === 'string' && trips.some((trip) => trip.id === requested)
      ? requested
      : trips[0].id

  return { schemaVersion: 1, activeTripId: active, trips }
}

/**
 * 保存済みの旅程を読む。必ず有効な TripLibrary を返す。
 *
 * 優先順位は 新キー → 旧キーからの移行 → 初期状態。
 * 新キーが壊れていた場合も旧キーを見にいく。旧キーは移行時点で凍結された
 * スナップショットなので数ヶ月古いこともありうるが、
 * 「古い旅程が出てくる」ほうが「まっさらな画面が出てくる」よりは救いがある。
 */
export function loadLibrary(today: string): TripLibrary {
  try {
    const raw = window.localStorage.getItem(LIBRARY_KEY)
    if (raw !== null) {
      const parsed = parseTripLibrary(JSON.parse(raw))
      if (parsed !== null) return parsed
    }
  } catch {
    // 壊れた JSON・window が無い環境。下の移行/初期状態に落とす
  }

  const legacy = loadFromStorage()
  if (legacy !== null) {
    const entry: TripEntry = { id: newId('trip'), state: legacy }
    return { schemaVersion: 1, activeTripId: entry.id, trips: [entry] }
  }

  return createInitialLibrary(today)
}

/** saveToStorage と同じく例外を握りつぶす。容量超過やプライベートモードでも編集は続けられるべき */
export function saveLibrary(library: TripLibrary): void {
  try {
    window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(library))
  } catch {
    // 容量超過・プライベートモード・window が無い環境でも編集自体は継続できるようにする
  }
}

/**
 * 旅程を 1 件足して、それを開いた状態の入れ物を返す。
 *
 * 既存の旅程には一切触れない(並びも中身も保つ)。外から旅程を持ち込む導線
 * (旅程パズルからの引き継ぎ、共有URL や JSON の取り込み)は、
 * 「いまのデータが消えるかもしれない」と利用者に思わせた時点で使われなくなる。
 * 追加しかしないと決めておけば、押す前に迷う理由が無くなる。
 *
 * 末尾に足すのは、旅程セレクタが作った順に並ぶほうが「さっき足したのはこれ」と
 * 探しやすいため。足した旅程をそのまま開くのは、持ち込んだ直後に見たいのが
 * その旅程だからで、開かずに足すと「押したのに何も起きていない」ように見える。
 */
export function addTripToLibrary(
  library: TripLibrary,
  state: TripNotesState,
): TripLibrary {
  const entry: TripEntry = { id: newId('trip'), state }
  return {
    ...library,
    activeTripId: entry.id,
    trips: [...library.trips, entry],
  }
}

/** いま開いている旅程の状態 */
export function activeStateOf(library: TripLibrary): TripNotesState {
  const active = library.trips.find((trip) => trip.id === library.activeTripId)
  // parseTripLibrary も createInitialLibrary も activeTripId が trips の中に
  // あることを保証するので、ここが外れることは実際には無い。
  // それでも先頭に逃がすのは、「どの旅程も開けない」という復帰不能な壊れ方を
  // 型の上でも作らないため
  return (active ?? library.trips[0]).state
}

/**
 * いま開いている旅程を、編集中の state で差し替えた入れ物を返す。
 * 編集は historyReducer 側が持つので、保存や旅程の切り替えの直前に
 * この関数で入れ物へ書き戻す。
 */
export function withActiveState(
  library: TripLibrary,
  state: TripNotesState,
): TripLibrary {
  return {
    ...library,
    trips: library.trips.map((trip) =>
      trip.id === library.activeTripId ? { ...trip, state } : trip,
    ),
  }
}
