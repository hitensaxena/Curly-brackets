/**
 * Generative UI fence parser.
 *
 * Detects fenced code blocks tagged with the ui:<type> info string, e.g.:
 *
 *   ```ui:table
 *   { "columns": ["Name", "Cost"], "rows": [["Pete", "$0.02"]] }
 *   ```
 *
 * Splits message content into an alternating list of plain markdown segments
 * and structured UI segments so the chat can render each appropriately.
 */

export type GenUISegment =
  | { kind: 'markdown'; text: string }
  | { kind: 'genui'; type: string; data: unknown; raw: string; error?: string }

const FENCE_RE = /```ui:([a-zA-Z0-9_-]+)\s*\n([\s\S]*?)\n```/g

export function parseGenUI(text: string): GenUISegment[] {
  if (!text) return []
  const segments: GenUISegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  // Reset since regex is stateful with /g flag
  FENCE_RE.lastIndex = 0
  while ((match = FENCE_RE.exec(text)) !== null) {
    const [fullMatch, type, body] = match
    const start = match.index
    const end = start + fullMatch.length

    // Push preceding markdown
    if (start > lastIndex) {
      const md = text.slice(lastIndex, start)
      if (md.trim().length > 0) segments.push({ kind: 'markdown', text: md })
    }

    // Try to parse the body as JSON. If it fails, fall back to a markdown code block
    let data: unknown
    let error: string | undefined
    try {
      data = JSON.parse(body)
    } catch (err) {
      error = (err as Error).message
      data = body
    }

    segments.push({ kind: 'genui', type, data, raw: body, error })
    lastIndex = end
  }

  if (lastIndex < text.length) {
    const tail = text.slice(lastIndex)
    if (tail.trim().length > 0) segments.push({ kind: 'markdown', text: tail })
  }

  if (segments.length === 0) segments.push({ kind: 'markdown', text })
  return segments
}

export function hasGenUI(text: string): boolean {
  return /```ui:[a-zA-Z0-9_-]+/.test(text)
}
