// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// use cpal::traits::{DeviceTrait, HostTrait};
use tauri::{
    Emitter, Manager, WebviewWindowBuilder,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};

// use wasapi::{DeviceCollection, Direction, get_default_device_for_role, Role};
use com_policy_config::{IPolicyConfig, PolicyConfigClient};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use windows::{
    Win32::{
        Devices::FunctionDiscovery::PKEY_Device_FriendlyName,
        Foundation::{BOOL, HWND, LPARAM},
        Media::Audio::{
            DEVICE_STATE_ACTIVE, IMMDeviceEnumerator, MMDeviceEnumerator, eConsole, eRender,
        },
        System::Com::{
            CLSCTX_ALL, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, STGM_READ,
        },
        UI::WindowsAndMessaging::{EnumWindows, GetWindowTextW, IsWindowVisible},
    },
    core::{PCWSTR, Result as WindowsResult},
};

// 全局状态管理
#[derive(Default)]
struct AppState {
    is_pinned: bool,
    monitored_windows: Vec<String>,
    auto_hide_delay: u64,           // 秒
    last_seen_windows: Vec<String>, // 上次检查时存在的窗口
    monitoring_active: bool,        // 是否正在监听
    dark_mode: bool,                // 深色模式
}

type SharedState = Arc<Mutex<AppState>>;

#[derive(Debug, Serialize, Deserialize)]
struct AudioDevice {
    id: String,
    name: String,
    is_default: bool,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct WindowPosition {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Debug, Serialize, Deserialize)]
struct WindowConfig {
    monitored_windows: Vec<String>,
    auto_hide_delay: u64,
    main_window_position: Option<WindowPosition>,
    preference_window_position: Option<WindowPosition>,
    dark_mode: bool,
}

impl Default for WindowConfig {
    fn default() -> Self {
        Self {
            monitored_windows: Vec::new(),
            auto_hide_delay: 5, // 默认5秒
            main_window_position: None,
            preference_window_position: None,
            dark_mode: false, // 默认浅色模式
        }
    }
}

// 获取配置文件路径
fn get_window_config_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    Ok(app_data_dir.join("window_config.json"))
}

// 加载窗口配置
fn load_window_config(app_handle: &tauri::AppHandle) -> WindowConfig {
    match get_window_config_path(app_handle) {
        Ok(config_path) => {
            if config_path.exists() {
                match fs::read_to_string(&config_path) {
                    Ok(content) => match serde_json::from_str::<WindowConfig>(&content) {
                        Ok(config) => {
                            println!("Loaded window config: {:?}", config);
                            return config;
                        }
                        Err(e) => println!("Failed to parse window config: {}", e),
                    },
                    Err(e) => println!("Failed to read window config file: {}", e),
                }
            }
        }
        Err(e) => println!("Failed to get config path: {}", e),
    }

    println!("Using default window config");
    WindowConfig::default()
}

// 保存窗口配置
fn save_window_config(app_handle: &tauri::AppHandle, config: &WindowConfig) -> Result<(), String> {
    let config_path = get_window_config_path(app_handle)?;

    // 确保父目录存在
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, content).map_err(|e| format!("Failed to write config file: {}", e))?;

    println!("Saved window config: {:?}", config);
    Ok(())
}

// 保存窗口位置
#[tauri::command]
fn save_window_position(
    app_handle: tauri::AppHandle,
    window_label: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<String, String> {
    let mut current_config = load_window_config(&app_handle);

    let position = WindowPosition {
        x,
        y,
        width,
        height,
    };

    match window_label.as_str() {
        "main" => current_config.main_window_position = Some(position),
        "preference" => current_config.preference_window_position = Some(position),
        _ => return Err(format!("Unknown window label: {}", window_label)),
    }

    if let Err(e) = save_window_config(&app_handle, &current_config) {
        return Err(format!("Failed to save window position: {}", e));
    }

    Ok(format!("Saved position for window: {}", window_label))
}

// 获取窗口位置
#[tauri::command]
fn get_window_position(
    app_handle: tauri::AppHandle,
    window_label: String,
) -> Option<WindowPosition> {
    let config = load_window_config(&app_handle);

    match window_label.as_str() {
        "main" => config.main_window_position,
        "preference" => config.preference_window_position,
        _ => None,
    }
}

// 定义一个 Tauri 命令，用于设置音频设备
#[tauri::command]
fn set_audio_device(device_id: String) -> Result<String, String> {
    unsafe {
        // 尝试初始化 COM，如果已经初始化则忽略错误
        let _com_result = CoInitializeEx(None, COINIT_MULTITHREADED);
        // 不检查错误，因为 COM 可能已经被 Tauri 初始化了

        let result = (|| -> WindowsResult<String> {
            // 创建设备枚举器
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;

            // 获取设备集合
            let device_collection = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)?;
            let device_count = device_collection.GetCount()?;

            // 查找目标设备
            let mut target_device = None;
            for i in 0..device_count {
                let device = device_collection.Item(i)?;
                let current_device_id = device.GetId()?;
                let current_device_id_str = current_device_id.to_string()?;

                if current_device_id_str == device_id {
                    target_device = Some(device);
                    break;
                }
            }

            let device = target_device.ok_or_else(|| {
                windows::core::Error::from(windows::Win32::Foundation::E_INVALIDARG)
            })?;

            // 获取设备名称用于日志
            let property_store = device.OpenPropertyStore(STGM_READ)?;
            let name_prop = property_store.GetValue(&PKEY_Device_FriendlyName)?;
            let device_name = name_prop
                .Anonymous
                .Anonymous
                .Anonymous
                .pwszVal
                .to_string()?;

            // 创建 PolicyConfig 实例来设置默认设备
            let policy_config: IPolicyConfig =
                CoCreateInstance(&PolicyConfigClient, None, CLSCTX_ALL)?;
            let device_id_pcwstr = PCWSTR(device.GetId()?.0);

            // 设置为默认设备（Console 角色用于大多数应用程序）
            policy_config.SetDefaultEndpoint(device_id_pcwstr, eConsole)?;

            Ok(format!("成功切换到音频设备: {}", device_name))
        })();

        // 不调用 CoUninitialize，因为 COM 可能被 Tauri 管理

        match result {
            Ok(msg) => {
                println!("{}", msg);
                Ok(msg)
            }
            Err(e) => {
                let error_msg = format!("切换音频设备失败: {:?}", e);
                println!("{}", error_msg);
                Err(error_msg)
            }
        }
    }
}

// 定义一个 Tauri 命令，用于获取当前音频设备
#[tauri::command]
fn get_current_audio_device() -> Option<AudioDevice> {
    println!("get_current_audio_device called");
    unsafe {
        // 尝试初始化 COM，如果已经初始化则忽略错误
        let _com_result = CoInitializeEx(None, COINIT_MULTITHREADED);
        // 不检查错误，因为 COM 可能已经被 Tauri 初始化了

        let result = (|| -> WindowsResult<AudioDevice> {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
            let device_id = device.GetId()?.to_string()?;

            let property_store = device.OpenPropertyStore(STGM_READ)?;
            let name_prop = property_store.GetValue(&PKEY_Device_FriendlyName)?;
            let device_name = name_prop
                .Anonymous
                .Anonymous
                .Anonymous
                .pwszVal
                .to_string()?;

            Ok(AudioDevice {
                id: device_id,
                name: device_name,
                is_default: true,
            })
        })();

        // 不调用 CoUninitialize，因为 COM 可能被 Tauri 管理

        result.ok()
    }
}

// 定义一个 Tauri 命令，用于获取所有可用的音频输出设备列表
#[tauri::command]
fn get_audio_output_devices() -> Vec<AudioDevice> {
    println!("get_audio_output_devices called");
    unsafe {
        // 尝试初始化 COM，如果已经初始化则忽略错误
        let _com_result = CoInitializeEx(None, COINIT_MULTITHREADED);
        // 不检查错误，因为 COM 可能已经被 Tauri 初始化了

        let result = (|| -> WindowsResult<Vec<AudioDevice>> {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let device_collection = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)?;
            let device_count = device_collection.GetCount()?;

            // 获取默认设备
            let default_device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
            let default_device_id = default_device.GetId()?.to_string()?;

            let mut devices = Vec::new();

            for i in 0..device_count {
                let device = device_collection.Item(i)?;
                let device_id = device.GetId()?.to_string()?;

                let property_store = device.OpenPropertyStore(STGM_READ)?;
                let name_prop = property_store.GetValue(&PKEY_Device_FriendlyName)?;
                let device_name = name_prop
                    .Anonymous
                    .Anonymous
                    .Anonymous
                    .pwszVal
                    .to_string()?;

                let is_default = device_id == default_device_id;

                devices.push(AudioDevice {
                    id: device_id,
                    name: device_name,
                    is_default,
                });
            }

            Ok(devices)
        })();

        // 不调用 CoUninitialize，因为 COM 可能被 Tauri 管理

        result.unwrap_or_default()
    }
}

// 定义一个 Tauri 命令，用于创建应用程序数据目录
#[tauri::command]
fn create_app_data_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(path).map_err(|e| format!("Failed to create directory: {}", e))
}

// 测试拖动功能的命令
#[tauri::command]
fn test_drag_functionality() -> Result<String, String> {
    Ok("Drag functionality test".to_string())
}

// 设置窗口置顶状态
#[tauri::command]
fn set_window_pinned(app_handle: tauri::AppHandle, pinned: bool) -> Result<String, String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        // 更新全局状态
        if let Some(state) = app_handle.try_state::<SharedState>() {
            if let Ok(mut app_state) = state.lock() {
                app_state.is_pinned = pinned;
            }
        }

        // 设置窗口置顶状态
        if let Err(e) = window.set_always_on_top(pinned) {
            return Err(format!("Failed to set window always on top: {}", e));
        }

        if pinned {
            println!("Window pinned to top");
        } else {
            println!("Window unpinned from top");
        }

        Ok(format!(
            "Window {}",
            if pinned { "pinned" } else { "unpinned" }
        ))
    } else {
        Err("Main window not found".to_string())
    }
}

// 获取当前窗口置顶状态
#[tauri::command]
fn get_window_pinned(app_handle: tauri::AppHandle) -> bool {
    if let Some(state) = app_handle.try_state::<SharedState>() {
        if let Ok(app_state) = state.lock() {
            return app_state.is_pinned;
        }
    }
    false
}

// 获取当前运行的窗口列表
#[tauri::command]
fn get_running_windows() -> Vec<String> {
    let mut windows = Vec::new();

    unsafe {
        let result = EnumWindows(
            Some(enum_windows_proc),
            LPARAM(&mut windows as *mut Vec<String> as isize),
        );

        if result.is_err() {
            println!("Failed to enumerate windows: {:?}", result);
        }
    }

    windows
}

// 窗口枚举回调函数
unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let windows = &mut *(lparam.0 as *mut Vec<String>);

    // 检查窗口是否可见
    if IsWindowVisible(hwnd).as_bool() {
        let mut buffer = [0u16; 256];
        let length = GetWindowTextW(hwnd, &mut buffer);

        if length > 0 {
            let title = String::from_utf16_lossy(&buffer[..length as usize]);
            if !title.trim().is_empty() {
                windows.push(title);
            }
        }
    }

    BOOL::from(true) // 继续枚举
}

// 设置监听的窗口列表
#[tauri::command]
fn set_monitored_windows(
    app_handle: tauri::AppHandle,
    windows: Vec<String>,
) -> Result<String, String> {
    if let Some(state) = app_handle.try_state::<SharedState>() {
        let auto_hide_delay = if let Ok(app_state) = state.lock() {
            app_state.auto_hide_delay
        } else {
            5 // 默认值
        };

        // 更新内存中的状态
        if let Ok(mut app_state) = state.lock() {
            app_state.monitored_windows = windows.clone();
        }

        // 保存到配置文件
        let current_config = load_window_config(&app_handle);
        let config = WindowConfig {
            monitored_windows: windows.clone(),
            auto_hide_delay,
            main_window_position: current_config.main_window_position,
            preference_window_position: current_config.preference_window_position,
            dark_mode: current_config.dark_mode,
        };

        if let Err(e) = save_window_config(&app_handle, &config) {
            println!("Failed to save window config: {}", e);
        }

        Ok(format!("Set {} monitored windows", windows.len()))
    } else {
        Err("Failed to access app state".to_string())
    }
}

// 获取监听的窗口列表
#[tauri::command]
fn get_monitored_windows(app_handle: tauri::AppHandle) -> Vec<String> {
    if let Some(state) = app_handle.try_state::<SharedState>() {
        if let Ok(app_state) = state.lock() {
            return app_state.monitored_windows.clone();
        }
    }
    Vec::new()
}

// 设置自动隐藏延迟
#[tauri::command]
fn set_auto_hide_delay(app_handle: tauri::AppHandle, delay: u64) -> Result<String, String> {
    if let Some(state) = app_handle.try_state::<SharedState>() {
        let monitored_windows = if let Ok(app_state) = state.lock() {
            app_state.monitored_windows.clone()
        } else {
            Vec::new()
        };

        // 更新内存中的状态
        if let Ok(mut app_state) = state.lock() {
            app_state.auto_hide_delay = delay;
        }

        // 保存到配置文件
        let current_config = load_window_config(&app_handle);
        let config = WindowConfig {
            monitored_windows,
            auto_hide_delay: delay,
            main_window_position: current_config.main_window_position,
            preference_window_position: current_config.preference_window_position,
            dark_mode: current_config.dark_mode,
        };

        if let Err(e) = save_window_config(&app_handle, &config) {
            println!("Failed to save window config: {}", e);
        }

        Ok(format!("Set auto hide delay to {} seconds", delay))
    } else {
        Err("Failed to access app state".to_string())
    }
}

// 获取自动隐藏延迟
#[tauri::command]
fn get_auto_hide_delay(app_handle: tauri::AppHandle) -> u64 {
    if let Some(state) = app_handle.try_state::<SharedState>() {
        if let Ok(app_state) = state.lock() {
            return app_state.auto_hide_delay;
        }
    }
    5 // 默认5秒
}

// 开始监听窗口
#[tauri::command]
fn start_window_monitoring(app_handle: tauri::AppHandle) -> Result<String, String> {
    if let Some(state) = app_handle.try_state::<SharedState>() {
        if let Ok(mut app_state) = state.lock() {
            app_state.monitoring_active = true;
            // 初始化当前窗口列表
            app_state.last_seen_windows = get_current_window_titles();
        }
        Ok("Window monitoring started".to_string())
    } else {
        Err("Failed to access app state".to_string())
    }
}

// 停止监听窗口
#[tauri::command]
fn stop_window_monitoring(app_handle: tauri::AppHandle) -> Result<String, String> {
    if let Some(state) = app_handle.try_state::<SharedState>() {
        if let Ok(mut app_state) = state.lock() {
            app_state.monitoring_active = false;
        }
        Ok("Window monitoring stopped".to_string())
    } else {
        Err("Failed to access app state".to_string())
    }
}

// 检查窗口变化（由定时器调用）
#[tauri::command]
fn check_window_changes(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let mut closed_windows = Vec::new();

    if let Some(state) = app_handle.try_state::<SharedState>() {
        if let Ok(mut app_state) = state.lock() {
            if !app_state.monitoring_active {
                return Ok(closed_windows);
            }

            let current_windows = get_current_window_titles();
            let monitored = app_state.monitored_windows.clone();
            let last_seen = app_state.last_seen_windows.clone();

            // 检查哪些监听的窗口被关闭了
            for window_title in &monitored {
                if last_seen.contains(window_title) && !current_windows.contains(window_title) {
                    closed_windows.push(window_title.clone());
                    println!("Detected window closed: {}", window_title);
                }
            }

            // 更新上次看到的窗口列表
            app_state.last_seen_windows = current_windows;
        }
    }

    Ok(closed_windows)
}

// 获取当前所有窗口标题的辅助函数
fn get_current_window_titles() -> Vec<String> {
    let mut windows = Vec::new();

    unsafe {
        let result = EnumWindows(
            Some(enum_windows_proc),
            LPARAM(&mut windows as *mut Vec<String> as isize),
        );

        if result.is_err() {
            println!("Failed to enumerate windows: {:?}", result);
        }
    }

    windows
}

// 设置深色模式
#[tauri::command]
fn set_dark_mode(app_handle: tauri::AppHandle, dark_mode: bool) -> Result<String, String> {
    if let Some(state) = app_handle.try_state::<SharedState>() {
        // 更新内存中的状态
        if let Ok(mut app_state) = state.lock() {
            app_state.dark_mode = dark_mode;
        }

        // 保存到配置文件
        let current_config = load_window_config(&app_handle);
        let config = WindowConfig {
            monitored_windows: current_config.monitored_windows,
            auto_hide_delay: current_config.auto_hide_delay,
            main_window_position: current_config.main_window_position,
            preference_window_position: current_config.preference_window_position,
            dark_mode,
        };

        if let Err(e) = save_window_config(&app_handle, &config) {
            return Err(format!("Failed to save dark mode setting: {}", e));
        }

        // 通知所有窗口更新主题
        if let Some(window) = app_handle.get_webview_window("main") {
            let _ = window.emit("dark-mode-changed", dark_mode);
        }
        if let Some(window) = app_handle.get_webview_window("preference") {
            let _ = window.emit("dark-mode-changed", dark_mode);
        }

        Ok(format!("Dark mode set to: {}", dark_mode))
    } else {
        Err("Failed to access app state".to_string())
    }
}

// 获取深色模式状态
#[tauri::command]
fn get_dark_mode(app_handle: tauri::AppHandle) -> Result<bool, String> {
    if let Some(state) = app_handle.try_state::<SharedState>() {
        if let Ok(app_state) = state.lock() {
            Ok(app_state.dark_mode)
        } else {
            Err("Failed to access app state".to_string())
        }
    } else {
        Err("Failed to access app state".to_string())
    }
}

// 打开配置文件夹
#[tauri::command]
fn open_config_folder(app_handle: tauri::AppHandle) -> Result<String, String> {
    use std::process::Command;

    let app_data_dir = match app_handle.path().app_data_dir() {
        Ok(dir) => dir,
        Err(e) => return Err(format!("Failed to get app data directory: {}", e)),
    };

    // 确保目录存在
    if let Err(e) = std::fs::create_dir_all(&app_data_dir) {
        return Err(format!("Failed to create app data directory: {}", e));
    }

    // 在 Windows 上使用 explorer 打开文件夹
    #[cfg(target_os = "windows")]
    {
        match Command::new("explorer").arg(&app_data_dir).spawn() {
            Ok(_) => Ok(format!("Opened config folder: {}", app_data_dir.display())),
            Err(e) => Err(format!("Failed to open config folder: {}", e)),
        }
    }

    // 在 macOS 上使用 open 命令
    #[cfg(target_os = "macos")]
    {
        match Command::new("open").arg(&app_data_dir).spawn() {
            Ok(_) => Ok(format!("Opened config folder: {}", app_data_dir.display())),
            Err(e) => Err(format!("Failed to open config folder: {}", e)),
        }
    }

    // 在 Linux 上使用 xdg-open 命令
    #[cfg(target_os = "linux")]
    {
        match Command::new("xdg-open").arg(&app_data_dir).spawn() {
            Ok(_) => Ok(format!("Opened config folder: {}", app_data_dir.display())),
            Err(e) => Err(format!("Failed to open config folder: {}", e)),
        }
    }
}

// 获取配置文件路径
#[tauri::command]
fn get_config_file_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = match app_handle.path().app_data_dir() {
        Ok(dir) => dir,
        Err(e) => return Err(format!("Failed to get app data directory: {}", e)),
    };

    let config_file = app_data_dir.join("window_config.json");
    Ok(config_file.to_string_lossy().to_string())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // 从配置文件加载窗口配置
            let window_config = load_window_config(app.handle());

            // 创建带有加载配置的应用状态
            let app_state = AppState {
                is_pinned: false,
                monitored_windows: window_config.monitored_windows,
                auto_hide_delay: window_config.auto_hide_delay,
                last_seen_windows: Vec::new(),
                monitoring_active: false,
                dark_mode: window_config.dark_mode, // 从配置文件加载深色模式
            };

            app.manage(SharedState::new(Mutex::new(app_state)));

            // 应用保存的主窗口位置
            if let Some(main_window) = app.get_webview_window("main") {
                if let Some(position) = window_config.main_window_position {
                    let _ = main_window.set_position(tauri::Position::Physical(
                        tauri::PhysicalPosition {
                            x: position.x,
                            y: position.y,
                        },
                    ));
                    let _ = main_window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                        width: position.width,
                        height: position.height,
                    }));
                    println!(
                        "Restored main window position: {}x{} at ({}, {})",
                        position.width, position.height, position.x, position.y
                    );
                }
            }

            // 创建菜单项
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let toggle_item =
                MenuItem::with_id(app, "toggle", "显示/隐藏窗口", true, None::<&str>)?;
            let pin_item = MenuItem::with_id(app, "pin", "置顶显示", true, None::<&str>)?;
            let config_item = MenuItem::with_id(app, "preference", "偏好设置", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_item, &pin_item, &config_item, &quit_item])?;

            // 构建托盘
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.0.as_str() {
                    "quit" => {
                        app.exit(0);
                    }
                    "toggle" => {
                        let window = app.get_webview_window("main").unwrap();
                        if window.is_visible().unwrap_or(false) {
                            window.hide().unwrap();
                        } else {
                            window.show().unwrap();
                            window.set_focus().unwrap();
                        }
                    }
                    "pin" => {
                        // 切换置顶显示 - 获取当前状态并切换
                        let current_pinned = if let Some(state) = app.try_state::<SharedState>() {
                            if let Ok(app_state) = state.lock() {
                                app_state.is_pinned
                            } else {
                                false
                            }
                        } else {
                            false
                        };

                        let new_pinned = !current_pinned;

                        // 更新状态
                        if let Some(state) = app.try_state::<SharedState>() {
                            if let Ok(mut app_state) = state.lock() {
                                app_state.is_pinned = new_pinned;
                            }
                        }

                        // 设置窗口置顶状态
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.set_always_on_top(new_pinned);
                            let _ = window.emit("pin-mode-changed", new_pinned);
                        }

                        println!(
                            "置顶显示 {} via tray menu",
                            if new_pinned { "已启用" } else { "已禁用" }
                        );
                    }

                    "preference" => {
                        let preference_window = app.get_webview_window("preference");
                        if let Some(window) = preference_window {
                            window.show().unwrap();
                            window.set_focus().unwrap();
                        } else {
                            let mut builder = WebviewWindowBuilder::new(
                                app,
                                "preference",
                                tauri::WebviewUrl::App("preference.html".into()),
                            )
                            .title("偏好设置")
                            .min_inner_size(800.0, 600.0);

                            // 尝试加载保存的窗口位置
                            if let Some(position) = get_window_position(
                                app.app_handle().clone(),
                                "preference".to_string(),
                            ) {
                                builder = builder
                                    .position(position.x as f64, position.y as f64)
                                    .inner_size(position.width as f64, position.height as f64);
                                println!(
                                    "Restored preference window position: {}x{} at ({}, {})",
                                    position.width, position.height, position.x, position.y
                                );
                            } else {
                                println!(
                                    "No saved preference window position found, using default"
                                );
                            }

                            builder.build().unwrap();
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
                        // 左键点击显示/隐藏主窗口
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // 主窗口默认为正常模式，用户可以通过界面切换到穿透模式
            println!("Application initialized successfully");

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    // 只对主窗口阻止关闭，其他窗口（如偏好设置）允许正常关闭
                    if window.label() == "main" {
                        // 主窗口关闭前保存位置
                        if let Ok(position) = window.outer_position() {
                            if let Ok(size) = window.outer_size() {
                                let _ = save_window_position(
                                    window.app_handle().clone(),
                                    "main".to_string(),
                                    position.x,
                                    position.y,
                                    size.width,
                                    size.height,
                                );
                            }
                        }
                        // 主窗口没有关闭按钮，如果触发关闭事件就隐藏窗口
                        api.prevent_close();
                        let _ = window.hide();
                    } else if window.label() == "preference" {
                        // 偏好设置窗口关闭前保存位置
                        if let Ok(position) = window.outer_position() {
                            if let Ok(size) = window.inner_size() {
                                let _ = save_window_position(
                                    window.app_handle().clone(),
                                    "preference".to_string(),
                                    position.x,
                                    position.y,
                                    size.width,
                                    size.height,
                                );
                                println!(
                                    "Saved preference window position: {}x{} at ({}, {})",
                                    size.width, size.height, position.x, position.y
                                );
                            }
                        }
                    }
                }
                tauri::WindowEvent::Moved(position) => {
                    // 窗口移动时保存位置
                    if window.label() == "main" {
                        if let Ok(size) = window.outer_size() {
                            let _ = save_window_position(
                                window.app_handle().clone(),
                                window.label().to_string(),
                                position.x,
                                position.y,
                                size.width,
                                size.height,
                            );
                        }
                    } else if window.label() == "preference" {
                        if let Ok(size) = window.inner_size() {
                            let _ = save_window_position(
                                window.app_handle().clone(),
                                window.label().to_string(),
                                position.x,
                                position.y,
                                size.width,
                                size.height,
                            );
                        }
                    }
                }
                tauri::WindowEvent::Resized(size) => {
                    // 窗口调整大小时保存位置
                    if window.label() == "main" {
                        if let Ok(position) = window.outer_position() {
                            let _ = save_window_position(
                                window.app_handle().clone(),
                                window.label().to_string(),
                                position.x,
                                position.y,
                                size.width,
                                size.height,
                            );
                        }
                    } else if window.label() == "preference" {
                        if let Ok(position) = window.outer_position() {
                            // 对于偏好设置窗口，size 参数已经是 inner_size
                            let _ = save_window_position(
                                window.app_handle().clone(),
                                window.label().to_string(),
                                position.x,
                                position.y,
                                size.width,
                                size.height,
                            );
                        }
                    }
                }
                _ => {}
            }
        })
        .plugin(tauri_plugin_fs::init()) // 初始化文件系统插件
        .invoke_handler(tauri::generate_handler![
            set_audio_device,
            get_current_audio_device,
            get_audio_output_devices,
            create_app_data_dir,
            test_drag_functionality,
            set_window_pinned,
            get_window_pinned,
            get_running_windows,
            set_monitored_windows,
            get_monitored_windows,
            set_auto_hide_delay,
            get_auto_hide_delay,
            start_window_monitoring,
            stop_window_monitoring,
            check_window_changes,
            save_window_position,
            get_window_position,
            set_dark_mode,
            get_dark_mode,
            open_config_folder,
            get_config_file_path
        ]) // 添加命令处理
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
