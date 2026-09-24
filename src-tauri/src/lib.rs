use std::path::Path;
use std::sync::Mutex;

use serde::Serialize;
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{Emitter, Manager};

#[derive(Serialize)]
struct SvgFile {
    path: String,
    name: String,
    content: String,
}

/// 读取 SVG 文件（走 Rust 侧，免去前端 fs 插件的 scope 配置）
#[tauri::command]
fn read_svg(path: String) -> Result<SvgFile, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let name = Path::new(&path)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    Ok(SvgFile { path, name, content })
}

/// 保存导出的 PNG（前端传入字节数组）
#[tauri::command]
fn save_png(path: String, data: Vec<u8>) -> Result<String, String> {
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(path)
}

/// 启动时通过命令行/文件关联传入的 SVG 路径
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(StartupPaths(Mutex::new(collect_startup_paths())))
        .setup(|app| {
            let open = MenuItemBuilder::with_id("open", "打开 SVG…")
                .accelerator("CmdOrCtrl+O")
                .build(app)?;
            let export = MenuItemBuilder::with_id("export-png", "导出 PNG…")
                .accelerator("CmdOrCtrl+S")
                .build(app)?;
            let close = MenuItemBuilder::with_id("close", "关闭文件")
                .accelerator("CmdOrCtrl+W")
                .build(app)?;
            let quit = PredefinedMenuItem::quit(app, Some("退出"))?;

            let file_menu = SubmenuBuilder::new(app, "文件")
                .item(&open)
                .item(&export)
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

            let view_menu = SubmenuBuilder::new(app, "视图")
                .item(&fit)
                .item(&reset)
                .item(&zoom_in)
                .item(&zoom_out)
                .build()?;

            let about = MenuItemBuilder::with_id("about", "项目说明").build(app)?;
            let help_menu = SubmenuBuilder::new(app, "帮助").item(&about).build()?;

            let menu = MenuBuilder::new(app)
                .items(&[&file_menu, &view_menu, &help_menu])
                .build()?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let _ = app.emit("menu", event.id().0.clone());
        })
        .invoke_handler(tauri::generate_handler![read_svg, save_png, startup_files])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
