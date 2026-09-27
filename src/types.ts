export interface SvgFilePayload {
  path: string
  name: string
  content: string
}

export interface ElementStats {
  total: number
  tags: Array<[string, number]>
}

export interface ParsedSvg {
  svg: SVGSVGElement
  width: number
  height: number
  viewBox: string | null
  stats: ElementStats
  hasSmil: boolean
  hasCssAnim: boolean
}

export interface Doc {
  id: number
  path: string
  name: string
  raw: string
  svg: SVGSVGElement
  width: number
  height: number
  viewBox: string | null
  stats: ElementStats
  hasSmil: boolean
  hasCssAnim: boolean
}

export type Background = 'checker' | 'white' | 'dark'
export type ThemeMode = 'auto' | 'light' | 'dark'
export type ExportEngine = 'webview' | 'rust'
