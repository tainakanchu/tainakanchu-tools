import { channelToPan, volumeToGain } from './frequency'
import type { Channel } from './frequency'

const FADE_TIME_CONSTANT = 0.008 // 約 25ms でほぼ収束
const FADE_OUT_STOP_MS = 60
const PARAM_TIME_CONSTANT = 0.015

type Nodes = {
  osc: OscillatorNode
  gain: GainNode
  panner: StereoPannerNode
}

/** Web Audio のサイン波再生。AudioContext は最初の再生操作で遅延生成する */
export class SineEngine {
  private ctx: AudioContext | null = null
  private nodes: Nodes | null = null
  private fading: Nodes | null = null
  private stopTimer: number | null = null
  private disposedFlag = false

  isDisposed() {
    return this.disposedFlag
  }

  get isPlaying() {
    return this.nodes !== null
  }

  async start(hz: number, volumePercent: number, channel: Channel) {
    if (this.isDisposed()) return
    this.clearStopTimer()
    // フェードアウト中の残りがあれば即座に片付ける
    this.flushFading()
    this.teardown()

    const ctx = (this.ctx ??= new AudioContext())
    if (ctx.state === 'suspended') await ctx.resume()
    if (this.isDisposed()) return

    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = hz
    const gain = ctx.createGain()
    gain.gain.value = 0
    const panner = ctx.createStereoPanner()
    panner.pan.value = channelToPan(channel)
    osc.connect(gain).connect(panner).connect(ctx.destination)
    osc.start()
    gain.gain.setTargetAtTime(
      volumeToGain(volumePercent),
      ctx.currentTime,
      FADE_TIME_CONSTANT,
    )
    this.nodes = { osc, gain, panner }
  }

  stop() {
    const ctx = this.ctx
    const nodes = this.nodes
    if (!ctx || !nodes) return
    this.nodes = null
    this.flushFading()
    this.fading = nodes
    const now = ctx.currentTime
    nodes.gain.gain.cancelScheduledValues(now)
    nodes.gain.gain.setTargetAtTime(0, now, FADE_TIME_CONSTANT)
    this.stopTimer = window.setTimeout(() => {
      this.flushFading()
    }, FADE_OUT_STOP_MS)
  }

  setFrequency(hz: number) {
    if (!this.ctx || !this.nodes) return
    this.nodes.osc.frequency.setTargetAtTime(
      hz,
      this.ctx.currentTime,
      PARAM_TIME_CONSTANT,
    )
  }

  setVolume(volumePercent: number) {
    if (!this.ctx || !this.nodes) return
    this.nodes.gain.gain.setTargetAtTime(
      volumeToGain(volumePercent),
      this.ctx.currentTime,
      PARAM_TIME_CONSTANT,
    )
  }

  setChannel(channel: Channel) {
    if (!this.ctx || !this.nodes) return
    this.nodes.panner.pan.setTargetAtTime(
      channelToPan(channel),
      this.ctx.currentTime,
      PARAM_TIME_CONSTANT,
    )
  }

  dispose() {
    this.disposedFlag = true
    this.flushFading()
    this.teardown()
    void this.ctx?.close()
    this.ctx = null
  }

  private clearStopTimer() {
    if (this.stopTimer !== null) {
      window.clearTimeout(this.stopTimer)
      this.stopTimer = null
    }
  }

  private flushFading() {
    this.clearStopTimer()
    if (this.fading) {
      this.disconnect(this.fading)
      this.fading = null
    }
  }

  private teardown() {
    if (this.nodes) {
      this.disconnect(this.nodes)
      this.nodes = null
    }
  }

  private disconnect({ osc, gain, panner }: Nodes) {
    try {
      osc.stop()
    } catch {
      // すでに停止済み
    }
    osc.disconnect()
    gain.disconnect()
    panner.disconnect()
  }
}
