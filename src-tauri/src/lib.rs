use std::io::Read;
use std::path::Path;
use std::sync::Mutex;

use base64::Engine;
use serde::Serialize;
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{Emitter, Manager};

/// 单个 SVG 文件读取上限（防止超大文件卡死 UI）
const MAX_SVG_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Serialize, Clone)]
struct SvgFile {
    path: String,
    name: String,
    content: String,
}

#[derive(Serialize)]
struct ExportResult {
    path: String,
    width: u32,
    height: u32,
}

#[derive(Serialize)]
struct RenderedPng {
    width: u32,
    height: u32,
    png_base64: String,
}

/* ------------------------------ 文件读取 ------------------------------ */

/// 读取 SVG 文件：支持 .svg（UTF-8）与 .svgz（gzip），带 32MB 大小保护
fn read_svg_impl(path: &str) -> Result<SvgFile, String> {
    let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    if meta.len() > MAX_SVG_BYTES {
        return Err(format!(
            "文件过大（约 {} MB），超过 {} MB 上限",
            meta.len() / 1024 / 1024,
            MAX_SVG_BYTES / 1024 / 1024
        ));
    }

    let raw = std::fs::read(path).map_err(|e| e.to_string())?;
    let content = if path.to_ascii_lowercase().ends_with(".svgz") {
        let mut decoder = flate2::read::GzDecoder::new(raw.as_slice());
        let mut text = String::new();
        decoder
            .read_to_string(&mut text)
            .map_err(|e| format!("svgz 解压失败：{e}"))?;
        text
    } else {
        String::from_utf8(raw).map_err(|e| format!("文件不是 UTF-8 编码：{e}"))?
    };

    let name = Path::new(path)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    Ok(SvgFile {
        path: path.to_string(),
        name,
        content,
    })
}

#[tauri::command]
fn read_svg(path: String) -> Result<SvgFile, String> {
    read_svg_impl(&path)
}

/// 列出目录下全部 SVG / SVGZ（按名称排序），供「批量转换」使用
#[tauri::command]
fn list_svg_dir(dir: String) -> Result<Vec<SvgFile>, String> {
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut paths: Vec<String> = Vec::new();
    for entry in entries.flatten() {
        let p = entry.path();
        let ext = p
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if (ext == "svg" || ext == "svgz") && p.is_file() {
            paths.push(p.to_string_lossy().into_owned());
        }
    }
    paths.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));

    let mut files = Vec::new();
    for p in &paths {
        if let Ok(f) = read_svg_impl(p) {
            files.push(f);
        }
    }
    Ok(files)
}

/* ------------------------------ 保存文件 ------------------------------ */

fn decode_base64(data: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD
        .decode(data.trim())
        .map_err(|e| format!("base64 解码失败：{e}"))
}

/// 保存导出的 PNG（前端传 base64，避免大数组 JSON 序列化开销）
#[tauri::command]
fn save_png(path: String, data: String) -> Result<String, String> {
    let bytes = decode_base64(&data)?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path)
}

/// 保存导出的 PDF（前端 pdf-lib 生成，base64 传输）
#[tauri::command]
fn save_pdf(path: String, data: String) -> Result<String, String> {
    let bytes = decode_base64(&data)?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path)
}

/* --------------------------- resvg 原生渲染导出 --------------------------- */

fn parse_hex_color(hex: &str) -> Option<resvg::tiny_skia::Color> {
    let h = hex.trim().trim_start_matches('#');
    if h.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&h[0..2], 16).ok()?;
    let g = u8::from_str_radix(&h[2..4], 16).ok()?;
    let b = u8::from_str_radix(&h[4..6], 16).ok()?;
    Some(resvg::tiny_skia::Color::from_rgba8(r, g, b, 255))
}

/// 用 resvg（Rust 端）把 SVG 字符串渲染成 PNG 字节，不依赖 WebView
fn render_svg_to_png(
    content: &str,
    scale: f64,
    background: Option<&str>,
) -> Result<(u32, u32, Vec<u8>), String> {
    let scale = if scale.is_finite() && scale > 0.0 {
        scale.clamp(0.01, 16.0)
    } else {
        1.0
    };

    let mut fontdb = resvg::usvg::fontdb::Database::new();
    fontdb.load_system_fonts();
    let opts = resvg::usvg::Options {
        fontdb: std::sync::Arc::new(fontdb),
        ..Default::default()
    };
    let tree = resvg::usvg::Tree::from_str(content, &opts)
        .map_err(|e| format!("SVG 解析失败：{e:?}"))?;

    let size = tree.size();
    let w = ((size.width() as f64) * scale).round().max(1.0) as u32;
    let h = ((size.height() as f64) * scale).round().max(1.0) as u32;

    let mut pixmap = resvg::tiny_skia::Pixmap::new(w, h).ok_or("创建画布失败")?;
    if let Some(bg) = background {
        let color = parse_hex_color(bg)
            .unwrap_or_else(|| resvg::tiny_skia::Color::from_rgba8(255, 255, 255, 255));
        let _ = pixmap.fill(color);
    }
    let ts = resvg::tiny_skia::Transform::from_scale(scale as f32, scale as f32);
    resvg::render(&tree, ts, pixmap.as_mut());

    let png = pixmap
        .encode_png()
        .map_err(|e| format!("PNG 编码失败：{e:?}"))?;
    Ok((w, h, png))
}

/// Rust 引擎导出 PNG（批量转换 / 引擎切换时使用）
#[tauri::command]
fn export_png_native(
    content: String,
    path: String,
    scale: f64,
    background: Option<String>,
) -> Result<ExportResult, String> {
    let (w, h, png) = render_svg_to_png(&content, scale, background.as_deref())?;
    std::fs::write(&path, &png).map_err(|e| e.to_string())?;
    Ok(ExportResult { path, width: w, height: h })
}

/// Rust 引擎渲染 PNG 并返回 base64（供预览 / 剪贴板复用）
#[tauri::command]
fn render_png_native(
    content: String,
    scale: f64,
    background: Option<String>,
) -> Result<RenderedPng, String> {
    let (w, h, png) = render_svg_to_png(&content, scale, background.as_deref())?;
    Ok(RenderedPng {
        width: w,
        height: h,
        png_base64: base64::engine::general_purpose::STANDARD.encode(&png),
    })
}

/* ------------------------------ 启动路径 ------------------------------ */

/// 启动时通过命令行 / 文件关联传入的 SVG 路径
struct StartupPaths(Mutex<Vec<String>>);

#[tauri::command]
fn startup_files(state: tauri::State<'_, StartupPaths>) -> Vec<String> {
    state.0.lock().map(|v| v.clone()).unwrap_or_default()
}

fn collect_startup_paths() -> Vec<String> {
    std::env::args()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .filter_map(|a| {
            let p = std::path::PathBuf::from(&a);
            let ext = p
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if (ext == "svg" || ext == "svgz") && p.is_file() {
                Some(p.to_string_lossy().into_owned())
            } else {
                None
            }
        })
        .collect()
}

/* -------------------------------- 入口 -------------------------------- */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // single-instance 必须最先注册：二次启动时把新文件转发给已运行实例
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let new_paths: Vec<String> = args
                .into_iter()
                .filter(|a| {
                    let low = a.to_ascii_lowercase();
                    (low.ends_with(".svg") || low.ends_with(".svgz"))
                        && std::path::Path::new(a).is_file()
                })
                .collect();
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_focus();
            }
            if !new_paths.is_empty() {
                if let Some(state) = app.try_state::<StartupPaths>() {
                    if let Ok(mut v) = state.0.lock() {
                        *v = new_paths.clone();
                    }
                }
                let _ = app.emit("open-files", new_paths);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(StartupPaths(Mutex::new(collect_startup_paths())))
        .setup(|app| {
            let open = MenuItemBuilder::with_id("open", "打开 SVG…")
                .accelerator("CmdOrCtrl+O")
                .build(app)?;
            let batch = MenuItemBuilder::with_id("batch-png", "批量转换 PNG…")
                .accelerator("CmdOrCtrl+Shift+B")
                .build(app)?;
            let export = MenuItemBuilder::with_id("export-png", "导出 PNG…")
                .accelerator("CmdOrCtrl+S")
                .build(app)?;
            let export_pdf = MenuItemBuilder::with_id("export-pdf", "导出 PDF…")
                .accelerator("CmdOrCtrl+Shift+S")
                .build(app)?;
            let close = MenuItemBuilder::with_id("close", "关闭文件")
                .accelerator("CmdOrCtrl+W")
                .build(app)?;
            let quit = PredefinedMenuItem::quit(app, Some("退出"))?;

            let file_menu = SubmenuBuilder::new(app, "文件")
                .item(&open)
                .item(&batch)
                .separator()
                .item(&export)
                .item(&export_pdf)
                .separator()
                .item(&close)
                .separator()
                .item(&quit)
                .build()?;

            let fit = MenuItemBuilder::with_id("fit", "适应窗口")
                .accelerator("F")
                .build(app)?;
            let reset = MenuItemBuilder::with_id("reset-zoom", "实际大小")
                .accelerator("CmdOrCtrl+0")
                .build(app)?;
            let zoom_in = MenuItemBuilder::with_id("zoom-in", "放大")
                .accelerator("CmdOrCtrl+=")
                .build(app)?;
            let zoom_out = MenuItemBuilder::with_id("zoom-out", "缩小")
                .accelerator("CmdOrCtrl+-")
                .build(app)?;
            let grid = MenuItemBuilder::with_id("grid", "切换网格")
                .accelerator("CmdOrCtrl+Shift+G")
                .build(app)?;
            let theme = MenuItemBuilder::with_id("theme", "切换主题")
                .accelerator("CmdOrCtrl+Shift+T")
                .build(app)?;
            let code = MenuItemBuilder::with_id("toggle-code", "查看 SVG 源码")
                .accelerator("F4")
                .build(app)?;

            let view_menu = SubmenuBuilder::new(app, "视图")
                .item(&fit)
                .item(&reset)
                .item(&zoom_in)
                .item(&zoom_out)
                .separator()
                .item(&grid)
                .item(&theme)
                .item(&code)
                .build()?;

            let about = MenuItemBuilder::with_id("about", "项目说明").build(app)?;
            let check_update = MenuItemBuilder::with_id("check-update", "检查更新…").build(app)?;
            let help_menu = SubmenuBuilder::new(app, "帮助")
                .item(&about)
                .item(&check_update)
                .build()?;

            let menu = MenuBuilder::new(app)
                .items(&[&file_menu, &view_menu, &help_menu])
                .build()?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let _ = app.emit("menu", event.id().0.clone());
        })
        .invoke_handler(tauri::generate_handler![
            read_svg,
            list_svg_dir,
            save_png,
            save_pdf,
            export_png_native,
            render_png_native,
            startup_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
