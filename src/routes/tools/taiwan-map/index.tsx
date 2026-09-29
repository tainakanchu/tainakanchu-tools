import { Suspense, lazy, useCallback, useMemo, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Check, Link2, List, Map as MapIcon, X } from 'lucide-react'
import { getToolMeta, toolPageTitle } from '../../../lib/site-meta'
import {
  filterFromSearch,
  parseTaiwanMapSearch,
  serializeTaiwanMapSearch,
} from '../../../lib/taiwan-map/query'
import { createStaticRepository } from '../../../lib/taiwan-map/staticRepository'
import { getCity } from '../../../lib/taiwan-map/types'
import {
  CategoryChip,
  StatusBadge,
  categoryName,
  labelDef,
  statusName,
} from './-components/Badges'
import { FilterBar } from './-components/FilterBar'
import { Landing } from './-components/Landing'
import { SpotCard, spotElementId } from './-components/SpotCard'
import { copyText, shareUrl } from './-lib/copy'
import {
  actionButtonClass,
  cardClass,
  linkClass,
  segmentedClass,
} from './-lib/styles'
import { useMediaQuery } from './-lib/useMediaQuery'
import { useTaiwanMapData } from './-lib/useTaiwanMapData'
import type { FlyRequest } from './-components/MapView'
import type { TaiwanMapSearch } from '../../../lib/taiwan-map/query'
import type { ResultsData } from './-lib/useTaiwanMapData'

// head() と静的 OG HTML で同じ文言を使うため site-meta を単一ソースにする
const tool = getToolMeta('taiwan-map')!

// 地図（maplibre-gl）は実際に地図を出す画面でだけ読む。
// 詳しくは MapView.tsx 冒頭のコメント参照
const MapView = lazy(() => import('./-components/MapView'))

// モジュールに 1 つだけ持つ。Promise キャッシュを画面遷移をまたいで効かせるため
const repository = createStaticRepository()

export const Route = createFileRoute('/tools/taiwan-map/')({
  // 絞り込み状態は URL だけに持つ（共有リンクがこのツールの主な使い道）。
  // 知らない値は捨てて、分かる条件だけで開く
  //
  // 既知のキーを undefined で明示的に並べてから上書きしているのは、
  // TanStack Router が「親ルート（検証なし）の生の検索パラメータ」に
  // validateSearch の戻り値を重ねる形で useSearch を作るため。
  // 不正値のキーを単に省くと、?city=tokyo の生の値がそのまま残ってしまう。
  validateSearch: (raw: Record<string, unknown>): TaiwanMapSearch => ({
    city: undefined,
    area: undefined,
    category: undefined,
    status: undefined,
    label: undefined,
    spot: undefined,
    view: undefined,
    ...parseTaiwanMapSearch(raw),
  }),
  head: () => ({
    meta: [
      { title: toolPageTitle(tool.name) },
      { name: 'description', content: tool.description },
    ],
  }),
  component: TaiwanMapPage,
})

/** lg 以上は一覧＋地図の 2 カラム。未満は一覧 / 地図の切り替え */
const DESKTOP_QUERY = '(min-width: 1024px)'

function TaiwanMapPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const data = useTaiwanMapData(repository, search)

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 text-gray-900">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold sm:text-3xl">
          {data.mode === 'landing' ? (
            tool.name
          ) : (
            // 絞り込み中はタイトルをトップへの戻り口にする
            <Link
              to="/tools/taiwan-map"
              className="hover:text-cyan-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
            >
              {tool.name}
            </Link>
          )}
        </h1>
      </div>

      {data.mode === 'landing' ? (
        <Landing manifest={data.manifest} error={data.error} />
      ) : (
        <Results
          search={search}
          data={data.data}
          loading={data.loading}
          error={data.error}
          onNavigate={(patch, replace = true) =>
            void navigate({
              search: (prev) => ({ ...prev, ...patch }),
              replace,
            })
          }
        />
      )}
    </main>
  )
}

type ResultsProps = {
  search: TaiwanMapSearch
  data: ResultsData | null
  loading: boolean
  error: string | null
  onNavigate: (patch: Partial<TaiwanMapSearch>, replace?: boolean) => void
}

function Results({ search, data, loading, error, onNavigate }: ResultsProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [flyRequest, setFlyRequest] = useState<FlyRequest | null>(null)
  const [copied, setCopied] = useState(false)

  const spots = useMemo(() => data?.spots ?? [], [data])
  const areaById = useMemo(
    () => new Map((data?.areas ?? []).map((a) => [a.id, a])),
    [data],
  )
  const cityAreas = useMemo(
    () => (data?.areas ?? []).filter((a) => a.city === search.city),
    [data, search.city],
  )
  const selectedArea = search.area ? areaById.get(search.area) : undefined
  const multiCity = (data?.cities.length ?? 0) > 1
  const selectedSpot = spots.find((s) => s.id === search.spot)

  const showMap = isDesktop || search.view === 'map'
  const showList = isDesktop || search.view !== 'map'

  const handleFilterChange = useCallback(
    (patch: Partial<TaiwanMapSearch>) => {
      // 条件を変えたら選択中のスポットは外す（新しい一覧に居ないことが多い）
      onNavigate({ ...patch, spot: undefined })
    },
    [onNavigate],
  )

  const handleSelect = useCallback(
    (id: string) => onNavigate({ spot: id }),
    [onNavigate],
  )

  const handleShowOnMap = useCallback(
    (id: string) => {
      setFlyRequest((prev) => ({ id, nonce: (prev?.nonce ?? 0) + 1 }))
      if (isDesktop) {
        onNavigate({ spot: id })
      } else {
        // スマホは地図へ切り替える。戻るボタンで一覧に戻れるよう履歴に積む
        onNavigate({ spot: id, view: 'map' }, false)
      }
    },
    [isDesktop, onNavigate],
  )

  const handleCopyView = async () => {
    const ok = await copyText(
      shareUrl(serializeTaiwanMapSearch({ ...search, view: undefined })),
    )
    if (!ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const conditionText = describeConditions(search, selectedArea?.name)

  return (
    <div className="space-y-5">
      <section className={cardClass} aria-label="絞り込み">
        <FilterBar
          search={search}
          areas={cityAreas}
          onChange={handleFilterChange}
        />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600" aria-live="polite">
          {conditionText && (
            <span className="font-medium text-gray-800">{conditionText}</span>
          )}
          {conditionText && ' ・ '}
          {data ? `${spots.length} 件` : '読み込み中…'}
          {loading && data && (
            <span className="ml-2 text-gray-400">更新中…</span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCopyView}
            className={actionButtonClass}
          >
            {copied ? (
              <Check size={14} aria-hidden />
            ) : (
              <Link2 size={14} aria-hidden />
            )}
            {copied ? 'コピーしました' : 'この条件のリンクをコピー'}
          </button>
          <Link to="/tools/taiwan-map" className={actionButtonClass}>
            <X size={14} aria-hidden />
            条件をクリア
          </Link>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          データを読み込めませんでした: {error}
        </p>
      )}

      {data?.spotNotFound && (
        <p
          role="status"
          className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          リンクのスポットが見つかりませんでした。削除されたか、id
          が変わった可能性があります。
        </p>
      )}

      {selectedArea && (
        <section className="rounded-2xl border-l-4 border-cyan-500 bg-cyan-50/60 px-4 py-3">
          <h2 className="font-semibold text-gray-900">
            {selectedArea.name}
            {selectedArea.nameZh && (
              <span
                lang="zh-Hant-TW"
                className="ml-2 text-sm font-normal text-gray-500"
              >
                {selectedArea.nameZh}
              </span>
            )}
          </h2>
          <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-gray-700">
            {selectedArea.summary}
          </p>
          {selectedArea.note && (
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-gray-600">
              {selectedArea.note}
            </p>
          )}
        </section>
      )}

      {/* スマホだけの切り替え。既定は一覧で、地図を最初の画面にはしない */}
      <div
        role="group"
        aria-label="表示の切り替え"
        className="flex rounded-xl bg-gray-100 p-1 lg:hidden"
      >
        <button
          type="button"
          aria-pressed={!showMap}
          className={segmentedClass(!showMap)}
          onClick={() => onNavigate({ view: undefined })}
        >
          <span className="inline-flex items-center gap-1.5">
            <List size={14} aria-hidden />
            一覧
          </span>
        </button>
        <button
          type="button"
          aria-pressed={showMap}
          className={segmentedClass(showMap)}
          onClick={() => onNavigate({ view: 'map' })}
        >
          <span className="inline-flex items-center gap-1.5">
            <MapIcon size={14} aria-hidden />
            地図
          </span>
        </button>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
        {showList && (
          <div>
            {data && spots.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
                この条件の場所はまだ記録していません。
              </p>
            ) : (
              <ul className="space-y-4">
                {spots.map((spot) => (
                  <li key={spot.id}>
                    <SpotCard
                      spot={spot}
                      area={spot.area ? areaById.get(spot.area) : undefined}
                      showCity={multiCity}
                      selected={spot.id === search.spot}
                      onSelect={handleSelect}
                      onShowOnMap={handleShowOnMap}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {showMap && data && (
          <aside className="space-y-2 lg:sticky lg:top-20" aria-label="地図">
            <div className="h-[65vh] overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 shadow-sm lg:h-[calc(100vh-7rem)]">
              <Suspense
                fallback={
                  <p className="flex h-full items-center justify-center text-sm text-gray-500">
                    地図を読み込み中…
                  </p>
                }
              >
                <MapView
                  spots={spots}
                  fallbackCity={search.city ?? data.cities.at(0) ?? 'taipei'}
                  selectedId={search.spot}
                  flyRequest={flyRequest}
                  onSelect={handleSelect}
                />
              </Suspense>
            </div>
            <MapLegend />
            {/* スマホの地図表示では一覧が見えないので、選んだ場所の要点を地図の下に出す */}
            {!isDesktop && selectedSpot && (
              <div className={`${cardClass} space-y-2`}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="font-semibold text-gray-900">
                    {selectedSpot.name}
                  </p>
                  <StatusBadge status={selectedSpot.status} />
                  {selectedSpot.categories.map((c) => (
                    <CategoryChip key={c} category={c} />
                  ))}
                </div>
                <p className="line-clamp-3 text-sm text-gray-700">
                  {selectedSpot.summary}
                </p>
                <button
                  type="button"
                  className={actionButtonClass}
                  onClick={() => {
                    onNavigate({ view: undefined })
                    // 一覧に戻ったら、選んだカードの位置へ（SpotCard 側でも寄せるが念のためフォーカスも移す）
                    window.setTimeout(
                      () =>
                        document
                          .getElementById(spotElementId(selectedSpot.id))
                          ?.focus(),
                      0,
                    )
                  }}
                >
                  <List size={14} aria-hidden />
                  一覧でくわしく見る
                </button>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}

function MapLegend() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-xs text-gray-500">
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        <li className="inline-flex items-center gap-1">
          <span
            aria-hidden
            className="inline-block h-3 w-3 rounded-full border-2 border-white bg-emerald-600 shadow"
          />
          行った
        </li>
        <li className="inline-flex items-center gap-1">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-slate-500 bg-slate-50"
          />
          未訪問・気になる
        </li>
      </ul>
      {/* style が読めない（オフライン）と maplibre 側の帰属表示も出ないので、ここにも常に出す */}
      <p>
        地図:{' '}
        <a
          href="https://openfreemap.org"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          OpenFreeMap
        </a>{' '}
        ©{' '}
        <a
          href="https://www.openmaptiles.org/"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          OpenMapTiles
        </a>{' '}
        ©{' '}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          OpenStreetMap contributors
        </a>
      </p>
    </div>
  )
}

/** 「台北 › 大稻埕・迪化街 ・ 食べる」のような、今の条件の読み上げ用テキスト */
function describeConditions(
  search: TaiwanMapSearch,
  areaName: string | undefined,
): string {
  const filter = filterFromSearch(search)
  const parts: Array<string> = []
  const place = [
    filter.city ? getCity(filter.city).name : null,
    areaName ?? null,
  ].filter(Boolean)
  if (place.length > 0) parts.push(place.join(' › '))
  if (filter.category) parts.push(categoryName(filter.category))
  if (filter.status) parts.push(statusName(filter.status))
  if (filter.label) {
    const l = labelDef(filter.label)
    parts.push(`${l.mark} ${l.name}`)
  }
  return parts.join(' ・ ')
}
