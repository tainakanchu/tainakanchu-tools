import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Home, Menu, Printer, Sparkles, X } from 'lucide-react'

export default function Header() {
  const [isOpen, setIsOpen] = useState(false)
  const tools = useMemo(
    () => [
      {
        to: '/tools/license-layout',
        title: '免許証レイアウトメーカー',
        description: '免許証画像をA4に原寸配置して印刷・PDF出力するツール',
        icon: Printer,
      },
    ],
    [],
  )

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-gray-900/80 backdrop-blur supports-[backdrop-filter]:bg-gray-900/60 print:hidden">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 text-white">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsOpen(true)}
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 transition hover:border-cyan-400/60 hover:bg-cyan-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
              aria-label="メニューを開く"
            >
              <Menu size={20} />
            </button>
            <Link to="/" className="flex items-center gap-3">
              <BrandBadge />
              <div className="leading-tight">
                <span className="block text-base font-semibold tracking-wide">
                  かんちゅツールズ
                </span>
                <span className="block text-xs text-cyan-200">
                  Daily helpers crafted by tainakanchu
                </span>
              </div>
            </Link>
          </div>

          <nav className="hidden items-center gap-6 text-sm font-medium text-gray-200 md:flex">
            <Link
              to="/"
              className="flex items-center gap-2 rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-white"
              activeProps={{
                className:
                  'flex items-center gap-2 rounded-full bg-cyan-500/20 px-3 py-2 text-cyan-100 hover:bg-cyan-500/30',
              }}
            >
              <Home size={16} />
              ホーム
            </Link>
            {tools.map((tool) => (
              <Link
                key={tool.to}
                to={tool.to}
                className="flex items-center gap-2 rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-white"
                activeProps={{
                  className:
                    'flex items-center gap-2 rounded-full bg-cyan-500/20 px-3 py-2 text-cyan-100 hover:bg-cyan-500/30',
                }}
              >
                <tool.icon size={16} />
                {tool.title}
              </Link>
            ))}
          </nav>

          <a
            href="https://x.com/tainakanchu"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-300 transition hover:border-cyan-400/60 hover:text-white md:flex"
          >
            <span className="inline-flex h-2 w-2 rounded-full bg-cyan-400" />
            @tainakanchu
          </a>
        </div>
      </header>

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-[320px] flex-col bg-gray-950 text-white shadow-2xl transition-transform duration-300 ease-in-out print:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <BrandBadge size="sm" />
            <div>
              <p className="text-sm font-semibold">かんちゅツールズ</p>
              <p className="text-xs text-gray-400">Utility lab</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-xl border border-white/10 bg-white/5 p-2 transition hover:border-white/20 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
            aria-label="メニューを閉じる"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-1">
            <Link
              to="/"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition hover:bg-white/10 hover:text-white"
              activeProps={{
                className:
                  'flex items-center gap-3 rounded-2xl bg-cyan-500/20 px-4 py-3 text-cyan-100 hover:bg-cyan-500/30',
              }}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/5">
                <Home size={18} />
              </span>
              <span className="text-sm font-medium">ホーム</span>
            </Link>
          </div>

          <div className="mt-6 space-y-3">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
              Tools
            </p>

            <div className="space-y-2">
              {tools.map((tool) => (
                <Link
                  key={tool.to}
                  to={tool.to}
                  onClick={() => setIsOpen(false)}
                  className="group flex gap-3 rounded-2xl border border-white/5 bg-white/[0.04] p-4 transition hover:border-cyan-400/40 hover:bg-cyan-400/10"
                  activeProps={{
                    className:
                      'group flex gap-3 rounded-2xl border border-cyan-400/60 bg-cyan-500/15 p-4',
                  }}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-cyan-200 group-hover:bg-cyan-500/20 group-[&.active]:bg-cyan-500/25">
                    <tool.icon size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      {tool.title}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      {tool.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </nav>

        <footer className="border-t border-white/10 px-5 py-4 text-xs text-gray-500">
          <p className="font-medium text-gray-300">かんちゅ</p>
          <p className="mt-1">
            “Gathering small, handy tools for everyday workflow.”
          </p>
        </footer>
      </aside>
    </>
  )
}

function BrandBadge({ size = 'md' }: { size?: 'md' | 'sm' }) {
  const dimension =
    size === 'sm' ? 'h-9 w-9 rounded-2xl' : 'h-10 w-10 rounded-3xl'
  const iconSize = size === 'sm' ? 18 : 20
  const [failedToLoad, setFailedToLoad] = useState(false)
  const avatarSrc = '/assets/tainakanchu-avatar.png'

  return (
    <span
      className={`relative inline-flex ${dimension} overflow-hidden bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-500 shadow-lg`}
    >
      <span className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.45),rgba(255,255,255,0)_55%)] opacity-70 mix-blend-screen" />
      {failedToLoad ? (
        <Sparkles
          size={iconSize}
          className="relative text-white drop-shadow-[0_4px_10px_rgba(15,118,110,0.55)]"
        />
      ) : (
        <img
          src={avatarSrc}
          alt="tainakanchu avatar"
          className="relative h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailedToLoad(true)}
        />
      )}
      <span className="pointer-events-none absolute inset-0 rounded-[inherit] border border-white/30 mix-blend-screen" />
    </span>
  )
}
