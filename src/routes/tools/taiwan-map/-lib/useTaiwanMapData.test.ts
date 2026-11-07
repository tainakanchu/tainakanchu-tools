import { describe, expect, it, vi } from 'vitest'
import { findSpotCity, loadResults, spotLinkStatus } from './useTaiwanMapData'
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
    getManifest: vi.fn(() =>
      Promise.resolve({
        cities: [
          { id: 'taipei' as const, name: '台北', count: 2 },
          { id: 'tainan' as const, name: '台南', count: 1 },
        ],
        categories: [],
      }),
    ),
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

describe('loadResults の categoryCounts', () => {
  it('都市指定なら、その都市の全件からカテゴリ以外の条件で数える', async () => {
    const r = await loadResults(
      fakeRepo(),
      { city: 'taipei', category: 'food' },
      undefined,
    )
    expect(r.spots.map((s) => s.id)).toEqual(['a'])
    expect(r.categoryCounts.get('food')).toBe(1)
    expect(r.categoryCounts.get('drink')).toBe(1)
  })

  it('都市なしなら、読んでいない都市のぶんもインデックスから数える', async () => {
    const r = await loadResults(fakeRepo(), { category: 'food' }, undefined)
    // 読んだのは taipei だけだが、tainan の drink も数に入る
    expect(r.cities).toEqual(['taipei'])
    expect(r.categoryCounts.get('drink')).toBe(2)
    expect(r.categoryCounts.get('food')).toBe(1)
  })
})

describe('loadResults の cityCounts / areaCounts', () => {
  it('都市指定なら manifest の件数を使う', async () => {
    const repo = fakeRepo()
    const r = await loadResults(repo, { city: 'taipei' }, undefined)
    expect(repo.getManifest).toHaveBeenCalledTimes(1)
    expect(Object.fromEntries(r.cityCounts!)).toEqual({ taipei: 2, tainan: 1 })
  })

  it('都市なしなら読んだインデックスから数え、manifest は読まない', async () => {
    const repo = fakeRepo()
    const r = await loadResults(repo, { category: 'food' }, undefined)
    expect(repo.getManifest).not.toHaveBeenCalled()
    expect(r.cityCounts?.get('taipei')).toBe(2)
    expect(r.cityCounts?.get('tainan')).toBe(1)
    expect(r.cityCounts?.get('kaohsiung')).toBe(0)
  })

  it('manifest が読めなくても一覧は出し、cityCounts は null', async () => {
    const repo = fakeRepo()
    repo.getManifest.mockImplementation(() =>
      Promise.reject(new Error('offline')),
    )
    const r = await loadResults(repo, { city: 'taipei' }, undefined)
    expect(r.spots).toHaveLength(2)
    expect(r.cityCounts).toBeNull()
  })

  it('エリアの件数は読んだ都市の全件から数える', async () => {
    const repo = fakeRepo()
    repo.getCity.mockImplementation(() =>
      Promise.resolve({
        city: 'taipei' as const,
        areas: [],
        spots: [
          { ...spot('a', 'taipei', ['food']), area: 'dadaocheng' },
          { ...spot('b', 'taipei', ['drink']), area: 'dadaocheng' },
          spot('c', 'taipei', ['drink']),
        ],
      }),
    )
    const r = await loadResults(
      repo,
      { city: 'taipei', category: 'food' },
      undefined,
    )
    expect(r.spots.map((s) => s.id)).toEqual(['a'])
    expect(Object.fromEntries(r.areaCounts)).toEqual({ dadaocheng: 2 })
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

describe('spotLinkStatus の elsewhere', () => {
  it('読んだ都市に無く、別の都市にあると分かれば elsewhere', async () => {
    const repo = fakeRepo()
    const taipei = await loadResults(repo, { city: 'taipei' }, undefined)
    // ?city=taipei&spot=c（c は台南の店）
    expect(spotLinkStatus('c', taipei)).toBe('missing')
    expect(spotLinkStatus('c', taipei, 'tainan')).toBe('elsewhere')
    // 調べた都市が今の都市と同じなら（起きないはずだが）missing のまま
    expect(spotLinkStatus('zzz', taipei, 'taipei')).toBe('missing')
  })
})

describe('findSpotCity', () => {
  it('インデックスからスポットの都市を引く', async () => {
    const repo = fakeRepo()
    await expect(findSpotCity(repo, 'c')).resolves.toBe('tainan')
    await expect(findSpotCity(repo, 'nope')).resolves.toBeUndefined()
  })
})
