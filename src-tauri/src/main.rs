// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// use cpal::traits::{DeviceTrait, HostTrait};
use tauri::{
    Manager,
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

// 设置窗口为桌面挂件模式
#[cfg(target_os = "windows")]
fn set_desktop_widget_mode(window: &tauri::WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowLongPtrW, GetWindowLongPtrW, SetWindowPos, SetParent, FindWindowW,
        GWL_EXSTYLE, WS_EX_TOOLWINDOW, WS_EX_NOACTIVATE, WS_EX_LAYERED,
        HWND_BOTTOM, SWP_NOMOVE, SWP_NOSIZE, SWP_NOACTIVATE, SWP_SHOWWINDOW
    };
    use windows::Win32::Foundation::HWND;
    use windows::core::PCWSTR;

    unsafe {
        let hwnd = HWND(window.hwnd()?.0 as isize);

        // 获取当前扩展样式
        let current_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);

        // 设置扩展样式：工具窗口 + 不激活 + 分层窗口
        let new_style = current_style |
            WS_EX_TOOLWINDOW.0 as isize |
            WS_EX_NOACTIVATE.0 as isize |
            WS_EX_LAYERED.0 as isize;
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_style);

        // 尝试找到 WorkerW 窗口（桌面工作区）
        let progman_hwnd = FindWindowW(
            PCWSTR::from_raw("Progman\0".encode_utf16().collect::<Vec<u16>>().as_ptr()),
            PCWSTR::null()
        );

        if progman_hwnd.0 != 0 {
            // 将窗口设置为桌面的子窗口，这样可以避免被"显示桌面"隐藏
            SetParent(hwnd, progman_hwnd);

            // 设置窗口位置在桌面层级
            SetWindowPos(
                hwnd,
                HWND_BOTTOM,
                0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW
            )?;

            println!("Window set as desktop child widget");
        } else {
            // 如果找不到 Progman，使用备用方法
            SetWindowPos(
                hwnd,
                HWND_BOTTOM,
                0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW
            )?;

            println!("Window set with fallback method");
        }

        println!("Desktop widget mode set for window: {}", window.label());
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn set_desktop_widget_mode(_window: &tauri::WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    println!("Desktop widget mode not supported on this platform");
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // 创建菜单项
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let toggle_item = MenuItem::with_id(app, "toggle", "显示/隐藏窗口", true, None::<&str>)?;
            let config_item = MenuItem::with_id(app, "preference", "偏好设置", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_item, &config_item, &quit_item])?;

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

            // 设置主窗口为桌面挂件模式
            if let Some(main_window) = app.get_webview_window("main") {
                if let Err(e) = set_desktop_widget_mode(&main_window) {
                    eprintln!("Failed to set desktop widget mode: {}", e);
                }
            }

            Ok(())
        })
        .on_window_event(|_window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    // 由于没有关闭按钮，这个事件通常不会触发
                    // 但如果触发了，阻止关闭并隐藏窗口
                    api.prevent_close();
                    // 注意：这里不能调用 window.hide() 因为会导致借用检查问题
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
            test_drag_functionality
        ]) // 添加命令处理
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
