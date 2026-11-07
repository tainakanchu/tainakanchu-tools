import { describe, expect, it } from 'vitest'
import {
  OUTPUT_FORMAT_RULE,
  WAIT_FOR_EDIT_RULE,
  WAIT_FOR_MATERIAL_RULE,
  buildTimetablePrompt,
} from './prompt'
import { buildSampleDoc } from './sample'

describe('buildTimetablePrompt', () => {
  it('新規: 型・深夜表記・資料待ちのルールを含む', () => {
    const prompt = buildTimetablePrompt('new')
    expect(prompt).toContain('type TimetableDoc')
    expect(prompt).toContain('"25:30"')
    expect(prompt).toContain('要確認')
    expect(prompt).toContain('travel')
    expect(prompt).toContain(WAIT_FOR_MATERIAL_RULE)
    expect(prompt).toContain('JSON を出力しないでください')
    expect(prompt).toContain(
      'タイムテーブルの画像・PDF・URL、または文字起こしを貼ってください',
    )
  })

  it('JSON は 1 つの ```json コードブロックで出させる(新規・追記の両方)', () => {
    for (const prompt of [
      buildTimetablePrompt('new'),
      buildTimetablePrompt('update', buildSampleDoc()),
    ]) {
      expect(prompt).toContain(OUTPUT_FORMAT_RULE)
      expect(prompt).toContain('```json コードブロック')
      expect(prompt).toContain('コピーボタン')
      expect(prompt).not.toContain('コードフェンスは不要')
    }
    expect(OUTPUT_FORMAT_RULE).toContain('表にしたりしない')
  })

  it('追記・修正: 現在の JSON と、修正内容を聞くルールを含む', () => {
    const doc = buildSampleDoc()
    const prompt = buildTimetablePrompt('update', doc)
    expect(prompt).toContain(WAIT_FOR_EDIT_RULE)
    expect(prompt).toContain('何を追加・修正したいか')
    expect(prompt).toContain(JSON.stringify(doc))
  })
})
