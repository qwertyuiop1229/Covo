use tauri::{tray::TrayIconBuilder, menu::{Menu, MenuItem}, Manager, WindowEvent, Emitter};
use tauri::WebviewWindowBuilder;
use std::sync::Mutex;

const CONTAINER_LABEL: &str = "notif_container";
const PICKER_LABEL: &str = "notif_pos_picker";

const CONTAINER_W: i32 = 360;
#[allow(dead_code)]
const CONTAINER_H_INITIAL: i32 = 100;       // 初期は1枚分の高さだけ
const CONTAINER_H_DEFAULT: i32 = 600;       // 「右下」デフォルト計算用の見込み高さ
const CONTAINER_H_MIN: i32 = 90;            // カードなしのとき
const CONTAINER_H_MAX_RATIO: f64 = 0.85;    // モニター高さの比率上限
const PICKER_W: i32 = 360;
const PICKER_H: i32 = 200;
const SCREEN_MARGIN: i32 = 20;
const OFFSCREEN_X: i32 = -8000;
const OFFSCREEN_Y: i32 = -8000;

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct SavedPosition {
    monitor_index: Option<usize>,
    x_in_monitor: i32,
    y_in_monitor: i32,
    stack_direction: String, // "up" (新着が下、古いのが上) | "down" (新着が上、古いのが下)
}

#[derive(Clone)]
struct PendingNotif {
    id: String,
    title: String,
    body: String,
    room_id: String,
    stack_dir: String,
}

#[derive(Default)]
struct NotificationState {
    saved_position: Mutex<Option<SavedPosition>>,
    container_ready: Mutex<bool>,
    pending: Mutex<Vec<PendingNotif>>,
    close_behavior: Mutex<String>,
    app_loaded: Mutex<bool>,
}

#[derive(serde::Serialize)]
struct MonitorInfo {
    index: usize,
    name: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    is_primary: bool,
    scale_factor: f64,
}

// ===========================================================================
// 位置計算ヘルパー
// ===========================================================================

fn pick_monitor(
    app_handle: &tauri::AppHandle,
    monitor_index: Option<usize>,
) -> Option<tauri::Monitor> {
    let win = app_handle.get_webview_window("main")?;
    let monitors = win.available_monitors().ok()?;
    if let Some(idx) = monitor_index {
        if let Some(m) = monitors.get(idx) {
            return Some(m.clone());
        }
    }
    if let Ok(Some(m)) = win.primary_monitor() {
        return Some(m);
    }
    monitors.into_iter().next()
}

fn container_height_for_monitor(monitor: &tauri::Monitor) -> i32 {
    let mh = monitor.size().height as f64;
    (mh * 0.8).min(CONTAINER_H_DEFAULT as f64).max(200.0) as i32
}

// 保存位置 (None なら primary 右下デフォルト) を実際の物理座標に解決
// 戻り値: (window_x, window_y, stack_direction)
fn resolve_window_position(
    app_handle: &tauri::AppHandle,
    saved: Option<&SavedPosition>,
) -> Option<(i32, i32, String)> {
    let monitor = pick_monitor(app_handle, saved.and_then(|s| s.monitor_index))?;
    let mp = monitor.position();
    let ms = monitor.size();
    let mw = ms.width as i32;
    let mh = ms.height as i32;

    if let Some(s) = saved {
        let wx = mp.x + s.x_in_monitor;
        let wy = mp.y + s.y_in_monitor;
        Some((wx, wy, s.stack_direction.clone()))
    } else {
        // デフォルト: 右下
        let container_h = container_height_for_monitor(&monitor);
        let wx = mp.x + mw - CONTAINER_W - SCREEN_MARGIN;
        let wy = mp.y + mh - container_h - SCREEN_MARGIN;
        Some((wx, wy, "up".to_string()))
    }
}

// ===========================================================================
// コンテナウィンドウ生成・取得（現在は使用していない: WebView2 でのハング問題により
// Windows ネイティブのトースト通知に切り替えた。将来カスタム UI を再開する際の
// ためにコードは残してある）
// ===========================================================================

#[allow(dead_code)]
fn ensure_container_window(
    app_handle: &tauri::AppHandle,
) -> Result<(tauri::WebviewWindow, bool), String> {
    log::info!("[ensure] step 1: checking existing container");
    if let Some(win) = app_handle.get_webview_window(CONTAINER_LABEL) {
        log::info!("[ensure] step 1.5: existing container found, reusing");
        return Ok((win, false));
    }
    log::error!("[ensure] step 2: container should have been pre-created in setup()! Falling back...");
    // フォールバック: setup() で作られていなかった場合に build を試みる
    // ただしハングする可能性あり
    let win = WebviewWindowBuilder::new(
        app_handle,
        CONTAINER_LABEL,
        tauri::WebviewUrl::App("/notification-container.html".into()),
    )
    .inner_size(CONTAINER_W as f64, CONTAINER_H_INITIAL as f64)
    .position(OFFSCREEN_X as f64, OFFSCREEN_Y as f64)
    .build()
    .map_err(|e| format!("fallback build failed: {}", e))?;

    let _ = win.set_decorations(false);
    let _ = win.set_skip_taskbar(true);
    let _ = win.set_always_on_top(true);
    let _ = win.set_resizable(false);

    log::info!("[ensure] step 6: container window setup complete (fallback)");
    Ok((win, true))
}

// JS から呼ばれるコンテナリサイズ。
// stack_direction によってアンカー（top or bottom）を維持する
#[tauri::command]
fn resize_notif_container(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, NotificationState>,
    height: u32,
) -> Result<(), String> {
    let win = app_handle
        .get_webview_window(CONTAINER_LABEL)
        .ok_or_else(|| "container not found".to_string())?;

    // モニターから最大高を計算
    let monitor = pick_monitor(&app_handle, None);
    let max_h = monitor
        .as_ref()
        .map(|m| (m.size().height as f64 * CONTAINER_H_MAX_RATIO) as i32)
        .unwrap_or(CONTAINER_H_DEFAULT);
    let new_h = height.max(CONTAINER_H_MIN as u32).min(max_h as u32);

    let saved = state.saved_position.lock().unwrap().clone();
    let stack_dir = saved
        .as_ref()
        .map(|s| s.stack_direction.clone())
        .unwrap_or_else(|| "up".to_string());

    let cur_pos = win.outer_position().map_err(|e| e.to_string())?;
    let cur_size = win.outer_size().map_err(|e| e.to_string())?;

    if stack_dir == "up" {
        // 「up」(下から積む): bottom anchor を維持。top を新しい高さに合わせて上下調整
        let bottom = cur_pos.y + cur_size.height as i32;
        let new_top = bottom - new_h as i32;
        win.set_size(tauri::PhysicalSize {
            width: cur_size.width,
            height: new_h,
        })
        .map_err(|e| format!("set_size failed: {}", e))?;
        win.set_position(tauri::PhysicalPosition {
            x: cur_pos.x,
            y: new_top,
        })
        .map_err(|e| format!("set_position failed: {}", e))?;
    } else {
        // 「down」(上から積む): top anchor 維持。サイズだけ変える
        win.set_size(tauri::PhysicalSize {
            width: cur_size.width,
            height: new_h,
        })
        .map_err(|e| format!("set_size failed: {}", e))?;
    }

    Ok(())
}

// ===========================================================================

#[tauri::command]
fn show_main_window(app_handle: tauri::AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn minimize_window(app_handle: tauri::AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.minimize();
    }
}

#[tauri::command]
fn toggle_maximize_window(app_handle: tauri::AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        if let Ok(is_max) = window.is_maximized() {
            if is_max {
                let _ = window.unmaximize();
            } else {
                let _ = window.maximize();
            }
        }
    }
}

#[tauri::command]
fn close_window(app_handle: tauri::AppHandle, state: tauri::State<'_, NotificationState>) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let behavior = {
            let b = state.close_behavior.lock().unwrap_or_else(|e| e.into_inner()).clone();
            b
        };
        if behavior == "quit" {
            let _ = window.close();
            app_handle.exit(0);
        } else if behavior == "hide" {
            let _ = window.hide();
        } else {
            let _ = window.minimize();
        }
    }
}

#[tauri::command]
fn set_close_behavior(
    behavior: String,
    state: tauri::State<'_, NotificationState>,
) -> Result<(), String> {
    if let Ok(mut b) = state.close_behavior.lock() {
        *b = behavior;
    }
    Ok(())
}

// コンテナの JS が起動完了したときに呼ばれる
#[tauri::command]
fn container_loaded(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, NotificationState>,
) -> Result<(), String> {
    log::info!("container_loaded called");
    *state.container_ready.lock().unwrap() = true;

    // 溜まっている notifications をすべて flush
    let pending: Vec<PendingNotif> = std::mem::take(&mut *state.pending.lock().unwrap());
    log::info!("Flushing {} pending notifications", pending.len());

    let window = app_handle
        .get_webview_window(CONTAINER_LABEL)
        .ok_or_else(|| "container not found".to_string())?;

    for p in pending {
        let payload = serde_json::json!({
            "id": p.id,
            "title": p.title,
            "body": p.body,
            "roomId": p.room_id,
            "stackDir": p.stack_dir,
        });
        if let Err(e) = window.emit("new-notif", payload) {
            log::error!("flush emit failed: {}", e);
        }
    }
    Ok(())
}

#[tauri::command]
fn hide_notif_container(app_handle: tauri::AppHandle) {
    if let Some(win) = app_handle.get_webview_window(CONTAINER_LABEL) {
        // hide() バグ回避のため画面外に移動して実質非表示にする
        let _ = win.set_position(tauri::PhysicalPosition {
            x: OFFSCREEN_X,
            y: OFFSCREEN_Y,
        });
    }
}

#[tauri::command]
fn close_notification(_app_handle: tauri::AppHandle, _label: String) {
    // 互換性のため残すがコンテナ方式では使わない
}

// ===========================================================================
// コマンド: 位置ピッカー
// ===========================================================================

#[tauri::command]
fn open_position_picker(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, NotificationState>,
) -> Result<(), String> {
    if let Some(win) = app_handle.get_webview_window(PICKER_LABEL) {
        let _ = win.close();
    }

    let saved = state.saved_position.lock().unwrap().clone();
    let (initial_x, initial_y) = resolve_window_position(&app_handle, saved.as_ref())
        .map(|(x, y, _)| (x, y))
        .unwrap_or((100, 100));

    let win = WebviewWindowBuilder::new(
        &app_handle,
        PICKER_LABEL,
        tauri::WebviewUrl::App("/notification-picker.html".into()),
    )
    .inner_size(PICKER_W as f64, PICKER_H as f64)
    .position(initial_x as f64, initial_y as f64)
    .always_on_top(true)
    .decorations(false)
    .skip_taskbar(true)
    .resizable(false)
    .build()
    .map_err(|e| format!("picker build failed: {}", e))?;

    let _ = win.set_position(tauri::PhysicalPosition {
        x: initial_x,
        y: initial_y,
    });

    // F12 で開閉可能（devtools feature 有効）
    Ok(())
}

#[tauri::command]
fn open_devtools_for_picker(app_handle: tauri::AppHandle) {
    if let Some(win) = app_handle.get_webview_window(PICKER_LABEL) {
        win.open_devtools();
    }
}

#[tauri::command]
fn open_devtools_for_container(app_handle: tauri::AppHandle) {
    if let Some(win) = app_handle.get_webview_window(CONTAINER_LABEL) {
        win.open_devtools();
    }
}

// デスクトップにショートカットを作成
#[tauri::command]
fn create_desktop_shortcut() -> Result<(), String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("current_exe failed: {}", e))?;
    let exe_str = exe.to_string_lossy().to_string();
    let exe_escaped = exe_str.replace('\'', "''").replace('`', "``").replace('$', "`$");

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let ps_script = format!(
            "$t='{}';$s=New-Object -COM WScript.Shell;$dp=[Environment]::GetFolderPath('Desktop');$sc=$s.CreateShortcut((Join-Path $dp 'Covo.lnk'));$sc.TargetPath=$t;$sc.IconLocation=$t;[void]$sc.Save()",
            exe_escaped
        );
        let status = std::process::Command::new("powershell")
            .args(["-NonInteractive", "-NoProfile", "-Command", &ps_script])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|e| format!("powershell failed: {}", e))?;
        if !status.success() {
            return Err("shortcut creation failed".to_string());
        }
    }

    Ok(())
}

// ログディレクトリをエクスプローラーで開く
#[tauri::command]
fn open_log_dir(app_handle: tauri::AppHandle) -> Result<String, String> {
    let path = app_handle
        .path()
        .app_log_dir()
        .map_err(|e| format!("app_log_dir failed: {}", e))?;
    // ディレクトリがまだ作られていなければ作る
    if !path.exists() {
        std::fs::create_dir_all(&path).map_err(|e| format!("create_dir_all failed: {}", e))?;
    }
    // ログファイルが空でも何か書いておく
    let log_marker = path.join("opened_at.txt");
    let _ = std::fs::write(
        &log_marker,
        format!("Log dir opened: {:?}\n", std::time::SystemTime::now()),
    );

    let path_str = path.to_string_lossy().to_string();
    log::info!("Opening log dir: {}", path_str);
    // explorer で開く
    std::process::Command::new("explorer")
        .arg(&path_str)
        .spawn()
        .map_err(|e| format!("spawn explorer failed: {}", e))?;
    Ok(path_str)
}

#[tauri::command]
fn save_notification_position(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, NotificationState>,
) -> Result<SavedPosition, String> {
    let win = app_handle
        .get_webview_window(PICKER_LABEL)
        .ok_or_else(|| "picker window not found".to_string())?;

    let pos = win
        .outer_position()
        .map_err(|e| format!("outer_position failed: {}", e))?;

    let main = app_handle
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let monitors = main
        .available_monitors()
        .map_err(|e| format!("monitors failed: {}", e))?;

    // ピッカー位置 (左上) から所属モニターを判定
    let found = monitors.iter().enumerate().find(|(_, m)| {
        let mp = m.position();
        let ms = m.size();
        pos.x >= mp.x
            && pos.x < mp.x + ms.width as i32
            && pos.y >= mp.y
            && pos.y < mp.y + ms.height as i32
    });

    let (monitor_idx, monitor) = match found {
        Some((i, m)) => (Some(i), m.clone()),
        None => {
            let m = monitors.first().cloned().ok_or_else(|| "no monitors".to_string())?;
            (Some(0), m)
        }
    };

    let mp = monitor.position();
    let ms = monitor.size();
    let x_in_monitor = pos.x - mp.x;
    let y_in_monitor = pos.y - mp.y;

    // y がモニター高の 1/3 未満なら下方向にスタック (top stack)、それ以外は上方向
    let stack_direction = if y_in_monitor < (ms.height as i32) / 3 {
        "down".to_string()
    } else {
        "up".to_string()
    };

    let saved = SavedPosition {
        monitor_index: monitor_idx,
        x_in_monitor,
        y_in_monitor,
        stack_direction: stack_direction.clone(),
    };

    {
        let mut lock = state.saved_position.lock().unwrap();
        *lock = Some(saved.clone());
    }

    let _ = win.close();

    if let Some(main) = app_handle.get_webview_window("main") {
        let _ = main.emit("position-saved", &saved);
    }

    // 既存コンテナがあれば即時再配置
    if let Some(container) = app_handle.get_webview_window(CONTAINER_LABEL) {
        if let Some((wx, wy, _)) = resolve_window_position(&app_handle, Some(&saved)) {
            let _ = container.set_position(tauri::PhysicalPosition { x: wx, y: wy });
        }
    }

    Ok(saved)
}

#[tauri::command]
fn cancel_position_picker(app_handle: tauri::AppHandle) {
    if let Some(win) = app_handle.get_webview_window(PICKER_LABEL) {
        let _ = win.close();
    }
}

// メインウィンドウ内で完結する位置設定: 絶対物理ピクセル座標を受け取って保存
#[tauri::command]
fn save_position_absolute(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, NotificationState>,
    x: i32,
    y: i32,
) -> Result<SavedPosition, String> {
    log::info!("save_position_absolute called: x={}, y={}", x, y);

    let main = app_handle
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let monitors = main
        .available_monitors()
        .map_err(|e| format!("monitors failed: {}", e))?;

    // 与えられた座標を含むモニターを判定
    let found = monitors.iter().enumerate().find(|(_, m)| {
        let mp = m.position();
        let ms = m.size();
        x >= mp.x && x < mp.x + ms.width as i32
            && y >= mp.y && y < mp.y + ms.height as i32
    });

    let (monitor_idx, monitor) = match found {
        Some((i, m)) => (Some(i), m.clone()),
        None => {
            // 座標がどのモニターにも含まれない場合は primary または 1 番目
            let m = main.primary_monitor().ok().flatten()
                .or_else(|| monitors.first().cloned())
                .ok_or_else(|| "no monitors".to_string())?;
            (Some(0), m)
        }
    };

    let mp = monitor.position();
    let ms = monitor.size();
    let x_in_monitor = x - mp.x;
    let y_in_monitor = y - mp.y;

    let stack_direction = if y_in_monitor < (ms.height as i32) / 3 {
        "down".to_string()
    } else {
        "up".to_string()
    };

    let saved = SavedPosition {
        monitor_index: monitor_idx,
        x_in_monitor,
        y_in_monitor,
        stack_direction,
    };

    {
        let mut lock = state.saved_position.lock().unwrap();
        *lock = Some(saved.clone());
    }

    log::info!("Saved position: {:?}", serde_json::to_string(&saved).ok());

    // 既存コンテナがあれば即時再配置
    if let Some(container) = app_handle.get_webview_window(CONTAINER_LABEL) {
        if let Some((wx, wy, _)) = resolve_window_position(&app_handle, Some(&saved)) {
            let _ = container.set_position(tauri::PhysicalPosition { x: wx, y: wy });
        }
    }

    Ok(saved)
}

#[tauri::command]
fn set_saved_position(state: tauri::State<'_, NotificationState>, saved: SavedPosition) {
    let mut lock = state.saved_position.lock().unwrap();
    *lock = Some(saved);
}

#[tauri::command]
fn get_saved_position(state: tauri::State<'_, NotificationState>) -> Option<SavedPosition> {
    state.saved_position.lock().unwrap().clone()
}

#[tauri::command]
fn get_available_monitors(app_handle: tauri::AppHandle) -> Vec<MonitorInfo> {
    let Some(win) = app_handle.get_webview_window("main") else {
        return vec![];
    };
    let monitors = match win.available_monitors() {
        Ok(m) => m,
        Err(_) => return vec![],
    };
    let primary = win.primary_monitor().ok().flatten();
    let primary_pos = primary.as_ref().map(|m| {
        let p = m.position();
        (p.x, p.y)
    });

    monitors
        .iter()
        .enumerate()
        .map(|(idx, m)| {
            let s = m.size();
            let p = m.position();
            let is_primary = primary_pos.map_or(false, |(px, py)| px == p.x && py == p.y);
            MonitorInfo {
                index: idx,
                name: m.name().cloned().unwrap_or_else(|| format!("Display {}", idx + 1)),
                x: p.x,
                y: p.y,
                width: s.width,
                height: s.height,
                is_primary,
                scale_factor: m.scale_factor(),
            }
        })
        .collect()
}

// ===========================================================================
// グローバルショートカット
// ===========================================================================

fn char_to_code(key: &str) -> Option<tauri_plugin_global_shortcut::Code> {
    use tauri_plugin_global_shortcut::Code;
    match key.to_uppercase().as_str() {
        "A" => Some(Code::KeyA), "B" => Some(Code::KeyB), "C" => Some(Code::KeyC),
        "D" => Some(Code::KeyD), "E" => Some(Code::KeyE), "F" => Some(Code::KeyF),
        "G" => Some(Code::KeyG), "H" => Some(Code::KeyH), "I" => Some(Code::KeyI),
        "J" => Some(Code::KeyJ), "K" => Some(Code::KeyK), "L" => Some(Code::KeyL),
        "M" => Some(Code::KeyM), "N" => Some(Code::KeyN), "O" => Some(Code::KeyO),
        "P" => Some(Code::KeyP), "Q" => Some(Code::KeyQ), "R" => Some(Code::KeyR),
        "S" => Some(Code::KeyS), "T" => Some(Code::KeyT), "U" => Some(Code::KeyU),
        "V" => Some(Code::KeyV), "W" => Some(Code::KeyW), "X" => Some(Code::KeyX),
        "Y" => Some(Code::KeyY), "Z" => Some(Code::KeyZ),
        _ => None,
    }
}

#[tauri::command]
fn update_shortcut_key(app_handle: tauri::AppHandle, key: String) {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Modifiers, Shortcut};
    let _ = app_handle.global_shortcut().unregister_all();
    if let Some(code) = char_to_code(&key) {
        let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), code);
        let _ = app_handle.global_shortcut().register(shortcut);
    }
}


#[tauri::command]
fn set_badge(app_handle: tauri::AppHandle, has_unread: bool) {
    log::info!("[DEBUG] set_badge called with has_unread: {}", has_unread);
    if let Some(window) = app_handle.get_webview_window("main") {
        #[cfg(target_os = "windows")]
        {
            use windows::Win32::UI::Shell::{ITaskbarList3, TaskbarList};
            use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
            use windows::Win32::Foundation::HWND;
            if let Ok(hwnd_ptr) = window.hwnd() {
                let hwnd = HWND(hwnd_ptr.0 as _);
                unsafe {
                    let _ = windows::Win32::System::Com::CoInitializeEx(None, windows::Win32::System::Com::COINIT_APARTMENTTHREADED);
                    if let Ok(taskbar) = CoCreateInstance::<_, ITaskbarList3>(&TaskbarList, None, CLSCTX_INPROC_SERVER) {
                        if taskbar.HrInit().is_ok() {
                            if has_unread {
                                use windows::Win32::UI::WindowsAndMessaging::{CreateIconFromResourceEx, LR_DEFAULTCOLOR};
                                let ico_bytes = include_bytes!("../icons/badge.ico");
                                let offset = u32::from_le_bytes(ico_bytes[18..22].try_into().unwrap()) as usize;
                                static BADGE_ICON_PTR: std::sync::OnceLock<isize> = std::sync::OnceLock::new();
                                let icon_ptr = BADGE_ICON_PTR.get_or_init(|| {
                                    let icon = CreateIconFromResourceEx(&ico_bytes[offset..], true, 0x00030000, 16, 16, LR_DEFAULTCOLOR).unwrap_or_default();
                                    icon.0 as isize
                                });
                                let icon = windows::Win32::UI::WindowsAndMessaging::HICON(*icon_ptr as *mut core::ffi::c_void);
                                if !icon.is_invalid() {
                                    let _ = taskbar.SetOverlayIcon(hwnd, icon, windows::core::w!("Unread Messages"));
                                }
                            } else {
                                use windows::Win32::UI::WindowsAndMessaging::HICON;
                                let _ = taskbar.SetOverlayIcon(hwnd, HICON::default(), windows::core::w!(""));
                            }
                        }
                    }
                }
            }
        }
        
        let icon_bytes = if has_unread {
            include_bytes!("../icons/icon-unread.png").to_vec()
        } else {
            include_bytes!("../icons/icon.png").to_vec()
        };
        
        match image::load_from_memory(&icon_bytes) {
            Ok(img) => {
                let rgba = img.into_rgba8();
                let width = rgba.width();
                let height = rgba.height();
                let tauri_image = tauri::image::Image::new_owned(rgba.into_raw(), width, height);
                // 変更前：左上のアイコンとトレイのアイコンだけ変えていた
                // 今回はタスクバーにもバッジを付与するため、window.set_iconとtray.set_iconはそのまま維持
                if let Err(e) = window.set_icon(tauri_image.clone()) {
                    log::error!("[DEBUG] window.set_icon failed: {}", e);
                } else {
                    log::info!("[DEBUG] window.set_icon succeeded");
                }
                
                if let Some(tray) = app_handle.tray_by_id("main-tray") {
                    if let Err(e) = tray.set_icon(Some(tauri_image)) {
                        log::error!("[DEBUG] tray.set_icon failed: {}", e);
                    } else {
                        log::info!("[DEBUG] tray.set_icon succeeded");
                    }
                } else {
                    log::warn!("[DEBUG] main-tray not found");
                }
            },
            Err(e) => {
                log::error!("[DEBUG] failed to load icon from memory: {}", e);
            }
        }
    } else {
        log::error!("[DEBUG] get_webview_window('main') returned None");
    }
}

use tauri_plugin_notification::NotificationExt;

#[tauri::command]
fn send_desktop_notification(app: tauri::AppHandle, title: String, body: String) {
    let _ = app.notification().builder()
        .title(title)
        .body(body)
        .show();
}

#[tauri::command]
async fn silent_install_past_version(app_handle: tauri::AppHandle, url: String, tag: String) -> Result<(), String> {
    log::info!("silent_install_past_version called: {} -> {}", tag, url);

    if !tag.chars().all(|c| c.is_alphanumeric() || c == '.' || c == '-' || c == '_') {
        return Err("Invalid tag format".to_string());
    }

    let url_lower = url.to_lowercase();
    let is_valid_url = url_lower.starts_with("https://github.com/qwertyuiop1229/covo/releases/download/")
        || url.starts_with("https://objects.githubusercontent.com/");
    if !is_valid_url {
        return Err("Invalid download URL: must be from official repository".to_string());
    }

    let temp_dir = std::env::temp_dir();
    let safe_tag = tag.replace(|c: char| !c.is_alphanumeric() && c != '.' && c != '-', "_");
    let exe_path = temp_dir.join(format!("Covo_installer_{}.exe", safe_tag));

    // ─── ストリーミングダウンロード（chunk ごとに進捗イベントを発行）───
    let response = reqwest::get(&url).await.map_err(|e| format!("Request failed: {}", e))?;
    let total = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;

    let mut file = std::fs::File::create(&exe_path)
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    let mut stream = response;
    loop {
        let chunk = stream.chunk().await.map_err(|e| format!("Stream error: {}", e))?;
        match chunk {
            None => break,
            Some(bytes) => {
                use std::io::Write;
                file.write_all(&bytes).map_err(|e| format!("Write error: {}", e))?;
                downloaded += bytes.len() as u64;
                let progress = if total > 0 {
                    ((downloaded as f64 / total as f64) * 100.0) as u32
                } else {
                    0
                };
                let _ = app_handle.emit("download-progress", serde_json::json!({
                    "tag": tag,
                    "downloaded": downloaded,
                    "total": total,
                    "progress": progress
                }));
            }
        }
    }
    drop(file);

    log::info!("Downloaded installer to: {:?} ({} bytes)", exe_path, downloaded);

    // ─── PowerShell 経由でサイレントインストール → 完了後に Covo.exe を自動再起動 ───
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let covo_exe = std::env::current_exe()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| "Covo.exe".to_string());

        let installer_path = exe_path.to_string_lossy().to_string();

        // PowerShell スクリプト:
        //   1. 5秒待機（UIでの再起動カウントダウン3秒の完了を待つ）
        //   2. Covo.exe が残っていれば確実に強制終了（NSISの競合ポップアップ防止）
        //   3. インストーラーを完全サイレント実行 (/S のみ指定)
        //   4. Covo.exe を再起動
        let ps_script = format!(
            "Start-Sleep -Seconds 5; \
             Stop-Process -Name 'Covo' -Force -ErrorAction SilentlyContinue; \
             Start-Sleep -Seconds 1; \
             Start-Process -FilePath '{installer}' -ArgumentList '/S' -Wait; \
             Start-Sleep -Seconds 1; \
             Start-Process -FilePath '{covo}'",
            installer = installer_path.replace('\'', "''"),
            covo = covo_exe.replace('\'', "''"),
        );

        std::process::Command::new("powershell")
            .args(["-NonInteractive", "-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps_script])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Failed to spawn PowerShell: {}", e))?;

        log::info!("Spawned silent installer via PowerShell; exiting current process after countdown.");

        // UI側のカウントダウン(3秒)が綺麗に完了するのを待ってからプロセス終了
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_millis(3500)).await;
            app_handle.exit(0);
        });
    }

    Ok(())
}

#[tauri::command]
fn notify_app_loaded(state: tauri::State<'_, NotificationState>) {
    if let Ok(mut loaded) = state.app_loaded.lock() {
        *loaded = true;
        log::info!("Received notify_app_loaded signal from frontend. Cancelling recovery popup.");
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
struct DesktopAuthResult {
    id_token: String,
    access_token: Option<String>,
}

#[tauri::command]
async fn start_desktop_google_auth(app_handle: tauri::AppHandle) -> Result<DesktopAuthResult, String> {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::time::Duration;

    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("ローカルポートのバインドに失敗しました: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("ローカルアドレスの取得に失敗しました: {}", e))?
        .port();

    let state_nonce = uuid::Uuid::new_v4().to_string();
    let auth_url = format!(
        "https://simplechat-65a0d.web.app/auth-desktop.html?callback=http%3A%2F%2F127.0.0.1%3A{}%2Fcallback&state={}",
        port, state_nonce
    );

    log::info!("Starting desktop Google auth: port={}, url={}", port, auth_url);

    // システム既定の外部ブラウザで安全なWeb認証ページを開く
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let _ = std::process::Command::new("cmd")
            .args(["/c", "start", "", &auth_url])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("open").arg(&auth_url).spawn();
    }

    let expected_state = state_nonce.clone();

    // spawn_blocking で非同期にタイムアウト付きでコールバックを受け取る
    let auth_res = tauri::async_runtime::spawn_blocking(move || -> Result<DesktopAuthResult, String> {
        let start = std::time::Instant::now();
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;

        while start.elapsed() < Duration::from_secs(180) {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let mut buffer = [0u8; 16384];
                    stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
                    let n = match stream.read(&mut buffer) {
                        Ok(n) => n,
                        Err(_) => continue,
                    };
                    let req_str = String::from_utf8_lossy(&buffer[..n]);

                    let first_line = req_str.lines().next().unwrap_or("");
                    if first_line.starts_with("GET ") {
                        let path_query = first_line.split_whitespace().nth(1).unwrap_or("");
                        if let Some(pos) = path_query.find('?') {
                            let query = &path_query[pos + 1..];
                            let mut id_token = String::new();
                            let mut access_token = None;
                            let mut state = String::new();

                            for pair in query.split('&') {
                                let mut kv = pair.splitn(2, '=');
                                let k = kv.next().unwrap_or("");
                                let v = kv.next().unwrap_or("");
                                let decoded_v = urlencoding::decode(v).unwrap_or_default().to_string();
                                if k == "idToken" {
                                    id_token = decoded_v;
                                } else if k == "accessToken" {
                                    access_token = Some(decoded_v);
                                } else if k == "state" {
                                    state = decoded_v;
                                }
                            }

                            if state == expected_state && !id_token.is_empty() {
                                let html_body = r#"<!DOCTYPE html><html><head><meta charset="utf-8"><title>Covo 認証完了</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}.box{background:#1e293b;padding:2.5rem 2rem;border-radius:1.5rem;box-shadow:0 20px 40px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.08);max-width:380px;width:90%;}h1{font-size:1.35rem;margin-bottom:0.6rem;color:#34d399;}p{font-size:0.875rem;color:#94a3b8;line-height:1.6;margin:0 0 1.25rem;}</style></head><body><div class="box"><div style="font-size:2.5rem;margin-bottom:0.75rem;">🎉</div><h1>ログインに成功しました</h1><p>Covo デスクトップアプリへお戻りください。<br>このタブは自動的に閉じるか、手動で閉じて構いません。</p><script>setTimeout(function(){window.close();}, 2000);</script></div></body></html>"#;
                                let response = format!(
                                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                                    html_body.len(),
                                    html_body
                                );
                                let _ = stream.write_all(response.as_bytes());
                                let _ = stream.flush();

                                return Ok(DesktopAuthResult {
                                    id_token,
                                    access_token,
                                });
                            }
                        }
                    }

                    let err_body = "HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nInvalid authentication request";
                    let _ = stream.write_all(err_body.as_bytes());
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(100));
                }
                Err(e) => {
                    log::warn!("Listener error: {}", e);
                    std::thread::sleep(Duration::from_millis(100));
                }
            }
        }
        Err("Google 認証の待機がタイムアウトしました。もう一度お試しください。".to_string())
    }).await.map_err(|e| format!("タスク実行エラー: {}", e))??;

    // メインウィンドウを前面に復帰
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }

    Ok(auth_res)
}

#[tauri::command]
fn open_in_app_browser_window(
    app_handle: tauri::AppHandle,
    url: String,
    title: Option<String>,
) -> Result<(), String> {
    let parsed_url: url::Url = url.parse().map_err(|e| format!("無効なURLです: {}", e))?;
    
    // 既存のブラウザウィンドウがあれば URL を更新して前面化
    if let Some(existing) = app_handle.get_webview_window("covo_in_app_browser") {
        let _ = existing.navigate(parsed_url);
        let _ = existing.unminimize();
        let _ = existing.show();
        let _ = existing.set_focus();
        if let Some(t) = title {
            let _ = existing.set_title(&format!("Covo Browser - {}", t));
        }
        return Ok(());
    }

    let win_title = title.map(|t| format!("Covo Browser - {}", t)).unwrap_or_else(|| "Covo Browser".to_string());

    let win = WebviewWindowBuilder::new(
        &app_handle,
        "covo_in_app_browser",
        tauri::WebviewUrl::External(parsed_url),
    )
    .title(&win_title)
    .inner_size(1060.0, 740.0)
    .center()
    .resizable(true)
    .decorations(true)
    .build()
    .map_err(|e| format!("ブラウザウィンドウの作成に失敗しました: {}", e))?;

    let _ = win.show();
    let _ = win.set_focus();
    Ok(())
}


// ===========================================================================
// run()
// ===========================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(NotificationState::default())
        .invoke_handler(tauri::generate_handler![
            show_main_window,
            minimize_window,
            toggle_maximize_window,
            close_window,
            set_close_behavior,
            container_loaded,
            hide_notif_container,
            resize_notif_container,
            close_notification,
            open_position_picker,
            save_notification_position,
            cancel_position_picker,
            save_position_absolute,
            set_saved_position,
            get_saved_position,
            get_available_monitors,
            update_shortcut_key,
            open_devtools_for_picker,
            open_devtools_for_container,
            open_log_dir,
            create_desktop_shortcut,
            set_badge,
            send_desktop_notification,
            silent_install_past_version,
            notify_app_loaded,
            start_desktop_google_auth,
            open_in_app_browser_window,
        ])
        .setup(|app| {
            let _handle = app.handle().clone();

            // アップデート後にショートカット・タスクバーのアイコンキャッシュを更新する
            // ie4uinit.exe -show は Windows シェルにアイコン再読み込みを要求する標準的な方法
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                let _ = std::process::Command::new("ie4uinit.exe")
                    .arg("-show")
                    .creation_flags(CREATE_NO_WINDOW)
                    .spawn();
            }

            use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState, ShortcutEvent};

            let ctrl_shift_s = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyS);

            let shortcut_plugin = {
                let h = app.handle().clone();
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |_app, _sc, event: ShortcutEvent| {
                        if event.state() == ShortcutState::Pressed {
                            if let Some(window) = h.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                                let _ = window.eval("if(window.focusMessageInput) window.focusMessageInput()");
                            }
                        }
                    })
                    .build()
            };
            app.handle().plugin(shortcut_plugin)?;

            let _ = app.global_shortcut().register(ctrl_shift_s);

            // 正常起動の非同期監視タスク (30秒後に app_loaded が false なら自動でリカバリーウィンドウをポップアップ)
            let monitor_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
                let loaded = {
                    let state = monitor_handle.state::<NotificationState>();
                    let val = *state.app_loaded.lock().unwrap();
                    val
                };
                if !loaded {
                    log::warn!("App loaded signal not received within 30 seconds. Assuming ERR_CONNECTION_REFUSED / network delay. Spawning recovery engine.");
                    if let Some(main_win) = monitor_handle.get_webview_window("main") {
                        let _ = main_win.hide();
                    }
                    if let Ok(recovery_win) = tauri::WebviewWindowBuilder::new(
                        &monitor_handle,
                        "recovery-engine",
                        tauri::WebviewUrl::App("recovery.html".into())
                    )
                    .title("Covo - リカバリーパネル")
                    .inner_size(840.0, 680.0)
                    .resizable(true)
                    .center()
                    .build() {
                        let _ = recovery_win.show();
                    }
                }
            });

            let quit_i = MenuItem::with_id(app, "quit", "終了", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Covoを表示", true, None::<&str>)?;
            let recovery_i = MenuItem::with_id(app, "recovery", "リカバリーパネル", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &recovery_i, &quit_i])?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => { app.exit(0); }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "recovery" => {
                        // トレイメニューからいつでもリカバリー画面を呼び出せる
                        if let Some(existing) = app.get_webview_window("recovery-engine") {
                            let _ = existing.show();
                            let _ = existing.set_focus();
                        } else {
                            if let Ok(recovery_win) = tauri::WebviewWindowBuilder::new(
                                app,
                                "recovery-engine",
                                tauri::WebviewUrl::App("recovery.html".into())
                            )
                            .title("Covo - リカバリーパネル")
                            .inner_size(840.0, 680.0)
                            .resizable(true)
                            .center()
                            .build() {
                                let _ = recovery_win.show();
                            }
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    use tauri::Manager;
                    let behavior = {
                        let state = window.app_handle().state::<NotificationState>();
                        let b = state.close_behavior.lock().unwrap_or_else(|e| e.into_inner()).clone();
                        b
                    };
                    if behavior == "quit" {
                        // 完全に終了する場合は何もしない (そのまま閉じる)
                    } else if behavior == "hide" {
                        api.prevent_close();
                        let _ = window.hide();
                    } else {
                        // デフォルト: タスクバーに最小化
                        api.prevent_close();
                        let _ = window.minimize();
                    }
                }
            }
        })
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_log::Builder::default()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: None }),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                ])
                .level(log::LevelFilter::Debug)
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
