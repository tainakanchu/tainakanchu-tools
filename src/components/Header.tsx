import { Link, useRouterState } from '@tanstack/react-router'
import { useEffect, useId, useMemo, useState } from 'react'
import { getCatalogByCategory } from '../lib/site-meta'
import { useTheme } from '../lib/theme'
import { SegmentedControl } from './ui'
import type { ReactNode } from 'react'
import type { CatalogItem, ToolCategoryId } from '../lib/site-meta'
import type { ThemeMode } from '../lib/theme'

/*
 * サイト共通のヘッダー。紙に青インクのワードマークと細罫 1 本だけ。
 * 高さは 64px（h-16）で固定。ツール側に `top-16` や `calc(100dvh-4rem)` で
 * この高さを前提にしている箇所があるので、変えるときはそちらも直すこと。
 * 配色（自動・ライト・ダーク）の切り替えは PC は右端、スマホは目次の中に置く。
 */

const themeOptions = [
  { value: 'system', label: '自動', title: '端末の設定に合わせる' },
  { value: 'light', label: 'ライト' },
  { value: 'dark', label: 'ダーク' },
] as const satisfies ReadonlyArray<{
  value: ThemeMode
  label: string
  title?: string
}>

/** 文字リンク。現在地はピンクの下線 */
function navLinkClass(isCurrent: boolean): string {
  return `border-b-[1.5px] py-0.5 text-sm font-medium no-underline ${
    isCurrent ? 'border-pink' : 'border-transparent hover:border-rule'
  }`
}

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuId = useId()
  const categories = useMemo(() => getCatalogByCategory(), [])
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [theme, setTheme] = useTheme()

  // いま開いているツールのカテゴリ（トップなら null）
  const currentCategory = useMemo<ToolCategoryId | null>(() => {
    for (const category of categories) {
      for (const item of category.items) {
        if (item.kind === 'internal' && pathname.startsWith(item.path)) {
          return category.id
        }
      }
    }
    return null
  }, [categories, pathname])
  const isTop = pathname === '/'

  // ページを移ったらメニューを閉じる
  useEffect(() => {
    setIsMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!isMenuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isMenuOpen])

  return (
    <>
      <header className="sticky top-0 z-40 h-16 ink-line-b bg-paper text-ink print:hidden">
        <div className="site-header-inner mx-auto flex h-full items-center justify-between gap-8 px-4 sm:px-6">
          <div className="flex min-w-0 items-baseline gap-8">
            <Link
              to="/"
              className="shrink-0 font-display text-[19px] leading-tight text-ink no-underline sm:text-2xl"
            >
              かんちゅツールズ
            </Link>

            <nav aria-label="目次" className="hidden md:block">
              <ul className="m-0 flex list-none items-baseline gap-5 p-0">
                <li>
                  <Link
                    to="/"
                    className={navLinkClass(isTop)}
                    aria-current={isTop ? 'page' : undefined}
                  >
                    目次
                  </Link>
                </li>
                {categories.map((category) => {
                  const isCurrent = currentCategory === category.id
                  return (
                    <li key={category.id}>
                      <Link
                        to="/"
                        hash={category.id}
                        className={navLinkClass(isCurrent)}
                        aria-current={isCurrent ? 'location' : undefined}
                      >
                        {category.name}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>
          </div>

          <div className="hidden shrink-0 items-center gap-6 md:flex">
            <a
              href="https://x.com/tainakanchu"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden text-sm text-ink-muted underline decoration-rule decoration-[1.5px] underline-offset-4 hover:text-ink hover:decoration-ink lg:inline"
            >
              作っている人
            </a>
            <SegmentedControl
              label="配色"
              size="sm"
              value={theme}
              options={themeOptions}
              onChange={setTheme}
            />
          </div>

          <button
            type="button"
            className="-mr-1 min-h-11 px-1 text-sm font-medium text-ink md:hidden"
            aria-expanded={isMenuOpen}
            aria-controls={menuId}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            {isMenuOpen ? '閉じる' : '目次'}
          </button>
        </div>
      </header>

      {/* スマホの目次。ヘッダーの下に紙を 1 枚重ねる */}
      <div
        id={menuId}
        hidden={!isMenuOpen}
        className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto bg-paper text-ink md:hidden print:hidden"
      >
        <nav aria-label="ツールの目次" className="px-4 pt-2 pb-10">
          <Link
            to="/"
            className="block border-b border-rule py-3 font-bold no-underline"
            aria-current={isTop ? 'page' : undefined}
          >
            <MenuLabel isCurrent={isTop}>目次</MenuLabel>
          </Link>
          {categories.map((category) => (
            <section key={category.id} className="mt-6">
              <h2 className="m-0 text-[13px] font-bold text-ink-muted">
                {category.name}
              </h2>
              <ul className="m-0 mt-1 list-none ink-line-t p-0">
                {category.items.map((item) => (
                  <li key={item.slug} className="border-b border-rule">
                    <MenuItem item={item} pathname={pathname} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <section className="mt-8">
            <h2
              id={`${menuId}-theme`}
              className="m-0 text-[13px] font-bold text-ink-muted"
            >
              配色
            </h2>
            <SegmentedControl
              labelledBy={`${menuId}-theme`}
              value={theme}
              options={themeOptions}
              onChange={setTheme}
              full
              className="mt-2"
            />
          </section>
          <p className="mt-8 text-sm">
            <a
              href="https://x.com/tainakanchu"
              target="_blank"
              rel="noopener noreferrer"
              className="ink-link"
            >
              作っている人（@tainakanchu）
            </a>
          </p>
        </nav>
      </div>
    </>
  )
}

function MenuLabel({
  isCurrent,
  children,
}: {
  isCurrent: boolean
  children: ReactNode
}) {
  return (
    <span
      className={
        isCurrent
          ? 'underline decoration-pink decoration-[3px] underline-offset-[6px]'
          : undefined
      }
    >
      {children}
    </span>
  )
}

function MenuItem({ item, pathname }: { item: CatalogItem; pathname: string }) {
  const itemClass = 'block py-3 text-[15px] font-bold no-underline'

  if (item.kind === 'external') {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className={itemClass}
      >
        {item.name}
        <span className="ml-2 text-xs font-normal text-ink-muted">
          別サイト
        </span>
      </a>
    )
  }

  const isCurrent = pathname.startsWith(item.path)
  return (
    <Link
      to={item.path}
      className={itemClass}
      aria-current={isCurrent ? 'page' : undefined}
    >
      <MenuLabel isCurrent={isCurrent}>{item.name}</MenuLabel>
    </Link>
  )
}
