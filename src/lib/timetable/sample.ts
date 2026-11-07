/**
 * 動作確認用のサンプル。2025 年に台北で開かれた Simple Life 2025 の公式
 * タイムテーブル(2 日・4 ステージ + サイン会)を新しい形式に変換したもの。
 * テストのフィクスチャも兼ねる。
 *
 * travel(ステージ間の移動時間)は公式には無い。移動の警告を試せるように
 * 架空の値を入れてあり、タイトルにもそう書いている。
 */

import { normalizeTimetable } from './normalize'
import type { TimetableDoc } from './types'

type RawAct = [time: string, title: string, subtitle?: string]

const DAY1: Record<string, Array<RawAct>> = {
  天空舞台: [
    ['14:40 - 15:30', '9m88', 'This Temporary Ensemble Vol.2'],
    ['16:00 - 16:40', '阿肆'],
    ['17:20 - 18:10', '鄭宜農 feat. 李瀧 Lang Lee'],
    ['19:00 - 19:50', '戴佩妮 Penny Tai'],
    ['20:40 - 21:25', '林憶蓮'],
  ],
  微風舞台: [
    ['14:00 - 14:40', '凹與山 Our Shame'],
    ['15:30 - 16:00', '張溢勛 Giyu Tjuljaviya'],
    ['16:40 - 17:20', '就以斯JOYCE feat. PIZZALI'],
    ['18:10 - 18:50', '知更 John Stoniae'],
    ['19:50 - 20:30', '自然捲（魏如萱＆奇哥）'],
  ],
  'Legacy 舞台': [
    ['13:20 - 14:00', '特別企劃【未來進行式】', '小樹 + 黃玠 + dato'],
    ['14:50 - 15:30', '庸俗救星 Vulgar Savior'],
    ['16:10 - 16:50', 'Andr'],
    ['17:30 - 18:10', '丹丹猫猫', 'aDAN薛詒丹 x Miao Miao Flow'],
    ['18:50 - 19:30', "我是機車少女I'mdifficult"],
    ['20:10 - 20:50', 'The Chairs 椅子樂團'],
    ['21:40 - 22:30', "傷心欲絕 Wayne's So Sad"],
  ],
  街聲舞台: [
    ['13:00 - 13:20', '【復展開幕】DJ BENN'],
    ['13:50 - 14:20', 'Osean 吳獻'],
    ['15:00 - 15:30', 'Niki the Unicorn'],
    ['16:20 - 16:50', 'YaMon Social Club 壓滿俱樂部'],
    ['17:50 - 18:20', '老貓偵探社'],
    ['19:10 - 19:40', '紙鳶 Seizer'],
    ['20:20 - 21:00', 'someshiit 山姆'],
    ['21:30 - 22:20', '【荒島派對】DJ 林貓王'],
  ],
  サイン会: [
    ['15:20 - 15:40', '凹與山 Our Shame'],
    ['16:10 - 16:30', '丹丹猫猫', 'aDAN薛詒丹 x Miao Miao Flow'],
    ['17:10 - 17:30', '紙鳶 Seizer'],
    ['18:10 - 18:30', '就以斯JOYCE'],
    ['19:00 - 19:20', '老貓偵探社'],
    ['19:50 - 20:10', "傷心欲絕 Wayne's So Sad"],
  ],
}

const DAY2: Record<string, Array<RawAct>> = {
  天空舞台: [
    ['14:40 - 15:30', 'YELLOW黃宣', '99% YELLOW, 1% CAMEO'],
    ['16:00 - 16:40', '理想混蛋 Bestards'],
    ['17:20 - 18:10', 'ABAO阿爆 feat. 那屋瓦'],
    ['19:00 - 19:50', '楊乃文'],
    ['20:40 - 21:30', '伍佰&China Blue feat. 李宗盛'],
  ],
  微風舞台: [
    ['14:00 - 14:40', '王彙筑 Hui Chu Wang'],
    ['15:30 - 16:00', '戴曉君 Sauljaljui'],
    ['16:40 - 17:20', 'Theseus式修斯'],
    ['18:10 - 18:50', '白安ANN'],
    ['19:50 - 20:30', '黃小楨'],
  ],
  'Legacy 舞台': [
    ['13:20 - 14:00', '特別企劃【寰宇龍虎豹】', '鄭吉 + 迪拉 + 達誠'],
    ['14:50 - 15:30', '呂允 Lu Yun'],
    ['16:10 - 16:50', 'Who Cares 胡凱兒'],
    ['17:30 - 18:10', '黃大謙'],
    ['18:50 - 19:30', '當代電影大師'],
    ['20:10 - 20:50', 'VH'],
    ['21:40 - 22:30', '老王樂隊', 'ft. 四分衛阿山 ft. 守夜人旭章'],
  ],
  街聲舞台: [
    ['13:00 - 13:20', '【復展開幕】DJ DASU'],
    ['13:50 - 14:20', 'NIO'],
    ['15:00 - 15:30', '羊駝小姐 Malpaca'],
    ['16:20 - 16:50', '心頭肉 MindBodySoul'],
    ['17:50 - 18:20', '鄰序 Hogan T.'],
    ['19:10 - 19:40', 'COLD DEW'],
    ['20:20 - 21:00', '公館青少年'],
    ['21:30 - 22:20', '【末日之夜】DJ Mykal a.k.a.林哲儀'],
  ],
  サイン会: [
    ['16:40 - 17:00', '戴曉君 Sauljaljui'],
    ['17:30 - 17:50', 'COLD DEW'],
    ['18:50 - 19:10', '鄒序 Hogan T.'],
  ],
}

const VENUES = [
  { id: 'sky', name: '天空舞台' },
  { id: 'breeze', name: '微風舞台' },
  { id: 'legacy', name: 'Legacy 舞台' },
  { id: 'street', name: '街聲舞台' },
  { id: 'sign', name: 'サイン会', note: '物販エリア横' },
]

function rawActs(dayId: string, stages: Record<string, Array<RawAct>>) {
  return Object.entries(stages).flatMap(([stage, list]) =>
    list.map(([time, title, subtitle]) => ({
      dayId,
      venue: stage,
      time,
      title,
      ...(subtitle ? { subtitle } : {}),
      ...(stage === 'サイン会' ? { kind: 'signing' } : {}),
      ...(title.includes('DJ') ? { kind: 'dj' } : {}),
    })),
  )
}

/** AI が返しそうな形(time 文字列・会場を名前で指定・id なし)の生データ */
export const SAMPLE_RAW = {
  version: 1,
  title: 'Simple Life 2025(サンプル・移動時間は架空)',
  timezone: 'Asia/Taipei',
  sourceUrl: 'https://www.simplelife.com.tw/',
  days: [
    { id: 'd1', date: '2025-11-29', label: 'DAY1' },
    { id: 'd2', date: '2025-11-30', label: 'DAY2' },
  ],
  venues: VENUES,
  acts: [...rawActs('d1', DAY1), ...rawActs('d2', DAY2)],
  travel: [
    { from: '天空舞台', to: '微風舞台', minutes: 5 },
    { from: '天空舞台', to: 'Legacy 舞台', minutes: 8 },
    { from: '天空舞台', to: '街聲舞台', minutes: 10 },
    { from: '微風舞台', to: 'Legacy 舞台', minutes: 6 },
    { from: '微風舞台', to: '街聲舞台', minutes: 7 },
    { from: 'Legacy 舞台', to: '街聲舞台', minutes: 4 },
  ],
}

export function buildSampleDoc(): TimetableDoc {
  const { doc } = normalizeTimetable(SAMPLE_RAW)
  if (doc === null) throw new Error('sample is broken')
  return doc
}
