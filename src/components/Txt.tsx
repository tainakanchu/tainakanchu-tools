import { Fragment } from 'react'
import { langOf } from '@/lib/cjk/lang'

/**
 * 利用者の入れた文字列を、文字体系に合った lang 付きで描く。
 * 簡体字・繁体字・ハングルの名前が日本語の書体と混ざらないよう、
 * styles.css の :lang() が文字列ごとに書体を切り替える。
 * ページの ja のままでよい文字列は span を足さずにそのまま描く。
 */
export function Txt({ text }: { text: string | null | undefined }) {
  if (!text) return null
  const lang = langOf(text)
  return lang ? <span lang={lang}>{text}</span> : <>{text}</>
}

/** 複数の文字列を区切り文字でつなぎ、それぞれに lang を付ける */
export function TxtList({
  items,
  separator = '、',
}: {
  items: ReadonlyArray<string>
  separator?: string
}) {
  return (
    <>
      {items.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && separator}
          <Txt text={item} />
        </Fragment>
      ))}
    </>
  )
}
