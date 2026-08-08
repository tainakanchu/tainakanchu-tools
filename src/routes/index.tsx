import { Link, createFileRoute } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { getCatalogByCategory } from '../lib/site-meta'

export const Route = createFileRoute('/')({
  component: App,
})

const cardClassName =
  'group block h-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-cyan-400 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500'

function App() {
  // ツール一覧と OG 用 meta を二重管理しないため、カタログは site-meta から導出
  const categories = getCatalogByCategory()

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 text-gray-900">
      <section className="space-y-6">
        <h2 className="text-3xl font-bold">かんちゅツールズ</h2>
        <p className="text-lg text-gray-600">
          個人用の小さなツールを集めたハブページです。用途に合わせてアプリを選んでください。
        </p>
      </section>

      <section className="mt-10 space-y-10">
        <h3 className="text-2xl font-semibold text-gray-800">アプリ一覧</h3>

        {categories.map((category) => (
          <div key={category.id}>
            <h4 className="text-lg font-semibold text-gray-700">
              {category.name}
            </h4>
            <ul className="mt-4 grid gap-6 sm:grid-cols-2">
              {category.items.map((item) => (
                <li key={item.slug}>
                  {item.kind === 'internal' ? (
                    <Link to={item.path} className={cardClassName}>
                      <h5 className="text-xl font-semibold text-gray-900 group-hover:text-cyan-600">
                        {item.name}
                      </h5>
                      <p className="mt-3 text-sm leading-relaxed text-gray-600">
                        {item.description}
                      </p>
                    </Link>
                  ) : (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cardClassName}
                    >
                      <h5 className="flex items-center gap-2 text-xl font-semibold text-gray-900 group-hover:text-cyan-600">
                        <span>{item.name}</span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500">
                          外部
                          <ExternalLink
                            size={12}
                            className="shrink-0"
                            aria-hidden
                          />
                        </span>
                      </h5>
                      <p className="mt-3 text-sm leading-relaxed text-gray-600">
                        {item.description}
                      </p>
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </main>
  )
}
