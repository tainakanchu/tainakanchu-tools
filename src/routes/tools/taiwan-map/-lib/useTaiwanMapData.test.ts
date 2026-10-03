import { describe, expect, it, vi } from 'vitest'
import { loadResults, spotLinkStatus } from './useTaiwanMapData'
import type { TaiwanMapRepository } from '../../../../lib/taiwan-map/repository'
import type {
  CityData,
  CityId,
  SpotIndexEntry,
  TaiwanSpot,
} from '../../../../lib/taiwan-map/types'

function spot(
  id: string,
  city: CityId,
  categories: TaiwanSpot['categories'],
): TaiwanSpot {
  return {
    id,
    name: id,
    city,
    location: { lat: 25, lng: 121.5 },
    categories,
    status: 'visited',
    summary: 'x',
  }
}

const cityData: Partial<Record<CityId, CityData>> = {
  taipei: {
    city: 'taipei',
    areas: [],
    spots: [spot('a', 'taipei', ['food']), spot('b', 'taipei', ['drink'])],
  },
  tainan: {
    city: 'tainan',
    areas: [],
    spots: [spot('c', 'tainan', ['drink'])],
  },
}

const index: Array<SpotIndexEntry> = Object.values(cityData).flatMap((c) =>
  c.spots.map((s) => ({
    id: s.id,
    name: s.name,
    city: s.city,
    lat: 25,
    lng: 121.5,
    categories: s.categories,
    status: s.status,
  })),
)

function fakeRepo() {
  const repo = {
    getManifest: vi.fn(),
    getSpotIndex: vi.fn(() => Promise.resolve(index)),
    getCity: vi.fn((id: CityId) => Promise.resolve(cityData[id]!)),
  } satisfies TaiwanMapRepository
  return repo
}

describe('loadResults', () => {
  it('都市指定ならその都市だけを読み、インデックスは読まない', async () => {
    const repo = fakeRepo()
    const r = await loadResults(repo, { city: 'taipei' }, undefined)
    expect(repo.getSpotIndex).not.toHaveBeenCalled()
    expect(repo.getCity.mock.calls.map(([id]) => id)).toEqual(['taipei'])
    expect(r.spots.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('都市なしの条件は、該当する都市だけを読む', async () => {
    const repo = fakeRepo()
    const r = await loadResults(repo, { category: 'food' }, undefined)
    expect(repo.getCity.mock.calls.map(([id]) => id)).toEqual(['taipei'])
    expect(r.spots.map((s) => s.id)).toEqual(['a'])
    // インデックスを読んだので、他都市のスポットも「存在する」と分かる
    expect(r.knownSpotIds.has('c')).toBe(true)
  })

  it('?spot= だけならそのスポットの都市を割り出して読む', async () => {
    const repo = fakeRepo()
    const r = await loadResults(repo, {}, 'c')
    expect(r.resolvedSpotCity).toBe('tainan')
    expect(repo.getCity.mock.calls.map(([id]) => id)).toEqual(['tainan'])
  })

  it('存在しない ?spot= は何も読まず、resolvedSpotCity も無い', async () => {
    const repo = fakeRepo()
    const r = await loadResults(repo, {}, 'nope')
    expect(r.resolvedSpotCity).toBeUndefined()
    expect(repo.getCity).not.toHaveBeenCalled()
  })
})

describe('spotLinkStatus', () => {
  it('shown / filtered / missing を見分ける', async () => {
    const repo = fakeRepo()
    const taipei = await loadResults(
      repo,
      { city: 'taipei', category: 'food' },
      undefined,
    )
    expect(spotLinkStatus(undefined, taipei)).toBeNull()
    expect(spotLinkStatus('a', null)).toBeNull()
    expect(spotLinkStatus('a', taipei)).toBe('shown')
    expect(spotLinkStatus('b', taipei)).toBe('filtered')
    // ?city=taipei&spot=nonexistent-id
    expect(spotLinkStatus('nonexistent-id', taipei)).toBe('missing')
  })
})
