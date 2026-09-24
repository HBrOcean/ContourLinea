import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { open, save } from '@tauri-apps/plugin-dialog'

/* ---------------------------------- 类型 ---------------------------------- */

interface SvgFilePayload {
  path: string
  name: string
  content: string
}

interface ElementStats {
  total: number
  tags: Array<[string, number]>
}

interface ParsedSvg {
  svg: SVGSVGElement
  width: number
  height: number
  viewBox: string | null
  stats: ElementStats
}

interface Doc {
  id: number
  path: string
  name: string
  svg: SVGSVGElement
  width: number
  height: number
  viewBox: string | null
  stats: ElementStats
}

type Background = 'checker' | 'white' | 'dark'

/* --------------------------------- 平台适配层 -------------------------------- */

const api = {
  async readSvg(path: string): Promise<SvgFilePayload | null> {
    try {
      return await invoke<SvgFilePayload>('read_svg', { path })
    } catch {
      return null
    }
  },

  async openSvgFiles(): Promise<SvgFilePayload[] | null> {
    const selected = await open({
      multiple: true,
      title: '打开 SVG 文件',
      filters: [{ name: 'SVG 图片', extensions: ['svg', 'svgz'] }]
    })
    if (!selected) return null
    const paths = Array.isArray(selected) ? selected : [selected]
    const files: SvgFilePayload[] = []
    for (const p of paths) {
      const f = await api.readSvg(p)
      if (f) files.push(f)
    }
    return files.length ? files : null
  },

  async savePng(bytes: Uint8Array, suggestedName: string): Promise<string | null> {
    const path = await save({
      title: '导出 PNG',
      defaultPath: suggestedName,
      filters: [{ name: 'PNG 图片', extensions: ['png'] }]
    })
    if (!path) return null
    await invoke('save_png', { path, data: Array.from(bytes) })
    return path
  },

  async startupFiles(): Promise<SvgFilePayload[]> {
    const paths = await invoke<string[]>('startup_files')
    const files: SvgFilePayload[] = []
    for (const p of paths) {
      const f = await api.readSvg(p)
      if (f) files.push(f)
    }
    return files
  }
}

/* ---------------------------------- 元素 ---------------------------------- */

const $ = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id)
  if (!node) throw new Error(`missing #${id}`)
  return node as T
}

const stage = $<HTMLDivElement>('stage')
const canvas = $<HTMLDivElement>('canvas')
const emptyEl = $<HTMLDivElement>('empty')
const dropOverlay = $<HTMLDivElement>('drop-overlay')
const tabsEl = $<HTMLDivElement>('tabs')
const inspectorEl = $<HTMLDivElement>('inspector')
const toastEl = $<HTMLDivElement>('toast')
const zoomLevelEl = $<HTMLButtonElement>('btn-zoom-level')
const bgBtn = $<HTMLButtonElement>('btn-bg')
const transparentChk = $<HTMLInputElement>('chk-transparent')

const btnOpen = $<HTMLButtonElement>('btn-open')
const btnClose = $<HTMLButtonElement>('btn-close')
const btnFit = $<HTMLButtonElement>('btn-fit')
const btnReset = $<HTMLButtonElement>('btn-reset')
const btnZoomIn = $<HTMLButtonElement>('btn-zoom-in')
const btnZoomOut = $<HTMLButtonElement>('btn-zoom-out')
const btnExport = $<HTMLButtonElement>('btn-export')

/* ---------------------------------- 状态 ---------------------------------- */

const state = {
  docs: [] as Doc[],
  activeId: -1,
  scale: 1,
  tx: 0,
  ty: 0,
  background: 'checker' as Background,
  transparentExport: true
}

let uid = 0

/* --------------------------------- 解析 SVG -------------------------------- */

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

function sanitize(svg: SVGSVGElement): void {
  svg.querySelectorAll('script').forEach((s) => s.remove())
  svg.querySelectorAll('*').forEach((node) => {
    for (const attr of Array.from(node.attributes)) {
      if (/^on/i.test(attr.name)) node.removeAttribute(attr.name)
    }
  })
}

function parseSvg(content: string): ParsedSvg {
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

  return { svg, width, height, viewBox, stats: collectStats(svg) }
}

/* --------------------------------- 文档管理 -------------------------------- */

function activeDoc(): Doc | null {
  return state.docs.find((d) => d.id === state.activeId) ?? null
}

function addFiles(files: SvgFilePayload[]): { ok: number; failed: number } {
  let ok = 0
  let failed = 0
  let firstNewId = -1

  for (const file of files) {
    try {
      const parsed = parseSvg(file.content)
      const doc: Doc = {
        id: ++uid,
        path: file.path,
        name: file.name,
        svg: parsed.svg,
        width: parsed.width,
        height: parsed.height,
        viewBox: parsed.viewBox,
        stats: parsed.stats
      }
      state.docs.push(doc)
      if (firstNewId < 0) firstNewId = doc.id
      ok += 1
    } catch {
      failed += 1
    }
  }

  if (firstNewId >= 0) activate(firstNewId)
  renderTabs()
  syncControls()
  return { ok, failed }
}

function activate(id: number): void {
  state.activeId = id
  renderCanvas()
  fitView()
  renderTabs()
  renderInspector()
  syncControls()
}

function closeActive(): void {
  const idx = state.docs.findIndex((d) => d.id === state.activeId)
  if (idx < 0) return
  state.docs.splice(idx, 1)
  const next = state.docs[idx] ?? state.docs[idx - 1] ?? null
  if (next) {
    activate(next.id)
  } else {
    state.activeId = -1
    renderCanvas()
    renderTabs()
    renderInspector()
    syncControls()
  }
}

/* --------------------------------- 渲染预览 -------------------------------- */

function applyBackground(): void {
  stage.classList.remove('bg-checker', 'bg-white', 'bg-dark')
  stage.classList.add(`bg-${state.background}`)
  bgBtn.textContent = `背景：${state.background === 'checker' ? '棋盘' : state.background === 'white' ? '白色' : '深色'}`
}

function renderCanvas(): void {
  const doc = activeDoc()
  canvas.textContent = ''
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

  canvas.appendChild(wrap)
  applyTransform()
}

function applyTransform(): void {
  const wrap = canvas.querySelector<HTMLElement>('.svg-wrap')
  if (!wrap) return
  wrap.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`
  zoomLevelEl.textContent = `${Math.round(state.scale * 100)}%`
}

const MIN_SCALE = 0.02
const MAX_SCALE = 40
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

function fitView(): void {
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

function setScale(next: number): void {
  const rect = stage.getBoundingClientRect()
  zoomAt(clamp(next, MIN_SCALE, MAX_SCALE), rect.left + rect.width / 2, rect.top + rect.height / 2)
}

function zoomAt(next: number, clientX: number, clientY: number): void {
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

/* ---------------------------------- 交互 ---------------------------------- */

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

/* ------------------------------ 拖拽打开（Tauri） ----------------------------- */

void getCurrentWebview().onDragDropEvent((event) => {
  const payload = event.payload
  if (payload.type === 'over' || payload.type === 'enter') {
    dropOverlay.classList.add('show')
  } else if (payload.type === 'leave') {
    dropOverlay.classList.remove('show')
  } else if (payload.type === 'drop') {
    dropOverlay.classList.remove('show')
    const paths = payload.paths.filter((p) => /\.svgz?$/i.test(p))
    if (!paths.length) return
    void (async () => {
      const payloads: SvgFilePayload[] = []
      for (const p of paths) {
        const f = await api.readSvg(p)
        if (f) payloads.push(f)
      }
      if (payloads.length) reportResult(addFiles(payloads))
    })()
  }
})

/* ---------------------------------- 面板 ---------------------------------- */

function renderTabs(): void {
  if (state.docs.length <= 1) {
    tabsEl.hidden = true
    tabsEl.textContent = ''
    return
  }
  tabsEl.hidden = false
  tabsEl.textContent = ''
  for (const doc of state.docs) {
    const tab = document.createElement('button')
    tab.className = 'tab' + (doc.id === state.activeId ? ' active' : '')
    tab.textContent = doc.name
    tab.title = doc.path
    tab.addEventListener('click', () => activate(doc.id))
    tabsEl.appendChild(tab)
  }
}

function renderInspector(): void {
  const doc = activeDoc()
  if (!doc) {
    inspectorEl.innerHTML = '<div class="ins-title">文件信息</div><div class="ins-empty">尚未打开文件</div>'
    return
  }
  const max = doc.stats.tags[0]?.[1] ?? 1
  const rows = doc.stats.tags
    .slice(0, 12)
    .map(
      ([tag, count]) => `
      <div class="stat-row">
        <span class="stat-tag">&lt;${tag}&gt;</span>
        <span class="stat-bar"><i style="width:${Math.round((count / max) * 100)}%"></i></span>
        <span class="stat-num">${count}</span>
      </div>`
    )
    .join('')

  inspectorEl.innerHTML = `
    <div class="ins-title">文件信息</div>
    <div class="ins-section">
      <div class="kv"><span>文件名</span><b>${escapeHtml(doc.name)}</b></div>
      <div class="kv"><span>画布尺寸</span><b>${round(doc.width)} × ${round(doc.height)} px</b></div>
      <div class="kv"><span>viewBox</span><b>${doc.viewBox ? escapeHtml(doc.viewBox) : '—'}</b></div>
      <div class="kv"><span>元素总数</span><b>${doc.stats.total}</b></div>
      <div class="kv"><span>当前缩放</span><b>${Math.round(state.scale * 100)}%</b></div>
    </div>
    <div class="ins-title">元素分布</div>
    <div class="ins-section stats">${rows || '<div class="ins-empty">无子元素</div>'}</div>
    <div class="ins-title">路径</div>
    <div class="ins-section"><div class="path">${escapeHtml(doc.path)}</div></div>
  `
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  )
}

function syncControls(): void {
  const has = !!activeDoc()
  for (const b of [btnClose, btnFit, btnReset, btnZoomIn, btnZoomOut, btnExport, bgBtn]) {
    b.disabled = !has
  }
}

/* --------------------------------- 打开/导出 ------------------------------- */

async function openDialog(): Promise<void> {
  const files = await api.openSvgFiles()
  if (!files || files.length === 0) return
  reportResult(addFiles(files))
}

function reportResult(res: { ok: number; failed: number }): void {
  toast(res.failed > 0 ? `已打开 ${res.ok} 个文件，${res.failed} 个失败` : `已打开 ${res.ok} 个文件`)
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('SVG 渲染为位图失败'))
    img.src = url
  })
}

async function exportPng(): Promise<void> {
  const doc = activeDoc()
  if (!doc) return
  try {
    const clone = doc.svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('width', String(doc.width))
    clone.setAttribute('height', String(doc.height))
    if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

    const text = new XMLSerializer().serializeToString(clone)
    const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }))
    try {
      const img = await loadImage(url)
      const ratio = 2
      const cw = Math.max(1, Math.round(doc.width * ratio))
      const ch = Math.max(1, Math.round(doc.height * ratio))
      const cv = document.createElement('canvas')
      cv.width = cw
      cv.height = ch
      const ctx = cv.getContext('2d')
      if (!ctx) throw new Error('无法创建画布上下文')
      if (!state.transparentExport) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, cw, ch)
      }
      ctx.drawImage(img, 0, 0, cw, ch)

      const blob = await new Promise<Blob | null>((resolve) => cv.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('PNG 生成失败')
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const suggested = doc.name.replace(/\.svgz?$/i, '') + '.png'
      const savedPath = await api.savePng(bytes, suggested)
      if (savedPath) toast(`已导出：${savedPath}`)
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch (err) {
    toast(err instanceof Error ? err.message : '导出失败')
  }
}

/* ---------------------------------- 工具栏 --------------------------------- */

btnOpen.addEventListener('click', () => void openDialog())
btnClose.addEventListener('click', () => closeActive())
btnFit.addEventListener('click', () => fitView())
btnReset.addEventListener('click', () => setScale(1))
btnZoomIn.addEventListener('click', () => setScale(state.scale * 1.25))
btnZoomOut.addEventListener('click', () => setScale(state.scale / 1.25))
btnExport.addEventListener('click', () => void exportPng())
zoomLevelEl.addEventListener('click', () => setScale(1))

bgBtn.addEventListener('click', () => {
  const order: Background[] = ['checker', 'white', 'dark']
  state.background = order[(order.indexOf(state.background) + 1) % order.length]
  applyBackground()
})

transparentChk.addEventListener('change', () => {
  state.transparentExport = transparentChk.checked
})

/* ---------------------------------- 提示条 --------------------------------- */

let toastTimer = 0
function toast(msg: string): void {
  toastEl.textContent = msg
  toastEl.classList.add('show')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 3200)
}

/* ------------------------------ 原生菜单事件（Rust 侧） ----------------------------- */

function handleMenu(id: string): void {
  switch (id) {
    case 'open':
      void openDialog()
      break
    case 'export-png':
      void exportPng()
      break
    case 'close':
      closeActive()
      break
    case 'fit':
      fitView()
      break
    case 'reset-zoom':
      setScale(1)
      break
    case 'zoom-in':
      setScale(state.scale * 1.25)
      break
    case 'zoom-out':
      setScale(state.scale / 1.25)
      break
    case 'about':
      toast('ContourLinea · TypeScript + Tauri v2 · 拖入 SVG 即可预览')
      break
  }
}

void listen<string>('menu', (event) => handleMenu(event.payload))

/* ---------------------------------- 初始化 --------------------------------- */

applyBackground()
renderInspector()
syncControls()

void (async () => {
  const files = await api.startupFiles()
  if (files.length) reportResult(addFiles(files))
})()
