/**
 * マイタイムテーブルの UI で共有するクラスと小さなフック。
 *
 * 当日スマホで見る道具なので、余白は控えめ・角丸は小さめにして情報を詰める。
 * 角丸カード + 影の羅列は避け、区切りは罫線で付ける。
 * cyan は「押せるもの」の色に限定し、会場色(colors.ts)と混ざらないようにする。
 *
 * ダーク(dark:)では面を gray-900、罫線を gray-600/700 にする。主ボタンは
 * cyan-700 のままだと暗い地に沈むので cyan-400 の塗りに濃い字(9:1 以上)にする。
 */

import { useEffect, useState } from 'react'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 dark:focus-visible:outline-cyan-400'

export const btn = `inline-flex items-center justify-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 ${focusRing}`

export const btnPrimary = `inline-flex items-center justify-center gap-1 rounded-md bg-cyan-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-cyan-400 dark:text-gray-950 dark:hover:bg-cyan-300 ${focusRing}`

export const btnDanger =
  'inline-flex items-center justify-center gap-1 rounded-md border border-rose-300 bg-white px-2.5 py-1.5 text-sm text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 dark:border-rose-800 dark:bg-gray-900 dark:text-rose-300 dark:hover:bg-rose-950/60 dark:focus-visible:outline-rose-400'

export const field =
  'w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-600/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-cyan-400 dark:focus:ring-cyan-400/30'

export const sectionTitle =
  'text-base font-bold text-gray-900 dark:text-gray-100'

/** 分が変わるたびに更新される現在時刻(ms) */
export function useNowMs(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let timer = 0
    const schedule = () => {
      const wait = 60_000 - (Date.now() % 60_000) + 50
      timer = window.setTimeout(() => {
        setNow(Date.now())
        schedule()
      }, wait)
    }
    schedule()
    // 画面に戻ってきたとき(スリープ明け)はすぐ合わせる
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return now
}

export function downloadText(fileName: string, text: string, type: string) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.append(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** 友達の名前の頭文字(グリッドの小さな札に出す) */
export function initialOf(name: string): string {
  const segments = new Intl.Segmenter('ja', {
    granularity: 'grapheme',
  }).segment(name.trim())
  for (const { segment } of segments) return segment.toUpperCase()
  return '友'
}
