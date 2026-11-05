import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { getToolMeta, toolPageTitle } from '../../../lib/site-meta'
import { AdvancedSettings } from './-components/AdvancedSettings'
import { MetaLine, SourceLine } from './-components/DataLines'
import { EmptyStage } from './-components/EmptyStage'
import { PalettePicker } from './-components/PalettePicker'
import { PhotoSection } from './-components/PhotoSection'
import { PreviewStage } from './-components/PreviewStage'
import { SaveBar } from './-components/SaveBar'
import { LockChip, ShuffleControls } from './-components/ShuffleControls'
import { TemplatePicker } from './-components/TemplatePicker'
import { TrackSection } from './-components/TrackSection'
import { Segmented } from './-components/ui'
import { useSetlistRender } from './-components/useSetlistRender'
import { fileBaseName } from './-lib/export'
import { ensureFontStylesheet } from './-lib/fonts'
import {
  CANVAS_SIZES,
  DEFAULT_LAYOUT,
  DEFAULT_PHOTO_SETTINGS,
  getSize,
} from './-lib/layouts'
import {
  loadMyPalettes,
  newMyPaletteId,
  saveMyPalettes,
} from './-lib/my-palettes'
import { autoCandidate, buildCandidates } from './-lib/palette-extract'
import {
  DEFAULT_PALETTE_ID,
  PRESET_PALETTES,
  getPreset,
  sameColors,
} from './-lib/palettes'
import { parseSetlistBuffer } from './-lib/parse'
import { disposePhoto, loadPhoto } from './-lib/photo'
import { mulberry32 } from './-lib/random'
import { DEFAULT_REDACT, parseRedact } from './-lib/redact'
import { loadRemembered, saveRemembered } from './-lib/remember'
import { createSampleSetlist, createStressSetlist } from './-lib/sample'
import {
  EMPTY_HISTORY,
  afterShuffle,
  canGoBack,
  canGoForward,
  comboKey,
  goBack,
  goForward,
  pushRecent,
  randomLayouts,
  shuffleDesign,
} from './-lib/shuffle'
import { DEFAULT_SPLIT_CHOICE } from './-lib/split'
import { templateStyle } from './-lib/tpl-common'
import { createTrackId } from './-lib/types'
import './-components/setlist.css'
import type {
  CanvasSize,
  ColumnsSetting,
  LayoutId,
  PhotoSettings,
} from './-lib/layouts'
import type { ShuffleActions } from './-components/ShuffleControls'
import type { Palette } from './-lib/palettes'
import type { RedactOptions } from './-lib/redact'
import type { Design, DesignHistory, ShuffleLocks } from './-lib/shuffle'
import type { SplitChoice } from './-lib/split'
import type { LoadedPhoto } from './-lib/photo'
import type {
  DisplayOptions,
  RenderInput,
  StyleOptions,
  TextOptions,
} from './-lib/render'
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

/**
 * 画像に出す項目の既定。時刻・BPM・Key は曲名の幅を食うので既定では出さず
 * （詳細設定の「表示する項目」で出す）、クレジットも既定では入れない。
 */
const DEFAULT_DISPLAY: DisplayOptions = {
  number: true,
  bpm: false,
  key: false,
  time: false,
  label: false,
  credit: false,
}

const DEFAULT_PALETTE: Palette =
  getPreset(DEFAULT_PALETTE_ID) ?? PRESET_PALETTES[0]

/**
 * 曲名は既定では読み込んだまま出す（ミックス表記も feat. も省かない）。
 * 「(Original Mix)」などを省くのは詳細設定で自分で選ぶ。
 */
const DEFAULT_TEXT: TextOptions = {
  longText: 'ellipsis',
  stripMix: false,
  stripFeat: false,
}

const EMPTY_SETLIST: Setlist = { tracks: [] }

const SIZE_NAMES: Record<CanvasSize['id'], string> = {
  portrait: '投稿',
  story: 'ストーリーズ',
  square: '正方形',
  wide: '横長',
}

/** 開発中か ?debug=1 のときだけ、長いセットのサンプル（50 曲・80 曲）を出す */
function debugEnabled(): boolean {
  if (import.meta.env.DEV) return true
  try {
    return new URLSearchParams(window.location.search).get('debug') === '1'
  } catch {
    return false
  }
}

const isImage = (file: File) =>
  file.type.startsWith('image/') ||
  /\.(jpe?g|png|webp|gif|heic|avif)$/i.test(file.name)

function SetlistCardPage() {
  const [remembered] = useState(loadRemembered)
  const [debug] = useState(debugEnabled)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [playlistIndex, setPlaylistIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [setlist, setSetlist] = useState<Setlist>(EMPTY_SETLIST)
  /** 読み込むか、サンプルか、手で入れ始めたか（それまでは空の枠だけを出す） */
  const [started, setStarted] = useState(false)
  const [tracksOpen, setTracksOpen] = useState(false)

  const setlistInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ensureFontStylesheet()
  }, [])

  const initialLayout = remembered.layout ?? DEFAULT_LAYOUT
  const [layout, setLayoutState] = useState<LayoutId>(initialLayout)
  const [style, setStyle] = useState<StyleOptions>(() =>
    templateStyle(initialLayout),
  )
  // 自分でテンプレートを選んだか（まだなら、写真を入れたときにフォトへ切り替える）
  const layoutTouched = useRef(false)
  const setLayout = useCallback((next: LayoutId, byUser = true) => {
    if (byUser) layoutTouched.current = true
    setLayoutState(next)
    setStyle((prev) => templateStyle(next, prev))
  }, [])
  const [sizeId, setSizeId] = useState<CanvasSize['id']>(
    remembered.sizeId ?? 'portrait',
  )
  const [palette, setPaletteState] = useState<Palette>(
    remembered.palette ?? DEFAULT_PALETTE,
  )
  // 自分でパレットを選んだか（まだなら、写真を入れたときに「写真から自動」にする）
  const paletteTouched = useRef(false)
  const setPalette = useCallback((next: Palette) => {
    paletteTouched.current = true
    setPaletteState(next)
  }, [])
  const [myPalettes, setMyPalettes] = useState<Array<Palette>>(() =>
    loadMyPalettes(),
  )
  const [display, setDisplay] = useState<DisplayOptions>(DEFAULT_DISPLAY)
  const [textOptions, setTextOptions] = useState<TextOptions>(DEFAULT_TEXT)
  const [columns, setColumns] = useState<ColumnsSetting>('auto')
  const [splitChoice, setSplitChoice] =
    useState<SplitChoice>(DEFAULT_SPLIT_CHOICE)
  const [redact, setRedact] = useState<RedactOptions>(DEFAULT_REDACT)

  // 最後に使ったテンプレート・配色・サイズを覚える（写真の配色は覚えない）
  useEffect(() => {
    saveRemembered({ layout, palette, sizeId })
  }, [layout, palette, sizeId])

  const [photo, setPhoto] = useState<LoadedPhoto | null>(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [photoSettings, setPhotoSettings] = useState<PhotoSettings>(
    DEFAULT_PHOTO_SETTINGS,
  )

  const candidates = useMemo(
    () => (photo ? buildCandidates(photo.swatches) : []),
    [photo],
  )
  const photoAuto = useMemo((): Palette | null => {
    if (!photo || candidates.length === 0) return null
    const id = autoCandidate(photo.swatches)
    const base = candidates.find((c) => c.candidate === id) ?? candidates[0]
    return { ...base, id: 'photo-auto', name: '写真から自動' }
  }, [photo, candidates])

  // 「写真から自動」を選んでいるときに写真を差し替えたら、新しい写真の配色にする
  useEffect(() => {
    if (palette.id === 'photo-auto' && photoAuto && palette !== photoAuto) {
      if (!sameColors(palette, photoAuto)) setPaletteState(photoAuto)
    }
  }, [palette, photoAuto])

  const updateMyPalettes = (next: Array<Palette>): boolean => {
    setMyPalettes(next)
    return saveMyPalettes(next)
  }

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
      setStarted(true)
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'ファイルを読み込めませんでした',
      )
    } finally {
      setLoading(false)
    }
  }

  const handleSample = (count?: number) => {
    setParseResult(null)
    setFileName(null)
    setError(null)
    setSetlist(count ? createStressSetlist(count) : createSampleSetlist())
    setStarted(true)
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
      // いちばんの使い方（写真を背景にセトリを重ねる）に合わせて、
      // まだテンプレートを選んでいなければフォトにする
      if (!layoutTouched.current) setLayout('photo', false)
      if (!paletteTouched.current) {
        const fresh = buildCandidates(loaded.swatches)
        const id = autoCandidate(loaded.swatches)
        const auto = fresh.find((c) => c.candidate === id)
        if (auto)
          setPaletteState({ ...auto, id: 'photo-auto', name: '写真から自動' })
      }
      setPhotoSettings((prev) => ({
        ...DEFAULT_PHOTO_SETTINGS,
        mode: prev.mode,
      }))
    } catch {
      setPhotoError('画像を読み込めません。JPEG・PNG・WebP で')
    } finally {
      setPhotoLoading(false)
    }
  }

  const addTrack = () => {
    setSetlist((prev) => ({
      ...prev,
      tracks: [...prev.tracks, { id: createTrackId(), artist: '', title: '' }],
    }))
    setTracksOpen(true)
    setStarted(true)
  }

  // ドロップはページのどこでも受ける（画像なら写真、それ以外は履歴）。
  // 外したファイルがブラウザで開かれてしまうのも防ぐ
  useEffect(() => {
    const prevent = (event: DragEvent) => event.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])
  const handleDrop = (file: File) => {
    if (isImage(file)) {
      if (started) void handlePhoto(file)
      return
    }
    void handleFile(file)
  }

  // ランダム: テンプレート × パレット × 文字組みだけを選び直す（曲・サイズ・写真の位置などは触らない）
  const [locks, setLocks] = useState<ShuffleLocks>({
    layout: false,
    palette: false,
  })
  const [history, setHistory] = useState<DesignHistory>(EMPTY_HISTORY)
  const [recent, setRecent] = useState<Array<string>>([])
  const rngRef = useRef(mulberry32(Date.now() % 2147483647))
  const design: Design = { layout, palette, style }
  const applyDesign = (next: Design) => {
    layoutTouched.current = true
    paletteTouched.current = true
    setLayoutState(next.layout)
    setStyle(next.style)
    setPaletteState(next.palette)
  }
  const handleShuffle = () => {
    const next = shuffleDesign(design, {
      locks,
      layouts: randomLayouts(photo !== null, photoSettings.mode === 'block'),
      presets: PRESET_PALETTES,
      photoPalettes: candidates,
      recent,
      rng: rngRef.current,
    })
    if (!next) return
    setHistory(afterShuffle(history, design, next))
    setRecent(
      pushRecent(
        recent,
        comboKey(design.layout, design.palette),
        comboKey(next.layout, next.palette),
      ),
    )
    applyDesign(next)
  }
  const handleBack = () => {
    const r = goBack(history, design)
    if (!r) return
    setHistory(r.history)
    applyDesign(r.design)
  }
  const handleForward = () => {
    const r = goForward(history, design)
    if (!r) return
    setHistory(r.history)
    applyDesign(r.design)
  }
  const shuffleProps: ShuffleActions = {
    onShuffle: handleShuffle,
    onBack: handleBack,
    onForward: handleForward,
    canBack: canGoBack(history, design),
    canForward: canGoForward(history, design),
    locks,
    onLocksChange: setLocks,
  }

  const size = getSize(sizeId)
  const input: RenderInput = useMemo(
    () => ({
      setlist,
      layout,
      size,
      palette,
      style,
      display,
      text: textOptions,
      columns,
      // 実際の枚数は useSetlistRender が splitChoice から決める
      split: { enabled: false, mode: 'auto', count: splitChoice.count },
      redact,
      photo: photo ? { image: photo, settings: photoSettings } : null,
    }),
    [
      setlist,
      layout,
      size,
      palette,
      style,
      display,
      textOptions,
      columns,
      splitChoice.count,
      redact,
      photo,
      photoSettings,
    ],
  )

  const view = useSetlistRender(
    input,
    splitChoice,
    fileBaseName({ title: setlist.title, date: setlist.date }),
  )
  const first = view.infos.at(0)
  const hasStartTimes = setlist.tracks.some((t) => t.startAt !== undefined)

  return (
    <main
      className="slc"
      onDrop={(event) => {
        const file = event.dataTransfer.files.item(0)
        if (!file) return
        event.preventDefault()
        handleDrop(file)
      }}
    >
      <input
        ref={setlistInput}
        type="file"
        accept=".xml,.txt,.nml,.csv,text/plain,text/csv,application/xml,text/xml"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void handleFile(file)
          // 同じファイルを選び直しても change が飛ぶように
          event.target.value = ''
        }}
      />
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void handlePhoto(file)
          event.target.value = ''
        }}
      />

      <div className="mx-auto w-full max-w-[1240px] px-4 lg:px-8">
        <header
          className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 py-5 lg:py-6 ${started ? '' : 'lg:justify-center'}`}
        >
          <h1 className="slc-title">{tool.name}</h1>
          <p className="text-(--muted)">
            昨夜のセトリ、そのまま載せる。画像はブラウザの中だけで作る。
          </p>
        </header>

        {!started ? (
          <div className="pb-10">
            <EmptyStage
              input={input}
              loading={loading}
              error={error}
              onPick={() => setlistInput.current?.click()}
              onFile={(file) => void handleFile(file)}
              onSample={() => handleSample()}
            />
            <div className="mx-auto mt-2 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className="slc-btn"
                data-variant="ghost"
                onClick={addTrack}
              >
                曲を手で入れる
              </button>
              {debug
                ? [50, 80].map((count) => (
                    <button
                      key={count}
                      type="button"
                      className="slc-btn mono"
                      data-variant="ghost"
                      onClick={() => handleSample(count)}
                      title="長い曲名を含む長いセットのサンプル（開発用）"
                    >
                      {count} 曲
                    </button>
                  ))
                : null}
            </div>
          </div>
        ) : (
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12">
            <div className="slc-stage lg:sticky lg:top-[calc(4rem+8px)] lg:self-start">
              <PreviewStage
                canvasRefs={view.canvasRefs}
                plan={view.plan}
                infos={view.infos}
                input={view.renderInput}
                splitChoice={splitChoice}
                onSplitChoiceChange={setSplitChoice}
                onPhotoSettingsChange={setPhotoSettings}
              />
            </div>

            <div className="flex min-w-0 flex-col lg:block">
              <div className="slc-row-soft order-2 lg:border-t-0">
                <SourceLine
                  result={parseResult}
                  fileName={fileName}
                  selectedIndex={playlistIndex}
                  loading={loading}
                  error={error}
                  onPick={() => setlistInput.current?.click()}
                  onSelectPlaylist={handleSelectPlaylist}
                />
              </div>
              <div className="slc-row-soft order-2">
                <MetaLine
                  setlist={setlist}
                  onChange={(key, value) =>
                    setSetlist((prev) => ({ ...prev, [key]: value }))
                  }
                />
              </div>
              <div className="slc-row-soft order-2">
                <TrackSection
                  tracks={setlist.tracks}
                  onChange={(tracks) =>
                    setSetlist((prev) => ({ ...prev, tracks }))
                  }
                  onAdd={addTrack}
                  open={tracksOpen}
                  onOpenChange={setTracksOpen}
                />
              </div>

              {/* phone ではプレビューのすぐ下に、選ぶもの（ランダム・テンプレート・配色・サイズ・写真）を先に置く */}
              <div className="slc-row order-1 space-y-3 pt-3 pb-5 max-lg:border-t-0">
                <ShuffleControls {...shuffleProps} />
                <TemplatePicker
                  layout={layout}
                  onChange={setLayout}
                  input={input}
                  aside={
                    <LockChip
                      target="layout"
                      locks={locks}
                      onLocksChange={setLocks}
                    />
                  }
                />
                <PalettePicker
                  palette={palette}
                  onChange={setPalette}
                  photoPalettes={candidates}
                  aside={
                    <LockChip
                      target="palette"
                      locks={locks}
                      onLocksChange={setLocks}
                    />
                  }
                />
                <Segmented
                  label="サイズ"
                  value={sizeId}
                  options={CANVAS_SIZES.map((s) => ({
                    value: s.id,
                    label: SIZE_NAMES[s.id],
                    title: s.label,
                  }))}
                  onChange={setSizeId}
                />
                <PhotoSection
                  photo={photo}
                  loading={photoLoading}
                  error={photoError}
                  settings={photoSettings}
                  onSettingsChange={setPhotoSettings}
                  onPick={() => photoInput.current?.click()}
                  onRemove={() => setPhoto(null)}
                  fallback={photo !== null && (first?.photoFallback ?? false)}
                  layout={layout}
                  contrast={photo ? (first?.photoContrast ?? null) : null}
                />
                <SaveBar state={view.exportState} />
              </div>

              <AdvancedSettings
                className="order-3"
                layout={layout}
                sizeId={sizeId}
                style={style}
                onStyleChange={setStyle}
                display={display}
                onDisplayChange={setDisplay}
                hasStartTimes={hasStartTimes}
                textOptions={textOptions}
                onTextOptionsChange={setTextOptions}
                columns={columns}
                onColumnsChange={setColumns}
                splitChoice={splitChoice}
                onSplitChoiceChange={setSplitChoice}
                redact={redact}
                onRedactChange={(next) => setRedact(parseRedact(next))}
                paletteEditor={{
                  palette,
                  onChange: setPalette,
                  myPalettes,
                  onSaveMine: (p, name) => {
                    const saved: Palette = { ...p, id: newMyPaletteId(), name }
                    const ok = updateMyPalettes([...myPalettes, saved])
                    setPalette(saved)
                    return ok
                  },
                  onRenameMine: (id, name) => {
                    updateMyPalettes(
                      myPalettes.map((p) => (p.id === id ? { ...p, name } : p)),
                    )
                    if (palette.id === id) setPalette({ ...palette, name })
                  },
                  onDeleteMine: (id) => {
                    updateMyPalettes(myPalettes.filter((p) => p.id !== id))
                  },
                  photoSwatches: photo?.swatches ?? [],
                }}
              />
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
