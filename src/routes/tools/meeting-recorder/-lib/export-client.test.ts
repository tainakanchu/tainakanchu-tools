import { afterEach, expect, it, vi } from 'vitest'
import {
  exportTargets,
  numberedFileName,
} from '../../../../lib/meeting-recorder/export-options'
import { chooseDestinations } from './export-client'

const targets = exportTargets('meeting', 'separate', 'wav')

afterEach(() => vi.unstubAllGlobals())

function mockDirectory(getFileHandle: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('window', {
    showDirectoryPicker: vi.fn().mockResolvedValue({ getFileHandle }),
  })
}

it('rejects without creating a file when all 99 names are occupied', async () => {
  const getFileHandle = vi.fn().mockResolvedValue({})
  mockDirectory(getFileHandle)

  await expect(chooseDestinations(targets, 'wav')).rejects.toThrow(
    '空いているファイル名が見つかりません',
  )
  expect(getFileHandle.mock.calls).toEqual(
    Array.from({ length: 99 }, (_, i) => [
      numberedFileName(targets[0].fileName, i + 1),
    ]),
  )
})

it('propagates lookup errors without creating a file', async () => {
  const error = new DOMException('Permission denied', 'NotAllowedError')
  const getFileHandle = vi.fn().mockRejectedValue(error)
  mockDirectory(getFileHandle)

  await expect(chooseDestinations(targets, 'wav')).rejects.toBe(error)
  expect(getFileHandle.mock.calls).toEqual([[targets[0].fileName]])
})

it('creates the next numbered file only after a NotFoundError', async () => {
  const getFileHandle = vi.fn((name: string, options?: { create: boolean }) => {
    if (!options?.create && name !== targets[0].fileName) {
      return Promise.reject(
        new DOMException('File does not exist', 'NotFoundError'),
      )
    }
    return Promise.resolve({ name })
  })
  mockDirectory(getFileHandle)

  const outputs = await chooseDestinations(targets, 'wav')
  expect(outputs?.map((output) => output.target.fileName)).toEqual([
    numberedFileName(targets[0].fileName, 2),
    targets[1].fileName,
  ])
  expect(getFileHandle.mock.calls).toEqual([
    [targets[0].fileName],
    [numberedFileName(targets[0].fileName, 2)],
    [numberedFileName(targets[0].fileName, 2), { create: true }],
    [targets[1].fileName],
    [targets[1].fileName, { create: true }],
  ])
})
