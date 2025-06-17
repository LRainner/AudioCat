import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Paper,
  Divider
} from '@mui/material';
import {
  VolumeUp as VolumeUpIcon,
  RadioButtonChecked as RadioButtonCheckedIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon
} from '@mui/icons-material';
import { appDataDir, join } from '@tauri-apps/api/path';
import { readTextFile, exists } from '@tauri-apps/plugin-fs';
import "./App.css";

const CONFIG_FILE_NAME = 'audio_devices.json';

interface AudioDevice {
  id: string;
  name: string;
  is_default: boolean;
}

function App() {
  const [currentAudioDevice, setCurrentAudioDevice] = useState<AudioDevice | null>(null);
  const [configuredDevices, setConfiguredDevices] = useState<string[]>([]);
  const [availableDevices, setAvailableDevices] = useState<AudioDevice[]>([]);

  useEffect(() => {
    loadData();

    // 监听配置更新事件
    const setupEventListener = async () => {
      const unlisten = await listen('config-updated', (event) => {
        console.log('Received config-updated event, refreshing...', event.payload);
        loadData();
      });

      return unlisten;
    };

    let unlistenPromise = setupEventListener();

    // 每5秒刷新一次当前设备状态
    const interval = setInterval(loadCurrentAudioDevice, 5000);

    return () => {
      clearInterval(interval);
      unlistenPromise.then(unlisten => unlisten());
    };
  }, []);

  const loadData = async () => {
    await Promise.all([
      loadCurrentAudioDevice(),
      loadConfiguredDevices(),
      loadAvailableDevices()
    ]);
  };

  const loadCurrentAudioDevice = async () => {
    try {
      const device = await invoke('get_current_audio_device');
      setCurrentAudioDevice(device as AudioDevice);
    } catch (error) {
      console.error('Failed to get current audio device:', error);
      setCurrentAudioDevice(null);
    }
  };

  const loadConfiguredDevices = async () => {
    try {
      const appDataDirPath = await appDataDir();
      const configFilePath = await join(appDataDirPath, CONFIG_FILE_NAME);
      console.log('Loading config from:', configFilePath);

      const fileExists = await exists(configFilePath);
      console.log('Config file exists:', fileExists);

      if (fileExists) {
        const contents = await readTextFile(configFilePath);
        console.log('Config file contents:', contents);
        const parsedDevices = JSON.parse(contents);
        console.log('Parsed devices:', parsedDevices);
        setConfiguredDevices(parsedDevices);
      } else {
        console.log('Config file does not exist, using empty array');
        setConfiguredDevices([]);
      }
    } catch (error) {
      console.error('Failed to load configured devices:', error);
      setConfiguredDevices([]);
    }
  };

  const loadAvailableDevices = async () => {
    try {
      const devices = await invoke('get_audio_output_devices');
      setAvailableDevices(devices as AudioDevice[]);
    } catch (error) {
      console.error('Failed to get available devices:', error);
      setAvailableDevices([]);
    }
  };

  const handleSwitchDevice = async (deviceName: string) => {
    try {
      const device = availableDevices.find(d => d.name === deviceName);
      if (device) {
        await invoke('set_audio_device', { deviceId: device.id });
        await loadCurrentAudioDevice();
        console.log(`Switched to device: ${deviceName}`);
      }
    } catch (error) {
      console.error('Failed to switch audio device:', error);
    }
  };



  // 获取要显示的设备列表（配置的设备）
  const getDisplayDevices = () => {
    return configuredDevices.map(deviceName => {
      const device = availableDevices.find(d => d.name === deviceName);
      return {
        name: deviceName,
        isAvailable: !!device,
        isCurrent: currentAudioDevice?.name === deviceName,
        device: device
      };
    });
  };

  const displayDevices = getDisplayDevices();

  return (
    <Box sx={{ width: '100%', maxWidth: 320, margin: 'auto', p: 1 }}>
      <Paper elevation={2} sx={{ borderRadius: 2 }}>
        {/* 标题栏 */}
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 2,
          pb: 1
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <VolumeUpIcon color="primary" />
            <Typography variant="subtitle1" fontWeight="medium">
              音频输出
            </Typography>
          </Box>
        </Box>

        <Divider />

        {/* 当前设备显示 */}
        <Box sx={{ p: 2, py: 1.5, bgcolor: 'rgba(25, 118, 210, 0.04)' }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            当前设备
          </Typography>
          <Typography variant="body1" fontWeight="medium">
            {currentAudioDevice ? currentAudioDevice.name : '未知设备'}
          </Typography>
        </Box>

        <Divider />

        {/* 设备列表 */}
        <List dense sx={{ py: 0 }}>
          {displayDevices.length === 0 ? (
            <ListItem>
              <ListItemText
                primary={
                  <Typography variant="body2" color="text.secondary">
                    未配置设备
                  </Typography>
                }
                secondary={
                  <Typography variant="caption">
                    请在偏好设置中添加设备
                  </Typography>
                }
              />
            </ListItem>
          ) : (
            displayDevices.map((item, index) => (
              <ListItem
                key={index}
                onClick={() => item.isAvailable && handleSwitchDevice(item.name)}
                sx={{
                  cursor: item.isAvailable ? 'pointer' : 'default',
                  opacity: item.isAvailable ? 1 : 0.5,
                  '&:hover': item.isAvailable ? {
                    backgroundColor: 'rgba(0, 0, 0, 0.04)'
                  } : {}
                }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  {item.isCurrent ? (
                    <RadioButtonCheckedIcon color="primary" fontSize="small" />
                  ) : (
                    <RadioButtonUncheckedIcon color="disabled" fontSize="small" />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Typography
                      variant="body2"
                      fontWeight={item.isCurrent ? 'medium' : 'normal'}
                    >
                      {item.name}
                    </Typography>
                  }
                  secondary={!item.isAvailable ? (
                    <Typography variant="caption" color="error">
                      设备不可用
                    </Typography>
                  ) : undefined}
                />
              </ListItem>
            ))
          )}
        </List>
      </Paper>
    </Box>
  );
}

export default App;
