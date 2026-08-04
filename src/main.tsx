import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

import { ensureTemporal } from './lib/trip-notes/temporal-setup'

import './styles.css'
import reportWebVitals from './reportWebVitals.ts'

// Create a new router instance
const router = createRouter({
  routeTree,
  context: {},
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
})

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

/**
 * Render the app.
 *
 * 旅のしおりは Temporal に依存するので、マウント前に polyfill の読み込みを待つ。
 * ネイティブ対応ブラウザでは何も読み込まずに即座に解決するため待ち時間は増えない。
 * 読み込みに失敗しても他のツールは動くべきなので、ここで描画自体は止めない。
 */
async function mount() {
  try {
    await ensureTemporal()
  } catch (error) {
    console.error('Temporal の初期化に失敗しました', error)
  }

  const rootElement = document.getElementById('app')
  if (rootElement && !rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement)
    root.render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    )
  }
}

void mount()

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals()
