/**
 * 「じゃあ実際どこで探すの」への外部検索リンクを並べる表示コンポーネント。
 *
 * リンク自体は searchLinks.ts が地名・日付から組み立てる純関数群の仕事で、
 * ここは並べるだけ。まだ予約が取れていない予定(BookingCard)と
 * 宿泊先が未定の夜(GapAlertCard)の両方から使う。
 *
 * 外部リンクは target="_blank" + rel="noopener noreferrer" の控えめなチップにし、
 * アイコンは付けず、見出しの側で「別サイト」と言葉で添える(docs/design.md)。
 * リンクが 0 件(地名が取れない等)のときは何も描画しない。
 * 「探す先が無いカードにも空の見出しだけ出る」より、丸ごと出ないほうが
 * 一覧を流し見したときに素直だからである。
 */

import type { SearchLink } from '../../../../lib/trip-notes/searchLinks'

interface SearchLinksProps {
  links: Array<SearchLink>
  /** 見出しの文言。用途に応じて呼び出し側から変えられるようにする */
  label?: string
}

export function SearchLinks({
  links,
  label = '探す（別サイト）',
}: SearchLinksProps) {
  if (links.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      {links.map((link) => (
        <a
          key={link.label}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-ui border border-ink bg-paper px-2 py-0.5 text-xs font-medium text-ink transition hover:bg-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {link.label}
        </a>
      ))}
    </div>
  )
}
