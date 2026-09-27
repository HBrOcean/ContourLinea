import { activeDoc, state } from './state'
import api from './api'
import { toast } from './panels'

/* -------------------------------- 工具函数 -------------------------------- */

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('SVG 渲染为位图失败'))
    img.src = url
  })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // data:image/png;base64,xxxx
      resolve(String(reader.result).split(',')[1] ?? '')
    }
    reader.onerror = () => reject(new Error('base64 编码失败'))
    reader.readAsDataURL(blob)
  })
}

function backgroundImage(): string | null {
  return state.transparentExport ? null : '#ffffff'
}

/* ------------------------------ WebView 渲染 PNG ------------------------------ */

async function renderPngViaWebView(content: string, scale: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([content], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = await loadImage(url)
    const viewBoxMatch = /viewBox\s*=\s*"([^"]+)"/.exec(content)
    let w = img.naturalWidth || 0
    let h = img.naturalHeight || 0
    if ((!w || !h) && viewBoxMatch) {
      const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number)
      if (parts.length === 4) {
        w = parts[2]
        h = parts[3]
      }
    }
    if (!w) w = 300
    if (!h) h = 150

    const cw = Math.max(1, Math.round(w * scale))
    const ch = Math.max(1, Math.round(h * scale))
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
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

/* --------------------------------- 导出 PNG --------------------------------- */

export async function exportPng(): Promise<void> {
  const doc = activeDoc()
  if (!doc) return

  const suggested = doc.name.replace(/\.svgz?$/i, '') + '.png'
  try {
    const path = await api.savePngDialog(suggested)
    if (!path) return

    if (state.engine === 'rust') {
      const res = await api.exportPngNative(doc.raw, path, state.exportScale, backgroundImage())
      toast(`已导出：${path}（${res.width}×${res.height}）`)
    } else {
      const blob = await renderPngViaWebView(doc.raw, state.exportScale)
      const base64 = await blobToBase64(blob)
      await api.savePng(path, base64)
      toast(`已导出：${path}`)
    }
  } catch (err) {
    toast(err instanceof Error ? err.message : '导出失败')
  }
}

/* --------------------------------- 导出 PDF --------------------------------- */

export async function exportPdf(): Promise<void> {
  const doc = activeDoc()
  if (!doc) return

  const suggested = doc.name.replace(/\.svgz?$/i, '') + '.pdf'
  try {
    const path = await api.savePdfDialog(suggested)
    if (!path) return

    const { PDFDocument } = await import('pdf-lib')

    // 嵌入位图保证与预览一致；PDF 页面尺寸采用 SVG 像素数值
    const blob = await renderPngViaWebView(doc.raw, state.exportScale)
    const bytes = new Uint8Array(await blob.arrayBuffer())

    const pdf = await PDFDocument.create()
    const png = await pdf.embedPng(bytes)
    const page = pdf.addPage([doc.width, doc.height])
    page.drawImage(png, { x: 0, y: 0, width: doc.width, height: doc.height })

    const pdfBytes = await pdf.save()
    // Uint8Array → base64
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < pdfBytes.length; i += chunk) {
      binary += String.fromCharCode(...pdfBytes.subarray(i, i + chunk))
    }
    const base64 = btoa(binary)

    await api.savePdf(path, base64)
    toast(`已导出：${path}`)
  } catch (err) {
    toast(err instanceof Error ? err.message : '导出失败')
  }
}

/* ------------------------------- 复制位图到剪贴板 ------------------------------- */

export async function copyBitmap(): Promise<void> {
  const doc = activeDoc()
  if (!doc) return
  try {
    const blob = await renderPngViaWebView(doc.raw, 2)
    const base64 = await blobToBase64(blob)
    const { writeImage } = await import('@tauri-apps/plugin-clipboard-manager')
    await writeImage(base64)
    toast('位图已复制到剪贴板（2× 分辨率）')
  } catch (err) {
    toast(err instanceof Error ? err.message : '复制失败')
  }
}

/* --------------------------------- 批量转换 --------------------------------- */

export async function batchConvertPng(): Promise<void> {
  try {
    const inputDir = await api.openDir('选择包含 SVG 的文件夹')
    if (!inputDir) return
    const files = await api.listSvgDir(inputDir)
    if (files.length === 0) {
      toast('该文件夹中没有 SVG / SVGZ 文件')
      return
    }
    const outputDir = await api.openDir('选择 PNG 输出文件夹')
    if (!outputDir) return

    const { join } = await import('./path-join')
    const total = files.length
    let done = 0
    let failed = 0

    for (const file of files) {
      const outPath = join(outputDir, file.name.replace(/\.svgz?$/i, '') + '.png')
      try {
        await api.exportPngNative(file.content, outPath, state.exportScale, backgroundImage())
        done += 1
      } catch {
        failed += 1
      }
      toast(`批量转换中：${done + failed} / ${total}`)
    }

    toast(
      failed > 0
        ? `批量完成：成功 ${done}，失败 ${failed}（输出到 ${outputDir}）`
        : `批量完成：${done} 个文件已输出到 ${outputDir}`
    )
  } catch (err) {
    toast(err instanceof Error ? err.message : '批量转换失败')
  }
}

/* --------------------------------- 检查更新 --------------------------------- */

export async function checkForUpdates(): Promise<void> {
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const { relaunch } = await import('@tauri-apps/plugin-process')
    const { confirm } = await import('@tauri-apps/plugin-dialog')

    const update = await check()
    if (!update) {
      toast('当前已是最新版本')
      return
    }
    const ok = await confirm(`发现新版本 ${update.version}，是否下载并安装？`, {
      title: 'ContourLinea 更新',
      kind: 'info'
    })
    if (!ok) return

    toast(`正在下载 ${update.version}…`)
    await update.downloadAndInstall()
    await relaunch()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/updater|disabled|not enabled/i.test(msg)) {
      toast('自动更新未启用：参见 docs/UPDATER.md 配置步骤')
    } else {
      toast(`检查更新失败：${msg}`)
    }
  }
}
