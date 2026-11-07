import {
  HeadContent,
  Link,
  Outlet,
  createRootRoute,
} from '@tanstack/react-router'
import { Suspense, lazy } from 'react'

import Header from '../components/Header'
import { Page, PageTitle, buttonClass } from '../components/ui'

const Devtools = import.meta.env.DEV
  ? lazy(() => import('../components/Devtools'))
  : null

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: 'かんちゅツールズ | tainakanchu tools' }],
  }),
  component: () => (
    <>
      <HeadContent />
      <Header />
      <Outlet />
      {Devtools ? (
        <Suspense fallback={null}>
          <Devtools />
        </Suspense>
      ) : null}
    </>
  ),
  notFoundComponent: NotFound,
})

function NotFound() {
  return (
    <Page>
      <PageTitle lead="URL が変わったか、まだ作っていないページです。目次から探してください。">
        このページは見つかりませんでした
      </PageTitle>
      <p>
        <Link to="/" className={buttonClass('secondary')}>
          目次に戻る
        </Link>
      </p>
    </Page>
  )
}
