#!/usr/bin/env node
/**
 * 版本号统一工具（⑲）
 * 用法：
 *   node scripts/sync-version.mjs            # 读取 package.json 的版本，同步到其它文件
 *   node scripts/sync-version.mjs 1.2.0      # 设置全部文件为指定版本
 * 同步位置：package.json / src-tauri/tauri.conf.json / src-tauri/Cargo.toml
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const read = (p) => readFileSync(join(root, p), 'utf-8')
const write = (p, s) => writeFileSync(join(root, p), s)

const pkg = JSON.parse(read('package.json'))
const version = process.argv[2] ?? pkg.version

if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error(`非法版本号: ${version}`)
  process.exit(1)
}

// 1) package.json
pkg.version = version
write('package.json', JSON.stringify(pkg, null, 2) + '\n')

// 2) tauri.conf.json
const tauriConf = JSON.parse(read('src-tauri/tauri.conf.json'))
tauriConf.version = version
write('src-tauri/tauri.conf.json', JSON.stringify(tauriConf, null, 2) + '\n')

// 3) Cargo.toml（只替换 [package] 段的 version）
const cargo = read('src-tauri/Cargo.toml')
const updated = cargo.replace(
  /^(\[package\][\s\S]*?version\s*=\s*)"[^"]*"/m,
  `$1"${version}"`
)
if (updated === cargo && !new RegExp(`version\\s*=\\s*"${version.replace(/\./g, '\\.')}"`).test(cargo)) {
  console.error('Cargo.toml 中未找到 version 字段')
  process.exit(1)
}
write('src-tauri/Cargo.toml', updated)

console.log(`✔ 版本已同步为 ${version}：package.json / tauri.conf.json / Cargo.toml`)
