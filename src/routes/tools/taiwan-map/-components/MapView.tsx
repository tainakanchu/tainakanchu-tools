/**
 * maplibre-gl + OpenFreeMap の地図。
 *
 * ■ このファイルは必ず React.lazy 経由で読むこと
 *   maplibre-gl は JS だけで 800KB 近くある。トップページやスマホの一覧表示
 *   （= 地図を出さない画面）で読まされるのは無駄なので、このモジュールごと
 *   動的 import にして「地図を実際に表示するときだけ」取りに行く。
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
 *   OpenFreeMap（キー不要・無料）のベクタタイル。帰属表示は style の
 *   attribution を maplibre の AttributionControl がそのまま出すが、
 *   オフラインで style 自体が読めないと何も出なくなるので、地図の外にも
 *   静的な帰属表示を置いている（index.tsx 側）。
 */

import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getCity } from '../../../../lib/taiwan-map/types'
import type { CityId, TaiwanSpot } from '../../../../lib/taiwan-map/types'

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

/** 1 件だけ・flyTo のときのズーム。路地の店が見分けられる程度 */
const SPOT_ZOOM = 16

export type FlyRequest = { id: string; nonce: number }

type Props = {
  spots: ReadonlyArray<TaiwanSpot>
  /** 何も無いときの初期表示位置 */
  fallbackCity: CityId
  selectedId: string | undefined
  flyRequest: FlyRequest | null
  onSelect: (id: string) => void
}

/**
 * ピンの見た目。visited は塗りつぶしの丸、want_to_go は白地に破線の
 * 小さめの丸。一覧のバッジと同じく「形」でも区別し、未訪問の場所が
 * 行った場所と同じ重みで地図に並ばないようにする。
 */
function styleMarker(el: HTMLElement, spot: TaiwanSpot, selected: boolean) {
  const visited = spot.status === 'visited'
  const size = (visited ? 18 : 14) + (selected ? 8 : 0)
  Object.assign(el.style, {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '9999px',
    border: visited ? '3px solid #ffffff' : '2px dashed #64748b',
    background: visited ? '#059669' : '#f8fafc',
    boxShadow: selected
      ? '0 0 0 3px #06b6d4, 0 2px 6px rgba(15,23,42,.45)'
      : '0 1px 4px rgba(15,23,42,.4)',
    cursor: 'pointer',
    padding: '0',
    zIndex: selected ? '2' : visited ? '1' : '0',
  })
}

export default function MapView({
  spots,
  fallbackCity,
  selectedId,
  flyRequest,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef(
    new Map<string, { marker: maplibregl.Marker; spot: TaiwanSpot }>(),
  )
  const onSelectRef = useRef(onSelect)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

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
    // 圏外でタイルが取れないのは想定内なので、画面に一言出すだけにする
    map.on('error', () => setLoadError(true))
    mapRef.current = map
    const markers = markersRef.current
    return () => {
      markers.clear()
      map.remove()
      mapRef.current = null
    }
    // fallbackCity はマウント時の初期位置にしか使わない
    // oxlint-disable-next-line react/exhaustive-deps
  }, [])

  // ピンを張り替え、表示範囲を絞り込み結果に合わせる
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const markers = markersRef.current
    for (const { marker } of markers.values()) marker.remove()
    markers.clear()

    for (const spot of spots) {
      const el = document.createElement('button')
      el.type = 'button'
      el.setAttribute(
        'aria-label',
        `${spot.name}（${spot.status === 'visited' ? '行った' : '未訪問・気になる'}）`,
      )
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        onSelectRef.current(spot.id)
      })
      styleMarker(el, spot, false)
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([spot.location.lng, spot.location.lat])
        .addTo(map)
      markers.set(spot.id, { marker, spot })
    }

    if (spots.length === 1) {
      const { lat, lng } = spots[0].location
      map.jumpTo({ center: [lng, lat], zoom: SPOT_ZOOM })
    } else if (spots.length > 1) {
      const bounds = new maplibregl.LngLatBounds()
      for (const s of spots) bounds.extend([s.location.lng, s.location.lat])
      map.fitBounds(bounds, { padding: 48, maxZoom: SPOT_ZOOM, duration: 0 })
    }
  }, [spots])

  // 選択中のピンだけ大きく・枠つきにする
  useEffect(() => {
    for (const [id, { marker, spot }] of markersRef.current) {
      styleMarker(marker.getElement(), spot, id === selectedId)
    }
  }, [selectedId, spots])

  // 一覧の「地図で見る」→ そのピンへ飛ぶ
  useEffect(() => {
    if (!flyRequest) return
    const entry = markersRef.current.get(flyRequest.id)
    const map = mapRef.current
    if (!entry || !map) return
    map.flyTo({
      center: [entry.spot.location.lng, entry.spot.location.lat],
      zoom: Math.max(map.getZoom(), SPOT_ZOOM),
      essential: true,
    })
  }, [flyRequest])

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="h-full w-full"
        role="region"
        aria-label="スポットの地図"
      />
      {loadError && (
        <p className="pointer-events-none absolute inset-x-2 bottom-8 rounded-lg bg-white/90 px-3 py-2 text-xs text-gray-600 shadow">
          地図の一部を読み込めませんでした（圏外かもしれません）。一覧と Google
          Maps のリンクはそのまま使えます。
        </p>
      )}
    </div>
  )
}
