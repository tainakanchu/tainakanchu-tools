import { describe, expect, it } from 'vitest'
import {
  deselectAction,
  filterFromSearch,
  historyMode,
  orderTaiwanMapSearch,
  parseTaiwanMapSearch,
  serializeTaiwanMapSearch,
  shareableSearch,
  unselectedKey,
} from './query.ts'

describe('parseTaiwanMapSearch', () => {
  it('既知の値だけを拾う', () => {
    expect(
      parseTaiwanMapSearch({
        city: 'taipei',
        area: 'dadaocheng',
        category: 'music',
        status: 'visited',
        label: 'favorite',
        spot: 'sidoli-radio',
        view: 'map',
      }),
    ).toEqual({
      city: 'taipei',
      area: 'dadaocheng',
      category: 'music',
      status: 'visited',
      label: 'favorite',
      spot: 'sidoli-radio',
      view: 'map',
    })
  })

  it('未知の値・型違い・余計なキーは黙って捨てる', () => {
    expect(
      parseTaiwanMapSearch({
        city: 'tokyo',
        category: ['food'],
        status: 'went',
        label: 1,
        area: '<script>',
        spot: '../etc/passwd',
        view: 'grid',
        utm_source: 'x',
      }),
    ).toEqual({})
  })

  it('view=list は既定値なので結果に含めない', () => {
    expect(parseTaiwanMapSearch({ view: 'list' })).toEqual({})
  })

  it('数字だけの id（JSON として number で届く）も受け付ける', () => {
    expect(parseTaiwanMapSearch({ spot: 101 })).toEqual({ spot: '101' })
  })

  it('検索語は文字列にして受け付け、空白だけなら捨てる', () => {
    expect(parseTaiwanMapSearch({ q: '牛肉 深夜' })).toEqual({
      q: '牛肉 深夜',
    })
    expect(parseTaiwanMapSearch({ q: 101 })).toEqual({ q: '101' })
    expect(parseTaiwanMapSearch({ q: '   ' })).toEqual({})
    expect(parseTaiwanMapSearch({ q: ['a'] })).toEqual({})
  })

  it('長すぎる検索語は切る', () => {
    expect(parseTaiwanMapSearch({ q: 'あ'.repeat(500) }).q).toHaveLength(100)
  })
})

describe('serializeTaiwanMapSearch', () => {
  it('キー順を固定し、未指定のキーは出さない', () => {
    expect(
      serializeTaiwanMapSearch({
        spot: 'x',
        category: 'food',
        city: 'taipei',
      }),
    ).toBe('city=taipei&category=food&spot=x')
    expect(serializeTaiwanMapSearch({})).toBe('')
  })

  it('parse と往復できる', () => {
    const search = {
      city: 'taipei',
      area: 'dadaocheng',
      status: 'want_to_go',
    } as const
    const round = parseTaiwanMapSearch(
      Object.fromEntries(new URLSearchParams(serializeTaiwanMapSearch(search))),
    )
    expect(round).toEqual(search)
  })
})

describe('filterFromSearch', () => {
  it('spot と view は絞り込み条件に含めない', () => {
    const filter = filterFromSearch({ city: 'taipei', spot: 'x', view: 'map' })
    expect(filter).not.toHaveProperty('spot')
    expect(filter).not.toHaveProperty('view')
    expect(filter.city).toBe('taipei')
  })
})

describe('orderTaiwanMapSearch', () => {
  it('キーを serialize と同じ順に並べ、undefined を落とす', () => {
    const ordered = orderTaiwanMapSearch({
      view: 'map',
      spot: 'x',
      category: undefined,
      city: 'taipei',
    })
    expect(Object.keys(ordered)).toEqual(['city', 'spot', 'view'])
    expect(new URLSearchParams(ordered).toString()).toBe(
      serializeTaiwanMapSearch(ordered),
    )
  })
})

describe('shareableSearch', () => {
  it('選択中のスポットと表示の切り替えは共有リンクに含めない', () => {
    expect(
      serializeTaiwanMapSearch(
        shareableSearch({
          city: 'taipei',
          category: 'food',
          spot: 'jiang-niu-lou',
          view: 'map',
        }),
      ),
    ).toBe('city=taipei&category=food')
  })
  it('検索語は共有リンクに含める', () => {
    expect(
      serializeTaiwanMapSearch(
        shareableSearch({ city: 'taipei', q: '牛肉', spot: 'x' }),
      ),
    ).toBe('city=taipei&q=%E7%89%9B%E8%82%89')
  })
})

describe('unselectedKey', () => {
  it('spot だけを外した URL（キー順は固定）', () => {
    expect(unselectedKey({ spot: 'a', view: 'map', city: 'taipei' })).toBe(
      'city=taipei&view=map',
    )
  })
})

describe('deselectAction', () => {
  it('何も選んでいなければ何もしない', () => {
    expect(deselectAction({ city: 'taipei' }, 'city=taipei')).toBe('none')
    expect(deselectAction({ city: 'taipei' }, undefined)).toBe('none')
  })

  it('選んだときに積んだ履歴（印が今の画面から spot を外した URL）なら戻る', () => {
    expect(deselectAction({ city: 'taipei', spot: 'a' }, 'city=taipei')).toBe(
      'back',
    )
    expect(
      deselectAction(
        { city: 'taipei', spot: 'a', view: 'map' },
        'city=taipei&view=map',
      ),
    ).toBe('back')
  })

  it('印が無い（共有リンクで開いた直後）なら置き換える', () => {
    expect(deselectAction({ city: 'taipei', spot: 'a' }, undefined)).toBe(
      'replace',
    )
  })

  it('印が今の条件と合わない（選んだあとに条件が変わった）なら置き換える', () => {
    expect(
      deselectAction(
        { city: 'taipei', category: 'food', spot: 'a' },
        'city=taipei',
      ),
    ).toBe('replace')
  })
})

describe('historyMode', () => {
  it('絞り込みが変われば履歴に積む', () => {
    expect(
      historyMode({ city: 'taipei' }, { city: 'taipei', area: 'dadaocheng' }),
    ).toBe('push')
    expect(
      historyMode({ city: 'taipei', category: 'food' }, { city: 'taipei' }),
    ).toBe('push')
  })
  it('一覧 / 地図の切り替えも履歴に積む', () => {
    expect(
      historyMode({ city: 'taipei' }, { city: 'taipei', view: 'map' }),
    ).toBe('push')
    expect(
      historyMode({ city: 'taipei', view: 'map' }, { city: 'taipei' }),
    ).toBe('push')
  })
  it('絞り込みと一緒にスポットが外れても積む', () => {
    expect(
      historyMode(
        { city: 'taipei', spot: 'sidoli-radio' },
        { city: 'taipei', category: 'food' },
      ),
    ).toBe('push')
  })
  it('何も選んでいない状態からスポットを選ぶと積む（「戻る」で選ぶ前へ）', () => {
    expect(historyMode({ city: 'taipei' }, { city: 'taipei', spot: 'a' })).toBe(
      'push',
    )
    expect(
      historyMode(
        { city: 'taipei', view: 'map' },
        { city: 'taipei', view: 'map', spot: 'a' },
      ),
    ).toBe('push')
  })
  it('別のスポットに替える・選択を外すのは置き換える', () => {
    expect(
      historyMode({ city: 'taipei', spot: 'a' }, { city: 'taipei', spot: 'b' }),
    ).toBe('replace')
    expect(historyMode({ city: 'taipei', spot: 'a' }, { city: 'taipei' })).toBe(
      'replace',
    )
  })
  it('検索語の変更は置き換える（スポットが一緒に外れても）', () => {
    expect(historyMode({ city: 'taipei' }, { city: 'taipei', q: 'ぎ' })).toBe(
      'replace',
    )
    expect(
      historyMode({ city: 'taipei', q: 'ぎ' }, { city: 'taipei', q: 'ぎゅう' }),
    ).toBe('replace')
    expect(
      historyMode(
        { city: 'taipei', spot: 'a' },
        { city: 'taipei', q: 'ぎゅう' },
      ),
    ).toBe('replace')
  })
  it('検索語と一緒に絞り込みが変われば積む', () => {
    expect(
      historyMode(
        { city: 'taipei', q: 'a' },
        { city: 'taipei', q: undefined, area: 'x' },
      ),
    ).toBe('push')
  })
  it('何も変わらなければ何もしない（キーの順・undefined の有無は見ない）', () => {
    expect(
      historyMode(
        { spot: 'a', city: 'taipei' },
        { city: 'taipei', area: undefined, spot: 'a' },
      ),
    ).toBe('skip')
  })
})
