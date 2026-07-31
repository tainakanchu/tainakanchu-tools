import { crashHit, nextRollHit } from '@/lib/drum-roll/hits'

const SNARE_URLS = ['/assets/drum-roll/snare.m4a']
const KICK_URL = '/assets/drum-roll/kick.m4a'
const CRASH_URL = '/assets/drum-roll/crash.m4a'

/** この先何秒ぶんの打撃を予約しておくか */
const LOOKAHEAD_SEC = 0.12
const SCHEDULER_INTERVAL_MS = 30
const ATTACK_DELAY_SEC = 0.005

/**
 * Web Audio API でロール（スネア連打）とジャーン（クラッシュ＋キック）を鳴らすエンジン。
 * setTimeout 直接発音だとタイミングが揺れすぎるため、
 * AudioContext の時計に対するルックアヘッド方式でスケジュールする。
 */
export class DrumRollEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private snares: Array<AudioBuffer> = []
  private kick: AudioBuffer | null = null
  private crash: AudioBuffer | null = null
  private schedulerId: ReturnType<typeof setInterval> | null = null
  private nextHitTime = 0
  private prevSampleIndex: number | null = null
  /** 現在のロールで何打目までスケジュールしたか。立ち上がりエンベロープに使う */
  private rollHitIndex = 0
  private pendingHits = new Map<AudioBufferSourceNode, number>()
  private rolling = false
  /** ロール1回ぶんの識別子。resume 待ちの間に打ち切られたかの判定に使う */
  private rollToken: object | null = null
  disposed = false

  /** AudioContext の生成とサンプルのデコード。マウント時に呼ぶ（suspended のままでもデコードは可能） */
  async load(): Promise<void> {
    const ctx = new AudioContext()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0.9
    this.master.connect(ctx.destination)

    const fetchBuffer = async (url: string) => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`failed to fetch ${url}`)
      return ctx.decodeAudioData(await res.arrayBuffer())
    }
    const [snares, kick, crash] = await Promise.all([
      Promise.all(SNARE_URLS.map(fetchBuffer)),
      fetchBuffer(KICK_URL),
      fetchBuffer(CRASH_URL),
    ])
    if (this.disposed) return
    this.snares = snares
    this.kick = kick
    this.crash = crash
  }

  get isReady(): boolean {
    return !this.disposed && this.snares.length > 0
  }

  /** ロール開始。押しっぱなし中は scheduleChunk が先の打撃を予約し続ける */
  async startRoll(): Promise<void> {
    const ctx = this.ctx
    if (!ctx || !this.isReady || this.rolling) return
    this.rolling = true
    const token = {}
    this.rollToken = token
    if (ctx.state === 'suspended') {
      // autoplay ポリシー対策: 最初のユーザー操作でここを通る
      await ctx.resume()
      // resume 待ちの間に離鍵・アンマウントされていたら開始しない
      if (this.disposed || this.rollToken !== token) return
    }
    this.prevSampleIndex = null
    this.rollHitIndex = 0
    this.nextHitTime = ctx.currentTime + ATTACK_DELAY_SEC
    this.scheduleChunk()
    this.schedulerId = setInterval(
      () => this.scheduleChunk(),
      SCHEDULER_INTERVAL_MS,
    )
  }

  /** ロールを止めてジャーン（クラッシュ＋キック同時打ち）。ロール中でなければ何もしない */
  releaseToCrash(): boolean {
    const ctx = this.ctx
    if (!ctx || !this.rolling || !this.crash || !this.kick) return false
    this.stopScheduling()
    const hit = crashHit(Math.random)
    const when = ctx.currentTime + ATTACK_DELAY_SEC
    this.play(this.crash, when, hit.crash.gain, hit.crash.playbackRate, 0)
    this.play(this.kick, when, hit.kick.gain, hit.kick.playbackRate, 0)
    return true
  }

  /** ジャーンを鳴らさずにロールだけ止める（ウィンドウの blur 時など） */
  cancelRoll(): void {
    this.stopScheduling()
  }

  dispose(): void {
    this.disposed = true
    this.stopScheduling()
    if (this.ctx) {
      void this.ctx.close().catch(() => {})
      this.ctx = null
    }
  }

  private scheduleChunk(): void {
    const ctx = this.ctx
    if (!ctx || !this.rolling) return
    while (this.nextHitTime < ctx.currentTime + LOOKAHEAD_SEC) {
      const hit = nextRollHit(
        this.prevSampleIndex,
        Math.random,
        undefined,
        this.rollHitIndex,
      )
      this.rollHitIndex++
      this.prevSampleIndex = hit.sampleIndex
      this.play(
        this.snares[hit.sampleIndex],
        this.nextHitTime,
        hit.gain,
        hit.playbackRate,
        hit.pan,
        true,
      )
      this.nextHitTime += hit.intervalSec
    }
  }

  private play(
    buffer: AudioBuffer,
    when: number,
    gain: number,
    playbackRate: number,
    pan: number,
    trackPending = false,
  ): void {
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master) return
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = playbackRate
    const gainNode = ctx.createGain()
    gainNode.gain.value = gain
    const panNode = ctx.createStereoPanner()
    panNode.pan.value = pan
    source.connect(gainNode).connect(panNode).connect(master)
    if (trackPending) {
      this.pendingHits.set(source, when)
      source.onended = () => this.pendingHits.delete(source)
    }
    source.start(when)
  }

  /** 予約済みでまだ鳴っていない打撃を取り消してスケジューラを止める */
  private stopScheduling(): void {
    if (this.schedulerId !== null) {
      clearInterval(this.schedulerId)
      this.schedulerId = null
    }
    this.rolling = false
    this.rollToken = null
    const now = this.ctx?.currentTime ?? 0
    for (const [source, when] of this.pendingHits) {
      if (when > now) {
        try {
          source.stop()
        } catch {
          // すでに停止済みなら無視
        }
      }
    }
    this.pendingHits.clear()
  }
}
