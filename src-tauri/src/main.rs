// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]


// use cpal::traits::{DeviceTrait, HostTrait};
use tauri::{
    Manager, Emitter,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    WebviewWindowBuilder,
};

// use wasapi::{DeviceCollection, Direction, get_default_device_for_role, Role};
use com_policy_config::{IPolicyConfig, PolicyConfigClient};
use windows::{
    core::{PCWSTR, Result as WindowsResult},
    Win32::{
        Devices::FunctionDiscovery::PKEY_Device_FriendlyName,
        Media::Audio::{DEVICE_STATE_ACTIVE, eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator},
        System::Com::{CLSCTX_ALL, CoCreateInstance, COINIT_MULTITHREADED, CoInitializeEx, STGM_READ},
    },
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

// 全局状态管理
#[derive(Default)]
struct AppState {
    passthrough_mode: bool,
}

type SharedState = Arc<Mutex<AppState>>;



#[derive(Debug, Serialize, Deserialize)]
struct AudioDevice {
    id: String,
    name: String,
    is_default: bool,
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
            let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;

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
            let device_name = name_prop.Anonymous.Anonymous.Anonymous.pwszVal.to_string()?;

            // 创建 PolicyConfig 实例来设置默认设备
            let policy_config: IPolicyConfig = CoCreateInstance(&PolicyConfigClient, None, CLSCTX_ALL)?;
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
            let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
            let device_id = device.GetId()?.to_string()?;

            let property_store = device.OpenPropertyStore(STGM_READ)?;
            let name_prop = property_store.GetValue(&PKEY_Device_FriendlyName)?;
            let device_name = name_prop.Anonymous.Anonymous.Anonymous.pwszVal.to_string()?;

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
            let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
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
                let device_name = name_prop.Anonymous.Anonymous.Anonymous.pwszVal.to_string()?;

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

        match result {
            Ok(devices) => devices,
            Err(_) => Vec::new(),
        }
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

// 切换穿透模式的命令 - 改进的自定义实现
#[tauri::command]
fn toggle_passthrough_mode(app_handle: tauri::AppHandle, enabled: bool) -> Result<String, String> {
    if let Some(_window) = app_handle.get_webview_window("main") {
        // 更新全局状态
        if let Some(state) = app_handle.try_state::<SharedState>() {
            if let Ok(mut app_state) = state.lock() {
                app_state.passthrough_mode = enabled;
            }
        }

        if enabled {
            // 启用穿透模式：只在前端禁用拖动，保持点击功能
            // 不使用 Windows API，避免影响交互
            println!("Passthrough mode enabled - dragging disabled in frontend");
        } else {
            // 禁用穿透模式：在前端恢复拖动
            println!("Passthrough mode disabled - dragging enabled in frontend");
        }
        Ok(format!("Passthrough mode {}", if enabled { "enabled" } else { "disabled" }))
    } else {
        Err("Main window not found".to_string())
    }
}

// 获取当前穿透模式状态
#[tauri::command]
fn get_passthrough_mode(app_handle: tauri::AppHandle) -> bool {
    if let Some(state) = app_handle.try_state::<SharedState>() {
        if let Ok(app_state) = state.lock() {
            return app_state.passthrough_mode;
        }
    }
    false
}

// 使用 wallpaper 插件，移除了自定义的 Windows API 实现



fn main() {
    tauri::Builder::default()
        .manage(SharedState::default())
        .setup(|app| {
            // 创建菜单项
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let toggle_item = MenuItem::with_id(app, "toggle", "显示/隐藏窗口", true, None::<&str>)?;
            let passthrough_item = MenuItem::with_id(app, "passthrough", "穿透模式", true, None::<&str>)?;
            let config_item = MenuItem::with_id(app, "preference", "偏好设置", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_item, &passthrough_item, &config_item, &quit_item])?;

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
                    "passthrough" => {
                        // 切换穿透模式 - 获取当前状态并切换
                        let current_mode = if let Some(state) = app.try_state::<SharedState>() {
                            if let Ok(app_state) = state.lock() {
                                app_state.passthrough_mode
                            } else { false }
                        } else { false };

                        let new_mode = !current_mode;

                        // 更新状态
                        if let Some(state) = app.try_state::<SharedState>() {
                            if let Ok(mut app_state) = state.lock() {
                                app_state.passthrough_mode = new_mode;
                            }
                        }

                        // 通知前端状态变化
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("passthrough-mode-changed", new_mode);
                        }

                        println!("Passthrough mode {} via tray menu", if new_mode { "enabled" } else { "disabled" });
                    }
                    "preference" => {
                        let preference_window = app.get_webview_window("preference");
                        if let Some(window) = preference_window {
                            window.show().unwrap();
                            window.set_focus().unwrap();
                        } else {
                            WebviewWindowBuilder::new(
                                app,
                                "preference",
                                tauri::WebviewUrl::App("preference.html".into()),
                            )
                            .title("偏好设置")
                            .min_inner_size(800.0, 600.0)
                            .build()
                            .unwrap();
                        }
                    }
                    _ => {}
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
                        // 主窗口没有关闭按钮，如果触发关闭事件就隐藏窗口
                        api.prevent_close();
                        let _ = window.hide();
                    }
                    // 偏好设置窗口等其他窗口允许正常关闭
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
            toggle_passthrough_mode,
            get_passthrough_mode
        ]) // 添加命令处理
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
