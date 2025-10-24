import { Outlet, createRootRoute } from '@tanstack/react-router'
import { Suspense, lazy } from 'react'

import Header from '../components/Header'

const Devtools = import.meta.env.DEV
  ? lazy(() => import('../components/Devtools'))
  : null

export const Route = createRootRoute({
  component: () => (
    <>
      <Header />
      <Outlet />
      {Devtools ? (
        <Suspense fallback={null}>
          <Devtools />
        </Suspense>
      ) : null}
    </>
  ),
})
