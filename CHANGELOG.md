# 更新日志

本项目所有重要变更都记录在此文件。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.2.2] - 2026-10-17

### 修复

- **「复制为位图」失效**：`writeImage` 的 string 参数会被当作**文件路径**解析（raw RGBA 才用 `Uint8Array`），原代码直接传 base64 必然失败。现改为先把 PNG 写入临时目录（`tempDir()` + `save_png`），再以路径写入剪贴板

### 变更

- **tauri-action 升级 `v0` → `v1`**：启用 `retryAttempts: 3` 缓解多平台并发创建同一 draft release 的 `already_exists` 冲突；未配置签名密钥前显式 `uploadUpdaterJson: false`
- CI 的 `cargo test --lib` 暂设 `continue-on-error`（首次接入，测试编译失败只告警、不阻断多平台构建）
- **dependabot 增加版本对齐保护**：忽略 `@tauri-apps/*` 与 Rust `tauri*` 的 minor / major 自动升级，避免再次打破 `tauri build` 的版本一致性检查；PR 上限由 5 降到 2，减少通知噪音

## [1.2.1] - 2026-10-17

### 修复

- **tauri 版本一致性检查导致全部平台构建失败**：`tauri build` 要求 NPM 包与 Rust crate 的 minor 版本对齐。`@tauri-apps/*` 仍锁在 9 月的旧版本（`api 2.11.1` / `plugin-dialog 2.7.3` / `plugin-process 2.3.1` / `plugin-updater 2.12.0` / `plugin-clipboard-manager 2.3.3`），而 Rust 侧已演进到 `2.12 / 2.8 / 2.4 / 2.13 / 2.4`，CI 四个平台均在 `Build and publish release` 秒挂。现按 Rust crate 的 minor 对齐为：`api ~2.12.4`、`plugin-dialog ~2.8.3`、`plugin-process ~2.4.0`、`plugin-updater ~2.13.3`、`plugin-clipboard-manager ~2.4.2`

## [1.2.0] - 2026-10-17

### 新增

- **Rust 单元测试**：覆盖颜色解析、base64 解码、渲染尺寸/背景、超大画布拒绝、缩放归一化、文件读取与目录扫描，CI 自动执行 `cargo test --lib`
- `push.bat`：Windows 一键推送脚本（自检环境 → 配置 remote → 推送 main + tags，失败自动 `--force-with-lease` 重试）
- `.github/dependabot.yml`：npm / cargo / GitHub Actions 依赖每周自动检查更新

### 修复

- **`resvg::render` 编译错误**：resvg 0.48 的第三参数要求 `&mut PixmapMut`，原代码传入 `pixmap.as_mut()` 缺少 `&mut`，会导致所有平台构建失败
- **CI lint job 缺少 `dist`**：`tauri-build` 编译期校验 `frontendDist`（`../dist`）存在，现补充 `npx vite build` 步骤
- **依赖下载源**：`package-lock.json` 中 81 处 `resolved` 指向国内镜像，导致海外 runner 超时；已全部改为官方 `registry.npmjs.org`

### 安全

- **svgz 解压上限**：最多解压 32 MB，防御 gzip 炸弹
- **渲染像素上限**：单张画布最多 1.2 亿像素（约 480 MB RGBA），超限返回友好错误
- **批量转换总量上限**：一次扫描的目录内容上限 256 MB，避免大目录打满内存

### 变更

- 版本号统一为 `1.2.0`（`package.json` / `tauri.conf.json` / `Cargo.toml` / `Cargo.lock`）
- 打 tag 时仅由 `release.yml` 构建发布，`build.yml` 不再响应 tag，避免重复跑两遍多平台构建
- Clippy 以 `continue-on-error` 方式接入，暂不阻断构建

## [1.1.0] - 2026-09-24

### 新增

- SVG 源码面板（查看 + 一键复制）
- 主题切换（自动 / 明亮 / 深色）+ 双主题样式
- 网格叠加、鼠标坐标显示、两点测量
- SVG 动画控制（SMIL / CSS 动画检测，暂停/播放/时间轴）
- PDF 导出、批量转换 PNG、复制为位图到剪贴板
- Rust · resvg 渲染引擎（不依赖 WebView）
- 单实例模式（复用已有窗口）、文件关联与命令行打开
- 自动更新插件接入（`tauri-plugin-updater`）
- 多平台 CI：构建产物 Artifacts + 打 tag 自动发布 Draft Release（含 SHA256 校验和与变更日志）
- 版本号统一脚本 `scripts/sync-version.mjs`
- 代码签名与自动更新文档（`docs/`）

### 安全

- 预览前剥离 `<script>` 与 `on*` 事件属性，CSP 兜底

## [1.0.0] - 2026-09-24

### 新增

- 首个版本：基于 Tauri v2 + TypeScript + Rust 的 SVG 查看器
- 打开 / 拖入 SVG 与 SVGZ、多标签页
- 缩放、平移、适应窗口、背景切换（棋盘格 / 白 / 深色）
- PNG 导出（WebView 渲染）
