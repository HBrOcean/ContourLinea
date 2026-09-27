import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { state } from './state'
import { initTheme, nextTheme, setTheme } from './theme'
import {
  addFiles,
  applyBackground,
  closeActive,
  fitView,
  onDocChanged,
  setScale,
  setToastHint,
  showDropOverlay,
  toggleGrid
} from './viewer'
import {
  loadExportOpts,
  notifyOpenResult,
  recordRecentFromFiles,
  refreshPanels,
  toast,
  toggleCodePanel
} from './panels'
import {
  batchConvertPng,
  checkForUpdates,
  copyBitmap,
  exportPdf,
  exportPng
} from './exporting'
import api from './api'
import type { SvgFilePayload } from './types'

/* --------------------------------- 元素 --------------------------------- */

const $ = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id)
  if (!node) throw new Error(`missing #${id}`)
  return node as T
}

const btnOpen = $<HTMLButtonElement>('btn-open')
const btnBatch = $<HTMLButtonElement>('btn-batch')
const btnClose = $<HTMLButtonElement>('btn-close')
const btnFit = $<HTMLButtonElement>('btn-fit')
const btnReset = $<HTMLButtonElement>('btn-reset')
const btnZoomIn = $<HTMLButtonElement>('btn-zoom-in')
const btnZoomOut = $<HTMLButtonElement>('btn-zoom-out')
const btnExport = $<HTMLButtonElement>('btn-export')
const btnExportPdf = $<HTMLButtonElement>('btn-export-pdf')
const btnCopy = $<HTMLButtonElement>('btn-copy')
const btnTheme = $<HTMLButtonElement>('btn-theme')
const bgBtn = $<HTMLButtonElement>('btn-bg')
const transparentChk = $<HTMLInputElement>('chk-transparent')

/* --------------------------------- 打开文件 --------------------------------- */

async function openDialog(): Promise<void> {
  const files = await api.openSvgFiles()
  if (!files || files.length === 0) return
  recordRecentFromFiles(files)
  notifyOpenResult(addFiles(files))
}

/* ------------------------------ 菜单事件（Rust） ------------------------------ */

function handleMenu(id: string): void {
  switch (id) {
    case 'open':
      void openDialog()
      break
    case 'batch-png':
      void batchConvertPng()
      break
    case 'export-png':
      void exportPng()
      break
    case 'export-pdf':
      void exportPdf()
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
    case 'grid':
      toggleGrid()
      break
    case 'theme':
      setTheme(nextTheme(state.theme))
      break
    case 'toggle-code':
      toggleCodePanel()
      break
    case 'check-update':
      void checkForUpdates()
      break
    case 'about':
      toast('ContourLinea · TypeScript + Tauri v2 · 拖入 SVG 即可预览')
      break
  }
}

/* --------------------------------- 工具栏 --------------------------------- */

btnOpen.addEventListener('click', () => void openDialog())
btnBatch.addEventListener('click', () => void batchConvertPng())
btnClose.addEventListener('click', () => closeActive())
btnFit.addEventListener('click', () => fitView())
btnReset.addEventListener('click', () => setScale(1))
btnZoomIn.addEventListener('click', () => setScale(state.scale * 1.25))
btnZoomOut.addEventListener('click', () => setScale(state.scale / 1.25))
btnExport.addEventListener('click', () => void exportPng())
btnExportPdf.addEventListener('click', () => void exportPdf())
btnCopy.addEventListener('click', () => void copyBitmap())

bgBtn.addEventListener('click', () => {
  const order: Array<'checker' | 'white' | 'dark'> = ['checker', 'white', 'dark']
  state.background = order[(order.indexOf(state.background) + 1) % order.length]
  applyBackground()
})

btnTheme.addEventListener('click', () => {
  setTheme(nextTheme(state.theme))
})

transparentChk.addEventListener('change', () => {
  state.transparentExport = transparentChk.checked
})

/* --------------------------------- 拖放打开 --------------------------------- */

void getCurrentWebview().onDragDropEvent((event) => {
  const payload = event.payload
  if (payload.type === 'over' || payload.type === 'enter') {
    showDropOverlay(true)
  } else if (payload.type === 'leave') {
    showDropOverlay(false)
  } else if (payload.type === 'drop') {
    showDropOverlay(false)
    const paths = payload.paths.filter((p) => /\.svgz?$/i.test(p))
    if (!paths.length) return
    void (async () => {
      const payloads: SvgFilePayload[] = []
      for (const p of paths) {
        const f = await api.readSvg(p)
        if (f) payloads.push(f)
      }
      if (payloads.length) {
        recordRecentFromFiles(payloads)
        notifyOpenResult(addFiles(payloads))
      }
    })()
  }
})

/* --------------------------------- 事件订阅 --------------------------------- */

void listen<string>('menu', (event) => handleMenu(event.payload))

// 单实例：二次启动把新文件路径转给已运行实例
void listen<string[]>('open-files', (event) => {
  void (async () => {
    const payloads: SvgFilePayload[] = []
    for (const p of event.payload) {
      const f = await api.readSvg(p)
      if (f) payloads.push(f)
    }
    if (payloads.length) {
      recordRecentFromFiles(payloads)
      notifyOpenResult(addFiles(payloads))
    }
  })()
})

/* --------------------------------- 初始化 --------------------------------- */

setToastHint(toast)
loadExportOpts()
initTheme((mode) => {
  state.theme = mode
})
applyBackground()
refreshPanels()

onDocChanged(() => {
  refreshPanels()
})

void (async () => {
  const files = await api.startupFiles()
  if (files.length) {
    recordRecentFromFiles(files)
    notifyOpenResult(addFiles(files))
  }
})()
