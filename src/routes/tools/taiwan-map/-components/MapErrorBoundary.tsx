/**
 * 地図まわりだけを包むエラー境界。
 *
 * 地図は React.lazy で後から読む別チャンク（maplibre 込みで約 1MB）なので、
 * 回線が切れた・デプロイで古いチャンクが消えた、といった理由で読み込みに
 * 失敗し得る。境界が無いとその失敗がルートまで伝わってページ全体が
 * 真っ白になり、地図とは関係なく読めるはずの一覧まで使えなくなる。
 * 失敗は地図の枠の中だけで受け止め、一覧はそのまま使えるようにする。
 *
 * 「再読み込み」はページごと読み直す。その場で lazy を作り直す手も試したが、
 * ブラウザは一度失敗した動的 import（同じ URL のモジュール）の結果を
 * 覚えていて、ページを読み直さない限り何度 import しても同じ失敗が返る。
 * 絞り込み条件は URL にあるので、読み直しても見ていた一覧はそのまま戻る。
 */

import { Component } from 'react'
import { RotateCw } from 'lucide-react'
import { actionButtonClass } from '../-lib/styles'
import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
}

type State = { failed: boolean }

export class MapErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  handleRetry = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div
        role="alert"
        className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center text-sm text-gray-600"
      >
        <p>地図を読み込めませんでした。一覧はそのまま使えます。</p>
        <button
          type="button"
          onClick={this.handleRetry}
          className={actionButtonClass}
        >
          <RotateCw size={14} aria-hidden />
          再読み込み
        </button>
      </div>
    )
  }
}
