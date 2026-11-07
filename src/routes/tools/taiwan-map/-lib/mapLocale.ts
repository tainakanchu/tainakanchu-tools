/**
 * maplibre の UI 文言（ボタンの title・aria-label、2 本指の案内など）の日本語版。
 * Map の locale オプションに渡す。キーは maplibre-gl の defaultLocale と同じ
 * （src/ui/default_locale.ts）。足りないキーは英語のまま出るだけで壊れない。
 */
export const MAP_LOCALE_JA: Record<string, string> = {
  'AttributionControl.ToggleAttribution': '地図の出典を表示',
  'AttributionControl.MapFeedback': '地図の誤りを報告',
  'FullscreenControl.Enter': '全画面で表示',
  'FullscreenControl.Exit': '全画面表示をやめる',
  'GeolocateControl.FindMyLocation': '現在地を表示',
  'GeolocateControl.LocationNotAvailable': '現在地を取得できません',
  'LogoControl.Title': 'MapLibre のロゴ',
  'Map.Title': '地図',
  'Marker.Title': '地図上の目印',
  'NavigationControl.ResetBearing': 'ドラッグで回転、クリックで北を上に戻す',
  'NavigationControl.ZoomIn': '拡大',
  'NavigationControl.ZoomOut': '縮小',
  'Popup.Close': '閉じる',
  'GlobeControl.Enable': '地球儀で表示',
  'GlobeControl.Disable': '平面で表示',
  'TerrainControl.Enable': '地形を表示',
  'TerrainControl.Disable': '地形を隠す',
  'CooperativeGesturesHandler.WindowsHelpText':
    'Ctrl キーを押しながらスクロールすると拡大・縮小できます',
  'CooperativeGesturesHandler.MacHelpText':
    '⌘ キーを押しながらスクロールすると拡大・縮小できます',
  'CooperativeGesturesHandler.MobileHelpText': '2 本の指で地図を動かせます',
}
