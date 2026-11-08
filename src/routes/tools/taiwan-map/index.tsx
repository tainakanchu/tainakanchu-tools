import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  Check,
  Link2,
  List,
  LocateFixed,
  Map as MapIcon,
  Navigation,
  RotateCw,
  Search,
  X,
} from 'lucide-react'
import { getToolMeta, toolPageTitle } from '../../../lib/site-meta'
import {
  SEARCH_QUERY_MAX,
  deselectAction,
  filterFromSearch,
  historyMode,
  orderTaiwanMapSearch,
  parseTaiwanMapSearch,
  serializeTaiwanMapSearch,
  shareableSearch,
  unselectedKey,
} from '../../../lib/taiwan-map/query'
import {
  distanceMeters,
  formatDistance,
  sortSpots,
} from '../../../lib/taiwan-map/nearby'
import { isInsideTaiwan } from '../../../lib/taiwan-map/geo'
import {
  matchesSearch,
  searchTerms,
  spotSearchFields,
} from '../../../lib/taiwan-map/search'
import { createStaticRepository } from '../../../lib/taiwan-map/staticRepository'
import { publicText } from '../../../lib/taiwan-map/format'
import { getCity } from '../../../lib/taiwan-map/types'
import {
  CategoryChip,
  StatusBadge,
  categoryName,
  labelDef,
  statusName,
} from './-components/Badges'
import { FilterBar } from './-components/FilterBar'
import { MapErrorBoundary } from './-components/MapErrorBoundary'
import { Landing } from './-components/Landing'
import { SpotCard } from './-components/SpotCard'
import {
  SpotActions,
  SpotComment,
  SpotLinkIcons,
} from './-components/SpotActions'
import { copyText, shareUrl } from './-lib/copy'
import { loadMapView, prefetchMapViewOnIdle } from './-lib/loadMapView'
import {
  actionButtonClass,
  cardClass,
  linkClass,
  segmentedClass,
} from './-lib/styles'
import { useGeolocation } from './-lib/useGeolocation'
import { useMediaQuery } from './-lib/useMediaQuery'
import { spotLinkStatus, useTaiwanMapData } from './-lib/useTaiwanMapData'
import type { HistoryState } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { FlyRequest } from './-components/MapView'
import type { TaiwanMapSearch } from '../../../lib/taiwan-map/query'
import type { SpotOrder } from '../../../lib/taiwan-map/nearby'
import type { CityId, SpotCategory } from '../../../lib/taiwan-map/types'
import type { ResultsData } from './-lib/useTaiwanMapData'

// head() と静的 OG HTML で同じ文言を使うため site-meta を単一ソースにする
const tool = getToolMeta('taiwan-map')!

// 地図（maplibre-gl）は別チャンク。いつ読むかは -lib/loadMapView.ts、
// 分けている理由は MapView.tsx 冒頭のコメント参照。読み込みに失敗したときは
// MapErrorBoundary が地図の枠の中だけで受け止める
const MapView = lazy(loadMapView)

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
    q: undefined,
    ...parseTaiwanMapSearch(raw),
  }),
  head: () => ({
    meta: [
      { title: toolPageTitle(tool.name) },
      { name: 'description', content: tool.description },
    ],
    // 地図の style・タイル・フォントはすべて tiles.openfreemap.org から来る。
    // 地図チャンクを読み終えてから接続（DNS・TLS）を始めると往復ぶん遅れるので、
    // このページに来た時点で先につないでおく。maplibre は fetch（CORS）で
    // 取りに行くので crossorigin を付けないと、この接続が使い回されない
    links: [
      {
        rel: 'preconnect',
        href: 'https://tiles.openfreemap.org',
        crossOrigin: 'anonymous',
      },
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
  const isDesktop = useMediaQuery(DESKTOP_QUERY)

  // onNavigate を作り直さずに今の条件を読むため（カードの memo を保つ）
  const searchRef = useRef(search)
  useEffect(() => {
    searchRef.current = search
  })

  /**
   * URL の条件を書き換える。履歴に積むか置き換えるかは、既定（'auto'）では
   * 何が変わったかで決める（query.ts の historyMode）:
   * 絞り込み・一覧 / 地図の切り替え・何も選んでいない状態からの選択は積み、
   * 選択の付け替え・検索語の入力は置き換える。
   * 何も変わらなければ何もしない（同じ URL を積んで「戻る」が空振りしない）。
   * ユーザーの操作ではない書き換え（?spot= から都市を補うなど）は
   * 'replace' を明示する（積むと「戻る」で補う前に戻り、また補われて進めなくなる）
   *
   * スポットを選んだ履歴には「1 つ前の履歴は、ここから選択を外しただけの
   * 状態」という印（UNSELECTED_MARK）を history.state に残す。選択を閉じる
   * ときに印があれば history.back() で 1 つ戻り、無ければ置き換える
   * （閉じるたびに「選んでいない状態」の履歴が積み増されないように）
   */
  const onNavigate = useCallback(
    (patch: Partial<TaiwanMapSearch>, mode: NavigateMode = 'auto') => {
      const prev = searchRef.current
      const next = orderTaiwanMapSearch({ ...prev, ...patch })
      const auto = historyMode(prev, next)
      if (auto === 'skip') return
      const replace = mode === 'auto' ? auto === 'replace' : mode === 'replace'
      const target = unselectedKey(next)
      // 積むなら「今の画面」が 1 つ前になる。置き換えるなら 1 つ前は変わらない
      // ので、今の履歴の印がまだ当てはまるときだけ引き継ぐ
      const marked =
        next.spot !== undefined &&
        (replace
          ? readUnselectedMark() === target
          : serializeTaiwanMapSearch(prev) === target)
      void navigate({
        // キー順を共有用 URL（serializeTaiwanMapSearch）と揃える
        search: next,
        replace,
        state: marked ? unselectedState(target) : {},
        // 同じページの中で URL の条件を書き換えるだけなので、ページの
        // スクロールを先頭に戻さない。戻すと、一覧の下のほうのカードや地図の
        // ピンを選ぶたびにページが先頭へ跳び、選んだカードへ寄せる
        // scrollIntoView（SpotCard）も途中で打ち消される
        resetScroll: false,
      })
    },
    [navigate],
  )

  /**
   * 選択を閉じる（デスクトップのポップアップの × ・Esc、スマホの地図の
   * 下端のカードの × 、地図の何も無い所）。どこから閉じても同じ動きにする。
   * 選んだときに積んだ履歴なら 1 つ戻る（「戻る」と同じ。地図の位置はそのまま）。
   * 共有リンクで開いた直後のように積んでいなければ、置き換えて外す
   * （query.ts の deselectAction）
   */
  const onClearSelection = useCallback(() => {
    const action = deselectAction(searchRef.current, readUnselectedMark())
    if (action === 'back') window.history.back()
    else if (action === 'replace') onNavigate({ spot: undefined }, 'replace')
  }, [onNavigate])

  // ?spot=<id> だけの共有リンクは、スポットの都市が分かった時点で
  // ?city=<都市>&spot=<id> に置き換える。こうすると都市・エリアのチップが
  // 正しく押された状態で出て、以降カードを選んでも「都市つき」の読み込み
  // （= 同じ都市 JSON・同じピン）のまま動く
  const resolvedSpotCity =
    data.mode === 'results' ? data.data?.resolvedSpotCity : undefined
  useEffect(() => {
    if (search.city === undefined && resolvedSpotCity !== undefined) {
      onNavigate({ city: resolvedSpotCity }, 'replace')
    }
  }, [search.city, resolvedSpotCity, onNavigate])

  // デスクトップのトップから都市を選ぶと、次の画面ではすぐ地図を出す。
  // トップを見ているあいだに地図チャンクを先読みしておく
  const isLanding = data.mode === 'landing'
  useEffect(() => {
    if (isLanding && isDesktop) return prefetchMapViewOnIdle()
  }, [isLanding, isDesktop])

  if (data.mode === 'landing') {
    // トップは地図を出さない読み物なので、行が長くなりすぎない幅に収める
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 text-gray-900 dark:text-gray-100">
        <h1 className="mb-6 text-2xl font-bold sm:text-3xl">{tool.name}</h1>
        <Landing
          manifest={data.manifest}
          error={data.error}
          onRetry={data.retry}
        />
      </main>
    )
  }

  // 一覧・地図の画面は、地図を大きく見せるため画面幅いっぱいを使う
  return (
    <main className="text-gray-900 dark:text-gray-100">
      <Results
        search={search}
        data={data.data}
        spotCity={data.spotCity}
        loading={data.loading}
        error={data.error}
        isDesktop={isDesktop}
        onRetry={data.retry}
        onNavigate={onNavigate}
        onClearSelection={onClearSelection}
      />
    </main>
  )
}

/** onNavigate の履歴の扱い。既定は変わったものから決める（historyMode） */
type NavigateMode = 'auto' | 'push' | 'replace'

/** history.state に残す「1 つ前は選択を外しただけの状態」の印（値はその URL） */
const UNSELECTED_MARK = 'twUnselected'

function readUnselectedMark(): string | undefined {
  // history.state は TanStack Router が持つオブジェクト（中身の型は分からない）
  const state: unknown = window.history.state
  if (typeof state !== 'object' || state === null) return undefined
  const value: unknown = Reflect.get(state, UNSELECTED_MARK)
  return typeof value === 'string' ? value : undefined
}

function unselectedState(target: string): HistoryState {
  // HistoryState は中身の決まっていない型（空の interface）なので、そのまま渡せる
  const state: Record<string, string> = { [UNSELECTED_MARK]: target }
  return state
}

type ResultsProps = {
  search: TaiwanMapSearch
  data: ResultsData | null
  /** ?spot= が読んだ都市に無かったとき、そのスポットのある都市 */
  spotCity: CityId | undefined
  loading: boolean
  error: string | null
  isDesktop: boolean
  onRetry: () => void
  onNavigate: (patch: Partial<TaiwanMapSearch>, mode?: NavigateMode) => void
  onClearSelection: () => void
}

function Results({
  search,
  data,
  spotCity,
  loading,
  error,
  isDesktop,
  onRetry,
  onNavigate,
  onClearSelection,
}: ResultsProps) {
  const [flyRequest, setFlyRequest] = useState<FlyRequest | null>(null)
  const [copied, setCopied] = useState(false)
  const clearFlyRequest = useCallback(() => setFlyRequest(null), [])

  const areaById = useMemo(
    () => new Map((data?.areas ?? []).map((a) => [a.id, a])),
    [data],
  )
  // 文字検索（?q=）は読み込んだ一覧の中だけで絞る（データを読み直さない）
  const terms = useMemo(() => searchTerms(search.q), [search.q])
  const spots = useMemo(() => {
    const all = data?.spots ?? []
    if (terms.length === 0) return all
    return all.filter((s) =>
      matchesSearch(
        spotSearchFields(
          { ...s, summary: publicText(s.summary) },
          s.area ? areaById.get(s.area)?.name : undefined,
        ),
        terms,
      ),
    )
  }, [data, terms, areaById])
  const cityAreas = useMemo(
    () => (data?.areas ?? []).filter((a) => a.city === search.city),
    [data, search.city],
  )
  const selectedArea = search.area ? areaById.get(search.area) : undefined
  const multiCity = (data?.cities.length ?? 0) > 1
  const selectedSpot = spots.find((s) => s.id === search.spot)
  const spotStatus = spotLinkStatus(search.spot, data, spotCity)

  // 「近くの場所」。現在地はこのコンポーネントのメモリにだけ持つ
  // （URL・保存先には出さない。useGeolocation 参照）
  const geo = useGeolocation()
  // 台湾の外にいるときの距離（数千 km）は意味が無いので、距離も「近い順」も
  // 台湾の中にいるときだけ使う（地図の点は出す）
  const outsideTaiwan = geo.position !== null && !isInsideTaiwan(geo.position)
  const localPosition = outsideTaiwan ? null : geo.position
  const [order, setOrder] = useState<SpotOrder>('default')
  const nearMe = order === 'distance' && localPosition !== null
  // 台湾の外にいるときは並びが変わらないので、「近い順」を押された見た目にしない
  // （押したこと自体は覚えておき、台湾に入ったら近い順になる）
  const distancePressed = order === 'distance' && !outsideTaiwan
  const handleNearMe = useCallback(() => {
    setOrder('distance')
    geo.request()
  }, [geo])
  // 位置情報が使えなかったら「近い順」は外す（並びが変わらないまま押された
  // 見た目にしない）
  useEffect(() => {
    if (
      geo.status === 'denied' ||
      geo.status === 'unavailable' ||
      geo.status === 'timeout'
    )
      setOrder('default')
  }, [geo.status])
  const sortedSpots = useMemo(
    () => sortSpots(spots, order, localPosition),
    [spots, order, localPosition],
  )
  const distanceById = useMemo(() => {
    const pos = localPosition
    if (!pos) return null
    return new Map(spots.map((s) => [s.id, distanceMeters(pos, s.location)]))
  }, [spots, localPosition])

  // エリア紹介（スマホは 2 行まで出して「続きを読む」）。エリアが変わったら閉じる
  const [areaExpanded, setAreaExpanded] = useState(false)
  const [prevArea, setPrevArea] = useState(search.area)
  if (prevArea !== search.area) {
    setPrevArea(search.area)
    setAreaExpanded(false)
  }
  const areaSummary = publicText(selectedArea?.summary)
  const areaNote = publicText(selectedArea?.note)
  // 「続きを読む」は、2 行に収まらないとき（か、閉じているあいだ隠している
  // note があるとき）だけ出す。2 行で読み切れるのにボタンがあると、押しても
  // 何も増えない。幅が変わると折り返しも変わるので ResizeObserver で測り直す
  const areaSummaryRef = useRef<HTMLQuoteElement>(null)
  const [areaOverflows, setAreaOverflows] = useState(false)
  const areaClamped = !isDesktop && !areaExpanded
  useLayoutEffect(() => {
    const el = areaSummaryRef.current
    // 開いているあいだは測らない（測ると収まって見え、「閉じる」が消える）
    if (!el || !areaClamped) return
    const check = () => setAreaOverflows(el.scrollHeight > el.clientHeight + 1)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [areaClamped, areaSummary])

  const showMap = isDesktop || search.view === 'map'
  const showList = isDesktop || search.view !== 'map'

  // 一覧 ⇔ 地図を切り替えたら、未処理の「そこへ飛ぶ」依頼は捨てる
  // （地図を開き直したときに、昔押したスポットへ勝手に飛ばないように）
  useEffect(() => {
    if (!showMap) setFlyRequest(null)
  }, [showMap])

  // 地図を出す画面では、都市 JSON を待たずに地図チャンクを取りに行く。
  // スマホの一覧表示では、暇になったときに先読みしておく（loadMapView.ts 参照）
  useEffect(() => {
    if (showMap) {
      void loadMapView().catch(() => {})
      return
    }
    return prefetchMapViewOnIdle()
  }, [showMap])

  const handleFilterChange = useCallback(
    (patch: Partial<TaiwanMapSearch>) => {
      // 条件を変えたら選択中のスポットは外す（新しい一覧に居ないことが多い）
      onNavigate({ ...patch, spot: undefined })
    },
    [onNavigate],
  )

  // 地図上のジャンルチップ。FilterBar のカテゴリと同じ URL の category を書き換える
  const handleCategoryChange = useCallback(
    (category: SpotCategory | undefined) => handleFilterChange({ category }),
    [handleFilterChange],
  )

  // URL から開いた直後の選択ではカードへフォーカスを移さず、ピン・カード・
  // 「一覧でくわしく見る」など画面上の操作のあとからだけ移す
  const [focusOnSelect, setFocusOnSelect] = useState(false)

  const handleSelect = useCallback(
    (id: string) => {
      setFocusOnSelect(true)
      onNavigate({ spot: id })
    },
    [onNavigate],
  )

  // 地図のピン（とキーボード用のピン一覧）から選んだとき。デスクトップでは
  // 地図の上にポップアップが開くので、一覧のカードは枠を付けて見える位置まで
  // 寄せるだけにし、フォーカスはカードへ移さない（地図・ポップアップに残す）。
  // スマホの地図表示では一覧が無いので、どちらでも変わらない
  const handleMapSelect = useCallback(
    (id: string) => {
      setFocusOnSelect(false)
      onNavigate({ spot: id })
    },
    [onNavigate],
  )

  // ポップアップ・地図の下端のカードの「地図で見る」。もう地図を見ているので
  // 選択もフォーカスも変えず、そのピンへ寄るだけ
  const handleFlyTo = useCallback((id: string) => {
    setFlyRequest((prev) => ({ id, nonce: (prev?.nonce ?? 0) + 1 }))
  }, [])

  const handleShowOnMap = useCallback(
    (id: string) => {
      setFocusOnSelect(true)
      setFlyRequest((prev) => ({ id, nonce: (prev?.nonce ?? 0) + 1 }))
      if (isDesktop) {
        onNavigate({ spot: id })
      } else {
        // スマホは地図へ切り替える。戻るボタンで一覧に戻れるよう履歴に積む
        onNavigate({ spot: id, view: 'map' })
      }
    },
    [isDesktop, onNavigate],
  )

  /**
   * 「条件をクリア」（一覧の上と 0 件のとき。どちらも同じ動き）。都市は
   * 残して、それ以外の条件（エリア・ジャンル・状態・気持ち・検索語）を外す。
   * 都市だけのときは外すものが無いので、ボタン自体を出さない
   */
  const hasSecondaryFilter =
    search.area !== undefined ||
    search.category !== undefined ||
    search.status !== undefined ||
    search.label !== undefined ||
    search.q !== undefined
  const clearSecondary = () =>
    onNavigate({
      area: undefined,
      category: undefined,
      status: undefined,
      label: undefined,
      q: undefined,
    })
  const clearButton = hasSecondaryFilter && (
    <button
      type="button"
      className={actionButtonClass}
      onClick={clearSecondary}
    >
      <X size={14} aria-hidden />
      条件をクリア
    </button>
  )

  // 検索語。入力中は URL を置き換えるだけ（historyMode）。条件を変えたときと
  // 同じく、選んでいるスポットは外す
  const handleQueryChange = useCallback(
    (q: string | undefined) => onNavigate({ q, spot: undefined }),
    [onNavigate],
  )

  const handleCopyView = async () => {
    // 今選んでいるスポットは共有リンクに含めない（query.ts の shareableSearch）
    const ok = await copyText(
      shareUrl(serializeTaiwanMapSearch(shareableSearch(search))),
    )
    if (!ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const conditions = describeConditions(search, selectedArea?.name)

  const emptyResult = (
    <div className="space-y-3 rounded-2xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300">
      <p>この条件に合う場所はありません。</p>
      {clearButton}
    </div>
  )

  const title = (
    <h1
      // スマホの地図表示では地図を画面いっぱいに出すため、見出しは
      // 読み上げ用にだけ残す（見出しの階層 h1 → h2 → h3 は保つ）
      className={showList ? 'text-xl font-bold sm:text-2xl' : 'sr-only'}
    >
      {/* 絞り込み中はタイトルをトップへの戻り口にする */}
      <Link
        to="/tools/taiwan-map"
        className="hover:text-cyan-700 dark:hover:text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 dark:focus-visible:outline-cyan-400"
      >
        {tool.name}
      </Link>
    </h1>
  )

  const viewToggle = (
    // スマホだけの切り替え。既定は一覧で、地図を最初の画面にはしない。
    // 一覧をどこまでスクロールしても地図へ切り替えられるよう、サイトの
    // ヘッダー（h-16）の下に貼り付ける
    <div className="sticky top-16 z-30 -mx-4 bg-white/95 px-4 py-2 backdrop-blur lg:hidden dark:bg-gray-950/95">
      <div
        role="group"
        aria-label="表示の切り替え"
        className="flex rounded-xl bg-gray-100 p-1 dark:bg-gray-800"
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
            {data && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {spots.length}
              </span>
            )}
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
    </div>
  )

  return (
    // デスクトップ: 左に固定幅の一覧（ページと一緒に縦スクロール）、右の残り
    // 全幅に地図（ヘッダーの下から画面の下まで貼り付く）。
    // スマホ: 一覧 / 地図を切り替え。地図は画面の高さいっぱい近くに出す
    <div className="lg:grid lg:grid-cols-[440px_minmax(0,1fr)] xl:grid-cols-[460px_minmax(0,1fr)]">
      <div
        className={`min-w-0 space-y-4 px-4 lg:border-r lg:border-gray-200 lg:px-5 dark:lg:border-gray-800 lg:py-6 ${
          showList ? 'pt-5 pb-8' : ''
        }`}
      >
        {title}

        {showList && (
          <section aria-label="絞り込み">
            <FilterBar
              search={search}
              areas={cityAreas}
              cityCounts={data?.cityCounts ?? null}
              areaCounts={data?.areaCounts ?? EMPTY_COUNTS}
              categoryCounts={data?.categoryCounts ?? null}
              statusCounts={data?.statusCounts ?? null}
              labelCounts={data?.labelCounts ?? null}
              // ジャンルはデスクトップでは地図の上のチップだけにする（二重に出さない）
              showCategory={!isDesktop}
              collapsible={!isDesktop}
              onChange={handleFilterChange}
            />
          </section>
        )}

        {showList && (
          <div className="space-y-2 border-t border-gray-200 pt-3 dark:border-gray-800">
            <SearchBox value={search.q} onChange={handleQueryChange} />
            {/* 「台北 大稻埕・迪化街 食べる 12 件」。条件は区切り記号でつながず、
                1 つずつ別の語として並べる */}
            <p
              className="flex flex-wrap items-baseline gap-x-2 text-sm text-gray-600 dark:text-gray-300"
              aria-live="polite"
            >
              {conditions.map((c) => (
                <span
                  key={c}
                  className="font-medium text-gray-800 dark:text-gray-100"
                >
                  {c}{' '}
                </span>
              ))}
              <span>
                {data
                  ? `${spots.length} 件`
                  : error
                    ? '読み込めませんでした'
                    : '読み込み中…'}
              </span>
              {loading && data && (
                <span className="text-gray-400">更新中…</span>
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
              {clearButton}
            </div>
            {spots.length > 1 && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <div
                  role="group"
                  aria-label="並び順"
                  className="flex shrink-0 rounded-xl bg-gray-100 p-1 dark:bg-gray-800"
                >
                  <button
                    type="button"
                    aria-pressed={!distancePressed}
                    className={`${segmentedClass(!distancePressed)} whitespace-nowrap`}
                    onClick={() => setOrder('default')}
                  >
                    標準
                  </button>
                  <button
                    type="button"
                    aria-pressed={distancePressed}
                    className={`${segmentedClass(distancePressed)} whitespace-nowrap`}
                    onClick={handleNearMe}
                  >
                    <span className="inline-flex items-center gap-1">
                      <LocateFixed size={14} aria-hidden />
                      近い順
                    </span>
                  </button>
                </div>
                {/* 位置情報の案内。「近い順」を押すまでは何も出さない */}
                <p
                  className="text-xs text-gray-500 dark:text-gray-400"
                  aria-live="polite"
                >
                  {order !== 'distance'
                    ? null
                    : geo.status === 'locating'
                      ? '現在地を取得中…'
                      : outsideTaiwan
                        ? '台湾の外にいるため、近い順にできません'
                        : nearMe
                          ? '現在地はこの画面の中だけで使い、保存しません'
                          : null}
                  {geo.status === 'denied'
                    ? '位置情報が許可されていません'
                    : geo.status === 'timeout' || geo.status === 'unavailable'
                      ? '現在地を取得できませんでした'
                      : null}
                </p>
              </div>
            )}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
          >
            <p>データを読み込めませんでした: {error}</p>
            <button
              type="button"
              onClick={onRetry}
              className={actionButtonClass}
            >
              <RotateCw size={14} aria-hidden />
              再試行
            </button>
          </div>
        )}

        {spotStatus === 'missing' && (
          <p
            role="status"
            className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
          >
            リンクのスポットが見つかりませんでした。削除されたか、id
            が変わった可能性があります。
          </p>
        )}
        {spotStatus === 'elsewhere' && spotCity && search.spot && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
          >
            <p>リンクの場所は{getCity(spotCity).name}にあります。</p>
            <button
              type="button"
              className={actionButtonClass}
              onClick={() =>
                onNavigate({
                  city: spotCity,
                  area: undefined,
                  category: undefined,
                  status: undefined,
                  label: undefined,
                  spot: search.spot,
                })
              }
            >
              {getCity(spotCity).name}で開く
            </button>
          </div>
        )}
        {spotStatus === 'filtered' && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
          >
            <p>リンクのスポットは、今の絞り込み条件には含まれていません。</p>
            {hasSecondaryFilter && (
              <button
                type="button"
                className={actionButtonClass}
                onClick={clearSecondary}
              >
                条件を外して表示
              </button>
            )}
          </div>
        )}

        {showList && selectedArea && (
          // cyan は押せるものの色なので、読むだけのエリア紹介には使わない
          <section className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              {selectedArea.name}
              {selectedArea.nameZh && (
                <span
                  lang="zh-Hant-TW"
                  className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400"
                >
                  {selectedArea.nameZh}
                </span>
              )}
            </h2>
            {/* スマホは 2 行まで（読み終える前に一覧が画面の外へ押し出されない
                ように）。続きは「続きを読む」で開く。デスクトップは全文 */}
            {areaSummary && (
              // エリアの紹介もかんちゅの言葉なので、カードのコメントと同じ引用の形
              <blockquote
                ref={areaSummaryRef}
                id="tw-area-summary"
                className={`mt-1.5 border-l-[3px] border-gray-300 pl-2.5 text-sm leading-relaxed whitespace-pre-line text-gray-800 dark:border-gray-600 dark:text-gray-200 ${
                  areaClamped ? 'line-clamp-2' : ''
                }`}
              >
                <span className="sr-only">かんちゅのコメント: </span>
                {areaSummary}
              </blockquote>
            )}
            {areaNote && (isDesktop || areaExpanded) && (
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-gray-600 dark:text-gray-300">
                {areaNote}
              </p>
            )}
            {!isDesktop && (areaOverflows || areaNote) && (
              <button
                type="button"
                aria-expanded={areaExpanded}
                aria-controls="tw-area-summary"
                className="mt-1 text-sm font-medium text-cyan-700 hover:text-cyan-900 dark:text-cyan-300 dark:hover:text-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 dark:focus-visible:outline-cyan-400"
                onClick={() => setAreaExpanded((v) => !v)}
              >
                {areaExpanded ? '閉じる' : '続きを読む'}
              </button>
            )}
          </section>
        )}

        {viewToggle}

        {showList && (
          <section aria-labelledby="tw-spot-list">
            {/* 見出しの階層（h1 → h2 → カードの h3）を保つための見出し。
                見た目は上の件数表示で足りているので視覚的には隠す */}
            <h2 id="tw-spot-list" className="sr-only">
              スポット一覧
            </h2>
            {data && spots.length === 0 ? (
              emptyResult
            ) : (
              <ul className="space-y-2.5">
                {sortedSpots.map((spot) => (
                  <li key={spot.id}>
                    <SpotCard
                      spot={spot}
                      area={spot.area ? areaById.get(spot.area) : undefined}
                      showCity={multiCity}
                      selected={spot.id === search.spot}
                      focusOnSelect={focusOnSelect}
                      onSelect={handleSelect}
                      onShowOnMap={handleShowOnMap}
                      distance={distanceById?.get(spot.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {/* 読み込むまでは地図の代わりに状態だけ出す（デスクトップ） */}
      {showMap && isDesktop && !data && (
        <aside
          className="sticky top-16 flex h-[calc(100dvh-4rem)] items-center justify-center bg-gray-50 px-4 text-center text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-400"
          aria-label="地図"
        >
          {error ? '地図を出せませんでした。' : '地図を読み込み中…'}
        </aside>
      )}
      {/* 0 件でも地図は消さない。地図の上のジャンルチップ（デスクトップでは
          ジャンルの絞り込みはここだけ）で条件を外せるように。ピンが無いことは
          地図の上の帯で知らせる */}
      {showMap && data && (
        <aside
          aria-label="地図"
          // スマホ: サイトのヘッダー（4rem）と切り替え（3.25rem）を除いた高さ
          className="relative h-[calc(100dvh-7.25rem)] bg-gray-100 lg:sticky dark:bg-gray-900 lg:top-16 lg:h-[calc(100dvh-4rem)]"
        >
          <MapErrorBoundary>
            <Suspense
              fallback={
                <p className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                  地図を読み込み中…
                </p>
              }
            >
              <MapView
                spots={spots}
                fallbackCity={search.city ?? data.cities.at(0) ?? 'taipei'}
                selectedId={search.spot}
                flyRequest={flyRequest}
                onFlyDone={clearFlyRequest}
                onSelect={handleMapSelect}
                activeCategory={search.category}
                categoryCounts={data.categoryCounts}
                onCategoryChange={handleCategoryChange}
                areaById={areaById}
                popupEnabled={isDesktop}
                onClearSelection={onClearSelection}
                userPosition={geo.position}
                locateStatus={geo.status}
                onLocate={geo.request}
                distanceById={distanceById}
                onShowOnMap={handleFlyTo}
                bottomCard={
                  !isDesktop && selectedSpot ? (
                    <SelectedSpotCard
                      spot={selectedSpot}
                      distance={distanceById?.get(selectedSpot.id)}
                      onClose={onClearSelection}
                      onShowOnMap={handleFlyTo}
                      onShowInList={() => {
                        setFocusOnSelect(true)
                        onNavigate({ view: undefined })
                      }}
                    />
                  ) : undefined
                }
              />
            </Suspense>
          </MapErrorBoundary>
          {spots.length === 0 && (
            <MapEmptyNotice clearButton={isDesktop ? null : clearButton} />
          )}
          {/* 選んだ場所のカード（スマホ）は MapView の bottomCard として
              地図の下端に重ねる。出していないときだけ凡例を出す */}
          {(isDesktop || !selectedSpot) && <MapLegend />}
        </aside>
      )}
    </div>
  )
}

const EMPTY_COUNTS: ReadonlyMap<string, number> = new Map()

/** 入力が止まってから URL に書くまでの待ち（ms） */
const SEARCH_DEBOUNCE_MS = 300

/**
 * 一覧の上の文字検索。打った文字は手元の state に持ち、止まってから
 * URL（?q=）へ書く（1 文字ごとに一覧と地図を描き直さない）。
 * 「戻る」などで URL の q が外から変わったら、入力欄もそれに合わせる
 */
function SearchBox({
  value,
  onChange,
}: {
  value: string | undefined
  onChange: (q: string | undefined) => void
}) {
  const [text, setText] = useState(value ?? '')
  /** 最後に自分で URL に書いた値。外からの変化と見分ける */
  const [sent, setSent] = useState(value)
  const [prevValue, setPrevValue] = useState(value)
  if (prevValue !== value) {
    setPrevValue(value)
    if (value !== sent) {
      setSent(value)
      setText(value ?? '')
    }
  }

  const commit = useCallback(
    (raw: string) => {
      const q = raw.trim() === '' ? undefined : raw.trim()
      setSent(q)
      onChange(q)
    },
    [onChange],
  )

  useEffect(() => {
    const q = text.trim() === '' ? undefined : text.trim()
    if (q === value) return
    const t = window.setTimeout(() => commit(text), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [text, value, commit])

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(e) => {
        // Enter ですぐ反映し、スマホではキーボードを閉じて結果を見せる
        e.preventDefault()
        commit(text)
        const input = e.currentTarget.querySelector('input')
        input?.blur()
      }}
    >
      <Search
        size={16}
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 dark:text-gray-500"
      />
      <input
        type="search"
        value={text}
        maxLength={SEARCH_QUERY_MAX}
        onChange={(e) => setText(e.target.value)}
        placeholder="店名・タグ・エリアで探す"
        aria-label="店名・タグ・エリア・コメントで探す"
        enterKeyHint="search"
        // スマホで 16px 未満だと iOS が入力時に拡大するので text-base
        className="w-full rounded-xl border border-gray-300 bg-white py-2 pr-10 pl-9 text-base text-gray-900 placeholder:text-gray-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 focus:outline-none lg:text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-cyan-400 dark:focus:ring-cyan-400/30 [&::-webkit-search-cancel-button]:hidden"
      />
      {text !== '' && (
        <button
          type="button"
          aria-label="検索語を消す"
          onClick={() => {
            setText('')
            commit('')
          }}
          className="absolute top-1/2 right-1 -translate-y-1/2 rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline focus-visible:outline-2 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 focus-visible:outline-cyan-500 dark:focus-visible:outline-cyan-400"
        >
          <X size={16} aria-hidden />
        </button>
      )}
    </form>
  )
}

/**
 * スマホの地図表示で、選んだ場所の要点を地図の下端に重ねるカード。
 * 一覧が見えないので、名前・状態・距離・コメントと、カードと同じ操作を出す
 */
function SelectedSpotCard({
  spot,
  distance,
  onClose,
  onShowOnMap,
  onShowInList,
}: {
  spot: ResultsData['spots'][number]
  distance: number | undefined
  onClose: () => void
  onShowOnMap: (id: string) => void
  onShowInList: () => void
}) {
  const summary = publicText(spot.summary)
  return (
    <div className={`${cardClass} space-y-2 !p-3 shadow-lg`}>
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <p className="font-semibold text-gray-900 dark:text-gray-100">
            {spot.name}
          </p>
          <StatusBadge status={spot.status} />
          {spot.categories.map((c) => (
            <CategoryChip key={c} category={c} />
          ))}
          {distance !== undefined && (
            <span className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
              <Navigation size={11} aria-hidden />
              現在地から{formatDistance(distance)}
            </span>
          )}
        </div>
        <SpotLinkIcons spot={spot} />
        <button
          type="button"
          aria-label="閉じる"
          onClick={onClose}
          // 指で押すので 44px 四方（見た目の位置は余白に食い込ませて保つ）
          className="-mt-2 -mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline focus-visible:outline-2 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 focus-visible:outline-cyan-500 dark:focus-visible:outline-cyan-400"
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      {summary && (
        <SpotComment
          text={summary}
          wantToGo={spot.status === 'want_to_go'}
          clamp={2}
          className="text-sm"
        />
      )}
      {/* 「一覧で見る」で一覧に戻ると選択中のカードがマウントされ、
          SpotCard 側の effect がそのカードへスクロールしてフォーカスを移す */}
      <SpotActions
        spot={spot}
        onShowOnMap={onShowOnMap}
        onShowInList={onShowInList}
        compact
      />
    </div>
  )
}

/**
 * 0 件のときに地図の真ん中に重ねる知らせ。地図とジャンルチップはそのまま
 * 使える（外枠は地図の操作を奪わないよう pointer-events-none）。
 * スマホの地図表示は一覧が見えないので、「条件をクリア」もここに出す
 * （デスクトップは一覧側の 0 件の表示にある）
 */
function MapEmptyNotice({ clearButton }: { clearButton: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-4 top-1/2 z-10 flex -translate-y-1/2 justify-center">
      <div className="pointer-events-auto space-y-2 rounded-xl bg-white/95 px-4 py-3 text-center text-sm text-gray-600 shadow-md dark:bg-gray-900/95 dark:text-gray-300 dark:ring-1 dark:ring-gray-700">
        <p>この条件に合う場所はありません。</p>
        {clearButton}
      </div>
    </div>
  )
}

/**
 * 凡例と帰属表示。地図の左下に重ねる（右下は maplibre の帰属ボタン）。
 * style が読めない（オフライン）と maplibre 側の帰属表示も出ないので、
 * ここにも常に出す。
 */
function MapLegend() {
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 z-10 max-w-[calc(100%-4rem)] rounded-lg bg-white/90 px-2.5 py-1.5 text-[0.7rem] leading-relaxed text-gray-600 shadow-sm backdrop-blur dark:bg-gray-900/90 dark:text-gray-300 dark:shadow-none">
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
        <li className="inline-flex items-center gap-1">
          <span
            aria-hidden
            className="inline-block h-3 w-3 rounded-full border-2 border-white bg-gray-500 shadow dark:border-slate-900 dark:bg-gray-400"
          />
          行った
        </li>
        <li className="inline-flex items-center gap-1">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full border-2 border-gray-500 bg-white dark:border-gray-400 dark:bg-slate-900"
          />
          未訪問・気になる
        </li>
        <li>色はジャンル（上のチップ）</li>
      </ul>
      <p className="pointer-events-auto">
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

/** 今の条件を「台北」「大稻埕・迪化街」「食べる」のように 1 つずつ返す */
function describeConditions(
  search: TaiwanMapSearch,
  areaName: string | undefined,
): Array<string> {
  const filter = filterFromSearch(search)
  const parts: Array<string> = []
  if (filter.city) parts.push(getCity(filter.city).name)
  if (areaName) parts.push(areaName)
  if (filter.category) parts.push(categoryName(filter.category))
  if (filter.status) parts.push(statusName(filter.status))
  if (filter.label) {
    const l = labelDef(filter.label)
    parts.push(`${l.mark} ${l.name}`)
  }
  if (search.q) parts.push(`「${search.q}」`)
  return parts
}
