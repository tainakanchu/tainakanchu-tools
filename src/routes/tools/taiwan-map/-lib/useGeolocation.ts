/**
 * 現在地（「近い順」・地図の現在地ボタン用）。
 *
 * - 位置情報の許可ダイアログは、ボタン（地図の現在地・一覧の「近い順」）を
 *   押したときだけ出す。押す前に geolocation は一切呼ばない。
 *   例外は、このサイトに対してすでに許可されている（Permissions API の
 *   state が 'granted'）とき。ダイアログは出ないので、開いた時点から追う
 * - request() はクリックの処理の中で同期的に呼ぶこと。iOS の Safari は
 *   ユーザー操作の外（await や setTimeout のあと）からの要求を黙って捨てる
 * - 取れた位置はこのフックの state にだけ持つ。URL・localStorage・
 *   サーバーには出さない（共有リンクに現在地が混ざらないように）。
 *   ページを離れれば消える
 * - 一度許可されたら watchPosition で追い続ける（歩きながら「近い順」が
 *   ずれていかないように）。タブが裏に回ったら止め（電池を食わない）、
 *   戻ってきたらすぐ 1 回取り直してから追い直す
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LatLng } from '../../../../lib/taiwan-map/types'

export type GeolocationStatus =
  'idle' | 'locating' | 'ready' | 'denied' | 'timeout' | 'unavailable'

export type GeoFix = LatLng & {
  /** 精度（m、半径） */
  accuracy: number
  /** GPS の進行方向（度、北から時計回り）。止まっている・分からなければ null */
  heading: number | null
  /** 速さ（m/s）。分からなければ null */
  speed: number | null
}

export type Geolocation = {
  position: GeoFix | null
  status: GeolocationStatus
  /** 現在地を取りに行く（すでに追っていれば何もしない）。クリックの中で同期的に呼ぶ */
  request: () => void
}

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 30_000,
  timeout: 20_000,
}

function toFix(p: GeolocationPosition): GeoFix {
  const { latitude, longitude, accuracy, heading, speed } = p.coords
  return {
    lat: latitude,
    lng: longitude,
    accuracy,
    heading: heading !== null && Number.isFinite(heading) ? heading : null,
    speed: speed !== null && Number.isFinite(speed) ? speed : null,
  }
}

export function useGeolocation(): Geolocation {
  const [position, setPosition] = useState<GeoFix | null>(null)
  const [status, setStatus] = useState<GeolocationStatus>('idle')
  const watchId = useRef<number | null>(null)
  /** 追いたい（ボタンを押した・許可済み）か。裏に回って止めても true のまま */
  const wanted = useRef(false)
  const hasFix = useRef(false)

  const clearWatch = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
  }, [])

  const onSuccess = useCallback((p: GeolocationPosition) => {
    hasFix.current = true
    setPosition(toFix(p))
    setStatus('ready')
  }, [])

  const onError = useCallback(
    (e: GeolocationPositionError) => {
      if (e.code === e.PERMISSION_DENIED) {
        wanted.current = false
        hasFix.current = false
        clearWatch()
        setPosition(null)
        setStatus('denied')
        return
      }
      // 一度取れたあとの一時的な失敗（地下・トンネルなど）は、最後の位置の
      // まま追い続ける。最初の 1 回が取れないときは止めて、押し直せるようにする
      if (hasFix.current) return
      wanted.current = false
      clearWatch()
      setStatus(e.code === e.TIMEOUT ? 'timeout' : 'unavailable')
    },
    [clearWatch],
  )

  const startWatch = useCallback(() => {
    if (watchId.current !== null) return
    watchId.current = navigator.geolocation.watchPosition(
      onSuccess,
      onError,
      WATCH_OPTIONS,
    )
  }, [onSuccess, onError])

  const request = useCallback(() => {
    if (watchId.current !== null) return
    if (!('geolocation' in navigator)) {
      setStatus('unavailable')
      return
    }
    wanted.current = true
    if (!hasFix.current) setStatus('locating')
    startWatch()
  }, [startWatch])

  // すでに許可されていれば、開いた時点から追う（ダイアログは出ない）。
  // 許可されていない・分からない（Permissions API が無い）ときは何もしない
  useEffect(() => {
    let cancelled = false
    const permissions = navigator.permissions as Permissions | undefined
    if (!permissions || !('geolocation' in navigator)) return
    permissions.query({ name: 'geolocation' }).then(
      (state) => {
        if (!cancelled && state.state === 'granted') request()
      },
      () => {},
    )
    return () => {
      cancelled = true
    }
  }, [request])

  // 裏に回ったら止め、戻ってきたらすぐ取り直して追い直す
  useEffect(() => {
    const onVisibility = () => {
      if (!wanted.current) return
      if (document.visibilityState === 'hidden') {
        clearWatch()
        return
      }
      if (watchId.current !== null) return
      navigator.geolocation.getCurrentPosition(onSuccess, onError, {
        ...WATCH_OPTIONS,
        maximumAge: 0,
      })
      startWatch()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [clearWatch, onSuccess, onError, startWatch])

  useEffect(() => clearWatch, [clearWatch])

  return { position, status, request }
}
