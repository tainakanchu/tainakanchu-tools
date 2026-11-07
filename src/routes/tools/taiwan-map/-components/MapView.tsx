/**
 * maplibre-gl + OpenFreeMap の地図。
 *
 * ■ このファイルは必ず React.lazy 経由で読むこと
 *   maplibre-gl は JS だけで 800KB 近くある。トップページ（= 地図を出さない
 *   画面）の読み込みに混ぜると最初の表示が遅くなるので、このモジュールごと
 *   動的 import にして、台湾マップの一覧・地図の画面に来てから取りに行く
 *   （いつ取りに行くかは -lib/loadMapView.ts に 1 箇所でまとめてある）。
 *   CSS もここで import しているので、同じチャンクと一緒に遅延される。
 *   ビルド後の sw.js で precache から外している理由も同じ（vite.config.ts 参照）。
 *
 * ■ maplibre-gl を v5 に留めている理由
 *   v6 は Web Worker を「ライブラリ自身の import.meta.url からの相対パス」で
 *   読みに行くため、Vite でバンドルするとワーカーのファイルが dist に
 *   出力されず、setWorkerUrl と ?worker 取り込みの設定が別途要る。
 *   v5 はワーカーを 1 ファイルに内包していて追加設定なしで動く。
 *
 * ■ タイル
 *   OpenFreeMap（キー不要・無料）のベクタタイル。ピンが主役になるよう、
 *   淡色で情報の少ない positron を使い、さらに細かい交通系のラベルを
 *   隠している（-lib/mapFeatures.ts の HIDDEN_BASE_LAYERS）。
 *   帰属表示は style の attribution を maplibre の AttributionControl が
 *   そのまま出すが、オフラインで style 自体が読めないと何も出なくなるので、
 *   地図の外にも静的な帰属表示を置いている（index.tsx 側）。
 *
 * ■ ピンは DOM のマーカーではなく GeoJSON ソース + circle レイヤー
 *   以前は maplibregl.Marker（1 件 = 1 つの <button>）で描いていたが、
 *   地図を動かすたびに全マーカーの transform を JS で書き換えるので、
 *   件数に比例してパン・ズームが重くなる。circle レイヤーなら WebGL が
 *   まとめて描き、件数が増えても DOM は増えない。
 *   代わりに失う「ピン 1 つ 1 つがキーボードで押せるボタン」は、地図の
 *   横に視覚的に隠したボタンの一覧（SpotKeyboardList）で補う。フォーカスが
 *   当たったピンは地図上でも枠で示し、見えていなければそこへ寄せる。
 */

import { useEffect, useId, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getCity } from '../../../../lib/taiwan-map/types'
import {
  HIDDEN_BASE_LAYERS,
  spotsToFeatureCollection,
} from '../-lib/mapFeatures'
import { categoryName } from './Badges'
import { MapCategoryChips } from './MapCategoryChips'
import type {
  CityId,
  SpotCategory,
  TaiwanSpot,
} from '../../../../lib/taiwan-map/types'

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'

/**
 * 1 件だけ・「地図で見る」で寄るときのズームの上限。通りの名前と周りの
 * 店が見える程度にとどめる（16 以上だと周りが見えず、どこにいるのか
 * 分からなくなる）。すでにこれより寄っているときはそのままにする。
 */
const SPOT_ZOOM = 15

/** ピンのクリック判定の半径（px）。指でも押せるよう、描いた丸より広く取る */
const HIT_RADIUS = 14

const SOURCE_ID = 'tw-spots'
const LAYER = {
  shadow: 'tw-spot-shadow',
  pins: 'tw-spot-pins',
  selectedHalo: 'tw-spot-selected-halo',
  selected: 'tw-spot-selected',
  focus: 'tw-spot-focus',
} as const

/** 選択の操作色（styles.ts の cyan-500 と同じ）。ジャンル色には使っていない */
const SELECT_COLOR = '#06b6d4'

export type FlyRequest = { id: string; nonce: number }

/** ピンを作り直す必要があるかの判定用。中身の id 列が同じなら同じ地図 */
function spotsKeyOf(spots: ReadonlyArray<TaiwanSpot>): string {
  return spots.map((s) => s.id).join('\n')
}

function statusText(spot: TaiwanSpot): string {
  return spot.status === 'visited' ? '行った' : '未訪問・気になる'
}

/** id が一致するものだけを描くフィルタ。null なら何も描かない */
function idFilter(
  id: string | null | undefined,
): maplibregl.FilterSpecification {
  return ['==', ['get', 'id'], id ?? '']
}

type Props = {
  spots: ReadonlyArray<TaiwanSpot>
  /** 何も無いときの初期表示位置 */
  fallbackCity: CityId
  selectedId: string | undefined
  flyRequest: FlyRequest | null
  /** flyRequest を処理し終えたら呼ぶ。親が null に戻し、再マウントで二度飛ばない */
  onFlyDone: () => void
  onSelect: (id: string) => void
  /** URL の category。ピンの色決めと地図上のジャンルチップに使う */
  activeCategory: SpotCategory | undefined
  /** カテゴリ以外の条件で数えたジャンルごとの件数 */
  categoryCounts: ReadonlyMap<SpotCategory, number>
  onCategoryChange: (category: SpotCategory | undefined) => void
}

/**
 * ピンのレイヤー一式を足す。見た目は以前の DOM マーカーと同じ考え方で、
 * 色はジャンル（categoryColors.ts）、形は訪問状況:
 * - visited     … ジャンル色で塗りつぶした白縁の丸
 * - want_to_go  … 白地にジャンル色の縁の、ひと回り小さい丸
 * 一覧のバッジと同じく「塗り / 白抜き」でも区別し、未訪問の場所が
 * 行った場所と同じ重みで地図に並ばないようにする。選択中は cyan の輪つきで
 * 大きく、いちばん上に描く。
 */
function addSpotLayers(map: maplibregl.Map) {
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  const visited: maplibregl.ExpressionSpecification = ['get', 'visited']
  const color: maplibregl.ExpressionSpecification = ['get', 'color']
  // 影。白縁の丸が淡い地図に溶けないよう、少しぼかした濃い丸を下に敷く
  map.addLayer({
    id: LAYER.shadow,
    type: 'circle',
    source: SOURCE_ID,
    paint: {
      'circle-radius': ['case', visited, 10, 8],
      'circle-color': '#0f172a',
      'circle-opacity': 0.28,
      'circle-blur': 0.6,
      'circle-translate': [0, 1],
    },
  })
  map.addLayer({
    id: LAYER.pins,
    type: 'circle',
    source: SOURCE_ID,
    layout: { 'circle-sort-key': ['get', 'sortKey'] },
    paint: {
      'circle-radius': ['case', visited, 6.5, 5],
      'circle-color': ['case', visited, color, '#ffffff'],
      'circle-stroke-width': 2.5,
      'circle-stroke-color': ['case', visited, '#ffffff', color],
    },
  })
  map.addLayer({
    id: LAYER.selectedHalo,
    type: 'circle',
    source: SOURCE_ID,
    filter: idFilter(null),
    paint: {
      'circle-radius': 14,
      'circle-color': SELECT_COLOR,
      'circle-stroke-width': 1,
      'circle-stroke-color': '#ffffff',
    },
  })
  map.addLayer({
    id: LAYER.selected,
    type: 'circle',
    source: SOURCE_ID,
    filter: idFilter(null),
    paint: {
      'circle-radius': ['case', visited, 9, 7.5],
      'circle-color': ['case', visited, color, '#ffffff'],
      'circle-stroke-width': 3,
      'circle-stroke-color': ['case', visited, '#ffffff', color],
    },
  })
  // キーボードでフォーカス中のピン。選択とは別の「今ここ」を示す白抜きの輪
  map.addLayer({
    id: LAYER.focus,
    type: 'circle',
    source: SOURCE_ID,
    filter: idFilter(null),
    paint: {
      'circle-radius': 18,
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-width': 3,
      'circle-stroke-color': SELECT_COLOR,
    },
  })
}

export default function MapView({
  spots,
  fallbackCity,
  selectedId,
  flyRequest,
  onFlyDone,
  onSelect,
  activeCategory,
  categoryCounts,
  onCategoryChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const onSelectRef = useRef(onSelect)
  const onFlyDoneRef = useRef(onFlyDone)
  const spotsRef = useRef(spots)
  const activeCategoryRef = useRef(activeCategory)
  /** style を読み終え、ピンのソースとレイヤーを足し終えたか */
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [focusedId, setFocusedId] = useState<string | null>(null)

  useEffect(() => {
    onSelectRef.current = onSelect
    onFlyDoneRef.current = onFlyDone
    spotsRef.current = spots
    activeCategoryRef.current = activeCategory
  })

  /**
   * 表示範囲の合わせ直しは、表示するスポットの顔ぶれが変わったときだけに
   * する。選択（selectedId）が変わっただけ、あるいは同じ中身の配列が
   * 作り直されただけで合わせ直すと、ピンを押すたびに地図が初期範囲へ
   * 跳ね戻って、見ていた場所を見失う。
   */
  const spotsKey = spotsKeyOf(spots)

  // 地図本体はマウント時に 1 度だけ作る
  useEffect(() => {
    const city = getCity(fallbackCity)
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: STYLE_URL,
      center: [city.center.lng, city.center.lat],
      zoom: city.zoom,
      attributionControl: { compact: true },
      // 一覧を縦スクロールしている途中で地図に指が乗ると、ページではなく
      // 地図が動いて操作を奪われる。スマホは 2 本指でだけ動かす
      cooperativeGestures: window.matchMedia('(pointer: coarse)').matches,
    })
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'top-right',
    )
    // error リスナーを付けておくと maplibre は console.error を出さない。
    // 知らせるのは「style（地図の定義）そのものが読めなかった」ときだけ。
    // タイル 1 枚・グリフ 1 つの失敗は地図の端が欠ける程度なので黙っておく
    // （そのたびに帯が出ると、ほぼ使えている地図に不安な表示が居座る）。
    // style の読み込み完了より前に、ソースに紐づかない error が
    // 来たら style の失敗とみなす。
    let styleLoaded = false
    // 'load'（最初のタイルまで描き終えたとき）ではなく 'style.load' で
    // ピンを足す。タイルを待たずにピンが出るのと、隠すレイヤーを最初の
    // 描画より前に消せる（一瞬だけ細かいラベルが見える、が起きない）ため
    // （setStyle は呼ばないので、style.load は 1 度しか来ない）
    map.on('style.load', () => {
      styleLoaded = true
      setLoadError(false)
      for (const id of HIDDEN_BASE_LAYERS) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none')
      }
      addSpotLayers(map)
      setReady(true)
    })
    // maplibre の compact な帰属表示は、最初は開いた状態（全文）で出る。
    // 地図の左下に同じ帰属表示（index.tsx の MapLegend）を常に出しているので
    // 二重になるうえ、スマホでは選んだ場所のカードの下に文字が透けて見える。
    // 最初から (i) ボタンだけの閉じた状態にしておく
    map.on('load', () => {
      map
        .getContainer()
        .querySelector('.maplibregl-ctrl-attrib')
        ?.classList.remove('maplibregl-compact-show')
    })
    map.on('error', (e) => {
      if (styleLoaded || 'sourceId' in e || 'tile' in e) return
      setLoadError(true)
    })

    // クリック（タップ）はピンの丸より少し広い範囲で拾い、いちばん近いものを選ぶ
    const pinsAt = (point: maplibregl.Point) =>
      map.queryRenderedFeatures(
        [
          [point.x - HIT_RADIUS, point.y - HIT_RADIUS],
          [point.x + HIT_RADIUS, point.y + HIT_RADIUS],
        ],
        { layers: [LAYER.pins] },
      )
    map.on('click', (e) => {
      if (!map.getLayer(LAYER.pins)) return
      const hits = pinsAt(e.point)
      let best: { id: string; d: number } | null = null
      for (const f of hits) {
        const id: unknown = f.properties.id
        const spot = spotsRef.current.find((s) => s.id === id)
        if (!spot) continue
        const p = map.project([spot.location.lng, spot.location.lat])
        const d = Math.hypot(p.x - e.point.x, p.y - e.point.y)
        if (best === null || d < best.d) best = { id: spot.id, d }
      }
      if (best) onSelectRef.current(best.id)
    })
    map.on('mousemove', (e) => {
      if (!map.getLayer(LAYER.pins)) return
      map.getCanvas().style.cursor = pinsAt(e.point).length > 0 ? 'pointer' : ''
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // fallbackCity はマウント時の初期位置にしか使わない
    // oxlint-disable-next-line react/exhaustive-deps
  }, [])

  // ピンの中身を差し替える（ジャンルを切り替えたら色も塗り直す）
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map
      .getSource<maplibregl.GeoJSONSource>(SOURCE_ID)
      ?.setData(spotsToFeatureCollection(spotsRef.current, activeCategory))
  }, [ready, spotsKey, activeCategory])

  // 表示範囲を絞り込み結果に合わせる（style を待たずに合わせてよい）
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const current = spotsRef.current
    if (current.length === 1) {
      const { lat, lng } = current[0].location
      map.jumpTo({ center: [lng, lat], zoom: SPOT_ZOOM })
    } else if (current.length > 1) {
      const bounds = new maplibregl.LngLatBounds()
      for (const s of current) bounds.extend([s.location.lng, s.location.lat])
      // 上は地図に重ねたジャンルチップのぶん広めに空ける。幅の狭い地図
      // （スマホ）ではチップが 2〜3 段に折り返すので、さらに空ける
      const narrow = map.getContainer().clientWidth < 640
      map.fitBounds(bounds, {
        padding: { top: narrow ? 120 : 80, bottom: 48, left: 40, right: 40 },
        maxZoom: SPOT_ZOOM,
        duration: 0,
      })
    }
  }, [spotsKey])

  // 選択中のピンだけ大きく・輪つきで上に描く。一覧で選んだ場所が地図の
  // 外にあるときは、ズームは変えずにそこまで横にずらす（輪が見えないと
  // 選んだことが地図に伝わらない）
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.setFilter(LAYER.selectedHalo, idFilter(selectedId))
    map.setFilter(LAYER.selected, idFilter(selectedId))
    // 「地図で見る」の flyTo の途中なら邪魔をしない
    if (map.isMoving()) return
    const spot = spotsRef.current.find((s) => s.id === selectedId)
    if (!spot) return
    const lngLat: [number, number] = [spot.location.lng, spot.location.lat]
    if (!map.getBounds().contains(lngLat))
      map.easeTo({ center: lngLat, duration: 600 })
  }, [ready, selectedId])

  // キーボードでフォーカスしたピンに輪を出し、画面外ならそこへ寄せる
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.setFilter(LAYER.focus, idFilter(focusedId))
    const spot = spotsRef.current.find((s) => s.id === focusedId)
    if (!spot) return
    const lngLat: [number, number] = [spot.location.lng, spot.location.lat]
    if (!map.getBounds().contains(lngLat)) map.easeTo({ center: lngLat })
  }, [ready, focusedId])

  // 一覧の「地図で見る」→ そのピンへ寄る。
  // - ズームは SPOT_ZOOM まで。すでにそれより寄っていれば変えない
  // - 寄る必要が無ければ（もう十分寄っている）横に動くだけの easeTo にする。
  //   flyTo は一度引いてから寄る弧を描くので、近場の移動だと大げさに揺れる
  useEffect(() => {
    if (!flyRequest) return
    const spot = spotsRef.current.find((s) => s.id === flyRequest.id)
    const map = mapRef.current
    if (spot && map) {
      const center: [number, number] = [spot.location.lng, spot.location.lat]
      const zoom = map.getZoom()
      if (zoom >= SPOT_ZOOM) {
        map.easeTo({ center, duration: 600, essential: true })
      } else {
        map.flyTo({
          center,
          zoom: SPOT_ZOOM,
          curve: 1.2,
          maxDuration: 1500,
          essential: true,
        })
      }
    }
    onFlyDoneRef.current()
  }, [flyRequest])

  return (
    <div className="relative h-full w-full">
      {/* ランドマークは親の <aside aria-label="地図"> が担うので、ここには role を付けない */}
      <div ref={containerRef} className="h-full w-full" />
      <MapCategoryChips
        active={activeCategory}
        counts={categoryCounts}
        onChange={onCategoryChange}
      />
      <SpotKeyboardList
        spots={spots}
        selectedId={selectedId}
        onSelect={onSelect}
        onFocusChange={setFocusedId}
      />
      {loadError && (
        <p className="pointer-events-none absolute inset-x-2 bottom-8 rounded-lg bg-white/90 px-3 py-2 text-xs text-gray-600 shadow">
          地図を読み込めませんでした（圏外かもしれません）。一覧と Google Maps
          のリンクはそのまま使えます。
        </p>
      )}
    </div>
  )
}

/**
 * 地図上のピンのキーボード・スクリーンリーダー向けの代わり。
 * ピンは canvas に描いているのでフォーカスできない。そこで「ピン 1 つ =
 * ボタン 1 つ」の一覧を視覚的に隠して置き、Tab で順にたどれるようにする。
 * フォーカスが入ったボタンだけは地図の左上（ジャンルチップの下）に名前つきで見せ、地図上の
 * 該当ピンにも輪を出す（onFocusChange → MapView の focus レイヤー）。
 */
function SpotKeyboardList({
  spots,
  selectedId,
  onSelect,
  onFocusChange,
}: {
  spots: ReadonlyArray<TaiwanSpot>
  selectedId: string | undefined
  onSelect: (id: string) => void
  onFocusChange: (id: string | null) => void
}) {
  const labelId = useId()
  return (
    <div>
      <p id={labelId} className="sr-only">
        地図上の場所（{spots.length} 件）
      </p>
      <ul
        aria-labelledby={labelId}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) onFocusChange(null)
        }}
      >
        {spots.map((spot) => (
          <li key={spot.id}>
            <button
              type="button"
              aria-pressed={spot.id === selectedId}
              onFocus={() => onFocusChange(spot.id)}
              onClick={() => onSelect(spot.id)}
              className="sr-only focus:not-sr-only focus:absolute focus:top-12 focus:left-2 focus:z-20 focus:max-w-[calc(100%-1rem)] focus:rounded-lg focus:border focus:border-cyan-500 focus:bg-white focus:px-3 focus:py-1.5 focus:text-sm focus:text-gray-900 focus:shadow focus:outline-none"
            >
              {spot.name}（{spot.categories.map(categoryName).join('・')}／
              {statusText(spot)}）
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
