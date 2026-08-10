/**
 * 逆分版 LUT の構築・適用(仕様書 §10)。
 * - LUT domain は linear sRGB の均等格子(§10.2)
 * - multiresolution 9³ → 17³ → 33³(§10.6)
 * - 連続性は Jacobi スイープ(前スイープのスナップショットに対して独立 solve、§10.5)
 * - ガモットマッピングは LUT 構築時にノード target へ適用(§9.3)
 * - 決定的: 同一入力で bit-identical(反復順・演算順固定)
 */
import { deltaE00, linearRgbToXyz, srgbToLinear, xyzToLab } from './color'
import type { Lab } from './color'
import { createForwardContext, forward } from './forward'
import type { ForwardContext } from './forward'
import { buildGamutTable, mapToGamut } from './gamut'
import type { GamutTable } from './gamut'
import { createSolverContext, projectConstraints, solveNode } from './solver'
import type { SolverContext } from './solver'
import type { InkId, PressProfile, SeparationConfig } from './types'

export interface SeparationLut {
  size: number
  inkCount: number
  inkIds: Array<InkId>
  /** size³ × N。index = ((z*size + y)*size + x)*N + ink */
  data: Float32Array
}

export type ProgressCallback = (fraction: number, message: string) => void

/** レベル列。9³ → 17³ (→ 33³) */
function levelsFor(finalSize: 17 | 33): Array<number> {
  return finalSize === 33 ? [9, 17, 33] : [9, 17]
}

/** ノード target(gamut map 済み Lab)をレベルごとに前計算する */
function buildTargets(
  size: number,
  gamut: GamutTable,
  config: SeparationConfig,
): Array<Lab> {
  const targets: Array<Lab> = Array.from({ length: size * size * size })
  let idx = 0
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // LUT domain は linear sRGB(x=R, y=G, z=B)
        const rgb = [x / (size - 1), y / (size - 1), z / (size - 1)] as const
        const lab = xyzToLab(linearRgbToXyz(rgb))
        targets[idx++] = mapToGamut(lab, gamut, config.gamutMap)
      }
    }
  }
  return targets
}

/** 前レベル格子からの三線形 upsample */
function upsample(
  src: Float32Array,
  srcSize: number,
  dstSize: number,
  inkCount: number,
): Float32Array {
  const dst = new Float32Array(dstSize * dstSize * dstSize * inkCount)
  const scale = (srcSize - 1) / (dstSize - 1)
  for (let z = 0; z < dstSize; z++) {
    const fz = z * scale
    const z0 = Math.min(srcSize - 2, Math.floor(fz))
    const tz = fz - z0
    for (let y = 0; y < dstSize; y++) {
      const fy = y * scale
      const y0 = Math.min(srcSize - 2, Math.floor(fy))
      const ty = fy - y0
      for (let x = 0; x < dstSize; x++) {
        const fx = x * scale
        const x0 = Math.min(srcSize - 2, Math.floor(fx))
        const tx = fx - x0
        const dstBase = ((z * dstSize + y) * dstSize + x) * inkCount
        for (let i = 0; i < inkCount; i++) {
          let acc = 0
          for (let dz = 0; dz <= 1; dz++) {
            const wz = dz === 0 ? 1 - tz : tz
            for (let dy = 0; dy <= 1; dy++) {
              const wy = dy === 0 ? 1 - ty : ty
              for (let dx = 0; dx <= 1; dx++) {
                const wx = dx === 0 ? 1 - tx : tx
                const srcIdx =
                  (((z0 + dz) * srcSize + (y0 + dy)) * srcSize + (x0 + dx)) *
                    inkCount +
                  i
                acc += wz * wy * wx * src[srcIdx]
              }
            }
          }
          dst[dstBase + i] = acc
        }
      }
    }
  }
  return dst
}

/** 6 近傍の平均を neighborMean へ書き、近傍数を返す */
function neighborMeanOf(
  snapshot: Float32Array,
  size: number,
  inkCount: number,
  x: number,
  y: number,
  z: number,
  neighborMean: Float32Array,
): number {
  neighborMean.fill(0)
  let count = 0
  const offsets = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ] as const
  for (const [dx, dy, dz] of offsets) {
    const nx = x + dx
    const ny = y + dy
    const nz = z + dz
    if (nx < 0 || nx >= size || ny < 0 || ny >= size || nz < 0 || nz >= size) {
      continue
    }
    const base = ((nz * size + ny) * size + nx) * inkCount
    for (let i = 0; i < inkCount; i++) neighborMean[i] += snapshot[base + i]
    count++
  }
  if (count > 0) {
    for (let i = 0; i < inkCount; i++) neighborMean[i] /= count
  }
  return count
}

function sweepLevel(
  data: Float32Array,
  size: number,
  targets: Array<Lab>,
  config: SeparationConfig,
  solverCtx: SolverContext,
  fwd: ForwardContext,
  onProgress: ProgressCallback | undefined,
  progressBase: number,
  progressSpan: number,
): void {
  const inkCount = fwd.inkCount
  const neighborMean = new Float32Array(inkCount)
  const initial = new Float32Array(inkCount)
  const out = new Float32Array(inkCount)

  for (let sweep = 1; sweep <= config.sweeps; sweep++) {
    // λ は 0 から線形 ramp(§10.5)
    const lambdaEff = (config.lambdaSmooth * sweep) / config.sweeps
    const snapshot = data.slice()
    let maxDelta = 0
    let idx = 0
    for (let z = 0; z < size; z++) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const base = idx * inkCount
          const count = neighborMeanOf(
            snapshot,
            size,
            inkCount,
            x,
            y,
            z,
            neighborMean,
          )
          for (let i = 0; i < inkCount; i++) initial[i] = snapshot[base + i]
          solveNode(
            targets[idx],
            count > 0 ? neighborMean : null,
            lambdaEff * count,
            solverCtx,
            initial,
            out,
          )
          for (let i = 0; i < inkCount; i++) {
            const d = Math.abs(out[i] - data[base + i])
            if (d > maxDelta) maxDelta = d
            data[base + i] = out[i]
          }
          idx++
        }
      }
      onProgress?.(
        progressBase +
          progressSpan *
            ((sweep - 1) / config.sweeps +
              ((z + 1) / size) * (1 / config.sweeps)),
        `${size}³ sweep ${sweep}/${config.sweeps}`,
      )
    }
    if (maxDelta < 1e-3) break
  }
}

export interface BuildLutResult {
  lut: SeparationLut
  gamut: GamutTable
  fwd: ForwardContext
}

export function buildSeparationLut(
  profile: PressProfile,
  config: SeparationConfig,
  onProgress?: ProgressCallback,
): BuildLutResult {
  const fwd = createForwardContext(profile, config.inkIds)
  const solverCtx = createSolverContext(
    fwd,
    config.lambdaTotalInk,
    config.lambdaInkCount,
  )
  onProgress?.(0.01, 'ガモット境界を推定中')
  const gamut = buildGamutTable(fwd)

  const inkCount = fwd.inkCount
  const levels = levelsFor(config.lutSize)
  const levelWeight = levels.map((s) => s * s * s)
  const weightTotal = levelWeight.reduce((a, b) => a + b, 0)

  let data: Float32Array | null = null
  let prevSize = 0
  let progressBase = 0.05

  for (let li = 0; li < levels.length; li++) {
    const size = levels[li]
    const span = 0.93 * (levelWeight[li] / weightTotal)
    const targets = buildTargets(size, gamut, config)

    if (data === null) {
      // 9³ レベル: まず独立 solve(λ_smooth = 0、粗グリッド初期化)で種を作る
      data = new Float32Array(size * size * size * inkCount)
      const out = new Float32Array(inkCount)
      const nodeCount = size * size * size
      for (let idx = 0; idx < nodeCount; idx++) {
        solveNode(targets[idx], null, 0, solverCtx, null, out)
        data.set(out, idx * inkCount)
        if (idx % size === 0) {
          onProgress?.(
            progressBase + span * (idx / nodeCount),
            `${size}³ 初期解を計算中`,
          )
        }
      }
      // 最粗レベルでも Jacobi スイープを回す。ここが独立 solve のままだと
      // 隣り合うノードが別々の局所解に落ちたまま上のレベルへ持ち上がり、
      // 以降の平滑化では戻せない不連続が LUT に焼き付く。
      sweepLevel(
        data,
        size,
        targets,
        config,
        solverCtx,
        fwd,
        onProgress,
        progressBase,
        span,
      )
    } else {
      data = upsample(data, prevSize, size, inkCount)
      // upsample 直後は制約を満たさない可能性があるため必ず射影(§10.6)
      const node = new Float32Array(inkCount)
      const nodeCount = size * size * size
      for (let idx = 0; idx < nodeCount; idx++) {
        for (let i = 0; i < inkCount; i++) node[i] = data[idx * inkCount + i]
        projectConstraints(node, fwd)
        data.set(node, idx * inkCount)
      }
      sweepLevel(
        data,
        size,
        targets,
        config,
        solverCtx,
        fwd,
        onProgress,
        progressBase,
        span,
      )
    }
    progressBase += span
    prevSize = size
  }

  onProgress?.(1, '完了')
  return {
    lut: {
      size: prevSize,
      inkCount,
      inkIds: [...config.inkIds],
      data: data!,
    },
    gamut,
    fwd,
  }
}

/** LUT の三線形補間。rgb は linear sRGB 0..1。結果は out(長さ N)へ */
export function sampleLut(
  lut: SeparationLut,
  r: number,
  g: number,
  b: number,
  out: Float32Array,
): void {
  const s = lut.size
  const n = lut.inkCount
  const fx = Math.min(1, Math.max(0, r)) * (s - 1)
  const fy = Math.min(1, Math.max(0, g)) * (s - 1)
  const fz = Math.min(1, Math.max(0, b)) * (s - 1)
  const x0 = Math.min(s - 2, Math.floor(fx))
  const y0 = Math.min(s - 2, Math.floor(fy))
  const z0 = Math.min(s - 2, Math.floor(fz))
  const tx = fx - x0
  const ty = fy - y0
  const tz = fz - z0
  out.fill(0)
  for (let dz = 0; dz <= 1; dz++) {
    const wz = dz === 0 ? 1 - tz : tz
    for (let dy = 0; dy <= 1; dy++) {
      const wy = dy === 0 ? 1 - ty : ty
      for (let dx = 0; dx <= 1; dx++) {
        const w = wz * wy * (dx === 0 ? 1 - tx : tx)
        const base = (((z0 + dz) * s + (y0 + dy)) * s + (x0 + dx)) * n
        for (let i = 0; i < n; i++) out[i] += w * lut.data[base + i]
      }
    }
  }
}

/**
 * RGBA(8bit sRGB)画像へ LUT を適用し、インクごとの coverage map を返す。
 * 戻り値は inkIds 順の Float32Array(width×height)。
 */
export function applyLutToImage(
  lut: SeparationLut,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Array<Float32Array> {
  const n = lut.inkCount
  const maps = Array.from({ length: n }, () => new Float32Array(width * height))
  // 8bit → linear の変換表
  const lin = new Float32Array(256)
  for (let i = 0; i < 256; i++) lin[i] = srgbToLinear(i / 255)
  const cov = new Float32Array(n)
  const pixelCount = width * height
  for (let p = 0; p < pixelCount; p++) {
    const o = p * 4
    sampleLut(lut, lin[rgba[o]], lin[rgba[o + 1]], lin[rgba[o + 2]], cov)
    for (let i = 0; i < n; i++) maps[i][p] = cov[i]
  }
  return maps
}

/**
 * LUT 品質の評価(§23 P1): ガモット内サンプルの再現 ΔE00 と
 * 隣接ノード間 coverage L2 距離の分布を返す。
 */
export function evaluateLut(result: BuildLutResult): {
  inGamutDeltaEMean: number
  neighborL2P99: number
} {
  const { lut, gamut, fwd } = result
  const s = lut.size
  const n = lut.inkCount
  const out = new Float32Array(3)

  // ガモット内ノードの再現誤差
  let deSum = 0
  let deCount = 0
  const node = new Float32Array(n)
  for (let z = 0; z < s; z += 2) {
    for (let y = 0; y < s; y += 2) {
      for (let x = 0; x < s; x += 2) {
        const rgb = [x / (s - 1), y / (s - 1), z / (s - 1)] as const
        const lab = xyzToLab(linearRgbToXyz(rgb))
        const mapped = mapToGamut(lab, gamut, {
          mode: 'clip',
          knee: 0.8,
          strength: 1,
        })
        // ガモット内(clip で動かない色)のみ評価
        const moved = Math.hypot(
          mapped[0] - lab[0],
          mapped[1] - lab[1],
          mapped[2] - lab[2],
        )
        if (moved > 0.5) continue
        const base = ((z * s + y) * s + x) * n
        for (let i = 0; i < n; i++) node[i] = lut.data[base + i]
        forward(node, fwd, out)
        const gotLab = xyzToLab([out[0], out[1], out[2]])
        deSum += deltaE00(gotLab, lab)
        deCount++
      }
    }
  }

  // 隣接ノード間 L2
  const dists: Array<number> = []
  for (let z = 0; z < s; z++) {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x + 1 < s; x++) {
        const a = ((z * s + y) * s + x) * n
        const b = a + n
        let d2 = 0
        for (let i = 0; i < n; i++) {
          const d = lut.data[a + i] - lut.data[b + i]
          d2 += d * d
        }
        dists.push(Math.sqrt(d2))
      }
    }
  }
  dists.sort((a, b) => a - b)
  const p99 =
    dists.length > 0 ? dists[Math.floor((dists.length - 1) * 0.99)] : 0

  return {
    inGamutDeltaEMean: deCount > 0 ? deSum / deCount : 0,
    neighborL2P99: p99,
  }
}
