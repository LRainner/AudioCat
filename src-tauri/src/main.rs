// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use cpal::traits::{DeviceTrait, HostTrait};
use tauri::{
    Manager,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};

// 定义一个 Tauri 命令，用于设置音频设备
#[tauri::command]
fn set_audio_device(device_name: String) {
    let host = cpal::default_host();
    if let Some(_device) = host
        .output_devices()
        .unwrap()
        .find(|d| d.name().unwrap() == device_name)
    {
        println!("尝试切换到音频设备: {}", device_name);
        // cpal 0.15 不直接提供设置默认设备的功能
        // 实际的切换可能需要更底层的操作系统API或用户手动操作
        // 这里只是打印信息，表示尝试切换
    } else {
        println!("未找到音频设备: {}", device_name);
    }
}

// 定义一个 Tauri 命令，用于获取当前音频设备
#[tauri::command]
fn get_current_audio_device() -> String {
    let host = cpal::default_host();
    if let Some(device) = host.default_output_device() {
        device.name().unwrap_or_else(|_| "未知设备".to_string())
    } else {
        "无可用设备".to_string()
    }
}

// 定义一个 Tauri 命令，用于获取所有可用的音频输出设备列表
#[tauri::command]
fn get_audio_output_devices() -> Vec<String> {
    let host = cpal::default_host();
    match host.output_devices() {
        Ok(devices) => devices.filter_map(|device| device.name().ok()).collect(),
        Err(_) => Vec::new(),
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
