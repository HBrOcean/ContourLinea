import type { Doc, SvgFilePayload } from './types'
import { activeDoc, state } from './state'
import { parseSvg } from './svg-parse'

/* --------------------------------- 元素 --------------------------------- */

const $ = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id)
  if (!node) throw new Error(`missing #${id}`)
  return node as T
}

const stage = $<HTMLDivElement>('stage')
const canvas = $<HTMLDivElement>('canvas')
const emptyEl = $<HTMLDivElement>('empty')
const dropOverlay = $<HTMLDivElement>('drop-overlay')
const zoomLevelEl = $<HTMLButtonElement>('btn-zoom-level')
const bgBtn = $<HTMLButtonElement>('btn-bg')
const gridBtn = $<HTMLButtonElement>('btn-grid')
const measureBtn = $<HTMLButtonElement>('btn-measure')
const posChip = $<HTMLDivElement>('pos-chip')
const animBar = $<HTMLDivElement>('anim-bar')
const animToggleBtn = $<HTMLButtonElement>('btn-anim-toggle')
const animTimeEl = $<HTMLElement>('anim-time')
const animSlider = $<HTMLInputElement>('anim-slider')

/** 当前画布上的 <svg> 元素（动画控制需要） */
let currentSvgEl: SVGSVGElement | null = null

/** 文档/视图变更订阅（tabs、inspector、最近文件等面板刷新用） */
const docListeners: Array<() => void> = []

export function onDocChanged(fn: () => void): void {
  docListeners.push(fn)
}

function notifyChanged(): void {
  docListeners.forEach((fn) => fn())
}

/* ------------------------------ 文档管理 ------------------------------ */

let uidCounter = 0

export function addFiles(files: SvgFilePayload[]): { ok: number; failed: number } {
  let ok = 0
  let failed = 0
  let firstNewId = -1

  for (const file of files) {
    try {
      const parsed = parseSvg(file.content)
      const doc: Doc = {
        id: ++uidCounter,
        path: file.path,
        name: file.name,
        raw: file.content,
        svg: parsed.svg,
        width: parsed.width,
        height: parsed.height,
        viewBox: parsed.viewBox,
        stats: parsed.stats,
        hasSmil: parsed.hasSmil,
        hasCssAnim: parsed.hasCssAnim
      }
      state.docs.push(doc)
      if (firstNewId < 0) firstNewId = doc.id
      ok += 1
    } catch {
      failed += 1
    }
  }

  if (firstNewId >= 0) activate(firstNewId)
  else notifyChanged()
  return { ok, failed }
}

export function activate(id: number): void {
  state.activeId = id
  state.measure.points = []
  renderCanvas()
  fitView()
  notifyChanged()
}

export function closeActive(): void {
  const idx = state.docs.findIndex((d) => d.id === state.activeId)
  if (idx < 0) return
  state.docs.splice(idx, 1)
  const next = state.docs[idx] ?? state.docs[idx - 1] ?? null
  if (next) {
    activate(next.id)
  } else {
    state.activeId = -1
    state.measure.points = []
    renderCanvas()
    notifyChanged()
  }
}

/* ------------------------------ 渲染预览 ------------------------------ */

export function applyBackground(): void {
  stage.classList.remove('bg-checker', 'bg-white', 'bg-dark')
  stage.classList.add(`bg-${state.background}`)
  bgBtn.textContent = `背景：${state.background === 'checker' ? '棋盘' : state.background === 'white' ? '白色' : '深色'}`
}

export function renderCanvas(): void {
  const doc = activeDoc()
  canvas.textContent = ''
  currentSvgEl = null
  animBar.hidden = true
  if (!doc) {
    emptyEl.hidden = false
    return
  }
  emptyEl.hidden = true

  const node = document.importNode(doc.svg, true) as SVGSVGElement
  node.setAttribute('width', String(doc.width))
  node.setAttribute('height', String(doc.height))
  if (!node.getAttribute('viewBox') && doc.viewBox) node.setAttribute('viewBox', doc.viewBox)

  const wrap = document.createElement('div')
  wrap.className = 'svg-wrap'
  wrap.style.width = `${doc.width}px`
  wrap.style.height = `${doc.height}px`
  wrap.appendChild(node)

  // 测量层：与内容同尺寸、同变换
  const measureLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  measureLayer.setAttribute('class', 'measure-layer')
  measureLayer.setAttribute('viewBox', `0 0 ${doc.width} ${doc.height}`)
  wrap.appendChild(measureLayer)

  canvas.appendChild(wrap)
  currentSvgEl = node
  applyTransform()
  updateAnimBar(doc)
}

function updateAnimBar(doc: Doc): void {
  const hasAnim = doc.hasSmil || doc.hasCssAnim
  animBar.hidden = !hasAnim
  if (hasAnim) {
    state.animPaused = false
    animToggleBtn.textContent = '⏸'
    setCssAnimPaused(false)
  }
}

export function applyTransform(): void {
  const wrap = canvas.querySelector<HTMLElement>('.svg-wrap')
  if (!wrap) return
  wrap.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`
  zoomLevelEl.textContent = `${Math.round(state.scale * 100)}%`
  updateGrid()
}

const MIN_SCALE = 0.02
const MAX_SCALE = 40
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

export function fitView(): void {
  const doc = activeDoc()
  if (!doc) return
  const rect = stage.getBoundingClientRect()
  const pad = 48
  const sx = (rect.width - pad) / doc.width
  const sy = (rect.height - pad) / doc.height
  state.scale = clamp(Math.min(sx, sy), MIN_SCALE, MAX_SCALE)
  state.tx = 0
  state.ty = 0
  applyTransform()
}

export function setScale(next: number): void {
  const rect = stage.getBoundingClientRect()
  zoomAt(clamp(next, MIN_SCALE, MAX_SCALE), rect.left + rect.width / 2, rect.top + rect.height / 2)
}

export function zoomAt(next: number, clientX: number, clientY: number): void {
  const clamped = clamp(next, MIN_SCALE, MAX_SCALE)
  if (clamped === state.scale) return
  const rect = stage.getBoundingClientRect()
  const px = clientX - (rect.left + rect.width / 2)
  const py = clientY - (rect.top + rect.height / 2)
  const k = clamped / state.scale
  state.tx = px - (px - state.tx) * k
  state.ty = py - (py - state.ty) * k
  state.scale = clamped
  applyTransform()
}

/* ------------------------------ 网格 / 坐标 ------------------------------ */

let gridOverlay: HTMLDivElement | null = null

function ensureGridOverlay(): HTMLDivElement {
  if (!gridOverlay) {
    const div = document.createElement('div')
    div.className = 'grid-overlay'
    div.hidden = true
    stage.appendChild(div)
    gridOverlay = div
  }
  return gridOverlay
}

function updateGrid(): void {
  const overlay = ensureGridOverlay()
  overlay.hidden = !state.grid || !activeDoc()
  const spacing = Math.max(8, 50 * state.scale)
  overlay.style.backgroundSize = `${spacing}px ${spacing}px`
  gridBtn.classList.toggle('on', state.grid)
}

export function toggleGrid(): void {
  state.grid = !state.grid
  updateGrid()
}

function round(n: number): number {
  return Math.round(n * 10) / 10
}

stage.addEventListener('pointermove', (e) => {
  const doc = activeDoc()
  if (!doc) {
    posChip.hidden = true
    return
  }
  const wrap = canvas.querySelector<HTMLElement>('.svg-wrap')
  if (!wrap) {
    posChip.hidden = true
    return
  }
  const r = wrap.getBoundingClientRect()
  const x = (e.clientX - r.left) / state.scale
  const y = (e.clientY - r.top) / state.scale
  const inside = x >= 0 && y >= 0 && x <= doc.width && y <= doc.height
  posChip.hidden = !inside
  if (inside) {
    posChip.textContent = `x ${round(x)} · y ${round(y)}`
    const stageRect = stage.getBoundingClientRect()
    posChip.style.left = `${Math.min(e.clientX - stageRect.left + 14, stage.clientWidth - 150)}px`
    posChip.style.top = `${e.clientY - stageRect.top + 16}px`
  }
})

/* -------------------------------- 测量 -------------------------------- */

let toastHintFn: ((msg: string) => void) | null = null

/** 注入 toast 提示函数（避免循环依赖） */
export function setToastHint(fn: (msg: string) => void): void {
  toastHintFn = fn
}

export function toggleMeasure(): void {
  state.measure.active = !state.measure.active
  state.measure.points = []
  measureBtn.classList.toggle('on', state.measure.active)
  stage.classList.toggle('measuring', state.measure.active)
  drawMeasure()
  if (state.measure.active) {
    toastHintFn?.('点击画布两点测量距离，Esc 退出')
  }
}

export function cancelMeasure(): void {
  if (!state.measure.active) return
  state.measure.active = false
  state.measure.points = []
  measureBtn.classList.toggle('on', false)
  stage.classList.toggle('measuring', false)
  drawMeasure()
}

function addMeasurePoint(svgX: number, svgY: number): void {
  if (!state.measure.active) return
  if (state.measure.points.length >= 2) state.measure.points = []
  state.measure.points.push({ x: svgX, y: svgY })
  drawMeasure()
  const pts = state.measure.points
  if (pts.length === 2) {
    const d = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
    toastHintFn?.(`距离：${round(d)} px（SVG 单位）`)
  }
}

function drawMeasure(): void {
  const layer = canvas.querySelector<SVGSVGElement>('.measure-layer')
  if (!layer) return
  layer.textContent = ''
  const pts = state.measure.points
  if (pts.length === 0) return
  const ns = 'http://www.w3.org/2000/svg'
  const mkCross = (x: number, y: number): SVGGElement => {
    const g = document.createElementNS(ns, 'g')
    const h = document.createElementNS(ns, 'line')
    h.setAttribute('x1', String(x - 6))
    h.setAttribute('x2', String(x + 6))
    h.setAttribute('y1', String(y))
    h.setAttribute('y2', String(y))
    const v = document.createElementNS(ns, 'line')
    v.setAttribute('x1', String(x))
    v.setAttribute('x2', String(x))
    v.setAttribute('y1', String(y - 6))
    v.setAttribute('y2', String(y + 6))
    for (const l of [h, v]) {
      l.setAttribute('stroke', '#4c8dff')
      l.setAttribute('stroke-width', '1.5')
    }
    g.appendChild(h)
    g.appendChild(v)
    return g
  }
  layer.appendChild(mkCross(pts[0].x, pts[0].y))
  if (pts.length === 2) {
    layer.appendChild(mkCross(pts[1].x, pts[1].y))
    const line = document.createElementNS(ns, 'line')
    line.setAttribute('x1', String(pts[0].x))
    line.setAttribute('y1', String(pts[0].y))
    line.setAttribute('x2', String(pts[1].x))
    line.setAttribute('y2', String(pts[1].y))
    line.setAttribute('stroke', '#4c8dff')
    line.setAttribute('stroke-width', '1.5')
    line.setAttribute('stroke-dasharray', '6 4')
    layer.appendChild(line)

    const d = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
    const text = document.createElementNS(ns, 'text')
    text.setAttribute('x', String((pts[0].x + pts[1].x) / 2))
    text.setAttribute('y', String((pts[0].y + pts[1].y) / 2 - 8))
    text.setAttribute('fill', '#6ea8ff')
    text.setAttribute('font-size', '14')
    text.setAttribute('text-anchor', 'middle')
    text.textContent = `${round(d)} px`
    layer.appendChild(text)
  }
}

/* -------------------------------- 动画控制 -------------------------------- */

function setCssAnimPaused(paused: boolean): void {
  canvas.classList.toggle('css-anim-paused', paused)
}

let sliderDragging = false
let lastSliderValue = -1

animToggleBtn.addEventListener('click', () => {
  state.animPaused = !state.animPaused
  animToggleBtn.textContent = state.animPaused ? '▶' : '⏸'
  if (currentSvgEl) {
    if (state.animPaused) currentSvgEl.pauseAnimations()
    else currentSvgEl.unpauseAnimations()
  }
  setCssAnimPaused(state.animPaused)
})

animSlider.addEventListener('pointerdown', () => {
  sliderDragging = true
  if (!state.animPaused && currentSvgEl) currentSvgEl.pauseAnimations()
})
animSlider.addEventListener('pointerup', () => {
  sliderDragging = false
})
animSlider.addEventListener('input', () => {
  const t = Number(animSlider.value) / 10
  if (currentSvgEl) currentSvgEl.setCurrentTime(t)
  animTimeEl.textContent = `${t.toFixed(1)}s`
})

function animLoop(): void {
  const doc = activeDoc()
  if (doc && !animBar.hidden && currentSvgEl && !sliderDragging && !state.animPaused) {
    const t = currentSvgEl.getCurrentTime()
    const v = Math.round(Math.min(t, 30) * 10)
    if (v !== lastSliderValue) {
      lastSliderValue = v
      animSlider.value = String(v)
      animTimeEl.textContent = `${t.toFixed(1)}s`
    }
  }
  requestAnimationFrame(animLoop)
}

/* -------------------------------- 交互 -------------------------------- */

let dragging = false
let dragX = 0
let dragY = 0

stage.addEventListener(
  'wheel',
  (e) => {
    if (!activeDoc()) return
    e.preventDefault()
    const factor = Math.pow(1.0015, -e.deltaY)
    zoomAt(state.scale * factor, e.clientX, e.clientY)
  },
  { passive: false }
)

stage.addEventListener('pointerdown', (e) => {
  if (!activeDoc()) return
  if (e.button !== 0 && e.button !== 1) return

  // 测量模式：点击空白处记录测量点
  if (state.measure.active && (e.target === stage || e.target === canvas)) {
    const wrap = canvas.querySelector<HTMLElement>('.svg-wrap')
    if (wrap) {
      const r = wrap.getBoundingClientRect()
      addMeasurePoint((e.clientX - r.left) / state.scale, (e.clientY - r.top) / state.scale)
    }
    return
  }

  dragging = true
  dragX = e.clientX
  dragY = e.clientY
  stage.classList.add('grabbing')
  stage.setPointerCapture(e.pointerId)
})

stage.addEventListener('pointermove', (e) => {
  if (!dragging) return
  state.tx += e.clientX - dragX
  state.ty += e.clientY - dragY
  dragX = e.clientX
  dragY = e.clientY
  applyTransform()
})

const endDrag = (e: PointerEvent): void => {
  if (!dragging) return
  dragging = false
  stage.classList.remove('grabbing')
  if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId)
}
stage.addEventListener('pointerup', endDrag)
stage.addEventListener('pointercancel', endDrag)

stage.addEventListener('dblclick', () => {
  if (activeDoc()) fitView()
})

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cancelMeasure()
})

gridBtn.addEventListener('click', () => toggleGrid())
measureBtn.addEventListener('click', () => toggleMeasure())

/* ------------------------------ 拖放覆盖层 ------------------------------ */

export function showDropOverlay(show: boolean): void {
  dropOverlay.classList.toggle('show', show)
}

requestAnimationFrame(animLoop)
