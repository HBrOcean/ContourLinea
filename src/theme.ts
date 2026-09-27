import type { ThemeMode } from './types'

/* 主题：auto / light / dark，持久化到 localStorage */

const KEY = 'cl.theme.v1'

export function loadTheme(): ThemeMode {
  const saved = localStorage.getItem(KEY)
  if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved
  return 'auto'
}

const media = window.matchMedia('(prefers-color-scheme: light)')

export function applyTheme(mode: ThemeMode): void {
  const resolved =
    mode === 'auto' ? (media.matches ? 'light' : 'dark') : mode
  document.documentElement.dataset.theme = resolved
  const label = mode === 'auto' ? '自动' : mode === 'light' ? '明亮' : '深色'
  const btn = document.getElementById('btn-theme')
  if (btn) btn.textContent = `主题：${label}`
}

export function initTheme(onChange: (mode: ThemeMode) => void): void {
  media.addEventListener('change', () => {
    // 系统切换时，若处于 auto 模式则重新解析
    if (localStorage.getItem(KEY) !== 'dark' && localStorage.getItem(KEY) !== 'light') {
      applyTheme('auto')
    }
  })
  applyTheme(loadTheme())
  onChange(loadTheme())
}

export function setTheme(mode: ThemeMode): void {
  localStorage.setItem(KEY, mode)
  applyTheme(mode)
}

export function nextTheme(current: ThemeMode): ThemeMode {
  const order: ThemeMode[] = ['auto', 'light', 'dark']
  return order[(order.indexOf(current) + 1) % order.length]
}
