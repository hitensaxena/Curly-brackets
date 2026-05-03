import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link2 } from 'lucide-react'
import { parseGenUI, hasGenUI } from './genui/parser'
import { GenUIBlock } from './genui/registry'
import type { GenUIAction } from './genui/schemas'

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
const WIKILINK_HREF_PREFIX = 'wikilink:'

/**
 * Pre-process [[Note Name]] and [[Note Name|Display]] into pseudo-markdown links
 * so the existing `a` component override can render them as styled chips.
 */
function preprocessWikilinks(text: string): string {
  return text.replace(WIKILINK_RE, (_, target: string, display?: string) => {
    const label = (display ?? target).trim()
    const t = target.trim()
    return `[${label}](${WIKILINK_HREF_PREFIX}${encodeURIComponent(t)})`
  })
}

/**
 * Themed markdown renderer for agent/workflow outputs.
 * Supports GFM (tables, strikethrough, task lists, autolinks), inline
 * generative-UI components via ` ```ui:<type> {...} ``` ` fences, and
 * Obsidian-style `[[wikilinks]]` rendered as clickable chips.
 */
export function Markdown({
  children,
  onAction,
  onWikilink
}: {
  children: string
  onAction?: (a: GenUIAction) => void
  onWikilink?: (target: string) => void
}) {
  // Fast path: no genui block → just render as before
  if (!hasGenUI(children)) {
    return <MarkdownInner onWikilink={onWikilink}>{children}</MarkdownInner>
  }
  const segments = parseGenUI(children)
  return (
    <div className="space-y-1">
      {segments.map((seg, i) =>
        seg.kind === 'markdown'
          ? <MarkdownInner key={i} onWikilink={onWikilink}>{seg.text}</MarkdownInner>
          : <GenUIBlock key={i} type={seg.type} data={seg.data} raw={seg.raw} error={seg.error} onAction={onAction} />
      )}
    </div>
  )
}

function MarkdownInner({ children, onWikilink }: { children: string; onWikilink?: (target: string) => void }) {
  const processed = preprocessWikilinks(children)
  void onWikilink // referenced inside the renderer below

  return (
    <div className="markdown-output text-xs text-slate-200 leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="text-base font-semibold text-white mt-3 mb-1.5" {...p} />,
          h2: (p) => <h2 className="text-sm font-semibold text-white mt-3 mb-1.5" {...p} />,
          h3: (p) => <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mt-2 mb-1" {...p} />,
          p: (p) => <p className="my-1.5" {...p} />,
          ul: (p) => <ul className="list-disc pl-5 my-1.5 space-y-0.5" {...p} />,
          ol: (p) => <ol className="list-decimal pl-5 my-1.5 space-y-0.5" {...p} />,
          li: (p) => <li className="leading-relaxed" {...p} />,
          a: ({ href, children: linkChildren, ...rest }) => {
            if (typeof href === 'string' && href.startsWith(WIKILINK_HREF_PREFIX)) {
              const target = decodeURIComponent(href.slice(WIKILINK_HREF_PREFIX.length))
              return (
                <button
                  onClick={(e) => { e.preventDefault(); onWikilink?.(target) }}
                  disabled={!onWikilink}
                  className="inline-flex items-baseline gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 hover:bg-amber-500/20 cursor-pointer disabled:cursor-default disabled:opacity-60 mx-0.5"
                  title={onWikilink ? `Pin "${target}" to this conversation` : target}
                >
                  <Link2 size={9} className="self-center" />
                  {linkChildren}
                </button>
              )
            }
            return <a href={href} className="text-indigo-400 hover:underline" target="_blank" rel="noreferrer" {...rest}>{linkChildren}</a>
          },
          strong: (p) => <strong className="text-white font-semibold" {...p} />,
          em: (p) => <em className="text-slate-100 italic" {...p} />,
          blockquote: (p) => (
            <blockquote className="border-l-2 border-indigo-500/50 pl-3 my-2 text-slate-300 italic" {...p} />
          ),
          hr: () => <hr className="border-white/10 my-3" />,
          code: ({ className, children, ...rest }) => {
            const isBlock = /language-/.test(className ?? '')
            if (isBlock) {
              return (
                <code
                  className="block bg-black/40 border border-white/5 rounded p-2 my-2 text-[11px] font-mono text-slate-100 overflow-x-auto whitespace-pre"
                  {...rest}
                >
                  {children}
                </code>
              )
            }
            return (
              <code className="bg-white/10 px-1 py-0.5 rounded text-[11px] font-mono text-amber-300" {...rest}>
                {children}
              </code>
            )
          },
          pre: ({ children }) => <pre className="my-0">{children}</pre>,
          table: (p) => (
            <div className="overflow-x-auto my-2">
              <table className="text-[11px] border-collapse border border-white/10" {...p} />
            </div>
          ),
          th: (p) => <th className="border border-white/10 px-2 py-1 bg-white/5 text-left font-semibold" {...p} />,
          td: (p) => <td className="border border-white/10 px-2 py-1" {...p} />
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  )
}
