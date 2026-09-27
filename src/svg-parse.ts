import type { ElementStats, ParsedSvg } from './types'

function parseLength(value: string | null): number {
  if (!value) return 0
  const m = /^\s*([\d.]+)/.exec(value)
  const n = m ? parseFloat(m[1]) : NaN
  return Number.isFinite(n) && n > 0 ? n : 0
}

function collectStats(svg: SVGSVGElement): ElementStats {
  const tags = new Map<string, number>()
  let total = 0
  svg.querySelectorAll('*').forEach((node) => {
    total += 1
    const tag = node.tagName.toLowerCase()
    tags.set(tag, (tags.get(tag) ?? 0) + 1)
  })
  const sorted = [...tags.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return { total, tags: sorted }
}

/** 安全处理：预览前剥离 <script> 与 on* 事件属性 */
function sanitize(svg: SVGSVGElement): void {
  svg.querySelectorAll('script').forEach((s) => s.remove())
  svg.querySelectorAll('*').forEach((node) => {
    for (const attr of Array.from(node.attributes)) {
      if (/^on/i.test(attr.name)) node.removeAttribute(attr.name)
    }
  })
}

function detectAnimations(svg: SVGSVGElement): { hasSmil: boolean; hasCssAnim: boolean } {
  const hasSmil = svg.querySelector('animate, animateTransform, animateMotion, set') !== null
  let hasCssAnim = false
  if (!hasSmil) {
    svg.querySelectorAll('style').forEach((s) => {
      const text = s.textContent ?? ''
      if (text.includes('@keyframes') || /animation\s*:/.test(text)) hasCssAnim = true
    })
    if (!hasCssAnim) {
      svg.querySelectorAll('*').forEach((node) => {
        const style = node.getAttribute('style') ?? ''
        if (/animation\s*:/.test(style)) hasCssAnim = true
      })
    }
  }
  return { hasSmil, hasCssAnim }
}

export function parseSvg(content: string): ParsedSvg {
  const parsed = new DOMParser().parseFromString(content, 'image/svg+xml')
  const err = parsed.querySelector('parsererror')
  if (err) throw new Error('SVG 解析失败，文件可能不是合法的 SVG')

  const svg = parsed.documentElement as unknown as SVGSVGElement
  if (!svg || svg.nodeName.toLowerCase() !== 'svg') throw new Error('不是有效的 SVG 文件')

  sanitize(svg)

  let width = 0
  let height = 0
  const viewBox = svg.getAttribute('viewBox')
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      width = parts[2]
      height = parts[3]
    }
  }
  if (!width) width = parseLength(svg.getAttribute('width'))
  if (!height) height = parseLength(svg.getAttribute('height'))
  if (!width) width = 300
  if (!height) height = 150

  const { hasSmil, hasCssAnim } = detectAnimations(svg)
  return { svg, width, height, viewBox, stats: collectStats(svg), hasSmil, hasCssAnim }
}
