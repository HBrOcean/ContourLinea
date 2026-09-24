# Tauri vs Electron：同一个 SVG 预览器的两种实现

我们用两套技术栈实现了**功能完全相同**的 SVG 预览器（同一个 UI、同一套交互逻辑），
以此对比两者在真实工程中的差异。

- Electron 版：`contour-linea-electron/`（TypeScript + Electron + electron-vite）
- Tauri 版：`contour-linea/`（TypeScript + Rust + Tauri v2）

两版前端源码高度相似（预览、缩放、平移、导出、元信息面板逻辑一致），
差异集中在**运行时外壳**：Electron 用自带的 Chromium + Node，Tauri 用系统 WebView + Rust 核心。

---

## 一、速览对比

| 维度 | Electron | Tauri v2 |
| --- | --- | --- |
| 内核 | 自带 Chromium + Node.js | 系统 WebView（Edge/WebKit）+ Rust |
| 安装包体积 | 约 **80–150 MB** | 约 **3–10 MB** |
| 空闲内存 | 约 120–250 MB/窗口 | 约 40–90 MB/窗口 |
| 冷启动 | 较慢（要拉起 Chromium） | 较快 |
| 前端语言 | 任意（HTML/CSS/JS/TS） | 任意（HTML/CSS/JS/TS） |
| 后端语言 | Node.js（JS/TS） | Rust |
| 渲染一致性 | ⭐⭐⭐⭐⭐ 全平台统一 | ⭐⭐⭐ 依赖系统 WebView |
| 安全默认值 | 需手动加固 | 默认收紧 + 权限白名单 |
| 生态成熟度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐（增长很快） |
| 移动端 | ❌ 不支持 | ✅ Android / iOS |
| 首次构建 | 快（装包即用） | 慢（Rust 首次编译 5–20 min） |
| 增量开发体验 | 极佳（热更新） | 好（前端热更新，Rust 改动需重编） |
| 内置自动更新 | 需 electron-updater | ✅ 内置 updater |

> 体积/内存为量级参考，取决于具体依赖与应用规模，不代表精确值。

---

## 二、逐项展开

### 1. 体积与分发
Electron 会**把整个 Chromium 和 Node 打进安装包**，这是它体积的主要来源，也是"开箱即用、行为一致"的代价。
Tauri **复用操作系统已有的 WebView**（Windows 的 WebView2、macOS 的 WKWebView、Linux 的 WebKitGTK），
自己只负责一个体积很小的 Rust 二进制，因此安装包通常只有 Electron 的 **1/10 甚至更小**。

对"下载安装"的场景（尤其是国内网络），体积差异直接影响用户体验。

### 2. 内存与启动
Electron 的多进程架构（主进程 + 渲染进程 + GPU 进程…）带来稳定隔离，但内存占用高、冷启动慢。
Tauri 的 Rust 进程更轻，WebView 由系统管理，空闲内存与启动时间通常明显更优。

### 3. 渲染一致性（Electron 的最大优势）
Electron 自带 Chromium ⇒ **"在我电脑上好好的"在用户电脑上也一样**，不受系统版本影响。
Tauri 用系统 WebView ⇒ 不同系统/版本的渲染引擎不同（Windows 是 Edge Chromium 内核，macOS 是 WebKit，
Linux 是 WebKitGTK），**CSS 特性支持与像素表现可能存在差异**，需要在各平台实测。

> 对"预览 SVG"这类强依赖渲染精确度的工具，这是要重点评估的点：
> 好在 Windows/macOS 的内核都足够现代；Linux 上需确认 WebKitGTK 版本。

### 4. 安全模型
Electron 默认给你完整能力（Node 集成、文件系统），**需要开发者自己收紧**（`contextIsolation`、
禁用 `nodeIntegration`、用 preload 白名单暴露 API）。本项目 Electron 版即采用 `preload + contextBridge`。
Tauri 反过来：**默认最小权限**，一切能力通过 `capabilities/*.json` 显式授权，前端只能在授权范围内调用。
本项目 Tauri 版仅授权了 `core:default` 与 `dialog:default`，文件读写走自定义 Rust 命令。

### 5. 开发体验与语言
Electron 全栈 JS/TS，上手门槛低，前端生态（调试、热更新）极致成熟。
Tauri 需要写 Rust（本项目只写了约 100 行：菜单 + 3 个命令），前期要跨过 Rust 工具链与环境依赖的门槛，
但核心逻辑外包给 Rust 后，二进制更小、内存更省、还能直接调用系统能力。

### 6. 构建与发布
- **Electron**：`electron-builder` 一条命令产出 nsis/portable/AppImage/dmg，配置简单，不依赖编译工具链。
  但要注意**不能交叉编译**：Windows 的 `.exe` 必须在 Windows 上（或 CI 的 Windows runner）构建。
- **Tauri**：需要 Rust 工具链 + 各平台系统依赖（Linux 要 `libwebkit2gtk` 等）。
  首次 `tauri build` 编译较久（Rust 依赖多），但之后有缓存。配合
  [tauri-action](https://github.com/tauri-apps/tauri-action) 可一键**多平台构建 + 发布 GitHub Release**。

两版都配好了 GitHub Actions，推 tag 即可自动出包。

### 7. 生态与社区
Electron 诞生更早，被 VS Code、Slack、Discord 等大规模验证，遇到问题几乎都能搜到答案。
Tauri 相对年轻，但社区活跃、插件体系（dialog/fs/http/updater…）已很完善，且 v2 正式支持移动端。

### 8. 移动端
Tauri v2 可以用同一套前端代码构建 **Android / iOS** 应用；Electron 完全没有移动端方案。
若未来有移动端诉求，Tauri 的路线更顺。

---

## 三、本项目的实际结论

| 诉求 | 建议 |
| --- | --- |
| 极致的小体积 / 省内存 | ✅ **Tauri** |
| 需要 100% 跨平台渲染一致 | ✅ **Electron** |
| 团队只有前端、不想碰 Rust | ✅ **Electron** |
| 想默认安全的权限模型 | ✅ **Tauri** |
| 未来要上移动端 | ✅ **Tauri** |
| 追求最省心的构建与调试 | ✅ **Electron** |

一句话：**"Electron 胜在一致与省心，Tauri 胜在轻量与安全。"**
做一个小工具（像这个 SVG 预览器），Tauri 的体积优势非常香；
如果产品对渲染一致性、复杂原生集成要求高，Electron 更稳。

---

## 四、如何发布到 GitHub

Tauri 版已内置 `.github/workflows/release.yml`：

```bash
git init
git add .
git commit -m "feat: SVG previewer (Tauri v2)"
git branch -M main
git remote add origin https://github.com/HBrOcean/contour-linea.git
git push -u origin main

git tag v1.0.0
git push origin v1.0.0
```

推送 tag 后，Actions 会在 **Windows / macOS(Intel+ARM) / Linux** 上并行构建，
并把 `.msi`/`.exe`/`.dmg`/`.AppImage`/`.deb` 上传为 **Draft Release**，确认后一键发布。
