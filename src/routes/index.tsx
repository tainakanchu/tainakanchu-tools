import { Link, createFileRoute } from '@tanstack/react-router'
import { getCatalogByCategory } from '../lib/site-meta'
import type { CatalogItem } from '../lib/site-meta'

export const Route = createFileRoute('/')({
  component: App,
})

/*
 * トップはノートの目次。カテゴリごとに番号付きでツールを並べる。
 * 最終更新日は site-meta に無いので出さない（ビルド時に決まる値だけを使う方針）。
 */

const itemClass =
  'grid grid-cols-[2em_minmax(0,1fr)] gap-x-3 py-4 pr-2 no-underline hover:bg-wash sm:grid-cols-[2.5em_minmax(0,1fr)] sm:gap-x-4 sm:py-[18px]'

function App() {
  // ツール一覧と OG 用 meta を二重管理しないため、カタログは site-meta から導出
  const categories = getCatalogByCategory()
  let number = 0

  return (
    <main className="page">
      <div className="grid gap-3 pb-6 md:grid-cols-[minmax(0,1fr)_300px] md:items-end md:gap-12 md:pb-10">
        <h1 className="page-title">かんちゅの道具箱</h1>
        <p className="page-lead">
          旅行の準備や印刷のために、自分で使うものを自分で作っています。旅先ではスマホで、準備と印刷はパソコンで。
        </p>
      </div>

      <div className="ink-line-t">
        {categories.map((category) => (
          <section
            key={category.id}
            id={category.id}
            aria-labelledby={`toc-${category.id}`}
            className="grid scroll-mt-16 ink-line-b md:grid-cols-[140px_minmax(0,1fr)]"
          >
            <h2
              id={`toc-${category.id}`}
              className="m-0 pt-4 pb-1 text-base font-bold md:py-5"
            >
              {category.name}
              <span className="ml-2 text-xs font-normal text-ink-muted md:ml-0 md:block">
                {category.items.length} つ
              </span>
            </h2>
            <ol className="m-0 list-none p-0">
              {category.items.map((item, index) => {
                number += 1
                return (
                  <li
                    key={item.slug}
                    className={index > 0 ? 'border-t border-rule' : undefined}
                  >
                    <TocItem item={item} number={number} />
                  </li>
                )
              })}
            </ol>
          </section>
        ))}
      </div>

      <p className="mt-10 text-sm text-ink-muted">
        作っている人：
        <a
          href="https://x.com/tainakanchu"
          target="_blank"
          rel="noopener noreferrer"
          className="ink-link text-ink"
        >
          かんちゅ（@tainakanchu）
        </a>
      </p>
    </main>
  )
}

function TocItem({ item, number }: { item: CatalogItem; number: number }) {
  const body = (
    <>
      <span className="font-medium text-ink-muted tabular-nums" aria-hidden>
        {number}
      </span>
      <span className="min-w-0">
        <span className="block text-[17px] leading-snug font-bold sm:text-lg">
          {item.name}
          {item.kind === 'external' ? (
            <span className="ml-2 text-xs font-normal text-ink-muted">
              別サイト
            </span>
          ) : null}
        </span>
        <span className="mt-1 block max-w-[44em] text-sm text-ink-muted">
          {item.description}
        </span>
      </span>
    </>
  )

  if (item.kind === 'external') {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className={itemClass}
      >
        {body}
      </a>
    )
  }

  return (
    <Link to={item.path} className={itemClass}>
      {body}
    </Link>
  )
}
