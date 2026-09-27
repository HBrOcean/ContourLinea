# ContourLinea

> 用线条勾勒轮廓 —— 一个轻量的 SVG 查看器与工具集，基于 **Tauri v2 + TypeScript + Rust**。

[![Build](https://github.com/HBrOcean/ContourLinea/actions/workflows/build.yml/badge.svg)](https://github.com/HBrOcean/ContourLinea/actions/workflows/build.yml)
[![Release](https://github.com/HBrOcean/ContourLinea/actions/workflows/release.yml/badge.svg)](https://github.com/HBrOcean/ContourLinea/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

体积只有同功能 Electron 应用的 **1/10 左右**（复用系统 WebView，不打包浏览器内核）。

## ✨ 功能

### 预览

- 打开 / 拖入 SVG、SVGZ（gzip）文件，支持多选与标签页
- 双击 `.svg` 用本应用打开（文件关联）与命令行打开
- **单实例**：再次打开文件会复用已有窗口，不会开一堆进程
- 滚轮以指针为中心缩放、拖拽平移、双击适应窗口
- 背景切换：棋盘格 / 白色 / 深色
- 鼠标坐标实时显示（SVG 用户单位）

### 主题与辅助

- 主题：自动（跟随系统）/ 明亮 / 深色
- **网格叠加**（随缩放自适应）
- **两点测量**：量取任意两点的距离（SVG 单位）
- **SVG 源码面板**：查看 + 一键复制全部源码

### 动画

- 自动检测 SMIL / CSS 动画并显示控制条
- 暂停 / 播放、时间轴拖动（SMIL `setCurrentTime`）

### 导出

- **PNG**：双引擎可选 —— WebView 渲染（与预览一致）或 **Rust · resvg**（快速、不依赖 DOM）
- 倍率 1× / 2× / 4×，可选透明背景
- **PDF** 导出（pdf-lib）
- **复制为位图**到剪贴板
- **批量转换**：整个文件夹的 SVG → PNG（Rust 引擎，带进度提示）

### 工程

- 32MB 文件大小保护，解析异常友好提示
- 预览前剥离 `<script>` 与 `on*` 事件属性 + CSP 兜底
- 自动更新（`tauri-plugin-updater`，配置见 [docs/UPDATER.md](./docs/UPDATER.md)）
- 多平台 CI：构建产物（Artifacts）+ 一键发 Release（附 SHA256 校验和与变更日志）
- 代码签名指引见 [docs/CODE-SIGNING.md](./docs/CODE-SIGNING.md)

## 🧱 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | TypeScript + Vite（原生 DOM，无框架） |
| 后端 | Rust（Tauri v2 命令 + resvg 渲染） |
| WebView | 系统自带（Windows: WebView2 / macOS: WKWebView / Linux: WebKitGTK） |
| 打包 | Tauri Bundler（msi/exe、dmg、AppImage/deb/rpm） |

## 📁 目录结构

```
contour-linea/
├── index.html                 # 界面结构
├── src/
│   ├── main.ts                # 装配：事件绑定 / 菜单 / 拖放 / 单实例
│   ├── api.ts                 # Tauri 适配层（所有原生调用集中于此）
│   ├── state.ts               # 全局共享状态
│   ├── types.ts               # 类型定义
│   ├── svg-parse.ts           # 解析 / 统计 / 安全净化 / 动画检测
│   ├── viewer.ts              # 画布：缩放 / 平移 / 网格 / 坐标 / 测量 / 动画
│   ├── panels.ts              # 标签页 / 信息面板 / 源码面板 / 最近文件 / toast
│   ├── exporting.ts           # PNG / PDF / 剪贴板 / 批量转换 / 检查更新
│   ├── theme.ts               # 主题切换
│   ├── path-join.ts           # 路径拼接小工具
│   └── style.css              # 双主题样式
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json        # 应用 / 打包 / updater 配置
│   ├── capabilities/          # 权限白名单
│   ├── icons/                 # 全套应用图标
│   └── src/lib.rs             # 菜单 + Rust 命令（读取/SVGZ/导出/resvg）
├── scripts/sync-version.mjs   # 三处版本号统一
├── samples/                   # 示例 SVG（含动画样例）
├── docs/                      # UPDATER.md / CODE-SIGNING.md
└── .github/workflows/         # build.yml（校验+多平台构建）/ release.yml（发布）
```

## 🚀 开发

前置条件：

- [Rust](https://rustup.rs/) stable（≥ 1.77）
- Node.js 18+
- **Linux 额外需要**：`libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev build-essential curl wget file libssl-dev patchelf`
- **Windows**：WebView2 + MSVC 构建工具
- **macOS**：Xcode Command Line Tools

```bash
npm install        # 安装前端依赖
npm run tauri dev  # 开发模式（前端热更新 + Rust 热重载）
npm run check      # 仅类型检查
```

## 📦 打包

```bash
npm run tauri build
```

产物在 `src-tauri/target/release/bundle/`：

| 平台 | 产物 |
| --- | --- |
| Windows | `.msi`（WiX）/ `-setup.exe`（NSIS） |
| macOS | `.app` / `.dmg` |
| Linux | `.AppImage` / `.deb` / `.rpm` |

## 🏷️ 发布

```bash
node scripts/sync-version.mjs 1.2.0   # ① 统一版本号（package.json / tauri.conf.json / Cargo.toml）
git commit -am "chore: release 1.2.0"
git tag v1.2.0                        # ② 打 tag
git push origin main --tags           # ③ 推送 → 自动构建 + 发布 Draft Release
```

- `build.yml`：push / PR / 手动触发 → 静态检查 + 多平台构建 → **Artifacts** 可下载
- `release.yml`：推 tag → 多平台构建 + 自动发布 **Draft Release**（含 SHA256 校验和与变更日志）

## ⌨️ 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl + O` | 打开 SVG |
| `Ctrl + Shift + B` | 批量转换 PNG |
| `Ctrl + S` | 导出 PNG |
| `Ctrl + Shift + S` | 导出 PDF |
| `Ctrl + W` | 关闭当前文件 |
| `Ctrl + 0` | 实际大小 100% |
| `Ctrl + =` / `Ctrl + -` | 放大 / 缩小 |
| `F` | 适应窗口 |
| `F4` | 查看 SVG 源码 |
| `Ctrl + Shift + G` | 切换网格 |
| `Ctrl + Shift + T` | 切换主题 |
| 滚轮 / 拖拽 | 缩放 / 平移 |
| `Esc` | 退出测量模式 |

## 📄 License

MIT © Oceaniat — 详见 [LICENSE](./LICENSE)
