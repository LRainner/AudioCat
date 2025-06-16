use std::io;
use windows::{
    core::{PCWSTR, Result as WindowsResult},
    Win32::{
        Devices::FunctionDiscovery::PKEY_Device_FriendlyName,
        Media::Audio::{DEVICE_STATE_ACTIVE, eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator},
        System::Com::{CLSCTX_ALL, CoCreateInstance, COINIT_MULTITHREADED, CoInitializeEx, CoUninitialize, STGM_READ},
    },
};
use com_policy_config::{IPolicyConfig, PolicyConfigClient};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    unsafe {
        // 初始化 COM
        let com_result = CoInitializeEx(None, COINIT_MULTITHREADED);
        if com_result.is_err() {
            println!("Failed to initialize COM: {:?}", com_result);
            return Ok(());
        }

        let result = (|| -> WindowsResult<()> {
            // 创建设备枚举器
            let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            
            // 获取设备集合
            let device_collection = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)?;
            let device_count = device_collection.GetCount()?;
            
            println!("找到 {} 个音频输出设备:", device_count);
            
            // 获取当前默认设备
            let default_device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
            let default_device_id = default_device.GetId()?.to_string()?;
            
            // 列出所有设备
            let mut devices = Vec::new();
            for i in 0..device_count {
                let device = device_collection.Item(i)?;
                let device_id = device.GetId()?.to_string()?;
                
                let property_store = device.OpenPropertyStore(STGM_READ)?;
                let name_prop = property_store.GetValue(&PKEY_Device_FriendlyName)?;
                let device_name = name_prop.Anonymous.Anonymous.Anonymous.pwszVal.to_string()?;
                
                let is_default = device_id == default_device_id;
                let status = if is_default { " (当前默认)" } else { "" };
                
                println!("  {}: {}{}", i + 1, device_name, status);
                devices.push((device_id, device_name));
            }
            
            if devices.is_empty() {
                println!("没有找到可用的音频设备");
                return Ok(());
            }
            
            // 让用户选择设备
            println!("\n请选择要切换到的设备 (输入数字 1-{}):", devices.len());
            let mut input = String::new();
            if let Err(e) = io::stdin().read_line(&mut input) {
                println!("读取输入失败: {}", e);
                return Ok(());
            }
            
            let choice: usize = match input.trim().parse::<usize>() {
                Ok(n) if n > 0 && n <= devices.len() => n - 1,
                _ => {
                    println!("无效的选择");
                    return Ok(());
                }
            };
            
            let (_target_device_id, target_device_name) = &devices[choice];
            
            // 获取目标设备
            let target_device = device_collection.Item(choice as u32)?;
            
            // 创建 PolicyConfig 实例来设置默认设备
            let policy_config: IPolicyConfig = CoCreateInstance(&PolicyConfigClient, None, CLSCTX_ALL)?;
            let device_id_pcwstr = PCWSTR(target_device.GetId()?.0);
            
            // 设置为默认设备
            policy_config.SetDefaultEndpoint(device_id_pcwstr, eConsole)?;
            
            println!("成功切换到音频设备: {}", target_device_name);
            
            Ok(())
        })();

        // 清理 COM
        CoUninitialize();

        match result {
            Ok(_) => println!("操作完成"),
            Err(e) => println!("操作失败: {:?}", e),
        }
    }

    Ok(())
}
