import { describe, expect, it, vi } from 'vitest'
import { createStaticRepository } from './staticRepository.ts'

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body) }
}

describe('createStaticRepository', () => {
  it('都市ごとのファイルを baseUrl から読む', async () => {
    const fetch = vi.fn((url: string) => Promise.resolve(okResponse({ url })))
    const repo = createStaticRepository({ baseUrl: '/d', fetch })
    await expect(repo.getCity('tainan')).resolves.toEqual({
      url: '/d/tainan.json',
    })
    await repo.getManifest()
    await repo.getSpotIndex()
    expect(fetch.mock.calls.map(([u]) => u)).toEqual([
      '/d/tainan.json',
      '/d/manifest.json',
      '/d/spot-index.json',
    ])
  })

  it('同時・後続の同じリクエストは 1 回の fetch にまとめる', async () => {
    const fetch = vi.fn(() => Promise.resolve(okResponse([])))
    const repo = createStaticRepository({ fetch })
    await Promise.all([repo.getSpotIndex(), repo.getSpotIndex()])
    await repo.getSpotIndex()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('失敗したらキャッシュを捨て、次の呼び出しで取り直す', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve(null),
      })
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(okResponse({ cities: [] }))
    const repo = createStaticRepository({ fetch })
    await expect(repo.getManifest()).rejects.toThrow('HTTP 503')
    await expect(repo.getManifest()).rejects.toThrow('offline')
    await expect(repo.getManifest()).resolves.toEqual({ cities: [] })
    expect(fetch).toHaveBeenCalledTimes(3)
  })
})
