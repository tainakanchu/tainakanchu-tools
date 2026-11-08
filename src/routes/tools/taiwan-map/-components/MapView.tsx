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
 *
 * ■ ピンを押したときのポップアップ（デスクトップ）
 *   maplibregl.Popup ではなく React で描いた要素（SpotPopup）を地図の上に
 *   重ね、地図が動くたびに map.project で位置だけを style で書き換える。
 *   中身を一覧のカードと同じ部品・同じ整形（publicText など）で作れるため。
 *   一覧で選んだときも同じポップアップを開く。× / Esc / 地図の何も無い所を
 *   押すと、ポップアップごと選択を外す（onClearSelection。スマホの下端の
 *   カードの × と同じ動きで、選んだときに積んだ履歴があれば 1 つ戻る）。
 *   スマホは地図の下端に別のカード（index.tsx）を出すので、ポップアップは
 *   出さない（2 つ同時に出さない）。
 *
 * ■ 0 件のとき
 *   ピンが無くても地図とジャンルチップは出したままにする（デスクトップでは
 *   ジャンルの絞り込みは地図の上のチップだけなので、消すと戻れなくなる）。
 *   表示範囲は直前のまま動かさない。
 *
 * ■ ピンの名前
 *   ズーム 14 以上で、ピンの横に店名を出す（symbol レイヤー）。重なる名前は
 *   maplibre の衝突判定で間引かれる。フォントは positron の glyphs にある
 *   Noto Sans。漢字・かなは maplibre の localIdeographFontFamily（既定
 *   'sans-serif'）で端末のフォントから描くので、glyphs に CJK が無くても出る。
 *
 * ■ 最初の表示範囲
 *   全件ではなく「中心から近い 9 割」を囲む（-lib/mapFeatures.ts の
 *   coreBounds）。台北なら山の上の貓空 1 件のせいで中心部が潰れないように。
 *
 * ■ ホイール（デスクトップ）
 *   デスクトップも cooperativeGestures にして、Ctrl / ⌘ + ホイールでだけ
 *   拡大・縮小する（トラックパッドのピンチは maplibre が ctrlKey 付きの
 *   wheel として通すので、そのまま拡大・縮小できる）。一覧はページごと
 *   スクロールし、地図はその横に貼り付いている作りなので、地図の上で
 *   ホイールを回してもページ（= 一覧）が進むほうが、一覧を読んでいる
 *   途中で地図に吸い込まれない。一覧を別のスクロール領域に分ける案は、
 *   カードへ寄せる scrollIntoView・「戻る」でのスクロール位置の復元・
 *   スマホとの作りの違いが増えるので採らなかった。
 *
 * ■ 現在地
 *   右下の丸い「現在地」ボタン（44px）。押したときだけ位置情報を取りに行き
 *   （すでに許可されていれば開いた時点から追う。-lib/useGeolocation.ts）、
 *   取れたらそこへ寄る。位置は親（index.tsx の useGeolocation）のメモリに
 *   だけ持ち、ここは受け取って描くだけ。URL や保存先には出さない。
 *   - 青い点 + 精度の円（実際の半径。ズームしても大きさが合う多角形）
 *   - 向きの扇: 端末のコンパス（-lib/compass.ts）があればそれ。無ければ
 *     GPS の進行方向を、速さ 1 m/s 超・精度 50m 以内のときだけ使う
 *     （止まっているときの GPS の向きはでたらめ）。どちらも無ければ出さない。
 *     向きは近いほうへ回るようになめらかにする（lib/taiwan-map/geo.ts）
 *   - 台湾の外にいるときはそこへ飛ばない（台湾の地図が見えなくなるだけ）。
 *     「台湾の外にいます」と知らせる
 *   - 状態（取得中・許可されていない・取れない）は地図の下端の小さな帯で
 *     知らせる（role=status）
 *
 * ■ ベース地図のラベル
 *   positron の地名・道路名は「ローマ字 + 中国語」の 2 段組みで、台湾では
 *   台湾語のローマ字が混ざって読みにくい。style を読んだ時点で text-field を
 *   中国語（現地表記）だけに差し替える（-lib/mapFeatures.ts の localizedTextField）。
 *
 * ■ ダーク
 *   サイトの配色がダークのときは、positron の各レイヤーの色を暗い色に
 *   差し替える（style は読み直さない。理由と色は -lib/mapTheme.ts）。
 *   ピン・現在地・ピンの名前など自前のレイヤーも同じく paint だけ替え、
 *   ジャンル色は一段明るいもの（categoryColors.ts の CATEGORY_COLORS_DARK）に
 *   する。ズームボタン・帰属表示など maplibre の部品は mapDark.css で暗くする。
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './mapDark.css'
import { Crosshair } from 'lucide-react'
import {
  circleRing,
  isInsideTaiwan,
  smoothHeading,
} from '../../../../lib/taiwan-map/geo'
import { getCity } from '../../../../lib/taiwan-map/types'
import {
  HIDDEN_BASE_LAYERS,
  coreBounds,
  localizedTextField,
  spotsToFeatureCollection,
} from '../-lib/mapFeatures'
import { requestCompassPermission, watchCompass } from '../-lib/compass'
import { MAP_LOCALE_JA } from '../-lib/mapLocale'
import { SPOT_LAYER_COLORS, basemapPaintPlan } from '../-lib/mapTheme'
import { useTheme } from '../../../../components/theme/ThemeScope'
import { placePopup } from '../-lib/popupPlacement'
import { categoryName } from './Badges'
import { MapCategoryChips } from './MapCategoryChips'
import { SpotPopup } from './SpotPopup'
import type { ReactNode } from 'react'
import type {
  AreaId,
  CityId,
  SpotCategory,
  TaiwanArea,
  TaiwanSpot,
} from '../../../../lib/taiwan-map/types'
import type { GeoFix, GeolocationStatus } from '../-lib/useGeolocation'
import type { BasemapPaintEntry, SpotLayerColors } from '../-lib/mapTheme'
import type { ResolvedTheme } from '../../../../lib/theme/theme'

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'

/**
 * 1 件だけ・「地図で見る」で寄るときのズームの上限。通りの名前と周りの
 * 店が見える程度にとどめる（16 以上だと周りが見えず、どこにいるのか
 * 分からなくなる）。すでにこれより寄っているときはそのままにする。
 */
const SPOT_ZOOM = 15

/**
 * ピンのクリック判定の半径（px）。描いた丸（半径 5〜6.5px）より広く取り、
 * 範囲内でいちばん近いピンを選ぶ。指で押す端末はさらに広くする
 */
const HIT_RADIUS_MOUSE = 14
const HIT_RADIUS_TOUCH = 22

/** ピンの中心からポップアップ・ツールチップまでの距離（ピン + 三角のぶん） */
const POPUP_GAP = 16
const TOOLTIP_GAP = 12
/** ポップアップを地図の縁から離す幅 */
const POPUP_MARGIN = 8

const SOURCE_ID = 'tw-spots'
const USER_SOURCE_ID = 'tw-user'
const ACCURACY_SOURCE_ID = 'tw-user-accuracy'
const HEADING_IMAGE = 'tw-heading-cone'
/** ピンの横に名前を出し始めるズーム */
const LABEL_MINZOOM = 14
const LAYER = {
  labels: 'tw-spot-labels',
  accuracy: 'tw-user-accuracy',
  accuracyLine: 'tw-user-accuracy-line',
  heading: 'tw-user-heading',
  user: 'tw-user',
  shadow: 'tw-spot-shadow',
  pins: 'tw-spot-pins',
  selectedHalo: 'tw-spot-selected-halo',
  selected: 'tw-spot-selected',
  focus: 'tw-spot-focus',
} as const

/** 精度の円はこれより大きければ打ち切る（数 km の円で地図が青く覆われないように） */
const MAX_ACCURACY_M = 2000
/** コンパスの値がこれより古ければ「コンパスは無い」とみなして GPS の向きに頼る */
const COMPASS_STALE_MS = 3000
/** GPS の進行方向を使う条件。止まっている・精度が悪いときの向きはでたらめ */
const GPS_HEADING_MIN_SPEED = 1
const GPS_HEADING_MAX_ACCURACY = 50
/** 向きの扇の描き直しの間隔（コンパスは 1 秒に数十回届く） */
const HEADING_FRAME_MS = 66

type Toast = { text: string; tone: 'info' | 'error' }

const TOASTS: Partial<Record<GeolocationStatus, Toast>> = {
  locating: { text: '現在地を取得中', tone: 'info' },
  denied: { text: '位置情報が許可されていません', tone: 'error' },
  timeout: {
    text: '現在地を取得できませんでした（時間切れ）',
    tone: 'error',
  },
  unavailable: { text: '現在地を取得できませんでした', tone: 'error' },
}
const OUTSIDE_TOAST: Toast = { text: '台湾の外にいます', tone: 'info' }

/**
 * 向きの扇の画像。点を中心に、上（北）へ開いた 60° の扇をぼかして描く。
 * 地図に合わせて icon-rotate で回す
 */
function headingConeImage(): ImageData | null {
  // pixelRatio 2 で足すので、地図の上では半径 50px の扇になる
  const size = 200
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const c = size / 2
  const gradient = ctx.createRadialGradient(c, c, 0, c, c, c)
  gradient.addColorStop(0, 'rgba(37, 99, 235, 0.6)')
  gradient.addColorStop(1, 'rgba(37, 99, 235, 0)')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.moveTo(c, c)
  ctx.arc(c, c, c, (-120 * Math.PI) / 180, (-60 * Math.PI) / 180)
  ctx.closePath()
  ctx.fill()
  return ctx.getImageData(0, 0, size, size)
}

/** 地図に重ねたジャンルチップの高さ。入れ物の中の絶対配置の要素を測る */
function chipsHeight(wrapper: HTMLElement | null): number {
  const chips = wrapper?.firstElementChild
  return chips instanceof HTMLElement ? chips.offsetHeight : 0
}

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
  /** ポップアップに出すエリア名を引く */
  areaById: ReadonlyMap<AreaId, TaiwanArea>
  /** ピンを押したときにポップアップを出すか（デスクトップだけ true） */
  popupEnabled: boolean
  /**
   * 選択を外す。ポップアップの × ・Esc、何も無い所を押したときに呼ぶ
   * （デスクトップ・スマホとも。スマホは地図の下端のカードが閉じる）
   */
  onClearSelection: () => void
  /** 現在地（親のメモリにだけある）。分からなければ null */
  userPosition: GeoFix | null
  locateStatus: GeolocationStatus
  /** 「現在地」ボタン。位置情報を取りに行くのは親。クリックの中で同期的に呼ぶ */
  onLocate: () => void
  /** ポップアップに出す現在地からの距離。台湾の外・分からなければ null */
  distanceById: ReadonlyMap<string, number> | null
  /** ポップアップの「地図で見る」。そのピンへ寄る */
  onShowOnMap: (id: string) => void
  /**
   * 地図の下端に重ねるもの（スマホの選んだ場所のカード）。現在地ボタン・
   * 状態の帯はこの上に積む（カードに隠れないように）
   */
  bottomCard?: ReactNode
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
function addSpotLayers(map: maplibregl.Map, c: SpotLayerColors) {
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
      'circle-color': c.shadow,
      'circle-opacity': c.shadowOpacity,
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
      'circle-color': ['case', visited, color, c.hollowFill],
      'circle-stroke-width': 2.5,
      'circle-stroke-color': ['case', visited, c.pinEdge, color],
    },
  })
  map.addLayer({
    id: LAYER.selectedHalo,
    type: 'circle',
    source: SOURCE_ID,
    filter: idFilter(null),
    paint: {
      'circle-radius': 14,
      'circle-color': c.select,
      'circle-stroke-width': 1,
      'circle-stroke-color': c.selectEdge,
    },
  })
  map.addLayer({
    id: LAYER.selected,
    type: 'circle',
    source: SOURCE_ID,
    filter: idFilter(null),
    paint: {
      'circle-radius': ['case', visited, 9, 7.5],
      'circle-color': ['case', visited, color, c.hollowFill],
      'circle-stroke-width': 3,
      'circle-stroke-color': ['case', visited, c.pinEdge, color],
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
      'circle-stroke-color': c.select,
    },
  })
  // 寄ったときだけピンの横に名前。重なる名前は maplibre が間引く。
  // 上にあるレイヤーほど先に場所を取るので、ベース地図の地名より優先される
  map.addLayer({
    id: LAYER.labels,
    type: 'symbol',
    source: SOURCE_ID,
    minzoom: LABEL_MINZOOM,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': [labelFont(map)],
      'text-size': 12,
      'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
      'text-radial-offset': 0.8,
      'text-justify': 'auto',
      'text-max-width': 9,
      'symbol-sort-key': ['-', 1, ['get', 'sortKey']],
    },
    paint: {
      'text-color': c.label,
      'text-halo-color': c.labelHalo,
      'text-halo-width': 1.6,
    },
  })
  // 現在地の精度の円。ピンを青く覆わないよう、ピンの影より下に描く
  map.addSource(ACCURACY_SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addLayer(
    {
      id: LAYER.accuracy,
      type: 'fill',
      source: ACCURACY_SOURCE_ID,
      paint: {
        'fill-color': c.user,
        'fill-opacity': c.accuracyFillOpacity,
      },
    },
    LAYER.shadow,
  )
  map.addLayer(
    {
      id: LAYER.accuracyLine,
      type: 'line',
      source: ACCURACY_SOURCE_ID,
      paint: {
        'line-color': c.user,
        'line-opacity': c.accuracyLineOpacity,
        'line-width': 1,
      },
    },
    LAYER.shadow,
  )
  // 現在地（向きの扇 + 青い点）。ピンより上に描く
  map.addSource(USER_SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  const cone = headingConeImage()
  if (cone && !map.hasImage(HEADING_IMAGE))
    map.addImage(HEADING_IMAGE, cone, { pixelRatio: 2 })
  map.addLayer({
    id: LAYER.heading,
    type: 'symbol',
    source: USER_SOURCE_ID,
    // 向きが分かっているときだけ（properties.heading がある）
    filter: ['has', 'heading'],
    layout: {
      'icon-image': HEADING_IMAGE,
      'icon-rotate': ['get', 'heading'],
      'icon-rotation-alignment': 'map',
      'icon-pitch-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })
  map.addLayer({
    id: LAYER.user,
    type: 'circle',
    source: USER_SOURCE_ID,
    paint: {
      'circle-radius': 6.5,
      'circle-color': c.user,
      'circle-stroke-width': 2.5,
      'circle-stroke-color': c.userEdge,
    },
  })
}

/**
 * 自前のレイヤーの色を配色に合わせて塗り直す（addSpotLayers と同じ値）。
 * ジャンル色はソースのデータ（spotsToFeatureCollection）側で替える
 */
function setSpotLayerColors(map: maplibregl.Map, c: SpotLayerColors) {
  const visited: maplibregl.ExpressionSpecification = ['get', 'visited']
  const color: maplibregl.ExpressionSpecification = ['get', 'color']
  const fill: maplibregl.ExpressionSpecification = [
    'case',
    visited,
    color,
    c.hollowFill,
  ]
  const edge: maplibregl.ExpressionSpecification = [
    'case',
    visited,
    c.pinEdge,
    color,
  ]
  map.setPaintProperty(LAYER.shadow, 'circle-color', c.shadow)
  map.setPaintProperty(LAYER.shadow, 'circle-opacity', c.shadowOpacity)
  for (const id of [LAYER.pins, LAYER.selected]) {
    map.setPaintProperty(id, 'circle-color', fill)
    map.setPaintProperty(id, 'circle-stroke-color', edge)
  }
  map.setPaintProperty(LAYER.selectedHalo, 'circle-color', c.select)
  map.setPaintProperty(LAYER.selectedHalo, 'circle-stroke-color', c.selectEdge)
  map.setPaintProperty(LAYER.focus, 'circle-stroke-color', c.select)
  map.setPaintProperty(LAYER.labels, 'text-color', c.label)
  map.setPaintProperty(LAYER.labels, 'text-halo-color', c.labelHalo)
  map.setPaintProperty(LAYER.accuracy, 'fill-color', c.user)
  map.setPaintProperty(LAYER.accuracy, 'fill-opacity', c.accuracyFillOpacity)
  map.setPaintProperty(LAYER.accuracyLine, 'line-color', c.user)
  map.setPaintProperty(
    LAYER.accuracyLine,
    'line-opacity',
    c.accuracyLineOpacity,
  )
  map.setPaintProperty(LAYER.user, 'circle-color', c.user)
  map.setPaintProperty(LAYER.user, 'circle-stroke-color', c.userEdge)
}

/** ベース地図の色の差し替え表と、style を読んだときの元の値（ライトに戻す用） */
type BasemapPaint = {
  plan: ReadonlyArray<BasemapPaintEntry>
  original: ReadonlyArray<unknown>
}

/** ベース地図をダークの色にする / style の元の色（ライト）に戻す */
function setBasemapTheme(
  map: maplibregl.Map,
  basemap: BasemapPaint,
  theme: ResolvedTheme,
) {
  basemap.plan.forEach((entry, i) => {
    if (!map.getLayer(entry.layerId)) return
    map.setPaintProperty(
      entry.layerId,
      entry.property,
      theme === 'dark' ? entry.dark : basemap.original[i],
    )
  })
}

/**
 * ピンの名前に使うフォント。style の glyphs にあるものしか使えないので、
 * ベース地図の symbol レイヤーが使っている Regular を借りる（見つからなければ
 * positron の既定の Noto Sans Regular）。漢字・かなは端末のフォントで描かれる
 */
function labelFont(map: maplibregl.Map): string {
  for (const layer of map.getStyle().layers) {
    if (layer.type !== 'symbol') continue
    const font: unknown = map.getLayoutProperty(layer.id, 'text-font')
    if (Array.isArray(font)) {
      const regular = font.find(
        (f): f is string => typeof f === 'string' && /Regular/.test(f),
      )
      if (regular) return regular
    }
  }
  return 'Noto Sans Regular'
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
  areaById,
  popupEnabled,
  onClearSelection,
  userPosition,
  locateStatus,
  onLocate,
  distanceById,
  onShowOnMap,
  bottomCard,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const { theme } = useTheme()
  /** style.load の中で読む今の配色（地図はマウント時に 1 度だけ作るので ref で渡す） */
  const themeRef = useRef(theme)
  /** ベース地図の色の差し替え表と元の値。style を読み終えるまでは null */
  const basemapRef = useRef<BasemapPaint | null>(null)
  const onSelectRef = useRef(onSelect)
  const onFlyDoneRef = useRef(onFlyDone)
  const spotsRef = useRef(spots)
  const activeCategoryRef = useRef(activeCategory)
  const onClearSelectionRef = useRef(onClearSelection)
  const userPositionRef = useRef(userPosition)
  /** 「現在地」を押して、位置が分かったらそこへ寄せる約束 */
  const flyToUserRef = useRef(false)
  /** 向きの扇に出している角度（なめらかにしたあと）。分からなければ null */
  const headingRef = useRef<number | null>(null)
  /** 最後にコンパスの値が届いた時刻 */
  const compassAtRef = useRef(0)
  /** style を読み終え、ピンのソースとレイヤーを足し終えたか */
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  /** ポップアップを出しているスポット。選択（selectedId）とは別に閉じられる */
  const [popupId, setPopupId] = useState<string | null>(selectedId ?? null)
  /** マウスが乗っているピン（名前のツールチップ用） */
  const [hoverId, setHoverId] = useState<string | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const chipsRef = useRef<HTMLDivElement>(null)
  /** ポップアップ・ツールチップを付けるピンの経緯度。地図の move で読む */
  const overlayLngLat = useRef<{
    popup: [number, number] | null
    hover: [number, number] | null
  }>({ popup: null, hover: null })
  /** キーボードの一覧から開いたとき、閉じたらフォーカスを戻す先 */
  const returnFocusRef = useRef<HTMLElement | null>(null)
  /** 次にポップアップを描いたらフォーカスを移すか（キーボードで開いたとき） */
  const focusPopupRef = useRef(false)

  // 一覧・URL など外から選択が変わったら、その場所のポップアップを開く
  // （描画中に前回の値と比べて state を合わせる。effect で setState しない）
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId)
  if (prevSelectedId !== selectedId) {
    setPrevSelectedId(selectedId)
    setPopupId(selectedId ?? null)
  }

  useEffect(() => {
    onSelectRef.current = onSelect
    onFlyDoneRef.current = onFlyDone
    spotsRef.current = spots
    activeCategoryRef.current = activeCategory
    onClearSelectionRef.current = onClearSelection
    userPositionRef.current = userPosition
    themeRef.current = theme
  })

  /**
   * 表示範囲の合わせ直しは、表示するスポットの顔ぶれが変わったときだけに
   * する。選択（selectedId）が変わっただけ、あるいは同じ中身の配列が
   * 作り直されただけで合わせ直すと、ピンを押すたびに地図が初期範囲へ
   * 跳ね戻って、見ていた場所を見失う。
   */
  const spotsKey = spotsKeyOf(spots)

  /**
   * ポップアップとツールチップを、今のピンの画面位置に合わせて動かす。
   * 地図は 1 秒に何十回も動くので React の state は通さず、style を直接
   * 書き換える（refs だけを読むので依存は無い）
   */
  const syncOverlays = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const container = map.getContainer()
    const size = {
      width: container.clientWidth,
      height: container.clientHeight,
    }
    const popup = popupRef.current
    const popupLngLat = overlayLngLat.current.popup
    if (popup && popupLngLat) {
      const placement = placePopup({
        anchor: map.project(popupLngLat),
        popup: { width: popup.offsetWidth, height: popup.offsetHeight },
        container: size,
        gap: POPUP_GAP,
        margin: POPUP_MARGIN,
        // 地図に重ねたジャンルチップ（折り返すと 2 段以上）には重ねない
        topInset: chipsHeight(chipsRef.current),
      })
      popup.style.visibility = placement.visible ? 'visible' : 'hidden'
      popup.style.transform = `translate(${Math.round(placement.left)}px, ${Math.round(placement.top)}px)`
      const arrow = popup.querySelector<HTMLElement>('[data-popup-arrow]')
      if (arrow) {
        arrow.style.left = `${placement.arrowX}px`
        const above = placement.side === 'above'
        arrow.style.top = above ? 'calc(100% - 6px)' : '-6px'
        arrow.style.borderWidth = above ? '0 1px 1px 0' : '1px 0 0 1px'
      }
    }
    const tooltip = tooltipRef.current
    const hoverLngLat = overlayLngLat.current.hover
    if (tooltip && hoverLngLat) {
      const p = map.project(hoverLngLat)
      const x = Math.round(p.x - tooltip.offsetWidth / 2)
      const y = Math.round(p.y - TOOLTIP_GAP - tooltip.offsetHeight)
      tooltip.style.transform = `translate(${x}px, ${y}px)`
      tooltip.style.visibility = 'visible'
    }
  }, [])

  // 地図本体はマウント時に 1 度だけ作る
  useEffect(() => {
    const city = getCity(fallbackCity)
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: STYLE_URL,
      center: [city.center.lng, city.center.lat],
      zoom: city.zoom,
      attributionControl: { compact: true },
      // 一覧を縦スクロールしている途中で地図に指・ホイールが乗ると、ページ
      // ではなく地図が動いて操作を奪われる。スマホは 2 本指、デスクトップは
      // Ctrl / ⌘ + ホイール（とトラックパッドのピンチ）でだけ拡大・縮小する
      // （理由は冒頭の「ホイール」）
      cooperativeGestures: true,
      locale: MAP_LOCALE_JA,
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
      // 地名・道路名は中国語（現地表記）だけにする。名前を出さない
      // レイヤー（道路番号など）・text-field の無いレイヤーはそのまま
      for (const layer of map.getStyle().layers) {
        if (layer.type !== 'symbol') continue
        const next = localizedTextField(
          map.getLayoutProperty(layer.id, 'text-field'),
        )
        if (next) map.setLayoutProperty(layer.id, 'text-field', next)
      }
      // ダークの色に差し替える前に、ライトに戻すための元の値を控える。
      // 最初の描画より前なので、ダークでも一瞬白い地図が見えることはない
      const plan = basemapPaintPlan(map.getStyle().layers)
      const basemap: BasemapPaint = {
        plan,
        original: plan.map((e) => map.getPaintProperty(e.layerId, e.property)),
      }
      basemapRef.current = basemap
      setBasemapTheme(map, basemap, themeRef.current)
      addSpotLayers(map, SPOT_LAYER_COLORS[themeRef.current])
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

    // クリック（タップ）はピンの丸より広い範囲で拾い、いちばん近いものを選ぶ
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches
    const hitRadius = coarsePointer ? HIT_RADIUS_TOUCH : HIT_RADIUS_MOUSE
    const nearestPinAt = (point: maplibregl.Point): string | null => {
      if (!map.getLayer(LAYER.pins)) return null
      const hits = map.queryRenderedFeatures(
        [
          [point.x - hitRadius, point.y - hitRadius],
          [point.x + hitRadius, point.y + hitRadius],
        ],
        { layers: [LAYER.pins] },
      )
      let best: { id: string; d: number } | null = null
      for (const f of hits) {
        const id: unknown = f.properties.id
        const spot = spotsRef.current.find((s) => s.id === id)
        if (!spot) continue
        const p = map.project([spot.location.lng, spot.location.lat])
        const d = Math.hypot(p.x - point.x, p.y - point.y)
        if (d <= hitRadius && (best === null || d < best.d))
          best = { id: spot.id, d }
      }
      return best?.id ?? null
    }
    map.on('click', (e) => {
      const id = nearestPinAt(e.point)
      // 何も無い所を押したら選択を外す（デスクトップはポップアップごと、
      // スマホは地図の下端のカードごと閉じる。× と同じ動き）
      setPopupId(id)
      if (id) {
        returnFocusRef.current = null
        onSelectRef.current(id)
      } else {
        onClearSelectionRef.current()
      }
    })
    map.on('mousemove', (e) => {
      const id = nearestPinAt(e.point)
      map.getCanvas().style.cursor = id ? 'pointer' : ''
      // タップのあとに来る疑似的な mousemove で名前が出しっぱなしにならないよう、
      // ツールチップはマウスのときだけ
      if (!coarsePointer) setHoverId(id)
    })
    map.getCanvas().addEventListener('mouseleave', () => setHoverId(null))
    map.on('move', syncOverlays)
    map.on('resize', syncOverlays)

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // fallbackCity はマウント時の初期位置にしか使わない
    // oxlint-disable-next-line react/exhaustive-deps
  }, [])

  // ポップアップ・ツールチップを付けるピンが変わったら、その位置へ置き直す
  const popupSpot =
    popupEnabled && popupId !== null
      ? spots.find((s) => s.id === popupId)
      : undefined
  const hoverSpot =
    hoverId !== null && hoverId !== popupSpot?.id
      ? spots.find((s) => s.id === hoverId)
      : undefined
  useLayoutEffect(() => {
    overlayLngLat.current = {
      popup: popupSpot
        ? [popupSpot.location.lng, popupSpot.location.lat]
        : null,
      hover: hoverSpot
        ? [hoverSpot.location.lng, hoverSpot.location.lat]
        : null,
    }
    syncOverlays()
    if (popupSpot && focusPopupRef.current) {
      focusPopupRef.current = false
      popupRef.current?.focus({ preventScroll: true })
    }
  }, [popupSpot, hoverSpot, syncOverlays])

  /** ポップアップの × ・Esc。ポップアップを閉じ、選択も外す */
  const closePopup = useCallback(() => {
    const hadFocus = popupRef.current?.contains(document.activeElement)
    setPopupId(null)
    onClearSelectionRef.current()
    if (!hadFocus) return
    // キーボードの一覧から開いていればそのボタンへ、そうでなければ地図へ戻す
    const back = returnFocusRef.current ?? mapRef.current?.getCanvas()
    back?.focus({ preventScroll: true })
    returnFocusRef.current = null
  }, [])

  // Esc で閉じる（選択も外す）
  const popupOpen = popupSpot !== undefined
  useEffect(() => {
    if (!popupOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) closePopup()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [popupOpen, closePopup])

  // ピンの中身を差し替える（ジャンル・配色を切り替えたら色も塗り直す）
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map
      .getSource<maplibregl.GeoJSONSource>(SOURCE_ID)
      ?.setData(
        spotsToFeatureCollection(spotsRef.current, activeCategory, theme),
      )
  }, [ready, spotsKey, activeCategory, theme])

  // 地図を開いたまま配色を切り替えたら、ベース地図と自前のレイヤーを塗り直す
  // （開いたときの配色は style.load で塗ってある）
  useEffect(() => {
    const map = mapRef.current
    const basemap = basemapRef.current
    if (!map || !ready || !basemap) return
    setBasemapTheme(map, basemap, theme)
    setSpotLayerColors(map, SPOT_LAYER_COLORS[theme])
  }, [ready, theme])

  // 表示範囲を絞り込み結果に合わせる（style を待たずに合わせてよい）
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const current = spotsRef.current
    if (current.length === 1) {
      const { lat, lng } = current[0].location
      map.jumpTo({ center: [lng, lat], zoom: SPOT_ZOOM })
    } else if (current.length > 1) {
      // 中心から外れた 1 割は囲まない（冒頭の「最初の表示範囲」）
      const bounds = coreBounds(current.map((s) => s.location))
      if (!bounds) return
      // 上は地図に重ねたジャンルチップのぶん空ける（チップはデスクトップで
      // 折り返して 2 段になることがある。スマホは横スクロールの 1 段）
      map.fitBounds(bounds, {
        padding: { top: 72, bottom: 48, left: 40, right: 56 },
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

  /** 現在地の点・向きの扇・精度の円を、refs の今の値で描き直す */
  const drawUser = useCallback(() => {
    const map = mapRef.current
    if (!map || !map.getSource(USER_SOURCE_ID)) return
    const pos = userPositionRef.current
    const heading = headingRef.current
    map.getSource<maplibregl.GeoJSONSource>(USER_SOURCE_ID)?.setData({
      type: 'FeatureCollection',
      features: pos
        ? [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [pos.lng, pos.lat] },
              properties: heading === null ? {} : { heading },
            },
          ]
        : [],
    })
    map.getSource<maplibregl.GeoJSONSource>(ACCURACY_SOURCE_ID)?.setData({
      type: 'FeatureCollection',
      features:
        pos && pos.accuracy > 0
          ? [
              {
                type: 'Feature',
                geometry: {
                  type: 'Polygon',
                  coordinates: [
                    circleRing(pos, Math.min(pos.accuracy, MAX_ACCURACY_M)),
                  ],
                },
                properties: {},
              },
            ]
          : [],
    })
  }, [])

  // 位置が変わったら描き直す。コンパスが無い（届いていない）ときは、
  // 動いていて精度がよいときだけ GPS の進行方向を向きに使う
  useEffect(() => {
    if (!ready) return
    if (Date.now() - compassAtRef.current > COMPASS_STALE_MS) {
      const p = userPosition
      headingRef.current =
        p &&
        p.heading !== null &&
        p.speed !== null &&
        p.speed > GPS_HEADING_MIN_SPEED &&
        p.accuracy <= GPS_HEADING_MAX_ACCURACY
          ? smoothHeading(headingRef.current, p.heading, 0.5)
          : null
    }
    drawUser()
    // 「現在地」を押して初めて位置が分かったときは、そこへ寄せる（ピンが
    // 遠くても一緒に見える範囲にはしない。「今どこにいるか」を見たくて
    // 押しているので）。台湾の外なら寄らない（台湾の地図が見えなくなるだけ）
    const map = mapRef.current
    if (map && userPosition && flyToUserRef.current) {
      flyToUserRef.current = false
      if (isInsideTaiwan(userPosition)) {
        map.easeTo({
          center: [userPosition.lng, userPosition.lat],
          zoom: Math.max(map.getZoom(), SPOT_ZOOM),
          duration: 600,
        })
      }
    }
  }, [ready, userPosition, drawUser])

  // 位置を追っているあいだだけコンパスを聞く（裏に回ったら止める）
  const tracking = locateStatus === 'locating' || locateStatus === 'ready'
  useEffect(() => {
    if (!ready || !tracking) return
    let stopCompass: (() => void) | null = null
    let last = 0
    let timer: number | null = null
    const onHeading = (deg: number) => {
      compassAtRef.current = Date.now()
      headingRef.current = smoothHeading(headingRef.current, deg, 0.3)
      // 毎回描き直すと重いので、間引いて描く
      if (timer !== null) return
      const wait = Math.max(0, HEADING_FRAME_MS - (Date.now() - last))
      timer = window.setTimeout(() => {
        timer = null
        last = Date.now()
        drawUser()
      }, wait)
    }
    const start = () => {
      if (stopCompass === null) stopCompass = watchCompass(onHeading)
    }
    const stop = () => {
      stopCompass?.()
      stopCompass = null
    }
    const onVisibility = () =>
      document.visibilityState === 'hidden' ? stop() : start()
    if (document.visibilityState !== 'hidden') start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [ready, tracking, drawUser])

  useEffect(() => {
    if (locateStatus === 'denied' || locateStatus === 'unavailable')
      flyToUserRef.current = false
    if (locateStatus === 'timeout') flyToUserRef.current = false
  }, [locateStatus])

  // 位置情報の状態の帯（地図の下端）。取得中のあいだは出し続け、それ以外は
  // 数秒で消す（地図に居座らせない）。取得中の帯は、地図のボタンを押したとき
  // だけ出す（許可済みで開いた時点から追うときは黙って取る）
  const [toast, setToast] = useState<Toast | null>(null)
  /** 地図のボタンを押して、最初の位置を待っているか */
  const [awaitingFix, setAwaitingFix] = useState(false)
  const [prevLocateStatus, setPrevLocateStatus] = useState(locateStatus)
  if (prevLocateStatus !== locateStatus) {
    setPrevLocateStatus(locateStatus)
    const next = TOASTS[locateStatus]
    if (next?.tone === 'error') {
      setToast(next)
      setAwaitingFix(false)
    } else if (locateStatus !== 'locating') {
      // 取れた（ready）→ 取得中の帯を下げる。台湾の外かどうかは下で
      if (toast === TOASTS.locating) setToast(null)
    }
  }
  if (awaitingFix && userPosition) {
    setAwaitingFix(false)
    setToast(isInsideTaiwan(userPosition) ? null : OUTSIDE_TOAST)
  }
  useEffect(() => {
    if (toast === null || toast === TOASTS.locating) return
    const t = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(t)
  }, [toast])

  /**
   * 現在地ボタン。iOS ではユーザー操作の外からの要求は捨てられるので、
   * 位置情報（onLocate）もコンパスの許可も、このクリックの中で同期的に求める
   */
  const handleLocate = () => {
    onLocate()
    requestCompassPermission()
    const map = mapRef.current
    if (userPosition && locateStatus === 'ready') {
      if (!isInsideTaiwan(userPosition)) {
        setToast(OUTSIDE_TOAST)
        return
      }
      map?.easeTo({
        center: [userPosition.lng, userPosition.lat],
        zoom: Math.max(map.getZoom(), SPOT_ZOOM),
        duration: 600,
      })
      return
    }
    flyToUserRef.current = true
    setAwaitingFix(true)
    setToast(TOASTS.locating ?? null)
  }

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
    <div className="tw-map relative h-full w-full">
      {/* ランドマークは親の <aside aria-label="地図"> が担うので、ここには role を付けない */}
      <div ref={containerRef} className="h-full w-full" />
      {/* ポップアップをチップの下に置くため、チップの高さを測る入れ物 */}
      <div ref={chipsRef}>
        <MapCategoryChips
          active={activeCategory}
          counts={categoryCounts}
          onChange={onCategoryChange}
        />
      </div>
      {hoverSpot && (
        <div
          ref={tooltipRef}
          aria-hidden
          style={{ visibility: 'hidden' }}
          className="pointer-events-none absolute top-0 left-0 z-10 max-w-60 truncate rounded-md bg-gray-900/85 px-2 py-0.5 text-xs font-medium text-white shadow dark:bg-gray-800/95 dark:text-gray-100 dark:ring-1 dark:ring-gray-600"
        >
          {hoverSpot.name}
        </div>
      )}
      {popupSpot && (
        <SpotPopup
          // スポットが変わったら作り直す（前の大きさのまま一瞬置かれないように）
          key={popupSpot.id}
          ref={popupRef}
          spot={popupSpot}
          areaName={
            popupSpot.area ? areaById.get(popupSpot.area)?.name : undefined
          }
          distance={distanceById?.get(popupSpot.id)}
          onShowOnMap={onShowOnMap}
          onClose={closePopup}
        />
      )}
      <SpotKeyboardList
        spots={spots}
        selectedId={selectedId}
        onActivate={(id, button) => {
          setPopupId(id)
          if (popupEnabled) {
            returnFocusRef.current = button
            focusPopupRef.current = true
          }
          onSelect(id)
        }}
        onFocusChange={setFocusedId}
      />
      {/* 地図の下端に積むもの（下から: 選んだ場所のカード・現在地ボタン・
          状態の帯）。右下の maplibre の帰属ボタン（(i)）の上から積む */}
      <div className="pointer-events-none absolute inset-x-2 bottom-10 z-20 flex flex-col items-end gap-2">
        {/* 読み上げのため role=status の入れ物は常に置き、中身だけ替える */}
        <div role="status" className="flex w-full justify-center">
          {toast && (
            <p
              className={`rounded-full px-3 py-1.5 text-xs font-medium shadow ${
                toast.tone === 'error'
                  ? 'bg-rose-600 text-white'
                  : 'bg-gray-900/85 text-white dark:bg-gray-800/95 dark:text-gray-100 dark:ring-1 dark:ring-gray-600'
              }`}
            >
              {toast.text}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleLocate}
          aria-label={
            locateStatus === 'ready' ? '現在地へ移動' : '現在地を表示'
          }
          title={locateStatus === 'ready' ? '現在地へ移動' : '現在地を表示'}
          // 位置を追っている・取りに行っているあいだは塗る（現在地の点と同じ青）
          className={`pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-md transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 dark:focus-visible:outline-cyan-400 ${
            tracking
              ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
          } ${locateStatus === 'locating' ? 'animate-pulse' : ''}`}
        >
          <Crosshair size={20} aria-hidden />
        </button>
        {bottomCard && (
          <div className="pointer-events-auto w-full">{bottomCard}</div>
        )}
      </div>
      {loadError && (
        <p className="pointer-events-none absolute inset-x-2 bottom-8 rounded-lg bg-white/90 px-3 py-2 text-xs text-gray-600 shadow dark:bg-gray-900/90 dark:text-gray-300">
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
 * 押すとピンを押したのと同じく選択し、デスクトップではポップアップを開いて
 * フォーカスをそこへ移す（Esc / × で閉じるとこのボタンに戻る）。
 */
function SpotKeyboardList({
  spots,
  selectedId,
  onActivate,
  onFocusChange,
}: {
  spots: ReadonlyArray<TaiwanSpot>
  selectedId: string | undefined
  onActivate: (id: string, button: HTMLButtonElement) => void
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
              onClick={(e) => onActivate(spot.id, e.currentTarget)}
              className="sr-only focus:not-sr-only focus:absolute focus:top-12 focus:left-2 focus:z-20 focus:max-w-[calc(100%-1rem)] focus:rounded-lg focus:border focus:border-cyan-500 focus:bg-white focus:px-3 focus:py-1.5 focus:text-sm focus:text-gray-900 focus:shadow focus:outline-none dark:focus:border-cyan-400 dark:focus:bg-gray-900 dark:focus:text-gray-100"
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
