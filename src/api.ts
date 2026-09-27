import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import type { SvgFilePayload } from './types'

/* Tauri 适配层：所有原生能力调用集中在这里 */

const api = {
  /** 读取单个 SVG / SVGZ（Rust 端带 32MB 大小保护与 gzip 解压） */
  async readSvg(path: string): Promise<SvgFilePayload | null> {
    try {
      return await invoke<SvgFilePayload>('read_svg', { path })
    } catch (err) {
      return null
    }
  },

  /** 文件选择对话框（多选） */
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

  /** 选择文件夹 */
  async openDir(title: string): Promise<string | null> {
    const dir = await open({ directory: true, title })
    return typeof dir === 'string' ? dir : null
  },

  /** 列出目录内全部 SVG（批量转换用） */
  async listSvgDir(dir: string): Promise<SvgFilePayload[]> {
    try {
      return await invoke<SvgFilePayload[]>('list_svg_dir', { dir })
    } catch {
      return []
    }
  },

  /** 保存对话框：PNG */
  async savePngDialog(suggestedName: string): Promise<string | null> {
    const path = await save({
      title: '导出 PNG',
      defaultPath: suggestedName,
      filters: [{ name: 'PNG 图片', extensions: ['png'] }]
    })
    return typeof path === 'string' ? path : null
  },

  /** 保存对话框：PDF */
  async savePdfDialog(suggestedName: string): Promise<string | null> {
    const path = await save({
      title: '导出 PDF',
      defaultPath: suggestedName,
      filters: [{ name: 'PDF 文档', extensions: ['pdf'] }]
    })
    return typeof path === 'string' ? path : null
  },

  /** 保存对话框：任意 */
  async saveDialog(suggestedName: string): Promise<string | null> {
    const path = await save({ title: '保存', defaultPath: suggestedName })
    return typeof path === 'string' ? path : null
  },

  /** 写入 PNG 文件（base64 传输，避免大数组序列化） */
  async savePng(path: string, base64: string): Promise<void> {
    await invoke('save_png', { path, data: base64 })
  },

  /** 写入 PDF 文件（base64 传输） */
  async savePdf(path: string, base64: string): Promise<void> {
    await invoke('save_pdf', { path, data: base64 })
  },

  /** Rust resvg 引擎：渲染并写文件 */
  async exportPngNative(
    content: string,
    path: string,
    scale: number,
    background: string | null
  ): Promise<{ path: string; width: number; height: number }> {
    return invoke('export_png_native', { content, path, scale, background })
  },

  /** Rust resvg 引擎：渲染返回 base64 PNG */
  async renderPngNative(
    content: string,
    scale: number,
    background: string | null
  ): Promise<{ width: number; height: number; pngBase64: string }> {
    return invoke('render_png_native', { content, scale, background })
  },

  /** 启动时命令行 / 文件关联传入的路径 */
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

export default api
