import { describe, expect, it } from 'vitest'
import { buildSampleDoc } from './sample'
import { GRID_IMAGE, buildGridImageModel } from './shareGridImage'
import { shareImageFileName } from './shareImage'
import type { GridMeasure } from './shareGridImage'
import type { TimetableAct, TimetableDoc } from './types'

/** 1 字 = 文字の大きさ分の幅とみなす(実際の字幅より広めで、厳しい側に倒れる) */
const measure: GridMeasure = (text, size) => Array.from(text).length * size

function docWithVenues(
  count: number,
  acts?: Array<TimetableAct>,
): TimetableDoc {
  const venues = Array.from({ length: count }, (_, i) => ({
    id: `v${i}`,
    name: `ステージ${i}`,
  }))
  return {
    version: 1,
    title: 'テストフェス',
    timezone: 'Asia/Tokyo',
    days: [
      { id: 'd1', date: '2026-11-07', label: 'DAY1' },
      { id: 'd2', date: '2026-11-08' },
    ],
    venues,
    acts: acts ?? [
      ...venues.map((v, i) => ({
        id: `a${i}`,
        dayId: 'd1',
        venueId: v.id,
        start: '13:00',
        end: '13:40',
        title: `出演者${i}`,
      })),
      {
        id: 'other-day',
        dayId: 'd2',
        venueId: 'v0',
        start: '10:00',
        end: '11:00',
        title: '別の日',
      },
    ],
  }
}

describe('buildGridImageModel', () => {
  it('その日に出演のある会場だけを、並び順どおりの列にする', () => {
    const doc = buildSampleDoc()
    const day = doc.days[0]
    const model = buildGridImageModel(doc, day.id, new Set(), measure)!
    const used = doc.venues.filter((v) =>
      doc.acts.some((a) => a.dayId === day.id && a.venueId === v.id),
    )
    expect(model.columns.map((c) => c.venueId)).toEqual(used.map((v) => v.id))
    expect(model.blocks).toHaveLength(
      doc.acts.filter((a) => a.dayId === day.id).length,
    )
  })

  it('別の日の出演は描かない。出演の無い日は null', () => {
    const doc = docWithVenues(3)
    const model = buildGridImageModel(doc, 'd1', new Set(), measure)!
    expect(model.blocks.map((b) => b.actId)).not.toContain('other-day')
    expect(buildGridImageModel(doc, 'nope', new Set(), measure)).toBeNull()
    const empty = { ...doc, acts: doc.acts.filter((a) => a.dayId === 'd1') }
    expect(buildGridImageModel(empty, 'd2', new Set(), measure)).toBeNull()
  })

  it('会場が少なければ幅 1080px で、列が等分される', () => {
    const model = buildGridImageModel(
      docWithVenues(5),
      'd1',
      new Set(),
      measure,
    )!
    expect(model.width).toBe(1080)
    const { columns } = model
    expect(columns[0].x).toBe(model.grid.left)
    const last = columns[columns.length - 1]
    expect(last.x + last.w).toBeCloseTo(model.grid.right)
    expect(new Set(columns.map((c) => c.w.toFixed(3))).size).toBe(1)
  })

  it('会場が多いと横に広げて列幅を保ち、広げすぎない', () => {
    const twelve = buildGridImageModel(
      docWithVenues(12),
      'd1',
      new Set(),
      measure,
    )!
    expect(twelve.width).toBeGreaterThan(1080)
    expect(twelve.width).toBeLessThanOrEqual(GRID_IMAGE.maxWidth)
    expect(twelve.columns[0].w).toBeGreaterThanOrEqual(GRID_IMAGE.minColW)

    const thirty = buildGridImageModel(
      docWithVenues(30),
      'd1',
      new Set(),
      measure,
    )!
    expect(thirty.width).toBe(GRID_IMAGE.maxWidth)
    expect(thirty.columns).toHaveLength(30)
  })

  it('時刻は縦の位置に比例し、短い出演も最小の高さを持つ', () => {
    const acts: Array<TimetableAct> = [
      {
        id: 'long',
        dayId: 'd1',
        venueId: 'v0',
        start: '13:00',
        end: '14:00',
        title: 'A',
      },
      {
        id: 'short',
        dayId: 'd1',
        venueId: 'v1',
        start: '14:30',
        end: '14:35',
        title: 'B',
      },
    ]
    const model = buildGridImageModel(
      docWithVenues(2, acts),
      'd1',
      new Set(),
      measure,
    )!
    const long = model.blocks.find((b) => b.actId === 'long')!
    const short = model.blocks.find((b) => b.actId === 'short')!
    expect(long.y).toBe(model.grid.top + 1)
    expect(long.h).toBeCloseTo(60 * model.pxPerMin - 3)
    expect(short.y).toBeCloseTo(model.grid.top + 90 * model.pxPerMin + 1)
    expect(short.h).toBe(GRID_IMAGE.minBlockH)
    // 13:00 から 15:00 まで 30 分ごとの線
    expect(model.hours.map((h) => h.label)).toEqual([
      '13:00',
      '13:30',
      '14:00',
      '14:30',
      '15:00',
    ])
    expect(model.hours.filter((h) => h.major)).toHaveLength(3)
  })

  it('お気に入りは ★ を付けて太字にし、数を見出しに出す', () => {
    const doc = docWithVenues(3)
    const model = buildGridImageModel(doc, 'd1', new Set(['a1']), measure)!
    const fav = model.blocks.find((b) => b.actId === 'a1')!
    const other = model.blocks.find((b) => b.actId === 'a0')!
    expect(fav.fav).toBe(true)
    expect(fav.weight).toBe(700)
    expect(fav.lines[0].startsWith('★ ')).toBe(true)
    expect(other.fav).toBe(false)
    expect(other.lines.join('')).not.toContain('★')
    // 塗らない出演は左帯のぶん字を右に寄せる
    expect(other.textX - other.x).toBeGreaterThan(fav.textX - fav.x)
    expect(model.favoriteCount).toBe(1)
    expect(model.note?.text).toBe('★ お気に入り 1 組')
    expect(model.day.label).toBe('11/7(土) DAY1')
  })

  it('出演名は枠の幅と高さに収まるように折り返す', () => {
    const acts: Array<TimetableAct> = [
      {
        id: 'x',
        dayId: 'd1',
        venueId: 'v0',
        start: '13:00',
        end: '13:20',
        title: 'とてもとても長い名前のバンドとその仲間たち feat. ゲスト',
      },
      {
        id: 'y',
        dayId: 'd1',
        venueId: 'v1',
        start: '13:00',
        end: '14:00',
        title: 'とてもとても長い名前のバンドとその仲間たち feat. ゲスト',
      },
    ]
    // 8 会場ぶんの列にして、列を細くする
    const fillers = Array.from({ length: 6 }, (_, i) => ({
      id: `f${i}`,
      dayId: 'd1',
      venueId: `v${i + 2}`,
      start: '15:00',
      end: '15:30',
      title: 'F',
    }))
    const model = buildGridImageModel(
      docWithVenues(8, [...acts, ...fillers]),
      'd1',
      new Set(),
      measure,
    )!
    for (const block of model.blocks) {
      const textW = block.x + block.w - 6 - block.textX
      for (const line of block.lines) {
        expect(
          measure(line, GRID_IMAGE.titleSize, 400, ''),
        ).toBeLessThanOrEqual(textW)
      }
      const used =
        block.lines.length * GRID_IMAGE.titleLh +
        (block.time ? GRID_IMAGE.timeLh : 0)
      expect(used).toBeLessThanOrEqual(block.h - GRID_IMAGE.blockPadY * 2)
      // 時刻の行も枠の下端より上に収まる
      if (block.time) {
        expect(block.time.y + GRID_IMAGE.timeLh / 2).toBeLessThanOrEqual(
          block.y + block.h,
        )
      }
    }
    for (const id of ['x', 'y']) {
      const block = model.blocks.find((b) => b.actId === id)!
      expect(block.lines.at(-1)?.endsWith('…')).toBe(true)
    }
    const tall = model.blocks.find((b) => b.actId === 'y')!
    expect(tall.lines.length).toBeGreaterThan(1)
    // 時刻が幅に収まらない列では開始時刻だけにする
    expect(tall.time?.text).toBe('13:00〜')
  })

  it('長い日でも iOS の canvas の面積の上限を超えない', () => {
    const acts: Array<TimetableAct> = [
      {
        id: 'all',
        dayId: 'd1',
        venueId: 'v0',
        start: '00:00',
        end: '42:00',
        title: 'オールナイト',
      },
    ]
    const doc = docWithVenues(16, [
      ...acts,
      ...Array.from({ length: 15 }, (_, i) => ({
        id: `b${i}`,
        dayId: 'd1',
        venueId: `v${i + 1}`,
        start: '12:00',
        end: '12:30',
        title: `B${i}`,
      })),
    ])
    const model = buildGridImageModel(doc, 'd1', new Set(), measure)!
    expect(model.width * model.height).toBeLessThanOrEqual(GRID_IMAGE.maxArea)
    expect(model.pxPerMin).toBeLessThan(GRID_IMAGE.pxPerMin)
  })
})

describe('shareImageFileName', () => {
  it('タイムテーブル形式は日付入りの名前にできる', () => {
    expect(shareImageFileName('Fes 2026', '20261107-timetable')).toBe(
      'Fes-2026-20261107-timetable.png',
    )
    expect(shareImageFileName('Fes 2026')).toBe('Fes-2026-my.png')
  })
})
