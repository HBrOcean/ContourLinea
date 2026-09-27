import type { SvgFilePayload } from './types'
import { activeDoc, state } from './state'
import { addFiles, activate } from './viewer'
import api from './api'

/* --------------------------------- 元素 --------------------------------- */

const $ = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id)
  if (!node) throw new Error(`missing #${id}`)
  return node as T
}

const tabsEl = $<HTMLDivElement>('tabs')
const infoEl = $<HTMLDivElement>('inspector-info')
const tabInfoBtn = $<HTMLButtonElement>('tab-info')
const tabCodeBtn = $<HTMLButtonElement>('tab-code')
const paneInfo = $<HTMLDivElement>('pane-info')
const paneCode = $<HTMLDivElement>('pane-code')
const codeText = $<HTMLElement>('code-text')
const codeView = $<HTMLElement>('code-view')
const codeSizeEl = $<HTMLElement>('code-size')
const btnCopyCode = $<HTMLButtonElement>('btn-copy-code')
const toastEl = $<HTMLDivElement>('toast')
const recentEl = $<HTMLDivElement>('recent')
const recentListEl = $<HTMLDivElement>('recent-list')
const selEngine = $<HTMLSelectElement>('sel-engine')
const selScale = $<HTMLSelectElement>('sel-scale')

/* --------------------------------- toast --------------------------------- */

let toastTimer = 0

export function toast(msg: string): void {
  toastEl.textContent = msg
  toastEl.classList.add('show')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 3200)
}

/* --------------------------------- 标签页 --------------------------------- */

export function renderTabs(): void {
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

/* ------------------------------- 信息面板 ------------------------------- */

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  )
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

export function renderInspector(): void {
  const doc = activeDoc()
  if (!doc) {
    infoEl.innerHTML =
      '<div class="ins-title">文件信息</div><div class="ins-section"><div class="ins-empty">尚未打开文件</div></div>'
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

  infoEl.innerHTML = `
    <div class="ins-title">文件信息</div>
    <div class="ins-section">
      <div class="kv"><span>文件名</span><b>${escapeHtml(doc.name)}</b></div>
      <div class="kv"><span>画布尺寸</span><b>${round(doc.width)} × ${round(doc.height)} px</b></div>
      <div class="kv"><span>viewBox</span><b>${doc.viewBox ? escapeHtml(doc.viewBox) : '—'}</b></div>
      <div class="kv"><span>元素总数</span><b>${doc.stats.total}</b></div>
      <div class="kv"><span>当前缩放</span><b>${Math.round(state.scale * 100)}%</b></div>
      <div class="kv"><span>动画</span><b>${doc.hasSmil ? 'SMIL' : doc.hasCssAnim ? 'CSS' : '—'}</b></div>
    </div>
    <div class="ins-title">元素分布</div>
    <div class="ins-section stats">${rows || '<div class="ins-empty">无子元素</div>'}</div>
    <div class="ins-title">路径</div>
    <div class="ins-section"><div class="path">${escapeHtml(doc.path)}</div></div>
  `
}

/* ------------------------------- 源码面板 ------------------------------- */

const CODE_LIMIT = 100_000

export function renderCodePanel(): void {
  const doc = activeDoc()
  if (!doc) {
    codeText.textContent = ''
    codeSizeEl.textContent = ''
    return
  }
  const raw = doc.raw
  const truncated = raw.length > CODE_LIMIT
  codeText.textContent = truncated ? raw.slice(0, CODE_LIMIT) : raw
  codeSizeEl.textContent = `${raw.length.toLocaleString()} 字符${truncated ? '（仅显示前 10 万）' : ''}`
  codeView.scrollTop = 0
}

export function toggleCodePanel(show?: boolean): void {
  const target = show ?? paneCode.classList.contains('hidden')
  paneCode.classList.toggle('hidden', !target)
  paneInfo.classList.toggle('hidden', target)
  tabCodeBtn.classList.toggle('active', target)
  tabInfoBtn.classList.toggle('active', !target)
}

tabInfoBtn.addEventListener('click', () => toggleCodePanel(false))
tabCodeBtn.addEventListener('click', () => toggleCodePanel(true))

btnCopyCode.addEventListener('click', async () => {
  const doc = activeDoc()
  if (!doc) return
  try {
    await writeClipboardText(doc.raw)
    toast('源码已复制到剪贴板')
  } catch {
    toast('复制失败')
  }
})

async function writeClipboardText(text: string): Promise<void> {
  const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
  await writeText(text)
}

/* ------------------------------- 最近文件 ------------------------------- */

const RECENT_KEY = 'cl.recent.v1'
const RECENT_MAX = 12

interface RecentItem {
  path: string
  name: string
  ts: number
}

function loadRecent(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const list = raw ? (JSON.parse(raw) as RecentItem[]) : []
    return Array.isArray(list) ? list.filter((i) => i && typeof i.path === 'string') : []
  } catch {
    return []
  }
}

function saveRecent(list: RecentItem[]): void {
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)))
}

export function pushRecent(path: string, name: string): void {
  if (!path) return
  const list = loadRecent().filter((i) => i.path !== path)
  list.unshift({ path, name: name || path, ts: Date.now() })
  saveRecent(list)
}

export function renderRecent(): void {
  const list = loadRecent()
  if (state.docs.length > 0 || list.length === 0) {
    recentEl.hidden = true
    return
  }
  recentEl.hidden = false
  recentListEl.textContent = ''

  for (const item of list.slice(0, 8)) {
    const chip = document.createElement('button')
    chip.className = 'recent-chip'
    chip.title = item.path
    chip.textContent = item.name
    chip.addEventListener('click', () => {
      void (async () => {
        const file = await api.readSvg(item.path)
        if (!file) {
          toast('文件已不存在或无法读取')
          return
        }
        addFiles([file])
      })()
    })
    recentListEl.appendChild(chip)
  }

  if (list.length > 0) {
    const clear = document.createElement('button')
    clear.className = 'recent-clear'
    clear.textContent = '清空'
    clear.addEventListener('click', () => {
      saveRecent([])
      renderRecent()
    })
    recentListEl.appendChild(clear)
  }
}

/* ------------------------------ 导出选项持久化 ------------------------------ */

const OPT_KEY = 'cl.export.v1'

export function loadExportOpts(): void {
  try {
    const raw = localStorage.getItem(OPT_KEY)
    const opts = raw ? (JSON.parse(raw) as { engine?: string; scale?: number; transparent?: boolean }) : {}
    if (opts.engine === 'rust' || opts.engine === 'webview') {
      state.engine = opts.engine
      selEngine.value = opts.engine
    }
    if (opts.scale === 1 || opts.scale === 2 || opts.scale === 4) {
      state.exportScale = opts.scale
      selScale.value = String(opts.scale)
    }
    if (typeof opts.transparent === 'boolean') {
      state.transparentExport = opts.transparent
      ;($<HTMLInputElement>('chk-transparent')).checked = opts.transparent
    }
  } catch {
    /* 忽略损坏的本地配置 */
  }
}

function saveExportOpts(): void {
  localStorage.setItem(
    OPT_KEY,
    JSON.stringify({
      engine: state.engine,
      scale: state.exportScale,
      transparent: state.transparentExport
    })
  )
}

selEngine.addEventListener('change', () => {
  state.engine = selEngine.value === 'rust' ? 'rust' : 'webview'
  saveExportOpts()
})

selScale.addEventListener('change', () => {
  state.exportScale = Number(selScale.value) || 2
  saveExportOpts()
})

/* -------------------------------- 统一刷新 -------------------------------- */

export function refreshPanels(): void {
  renderTabs()
  renderInspector()
  renderCodePanel()
  renderRecent()
}

export function notifyOpenResult(res: { ok: number; failed: number }): void {
  if (res.failed > 0) {
    toast(`已打开 ${res.ok} 个文件，${res.failed} 个失败`)
  } else {
    toast(`已打开 ${res.ok} 个文件`)
  }
}

export function recordRecentFromFiles(files: SvgFilePayload[]): void {
  for (const f of files) pushRecent(f.path, f.name)
}
