import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { getToolMeta, toolPageTitle } from '../../../lib/site-meta'
import { DesignSection } from './-components/DesignSection'
import { MetaSection } from './-components/MetaSection'
import { PhotoSection } from './-components/PhotoSection'
import { PreviewPanel } from './-components/PreviewPanel'
import { SourceSection } from './-components/SourceSection'
import { TrackSection } from './-components/TrackSection'
import { DEFAULT_PHOTO_SETTINGS, getSize } from './-lib/layouts'
import { parseSetlistBuffer } from './-lib/parse'
import { disposePhoto, loadPhoto } from './-lib/photo'
import { createSampleSetlist } from './-lib/sample'
import { getTheme } from './-lib/themes'
import { createTrackId } from './-lib/types'
import type { CanvasSize, LayoutId, PhotoSettings } from './-lib/layouts'
import type { LoadedPhoto } from './-lib/photo'
import type { DisplayOptions, RenderInfo, RenderInput } from './-lib/render'
import type { ParseResult, Setlist } from './-lib/types'

// head() と静的 OG HTML で同じ文言を使うため site-meta を単一ソースにする
const tool = getToolMeta('setlist-card')!

export const Route = createFileRoute('/tools/setlist-card/')({
  head: () => ({
    meta: [
      { title: toolPageTitle(tool.name) },
      { name: 'description', content: tool.description },
    ],
  }),
  component: SetlistCardPage,
})

const DEFAULT_DISPLAY: DisplayOptions = {
  number: true,
  bpm: false,
  key: false,
  time: false,
  credit: true,
}

const EMPTY_SETLIST: Setlist = { tracks: [] }

/** 書き出しファイル名用（日付かイベント名から作る） */
function toFileBaseName(setlist: Setlist): string {
  const source = [setlist.title, setlist.date].filter(Boolean).join('-')
  const cleaned = source
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60)
  return cleaned ? `setlist-${cleaned}` : 'setlist'
}

function SetlistCardPage() {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [playlistIndex, setPlaylistIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [setlist, setSetlist] = useState<Setlist>(EMPTY_SETLIST)

  const [layout, setLayout] = useState<LayoutId>('list')
  const [sizeId, setSizeId] = useState<CanvasSize['id']>('portrait')
  const [themeId, setThemeId] = useState('neon')
  const [display, setDisplay] = useState<DisplayOptions>(DEFAULT_DISPLAY)

  const [photo, setPhoto] = useState<LoadedPhoto | null>(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [photoSettings, setPhotoSettings] = useState<PhotoSettings>(
    DEFAULT_PHOTO_SETTINGS,
  )
  const [photoFallback, setPhotoFallback] = useState(false)

  // 差し替えた写真のビットマップを解放する
  const photoRef = useRef<LoadedPhoto | null>(null)
  useEffect(() => {
    const prev = photoRef.current
    photoRef.current = photo
    if (prev && prev !== photo) disposePhoto(prev)
  }, [photo])
  useEffect(
    () => () => {
      if (photoRef.current) disposePhoto(photoRef.current)
    },
    [],
  )

  /** 読み込んだ値でメタ情報を埋める。手で入れた値は空でない限り残す */
  const applySetlist = useCallback((next: Setlist) => {
    setSetlist((prev) => ({
      title: next.title ?? prev.title,
      djName: next.djName ?? prev.djName,
      date: next.date ?? prev.date,
      venue: next.venue ?? prev.venue,
      tracks: next.tracks,
    }))
  }, [])

  const handleFile = async (file: File) => {
    setLoading(true)
    setError(null)
    try {
      const buffer = await file.arrayBuffer()
      const result = parseSetlistBuffer(buffer, file.name)
      setParseResult(result)
      setFileName(file.name)
      setPlaylistIndex(result.defaultIndex)
      applySetlist(result.playlists[result.defaultIndex].setlist)
      // 開始時刻があるなら最初から出しておく
      const hasTimes = result.playlists[
        result.defaultIndex
      ].setlist.tracks.some((t) => t.startAt !== undefined)
      if (hasTimes) setDisplay((prev) => ({ ...prev, time: true }))
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'ファイルを読み込めませんでした',
      )
    } finally {
      setLoading(false)
    }
  }

  const handleSample = () => {
    setParseResult(null)
    setFileName(null)
    setError(null)
    setSetlist(createSampleSetlist())
    setDisplay((prev) => ({ ...prev, bpm: true, key: true, time: true }))
  }

  const handleSelectPlaylist = (index: number) => {
    if (!parseResult) return
    setPlaylistIndex(index)
    applySetlist(parseResult.playlists[index].setlist)
  }

  const handlePhoto = async (file: File) => {
    setPhotoLoading(true)
    setPhotoError(null)
    try {
      const loaded = await loadPhoto(file)
      setPhoto(loaded)
      setPhotoSettings((prev) => ({
        ...DEFAULT_PHOTO_SETTINGS,
        mode: prev.mode,
      }))
    } catch {
      setPhotoError(
        '画像を読み込めませんでした。JPEG / PNG / WebP などで試してみてください。',
      )
    } finally {
      setPhotoLoading(false)
    }
  }

  const theme = getTheme(themeId)
  const size = getSize(sizeId)
  const input: RenderInput = useMemo(
    () => ({
      setlist,
      layout,
      size,
      theme,
      display,
      photo: photo ? { image: photo, settings: photoSettings } : null,
    }),
    [setlist, layout, size, theme, display, photo, photoSettings],
  )

  const handleRendered = useCallback((info: RenderInfo) => {
    setPhotoFallback(info.photoFallback)
  }, [])

  const hasStartTimes = setlist.tracks.some((t) => t.startAt !== undefined)

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-gray-950 text-gray-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
        <header className="space-y-3">
          <h1 className="text-3xl font-bold">{tool.name}</h1>
          <p className="max-w-3xl text-sm leading-relaxed text-gray-400">
            DJ ソフトの再生履歴を読み込んで、SNS
            にそのまま載せられるセトリ画像を作ります。曲名の直し・並べ替え・
            レイアウトやテーマの切り替えをして、PNG で保存できます。
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="flex min-w-0 flex-col gap-6">
            <SourceSection
              result={parseResult}
              fileName={fileName}
              selectedIndex={playlistIndex}
              loading={loading}
              error={error}
              onFile={(file) => void handleFile(file)}
              onSample={handleSample}
              onSelectPlaylist={handleSelectPlaylist}
            />
            <MetaSection
              setlist={setlist}
              onChange={(key, value) =>
                setSetlist((prev) => ({ ...prev, [key]: value }))
              }
            />
            <TrackSection
              tracks={setlist.tracks}
              onChange={(tracks) => setSetlist((prev) => ({ ...prev, tracks }))}
              onAdd={() =>
                setSetlist((prev) => ({
                  ...prev,
                  tracks: [
                    ...prev.tracks,
                    { id: createTrackId(), artist: '', title: '' },
                  ],
                }))
              }
            />
            <DesignSection
              layout={layout}
              onLayoutChange={setLayout}
              sizeId={sizeId}
              onSizeChange={setSizeId}
              themeId={themeId}
              onThemeChange={setThemeId}
              display={display}
              onDisplayChange={setDisplay}
              hasStartTimes={hasStartTimes}
            />
            <PhotoSection
              photo={photo}
              loading={photoLoading}
              error={photoError}
              settings={photoSettings}
              onSettingsChange={setPhotoSettings}
              onFile={(file) => void handlePhoto(file)}
              onRemove={() => setPhoto(null)}
              fallback={photo !== null && photoFallback}
            />
          </div>

          <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
            <PreviewPanel
              input={input}
              fileBaseName={toFileBaseName(setlist)}
              onRendered={handleRendered}
              onPhotoSettingsChange={setPhotoSettings}
            />
          </div>
        </div>
      </div>
    </main>
  )
}
