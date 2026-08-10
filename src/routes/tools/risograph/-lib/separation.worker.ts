/**
 * 分版ワーカー。
 * 仮想プレスのプロファイル合成 → LUT 構築 → 画像への適用まで、
 * 秒単位かかる計算をまとめてメインスレッドの外でやる。
 */
import { INK_PRESETS, getPaperPreset } from '../../../../lib/risograph/presets'
import { createSyntheticProfile } from '../../../../lib/risograph/press-sim'
import {
  applyLutToImage,
  buildSeparationLut,
  evaluateLut,
} from '../../../../lib/risograph/lut'
import { defaultSeparationConfig } from '../../../../lib/risograph/types'
import type {
  GamutMapMode,
  PressProfile,
} from '../../../../lib/risograph/types'

export type SeparateRequest = {
  type: 'separate'
  inkIds: Array<string>
  /** sRGB 8bit RGBA。transfer で受け取る */
  rgba: ArrayBuffer
  width: number
  height: number
  lutSize: 17 | 33
  gamutMap: GamutMapMode
  /** 紙プリセット id（PAPER_PRESETS）。紙白は分版そのものに効く */
  paperId: string
}

export type LutQuality = {
  inGamutDeltaEMean: number
  neighborL2P99: number
}

export type SeparateResponse =
  | { type: 'progress'; fraction: number; message: string }
  | {
      type: 'done'
      profile: PressProfile
      warnings: Array<string>
      lutQuality: LutQuality
      /** inkIds 順の coverage map（Float32Array の buffer） */
      maps: Array<ArrayBuffer>
      width: number
      height: number
    }
  | { type: 'error'; message: string }

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- module worker のグローバルは lib.dom の Window として型が付くので、DedicatedWorkerGlobalScope として使う面だけを切り出す
const ctx = self as unknown as {
  postMessage: (
    message: SeparateResponse,
    transfer?: Array<Transferable>,
  ) => void
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<SeparateRequest>) => void,
  ) => void
}

function post(message: SeparateResponse, transfer?: Array<Transferable>): void {
  ctx.postMessage(message, transfer)
}

function separate(request: SeparateRequest): void {
  const inks = request.inkIds.map((id) => {
    const preset = INK_PRESETS.find((p) => p.id === id)
    if (!preset) throw new Error(`未知のインクです: ${id}`)
    return preset
  })

  const paper = getPaperPreset(request.paperId)
  if (!paper) throw new Error(`未知の紙です: ${request.paperId}`)

  post({ type: 'progress', fraction: 0.01, message: '仮想プレスを合成中' })
  const { profile, warnings } = createSyntheticProfile(inks, request.inkIds, {
    paperWhite: paper.paperWhite,
    paperLabel: paper.name,
  })

  const config = defaultSeparationConfig(request.inkIds)
  config.lutSize = request.lutSize
  config.gamutMap = { ...config.gamutMap, mode: request.gamutMap }

  // LUT 構築が全体の大半を占めるので、進捗の 0.05–0.85 をここに割り当てる
  const result = buildSeparationLut(profile, config, (fraction, message) => {
    post({
      type: 'progress',
      fraction: 0.05 + fraction * 0.8,
      message,
    })
  })

  post({ type: 'progress', fraction: 0.88, message: '画像へ LUT を適用中' })
  const rgba = new Uint8ClampedArray(request.rgba)
  const maps = applyLutToImage(result.lut, rgba, request.width, request.height)

  post({ type: 'progress', fraction: 0.96, message: 'LUT 品質を評価中' })
  const lutQuality = evaluateLut(result)

  // applyLutToImage が返す Float32Array は必ず ArrayBuffer 上に確保されるので転送できる
  const buffers = maps
    .map((m) => m.buffer)
    .filter((b) => b instanceof ArrayBuffer)
  post(
    {
      type: 'done',
      profile,
      warnings,
      lutQuality,
      maps: buffers,
      width: request.width,
      height: request.height,
    },
    buffers,
  )
}

ctx.addEventListener('message', (event) => {
  try {
    separate(event.data)
  } catch (error) {
    post({
      type: 'error',
      message: error instanceof Error ? error.message : '分版に失敗しました',
    })
  }
})
