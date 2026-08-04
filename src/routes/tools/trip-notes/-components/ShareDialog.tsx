/**
 * 共有URLダイアログ。
 *
 * 「同行者に渡す」ことと「未来の自分へのバックアップ」を1つの導線で兼ねる
 * (share.ts の設計意図を参照)。サーバーには何も送らないので、
 * URLの生成自体は完全にクライアント側で完結する。
 *
 * QRコードは常に出すわけではない。予約が増えるとpayloadが伸び、
 * QRの実用上限(QR_SAFE_BYTES)を超えることがあるため、超えた場合は
 * QRを諦めてURLコピーに誘導する(中途半端に読み取れないQRを出すほうが有害)。
 * 判定に使うのは文字数ではなく圧縮後のバイト数。漢字URLだと1文字が14bitを運ぶうえ
 * URL上では1文字3バイトに膨らむので、文字数はQR容量とまったく相関しない。
 */

import { useEffect, useId, useState } from 'react'
import { Check, Copy, Loader2, Share2, X } from 'lucide-react'
import QRCode from 'qrcode'
import { QR_SAFE_BYTES, buildShare } from '../../../../lib/trip-notes/share'
import { copyText } from '../-lib/format'
import { useDialogFocus } from '../-lib/focusTrap'
import {
  fieldClass,
  iconButtonClass,
  primaryButtonClass,
  subtleButtonClass,
} from '../-lib/styles'
import type { TripNotesState } from '../../../../lib/trip-notes/types'

interface ShareDialogProps {
  state: TripNotesState
  onClose: () => void
}

type ShareResult =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; url: string; size: number; qrDataUrl: string | null }

export function ShareDialog({ state, onClose }: ShareDialogProps) {
  const titleId = useId()
  const urlInputId = useId()
  const kanjiToggleId = useId()

  const [result, setResult] = useState<ShareResult>({ status: 'loading' })
  const [copied, setCopied] = useState(false)
  // 漢字URLはネタなので既定はオフ。明示的に選んだときだけ marker '3' で作る
  const [kanji, setKanji] = useState(false)
  const panelRef = useDialogFocus<HTMLDivElement>({ onClose })
  const shareSupported =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  // マウント後にURL生成・サイズ見積もり・QR生成を行う(すべて非同期)。
  // ダイアログを開いてすぐ閉じたときにアンマウント後の setState を起こさないようガードする。
  //
  // フラグを直接読まずに isAlive() 越しに読むのは型解析のため。
  // 素の変数だと「初期値 true・書き換えはクリーンアップ関数の中だけ」と見えるので、
  // await をまたいでも値が変わらないものとして扱われ、
  // 2 回目以降の判定が「常に偽の条件」として lint に落とされてしまう。
  useEffect(() => {
    const alive = { current: true }
    const isAlive = () => alive.current

    async function run() {
      try {
        const baseUrl = `${window.location.origin}${window.location.pathname}`
        const share = await buildShare(state, baseUrl, { cjk: kanji })
        if (!isAlive()) return

        let qrDataUrl: string | null = null
        // 漢字URLはQRに載せない。qrcode は漢字モードが有効な環境で
        // SJIS に無い CJK 文字を渡すと throw するうえ、%エンコード後の
        // バイト数が3倍になってそもそも容量に収まらない
        if (!kanji && share.byteLength <= QR_SAFE_BYTES) {
          try {
            qrDataUrl = await QRCode.toDataURL(share.url, {
              width: 256,
              margin: 1,
            })
          } catch {
            // QR化に失敗しても共有URL自体は使えるので、QRを諦めるだけに留める
            qrDataUrl = null
          }
        }
        if (!isAlive()) return
        setResult({
          status: 'ready',
          url: share.url,
          size: share.length,
          qrDataUrl,
        })
      } catch {
        if (isAlive()) setResult({ status: 'error' })
      }
    }

    setResult({ status: 'loading' })
    void run()
    return () => {
      alive.current = false
    }
  }, [state, kanji])

  const handleCopy = async () => {
    if (result.status !== 'ready') return
    // アプリが持っている文字列そのものをコピーする。
    // アドレスバーからコピーすると %E8%B2%9E... の形に戻ってしまうので、
    // 漢字のまま渡せるのはこの経路だけ
    const ok = await copyText(result.url)
    setCopied(ok)
    if (ok) {
      window.setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleShare = async () => {
    if (result.status !== 'ready') return
    try {
      await navigator.share({
        title: state.tripTitle.length > 0 ? state.tripTitle : '旅のしおり',
        url: result.url,
      })
    } catch {
      // ユーザーによるキャンセルも失敗として扱わない。共有はあくまで補助手段
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl outline-none"
      >
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="text-base font-semibold text-gray-800">
            共有URL
          </h2>
          <button
            type="button"
            aria-label="閉じる"
            className={iconButtonClass}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {result.status === 'loading' ? (
          <div className="flex items-center gap-2 py-8 text-sm text-gray-600">
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            共有URLを作成しています…
          </div>
        ) : null}

        {result.status === 'error' ? (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            共有URLの作成に失敗しました。時間をおいて再度お試しください。
          </p>
        ) : null}

        {result.status === 'ready' ? (
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor={urlInputId} className="sr-only">
                共有URL
              </label>
              <div className="flex gap-2">
                <input
                  id={urlInputId}
                  type="text"
                  readOnly
                  value={result.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className={`${fieldClass} font-mono text-xs`}
                />
                <button
                  type="button"
                  className={`${subtleButtonClass} shrink-0`}
                  onClick={() => {
                    void handleCopy()
                  }}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'コピー済み' : 'コピー'}
                </button>
              </div>
            </div>

            {result.qrDataUrl !== null ? (
              <div className="flex flex-col items-center gap-2">
                <img
                  src={result.qrDataUrl}
                  alt="共有URLのQRコード"
                  className="h-48 w-48"
                />
                <p className="text-xs text-gray-500">
                  同行者のスマホのカメラで読み取ってもらえます。
                </p>
              </div>
            ) : null}

            {result.qrDataUrl === null && !kanji ? (
              <p
                role="alert"
                className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
              >
                予約が多いためQRコードは使えません(
                {result.size.toLocaleString('ja-JP')}文字)。
                URLをコピーして共有してください。
              </p>
            ) : null}

            {shareSupported ? (
              <button
                type="button"
                className={`${primaryButtonClass} w-full`}
                onClick={() => {
                  void handleShare()
                }}
              >
                <Share2 size={16} />
                共有する
              </button>
            ) : null}

            <div className="rounded-lg border border-gray-200 px-3 py-2">
              <label
                htmlFor={kanjiToggleId}
                className="flex items-center gap-2 text-sm text-gray-700"
              >
                <input
                  id={kanjiToggleId}
                  type="checkbox"
                  checked={kanji}
                  onChange={(e) => setKanji(e.currentTarget.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                />
                URLを漢字にする(ネタ)
              </label>
              <p className="mt-1 text-xs text-gray-500">
                同じ内容を漢字だけで書き表します。文字数は半分以下になりますが、
                実際に送れる量が増えるわけではありません。
              </p>
            </div>

            {kanji ? (
              <ul
                role="alert"
                className="list-disc space-y-1 rounded-lg bg-amber-50 px-3 py-2 pl-7 text-xs text-amber-900"
              >
                <li>LINEなどでリンクが途中で切れることがあります。</li>
                <li>
                  ブラウザのアドレスバーからコピーすると
                  <span className="font-mono">%E8%B2%9E…</span>
                  のような形式に戻ります。このダイアログのコピーボタンを使ってください。
                </li>
                <li>
                  SMSでは送らないでください(文字数制限が一気に厳しくなります)。
                </li>
                <li>QRコードは作れません。</li>
              </ul>
            ) : null}

            <p className="rounded-lg bg-cyan-50 px-3 py-2 text-xs text-cyan-900">
              このURLを自分にLINEやメールで送っておくと、端末のデータが消えても
              復元できます。iOSのSafariは7日間開かなかったサイトのデータを
              消すことがあるため、旅行直前に限らず今のうちに送っておくと安心です。
            </p>
          </div>
        ) : null}

        <button
          type="button"
          className={`${subtleButtonClass} mt-4 w-full`}
          onClick={onClose}
        >
          閉じる
        </button>
      </div>
    </div>
  )
}
