/**
 * 条件なしで開いたときのトップ。読むのは manifest.json だけ。
 *
 * 地図はここには出さない。このマップの価値はコメントなので、
 * まず「どこの・何を」見るかを選んでもらい、一覧から入ってもらう。
 * ボタンは Link（本物のリンク）にしていて、長押しでそのまま共有 URL を
 * コピーできる。
 */

import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { SPOT_LABELS } from '../../../../lib/taiwan-map/types'
import { bigChoiceClass, cardClass, sectionTitleClass } from '../-lib/styles'
import { categoryName } from './Badges'
import type { TaiwanManifest } from '../../../../lib/taiwan-map/types'

type Props = {
  manifest: TaiwanManifest | null
  error: string | null
}

export function Landing({ manifest, error }: Props) {
  return (
    <div className="space-y-8">
      <section className={`${cardClass} space-y-3 text-gray-700`}>
        <p className="leading-relaxed">
          台湾で実際に行った場所を中心に、個人的に記録しているマップです。
        </p>
        <p className="text-sm leading-relaxed text-gray-500">
          {/* JSX の改行は空白になり日本語の文中に隙間が出るので、文ごとに式で渡す */}
          {
            'コメントはすべてかんちゅの主観です。点数やランキングは付けていません。'
          }
          {
            '営業時間や価格は変わるので、出かける前に Google Maps などで最新の情報を確かめてください。'
          }
          {'「未訪問・気になる」の場所は、まだ行っていない、ただのメモです。'}
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
          {SPOT_LABELS.map((l) => (
            <li key={l.id}>
              <span aria-hidden className="text-rose-600">
                {l.mark}
              </span>{' '}
              {l.name}
            </li>
          ))}
        </ul>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          データを読み込めませんでした: {error}
        </p>
      )}

      <section aria-labelledby="tw-cities" className="space-y-3">
        <h2 id="tw-cities" className={sectionTitleClass}>
          都市から探す
        </h2>
        {manifest === null && !error ? (
          <p className="text-sm text-gray-500">読み込み中…</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {manifest?.cities.map((city) => (
              <li key={city.id}>
                <Link
                  to="/tools/taiwan-map"
                  search={{ city: city.id }}
                  className={bigChoiceClass}
                >
                  <span className="text-lg font-semibold text-gray-900">
                    {city.name}
                  </span>
                  <span className="flex items-center gap-1 text-sm text-gray-500">
                    {city.count} 件
                    <ChevronRight size={16} aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="tw-categories" className="space-y-3">
        <h2 id="tw-categories" className={sectionTitleClass}>
          やりたいことから探す
        </h2>
        <ul className="flex flex-wrap gap-2">
          {manifest?.categories.map((cat) => (
            <li key={cat.id}>
              <Link
                to="/tools/taiwan-map"
                search={{ category: cat.id }}
                className={`${bigChoiceClass} py-2`}
              >
                <span className="font-medium text-gray-900">
                  {categoryName(cat.id)}
                </span>
                <span className="text-sm text-gray-500">{cat.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
