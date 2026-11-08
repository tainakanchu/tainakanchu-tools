import { Link, useRouterState } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import {
  CalendarClock,
  Dices,
  Disc3,
  Drum,
  ExternalLink,
  Home,
  Layers,
  Luggage,
  Map,
  MapPinned,
  Menu,
  Mic,
  Monitor,
  Moon,
  PlaneLanding,
  Printer,
  Sparkles,
  Sun,
  X,
  ZoomIn,
} from 'lucide-react'
import { getCatalogByCategory } from '../lib/site-meta'
import type { CatalogItem } from '../lib/site-meta'
import { THEME_SETTING_LABELS } from '../lib/theme/theme'
import type { ThemeSetting } from '../lib/theme/theme'
import { useTheme } from './theme/ThemeScope'
import {
  getLaunchedToolAppSlug,
  isStandaloneDisplay,
  isToolAppPathname,
} from '../lib/tool-app'

/** Header 専用: site-meta に lucide を入れないため slug → icon はここで持つ */
const TOOL_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  'actual-size-layout': Printer,
  risograph: Layers,
  'meeting-recorder': Mic,
  'trip-scheduler': Map,
  'trip-notes': Luggage,
  'drum-roll': Drum,
  'setlist-card': Disc3,
  timetable: CalendarClock,
  'taiwan-arrival-card': PlaneLanding,
  'taiwan-map': MapPinned,
  'magnify-image': ZoomIn,
  'online-roulette': Dices,
}

function toolIcon(slug: string) {
  return TOOL_ICONS[slug] ?? Sparkles
}

export default function Header() {
  const [isOpen, setIsOpen] = useState(false)
  const categories = useMemo(() => getCatalogByCategory(), [])
  const isToolApp = useIsToolApp()

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-gray-900/80 backdrop-blur supports-[backdrop-filter]:bg-gray-900/60 print:hidden">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 text-white">
          <div className="flex min-w-0 items-center gap-3">
            {/* ツール単体アプリではツール一覧を開くボタンを出さない（そのツール専用の
                アプリなので）。ドロワーはボタンが無ければ開かないので触らない。
                ロゴのトップへのリンクは残し、他のツールへはそこから行ける。 */}
            {isToolApp ? null : (
              <button
                onClick={() => setIsOpen(true)}
                className="inline-flex shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 transition hover:border-cyan-400/60 hover:bg-cyan-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
                aria-label="メニューを開く"
              >
                <Menu size={20} />
              </button>
            )}
            <Link to="/" className="flex min-w-0 items-center gap-3">
              <BrandBadge />
              <div className="min-w-0 leading-tight">
                <span className="block text-base font-semibold tracking-wide">
                  かんちゅツールズ
                </span>
                <span className="block truncate text-xs text-cyan-200">
                  Daily helpers crafted by tainakanchu
                </span>
              </div>
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <a
              href="https://x.com/tainakanchu"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-300 transition hover:border-cyan-400/60 hover:text-white md:flex"
            >
              <span className="inline-flex h-2 w-2 rounded-full bg-cyan-400" />
              @tainakanchu
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* 影は開いているときだけ。閉じて画面の左外に退けていても、影が画面の
          左端に薄くはみ出して見えるため */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-[320px] flex-col border-r border-white/10 bg-gray-950 text-white transition-transform duration-300 ease-in-out print:hidden ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
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

          <div className="mt-6 space-y-5">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
              Tools
            </p>

            {categories.map((category) => (
              <div key={category.id} className="space-y-2">
                <p className="px-1 text-xs font-medium tracking-wide text-gray-400">
                  {category.name}
                </p>
                <div className="space-y-2">
                  {category.items.map((item) => (
                    <ToolNavItem
                      key={item.slug}
                      item={item}
                      onNavigate={() => setIsOpen(false)}
                    />
                  ))}
                </div>
              </div>
            ))}
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

/** 押すたびに 自動 → ライト → ダーク → 自動 と進む */
const NEXT_THEME_SETTING: Record<ThemeSetting, ThemeSetting> = {
  auto: 'light',
  light: 'dark',
  dark: 'auto',
}

const THEME_ICONS: Record<ThemeSetting, ComponentType<{ size?: number }>> = {
  auto: Monitor,
  light: Sun,
  dark: Moon,
}

/**
 * 配色の切り替え。ドロワーの中ではなくヘッダーの帯に置くのは、ツール単体アプリでは
 * ドロワーを開くボタンが無く、どのページからでも 1 タップで変えられるようにするため。
 * 3 択を並べるとスマホ幅でロゴと名前が収まらないので、1 つのボタンで順に回す。
 * アイコンだけでは今どれか・押すと何になるかが分からないので、aria-label と
 * title にどちらも書く。
 */
function ThemeToggle() {
  const { setting, setSetting } = useTheme()
  const next = NEXT_THEME_SETTING[setting]
  const Icon = THEME_ICONS[setting]
  const current =
    setting === 'auto'
      ? `${THEME_SETTING_LABELS.auto}(端末の設定に合わせる)`
      : THEME_SETTING_LABELS[setting]
  const label = `配色: ${current}。押すと${THEME_SETTING_LABELS[next]}にする`
  return (
    <button
      type="button"
      onClick={() => setSetting(next)}
      aria-label={label}
      title={label}
      className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 transition hover:border-cyan-400/60 hover:bg-cyan-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
    >
      <Icon size={20} />
    </button>
  )
}

/**
 * ツール単体アプリとして起動され、そのツールの中にいるか。
 * 起動印 (sessionStorage) と display-mode の両方を見る。印だけだと、
 * ブラウザのタブで start_url を開いたときにもメニューが消えてしまう。
 * どちらも起動中に変わらないので初回に 1 度だけ読む。
 */
function useIsToolApp(): boolean {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const [launchedSlug] = useState(() =>
    isStandaloneDisplay() ? getLaunchedToolAppSlug() : undefined,
  )
  return isToolAppPathname(pathname, launchedSlug)
}

function ToolNavItem({
  item,
  onNavigate,
}: {
  item: CatalogItem
  onNavigate: () => void
}) {
  const Icon = toolIcon(item.slug)
  const body = (
    <>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-cyan-200 group-hover:bg-cyan-500/20 group-[&.active]:bg-cyan-500/25">
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium text-white">
          <span className="truncate">{item.name}</span>
          {item.kind === 'external' && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
              外部
              <ExternalLink size={10} aria-hidden />
            </span>
          )}
        </p>
        <p className="mt-1 text-xs text-gray-400 line-clamp-2">
          {item.description}
        </p>
      </div>
    </>
  )

  const baseClassName =
    'group flex gap-3 rounded-2xl border border-white/5 bg-white/[0.04] p-4 transition hover:border-cyan-400/40 hover:bg-cyan-400/10'

  if (item.kind === 'external') {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        className={baseClassName}
      >
        {body}
      </a>
    )
  }

  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      className={baseClassName}
      activeProps={{
        className:
          'group flex gap-3 rounded-2xl border border-cyan-400/60 bg-cyan-500/15 p-4',
      }}
    >
      {body}
    </Link>
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
      className={`relative inline-flex shrink-0 ${dimension} overflow-hidden bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-500 shadow-lg`}
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
