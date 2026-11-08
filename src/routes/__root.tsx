import { HeadContent, Outlet, createRootRoute } from '@tanstack/react-router'
import { Suspense, lazy } from 'react'

import Header from '../components/Header'
import PwaHeadSync from '../components/PwaHeadSync'
import { ThemeProvider } from '../components/theme/ThemeScope'

const Devtools = import.meta.env.DEV
  ? lazy(() => import('../components/Devtools'))
  : null

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: 'かんちゅツールズ | tainakanchu tools' }],
  }),
  // 配色はサイト全体で 1 つ。ヘッダーの切り替えもツールの中身も同じ状態を見る
  component: () => (
    <ThemeProvider>
      <HeadContent />
      <PwaHeadSync />
      <Header />
      <Outlet />
      {Devtools ? (
        <Suspense fallback={null}>
          <Devtools />
        </Suspense>
      ) : null}
    </ThemeProvider>
  ),
})
