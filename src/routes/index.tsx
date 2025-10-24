import { Link } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: App,
})

function App() {
  const tools = [
    {
      title: '免許証レイアウトメーカー',
      description:
        '免許証の画像を原寸大でA4に配置して印刷・PDF出力できるレイアウトツール。',
      to: '/tools/license-layout',
    },
  ]

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 text-gray-900">
      <section className="space-y-6">
        <h2 className="text-3xl font-bold">たいなかんちゅーツールズ</h2>
        <p className="text-lg text-gray-600">
          個人用の小さなツールを集めたハブページです。用途に合わせてアプリを選んでください。
        </p>
      </section>

      <section className="mt-10">
        <h3 className="text-2xl font-semibold text-gray-800">アプリ一覧</h3>
        <ul className="mt-6 grid gap-6 sm:grid-cols-2">
          {tools.map((tool) => (
            <li key={tool.to}>
              <Link
                to={tool.to}
                className="group block h-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-cyan-400 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
              >
                <h4 className="text-xl font-semibold text-gray-900 group-hover:text-cyan-600">
                  {tool.title}
                </h4>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">
                  {tool.description}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
