import { describe, expect, it } from 'vitest'
import { shouldPrefetchOnIdle } from './loadMapView'

describe('shouldPrefetchOnIdle', () => {
  it('回線情報が無ければ先読みする', () => {
    expect(shouldPrefetchOnIdle(undefined)).toBe(true)
    expect(shouldPrefetchOnIdle({})).toBe(true)
  })

  it('データセーバー有効なら先読みしない', () => {
    expect(shouldPrefetchOnIdle({ saveData: true, effectiveType: '4g' })).toBe(
      false,
    )
  })

  it('2G 相当の回線では先読みしない', () => {
    expect(shouldPrefetchOnIdle({ effectiveType: '2g' })).toBe(false)
    expect(shouldPrefetchOnIdle({ effectiveType: 'slow-2g' })).toBe(false)
    expect(shouldPrefetchOnIdle({ effectiveType: '3g' })).toBe(true)
  })
})
