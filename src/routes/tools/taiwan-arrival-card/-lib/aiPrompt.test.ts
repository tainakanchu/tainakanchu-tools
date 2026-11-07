import { describe, expect, it } from 'vitest'
import { buildImportPrompt } from './aiPrompt'

describe('buildImportPrompt(入境カード)', () => {
  it('資料が無いときは JSON を出さず案内して待つ規則を持つ', () => {
    const prompt = buildImportPrompt()
    expect(prompt).toContain('## 資料がまだ無いとき')
    expect(prompt).toContain('JSON を出力してはいけません')
    expect(prompt).toContain('台湾の入国カードに必要な書類がまだ届いていません')
    expect(prompt).toContain('メール本文・PDF・画面のスクショ')
  })

  it('資料を受け取ったあとは従来どおり JSON のみ', () => {
    expect(buildImportPrompt()).toContain('JSON オブジェクト**のみ**')
  })
})
