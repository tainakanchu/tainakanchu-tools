/**
 * 文字列ごとの文字体系の判定（どの CJK 書体を先頭に置くか）。純粋関数。
 *
 * 1 つの文字列（アーティスト名・曲名・イベント名・DJ 名・会場など、描く単位）の中で
 * 漢字のデザインが混ざらないよう、1 文字ずつではなく文字列ごとに書体を選ぶ。
 *
 *   ハングルを含む              → ko（韓国語の書体を先頭に）
 *   かな（と 々 〆）を含む      → ja
 *   漢字だけ（かなが無い）      → 中国語。簡体字だけ・繁体字だけの字の数で
 *                                 zh-hans / zh-hant を決める。決め手が無ければ zh-hant
 *                                 （オーナーの現場は台湾の曲が多いため）
 *                                 新字体（日本だけの字形: 駅 気 広 …）が多ければ ja
 *   どれも無い                  → latin（今までどおり欧文の書体から）
 *
 * 判定には描く文字（「隠す」で置き換えた後の文字）だけを渡すこと。
 */

export type Script = 'latin' | 'ja' | 'zh-hant' | 'zh-hans' | 'ko'

/** CJK の書体を選ぶ必要がある体系 */
export type CjkScript = Exclude<Script, 'latin'>

/**
 * よく使う字の「簡体字 → 繁体字」の組（2 文字ずつ）。左が簡体字にしか無い字、
 * 右が繁体字にしか無い字。どちらの表記でも同じ字（台・后・里・余・于・杰 など）は入れない。
 */
const PAIRS =
  '这這们們为為国國说說个個爱愛时時来來对對会會过過还還没沒发發发髮头頭样樣' +
  '经經开開关關见見长長门門问問间間听聽让讓认認识識语語话話请請谁誰读讀写寫' +
  '书書买買卖賣东東车車马馬鸟鳥鱼魚龙龍风風飞飛云雲电電声聲乐樂欢歡梦夢记記' +
  '忆憶树樹苹蘋侨僑倾傾鳗鰻灯燈恋戀错錯钟鐘钟鍾银銀铁鐵钱錢级級纪紀红紅绿綠' +
  '蓝藍纯純线線结結给給终終续續网網罗羅岁歲华華万萬与與无無现現实實边邊远遠' +
  '运運进進达達迟遲选選应應张張弹彈强強归歸当當尔爾亲親视視觉覺观觀览覽讲講' +
  '谢謝词詞诗詩课課调調难難鸡雞汉漢叶葉号號吗嗎么麼宝寶贝貝爷爺妈媽孙孫儿兒' +
  '乡鄉亿億优優伤傷传傳动動劳勞势勢区區单單卫衛历歷历曆压壓县縣双雙变變响響' +
  '团團园園围圍图圖圆圓场場坏壞块塊坚堅处處备備复復复複夺奪妇婦宁寧静靜宫宮' +
  '寻尋导導尘塵层層岛島师師带帶庆慶废廢异異录錄怀懷态態总總恶惡惊驚惯慣愿願' +
  '战戰戏戲护護报報拥擁择擇挥揮换換据據摇搖敌敵数數断斷旧舊显顯晓曉术術机機' +
  '杀殺杂雜权權条條杨楊极極枪槍枫楓桥橋检檢楼樓横橫欧歐残殘毕畢气氣汤湯泪淚' +
  '泽澤洁潔浅淺测測浓濃涛濤润潤湾灣满滿灭滅灵靈炼煉烂爛烟煙热熱牵牽独獨献獻' +
  '环環画畫疗療盘盤矿礦码碼确確礼禮离離种種积積称稱稳穩穷窮竞競笔筆笼籠签簽' +
  '简簡类類纤纖约約纱紗纳納纷紛纸紙练練组組细細织織绍紹绕繞绘繪络絡绝絕统統' +
  '绣繡继繼绩績绪緒绮綺绳繩维維绵綿综綜缘緣编編缓緩缠纏缤繽缩縮职職联聯聪聰' +
  '肠腸肤膚脑腦脸臉艺藝节節苍蒼苏蘇荐薦荡蕩荣榮药藥莲蓮获獲莹瑩营營萝蘿萧蕭' +
  '虑慮虫蟲虽雖补補装裝规規触觸计計订訂讨討训訓议議讯訊许許论論设設访訪证證' +
  '评評诉訴译譯试試诚誠诞誕询詢该該详詳误誤诸諸谈談谊誼谋謀谎謊谜謎谣謠谱譜' +
  '诒詒负負贡貢财財责責贤賢败敗货貨质質贪貪购購贯貫贵貴贺賀资資赏賞赐賜赖賴' +
  '赛賽赞贊赠贈赢贏赵趙赶趕跃躍踪蹤轨軌转轉轮輪软軟轰轟轻輕载載较較辉輝辈輩' +
  '输輸辞辭迁遷迈邁违違连連适適递遞遗遺邓鄧邮郵邻鄰郑鄭释釋钢鋼钥鑰铃鈴铺鋪' +
  '链鏈销銷锁鎖锋鋒锦錦键鍵镇鎮镜鏡闪閃闭閉闯闖闲閒闷悶闹鬧闻聞阁閣阅閱阔闊' +
  '队隊阳陽阴陰阵陣阶階际際陆陸陈陳险險随隨隐隱雾霧韩韓页頁顶頂项項顺順须須' +
  '顾顧预預领領频頻题題颜顏额額飘飄饭飯饮飲饰飾馆館驰馳驱驅驾駕骑騎骗騙鲁魯' +
  '鲜鮮鲨鯊鸣鳴鸭鴨鹤鶴鹰鷹黄黃齐齊龄齡龟龜琼瓊协協炖燉筝箏晕暈侣侶启啟兴興' +
  '举舉义義养養军軍农農冯馮刘劉吴吳吕呂蒋蔣尽盡价價广廣属屬点點学學乱亂刹剎' +
  '杂雜厅廳挂掛凤鳳宾賓汇匯沟溝浊濁湿濕渐漸滚滾滤濾邮郵鸽鴿鹅鵝剧劇'

function pairSets(): { hans: Set<string>; hant: Set<string> } {
  const chars = Array.from(PAIRS)
  const hans = new Set<string>()
  const hant = new Set<string>()
  for (let i = 0; i + 1 < chars.length; i += 2) {
    hans.add(chars[i])
    hant.add(chars[i + 1])
  }
  return { hans, hant }
}

const SETS = pairSets()

/** 簡体字にしか無い字（よく使うものだけ） */
export const SIMPLIFIED_ONLY: ReadonlySet<string> = SETS.hans
/** 繁体字にしか無い字（よく使うものだけ。日本の旧字体・新字体と同じ字も含む） */
export const TRADITIONAL_ONLY: ReadonlySet<string> = SETS.hant
/** 日本の新字体（簡体字とも繁体字とも違う字形）。かなの無い日本語の名前の手がかり */
export const JAPANESE_ONLY: ReadonlySet<string> = new Set(
  Array.from(
    '気駅広図円売読楽薬桜沢浜鉄県歳辺戦単黒渋栄様実弾応権観覚聴隠遅雑闘亀縄' +
      '粋酔頼瀬戻涙塩帰込畑峠働匂栃枠譲嬢斉剤済浄駆継続経総緑縁毎姫拝悪価仏伝' +
      '転軽験険検剣銭桟発廃拡鉱恵歩渉焼鶏',
  ),
)

const HANGUL = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힯ힰ-퟿]/u
/** かな（長音記号・中点は中国語の中でも使うので数えない）と 々 〆 */
const KANA = /[ぁ-ゖゝ-ゟァ-ヺヽ-ヿㇰ-ㇿｦ-ｯｱ-ﾝ々〆\u{1b000}-\u{1b16f}]/u
const HAN = /[㐀-䶿一-鿿豈-﫿\u{20000}-\u{2fa1f}]/u

export function hasHangul(text: string): boolean {
  return HANGUL.test(text)
}

export function hasKana(text: string): boolean {
  return KANA.test(text)
}

export function hasHan(text: string): boolean {
  return HAN.test(text)
}

/**
 * CJK の書体でしか描けない字（漢字・かな・ハングル・注音・全角の記号）。
 * 中国語・韓国語の Web フォントの CSS を読むかどうかの判断に使う。
 */
export function isCjkChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  return (
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x2e80 && code <= 0x2fdf) ||
    (code >= 0x3000 && code <= 0x9fff) ||
    (code >= 0xa960 && code <= 0xa97f) ||
    (code >= 0xac00 && code <= 0xd7ff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xffef) ||
    (code >= 0x1b000 && code <= 0x1b16f) ||
    (code >= 0x20000 && code <= 0x3134f)
  )
}

export type ScriptGuess = {
  script: Script
  /** 漢字だけで、簡体字・繁体字の決め手が無かった（既定の zh-hant にした） */
  ambiguous: boolean
}

/** 文字列の文字体系（判定の根拠つき） */
export function guessScript(text: string): ScriptGuess {
  if (hasHangul(text)) return { script: 'ko', ambiguous: false }
  if (hasKana(text)) return { script: 'ja', ambiguous: false }
  if (!hasHan(text)) return { script: 'latin', ambiguous: false }
  let hans = 0
  let hant = 0
  let ja = 0
  for (const ch of text) {
    if (SIMPLIFIED_ONLY.has(ch)) hans++
    else if (TRADITIONAL_ONLY.has(ch)) hant++
    else if (JAPANESE_ONLY.has(ch)) ja++
  }
  if (ja > 0 && ja >= hans && ja >= hant) {
    return { script: 'ja', ambiguous: false }
  }
  if (hans > hant) return { script: 'zh-hans', ambiguous: false }
  return { script: 'zh-hant', ambiguous: hant === 0 }
}

/** 文字列の文字体系 */
export function detectScript(text: string): Script {
  return guessScript(text).script
}

/** 決め手の無い方を、もう一方の体系にそろえる */
const adopt = (self: ScriptGuess, other: ScriptGuess): Script =>
  self.ambiguous &&
  !other.ambiguous &&
  (other.script === 'zh-hans' ||
    other.script === 'zh-hant' ||
    other.script === 'ja')
    ? other.script
    : self.script

/**
 * 同じ曲のアーティスト名と曲名の文字体系。漢字だけで決め手の無い方は、
 * もう一方が中国語（簡体 / 繁体）か日本語ならそれにそろえる
 * （「失忆 / 潘高峰」の潘高峰を簡体字の書体で描く）。
 * どちらも文字列ごとに 1 つの書体を選ぶことに変わりはない。
 */
export function pairScripts(a: string, b: string): [Script, Script] {
  const ga = guessScript(a)
  const gb = guessScript(b)
  return [adopt(ga, gb), adopt(gb, ga)]
}
