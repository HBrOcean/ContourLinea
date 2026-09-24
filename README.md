# ContourLinea (Tauri)

一个用 **Tauri v2 + TypeScript** 构建的轻量 SVG 预览器 —— 与 Electron 版功能一致，但体积小得多。

> 想看两个版本的详细对比？见 [TAURI-VS-ELECTRON.md](./TAURI-VS-ELECTRON.md)

## ✨ 功能

- 打开 / 拖入 SVG 文件预览（支持多选，标签页切换）
- 鼠标滚轮缩放（以指针为中心）、拖拽平移、双击适应窗口
- 一键「适应窗口」/「1:1 实际大小」
- 背景切换：棋盘格 / 白色 / 深色
- 导出 PNG（2× 分辨率，可选透明背景）
- 文件信息面板：画布尺寸、viewBox、元素总数、元素标签分布、路径
- 原生菜单 + 快捷键；支持命令行 / 文件关联打开
- 安全处理：预览前剥离 SVG 内的 `<script>` 与 `on*` 事件属性

## 🧱 技术栈

| 部分 | 技术 |
| --- | --- |
| 前端 | TypeScript + Vite（原生 DOM，无框架） |
| 后端 | Rust（Tauri v2 命令：`read_svg` / `save_png` / `startup_files`） |
| WebView | 系统自带（Windows: WebView2 / macOS: WKWebView / Linux: WebKitGTK） |
| 打包 | Tauri Bundler（msi/exe、dmg、AppImage/deb/rpm） |

## 📁 目录结构

```
contour-linea/
├── index.html                # 界面结构
├── src/
│   ├── main.ts               # 预览逻辑（解析/缩放/平移/导出）+ Tauri 适配层
│   └── style.css             # 深色主题样式
├── src-tauri/
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json       # 应用与打包配置
│   ├── capabilities/         # 权限（core + dialog）
│   ├── icons/                # 全套应用图标
│   └── src/
│       ├── main.rs           # 入口
│       └── lib.rs            # 菜单 + Rust 命令
└── .github/workflows/release.yml  # CI：多平台构建并发布 Release
```

## 🚀 开发

前置条件：

- [Rust](https://rustup.rs/)（stable，≥ 1.77）
- Node.js 18+
- **Linux 额外需要**：`libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev build-essential curl wget file libssl-dev`
- **Windows**：WebView2（Win10/11 一般已内置）+ MSVC 构建工具
- **macOS**：Xcode Command Line Tools

```bash
npm install        # 安装前端依赖
npm run tauri dev  # 开发模式（热更新 + Rust 热重载）
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

体积通常只有同功能 Electron 应用的 **1/10 左右**（Tauri 复用系统 WebView，不打包浏览器内核）。

## 🏷️ 发布到 GitHub（自动多平台）

Tauri 版内置两个工作流，按需使用：

**① `build.yml` —— 只产出可下载的 Artifacts（日常推荐）**

- 触发方式：push 到 `main`/`master`、Pull Request，或手动 **Run workflow**
- 在 **Windows / Linux / macOS(Intel+ARM)** 上并行构建
- 构建完成后，进入该次运行页面底部的 **Artifacts** 区下载：
  - `contour-linea-Windows-x64` —— `.msi` / `-setup.exe`
  - `contour-linea-Linux-x64` —— `.AppImage` / `.deb` / `.rpm`
  - `contour-linea-macOS-ARM64` / `contour-linea-macOS-x64` —— `.dmg` / `.app`

**② `release.yml` —— 构建并发布 GitHub Release**（使用 [tauri-action](https://github.com/tauri-apps/tauri-action)）

```bash
git tag v1.0.0
git push origin v1.0.0
```

推送 tag 后会在 **Windows / macOS(Intel+ARM) / Linux** 上构建，并把安装包上传为一个 **Draft Release**。
到仓库 Releases 页面确认并点 Publish 即可。

## ⌨️ 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl + O` | 打开 SVG |
| `Ctrl + S` | 导出 PNG |
| `Ctrl + W` | 关闭当前文件 |
| `Ctrl + 0` | 实际大小 100% |
| `Ctrl + =` / `Ctrl + -` | 放大 / 缩小 |
| `F` | 适应窗口 |

## 📄 License

MIT © Oceaniat
