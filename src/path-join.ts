/* 轻量路径拼接：统一处理 / 与 \（输出路径由 Rust 端处理，这里只需可读的展示级拼接） */

export function join(base: string, name: string): string {
  const sep = base.includes('\\') && !base.includes('/') ? '\\' : '/'
  const trimmed = base.endsWith('/') || base.endsWith('\\') ? base : base + sep
  return trimmed + name
}
