import { useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'

import { getPwaHeadForPathname } from '../lib/site-meta'
import type { PwaHead } from '../lib/site-meta'

/**
 * ツール単体 PWA 用に head の manifest / apple-touch-icon /
 * apple-mobile-web-app-title を、いまのルートに合わせて差し替える。
 *
 * 静的な dist/tools/<slug>.html でも同じ差し替えをしているが、それだけでは
 * 足りない。SW が入った後はツール URL を直接開いても navigateFallback で
 * /index.html (サイト全体の値) が返るし、SPA 内の移動では HTML を読み直さない。
 * なのでランタイムでも pathname から決め直す。
 *
 * 要素は新しく足さずに既存のものを書き換える。<link rel="manifest"> は VitePWA が
 * index.html に注入したもので TanStack Router の HeadContent の管理外なうえ、
 * manifest のリンクが 2 本あるとブラウザは先頭しか見ないため。
 * 要素が無いとき (pnpm dev では VitePWA が manifest を注入しない) は何もしない。
 */
export default function PwaHeadSync() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  useEffect(() => {
    applyPwaHead(getPwaHeadForPathname(pathname))
  }, [pathname])

  return null
}

function applyPwaHead(head: PwaHead) {
  setHeadAttr('link[rel="manifest"]', 'href', head.manifestHref)
  setHeadAttr('link[rel="apple-touch-icon"]', 'href', head.appleTouchIcon)
  setHeadAttr(
    'meta[name="apple-mobile-web-app-title"]',
    'content',
    head.appleTitle,
  )
}

function setHeadAttr(selector: string, attr: string, value: string) {
  const element = document.head.querySelector(selector)
  // 同じ値を書き直さない。manifest の href を触るとブラウザが manifest を
  // 読み直すことがあるので、変わるときだけ書き換える。
  if (element && element.getAttribute(attr) !== value) {
    element.setAttribute(attr, value)
  }
}
