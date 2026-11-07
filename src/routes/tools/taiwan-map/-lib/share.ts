/**
 * スポットのリンクを渡す手段。スマホで Web Share API（OS の共有シート）が
 * 使えるなら「共有」、それ以外は「リンクをコピー」。
 * デスクトップの Chrome / Safari にも navigator.share はあるが、
 * パソコンではコピーのほうが期待どおりなので、指で操作する端末だけにする。
 */

import { copyText } from './copy'

export function canNativeShare(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  )
}

/**
 * 共有シートを開く。閉じられた（AbortError）ときは何もしない。
 * 共有シートが使えない・失敗したときはコピーに切り替える。
 * 戻り値はコピーしたときだけ 'copied'（「コピーしました」を出すため）
 */
export async function shareOrCopy(
  title: string,
  url: string,
): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (canNativeShare()) {
    try {
      await navigator.share({ title, url })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError')
        return 'cancelled'
    }
  }
  return (await copyText(url)) ? 'copied' : 'failed'
}
