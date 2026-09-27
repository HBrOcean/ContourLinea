import type { Background, Doc, ExportEngine, ThemeMode } from './types'

/* 全局共享状态（模块间单一数据源） */

export const state = {
  docs: [] as Doc[],
  activeId: -1,
  scale: 1,
  tx: 0,
  ty: 0,
  background: 'checker' as Background,
  theme: 'auto' as ThemeMode,
  transparentExport: true,
  engine: 'webview' as ExportEngine,
  exportScale: 2,
  grid: false,
  measure: {
    active: false,
    points: [] as Array<{ x: number; y: number }>
  },
  animPaused: false
}

let uid = 0
export function nextId(): number {
  return ++uid
}

export function activeDoc(): Doc | null {
  return state.docs.find((d) => d.id === state.activeId) ?? null
}
