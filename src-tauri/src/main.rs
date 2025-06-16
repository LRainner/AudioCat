// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// use cpal::traits::{DeviceTrait, HostTrait};
use tauri::{
    Manager,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
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

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // 创建菜单项
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let config_item = MenuItem::with_id(app, "preference", "偏好设置", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &config_item, &quit_item])?;

            // 构建托盘
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.0.as_str() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        let window = app.get_webview_window("main").unwrap();
                        window.show().unwrap();
                        window.set_focus().unwrap();
                    }
                    "preference" => {
                        let preference_window = app.get_webview_window("preference");
                        if let Some(window) = preference_window {
                            window.show().unwrap();
                            window.set_focus().unwrap();
                        } else {
                            tauri::WebviewWindowBuilder::new(
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
            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    // 阻止默认的关闭行为
                    api.prevent_close();
                    // 隐藏窗口而不是关闭
                    window.hide().unwrap();
                }
                _ => {}
            }
        })
        .plugin(tauri_plugin_fs::init()) // 初始化文件系统插件
        .invoke_handler(tauri::generate_handler![
            set_audio_device,
            get_current_audio_device,
            get_audio_output_devices,
            create_app_data_dir
        ]) // 添加命令处理
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
