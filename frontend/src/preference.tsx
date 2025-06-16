import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Box, Typography, TextField, Button, List, ListItem, ListItemText, IconButton, MenuItem } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { BaseDirectory } from '@tauri-apps/api/path'; // BaseDirectory 可能在 @tauri-apps/api/path 中
import './App.css'; // 可以复用主应用的 CSS，或者创建新的 CSS 文件

const theme = createTheme({
  // 您可以在这里自定义 MUI 主题
});

const CONFIG_FILE_NAME = 'audio_devices.json';

interface AudioDevice {
  id: string;
  name: string;
  is_default: boolean;
}

function PreferenceApp() {
  const [configuredAudioDevices, setConfiguredAudioDevices] = useState<string[]>([]);
  const [availableAudioDevices, setAvailableAudioDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceToAdd, setSelectedDeviceToAdd] = useState('');

  useEffect(() => {
    loadConfiguredAudioDevices();
    loadAvailableAudioDevices();
  }, []);

  const getConfigFile = async () => {
    const appDataDirPath = await appDataDir();
    console.log('App Data Directory:', appDataDirPath);
    return await join(appDataDirPath, CONFIG_FILE_NAME);
  };

  const loadConfiguredAudioDevices = async () => {
    try {
      const configFilePath = await getConfigFile();
      console.log('Loading from:', configFilePath);
      const fileExists = await exists(configFilePath, { baseDir: BaseDirectory.AppData });
      console.log('Config file exists:', fileExists);
      if (fileExists) {
        const contents = await readTextFile(configFilePath);
        const parsedDevices = JSON.parse(contents);
        setConfiguredAudioDevices(parsedDevices);
        console.log('Loaded devices:', parsedDevices);
      } else {
        console.log('Config file does not exist, initializing with empty array.');
        setConfiguredAudioDevices([]);
      }
    } catch (error) {
      console.error('Failed to load configured audio devices:', error);
    }
  };

  const loadAvailableAudioDevices = async () => {
    try {
      const devices = await invoke('get_audio_output_devices');
      setAvailableAudioDevices(devices as AudioDevice[]);
      console.log('Available devices:', devices);
    } catch (error) {
      console.error('Failed to get available audio devices:', error);
    }
  };

  const saveConfiguredAudioDevices = async (devices: string[]) => {
    try {
      const configFilePath = await getConfigFile();
      console.log('Saving to:', configFilePath);
      // 确保父目录存在
      const appDataDirPath = await appDataDir();
      await invoke('create_app_data_dir', { path: appDataDirPath }); // 调用 Rust 命令创建目录
      await writeTextFile(configFilePath, JSON.stringify(devices), { baseDir: BaseDirectory.AppData });
      setConfiguredAudioDevices(devices);
      console.log('Saved devices:', devices);
    } catch (error) {
      console.error('Failed to save configured audio devices:', error);
    }
  };

  const handleAddDevice = () => {
    const selectedDevice = availableAudioDevices.find(device => device.id === selectedDeviceToAdd);
    if (selectedDevice && configuredAudioDevices.length < 4 && !configuredAudioDevices.includes(selectedDevice.name)) {
      const updatedDevices = [...configuredAudioDevices, selectedDevice.name];
      saveConfiguredAudioDevices(updatedDevices);
      setSelectedDeviceToAdd('');
    }
  };

  const handleDeleteDevice = (index: number) => {
    const updatedDevices = configuredAudioDevices.filter((_, i) => i !== index);
    saveConfiguredAudioDevices(updatedDevices);
  };

  const handleSwitchDevice = async (deviceName: string) => {
    try {
      // 根据设备名称找到对应的设备 ID
      const device = availableAudioDevices.find(d => d.name === deviceName);
      if (device) {
        await invoke('set_audio_device', { deviceId: device.id });
        console.log(`Switched to device: ${deviceName}`);
      } else {
        console.error('Device not found:', deviceName);
      }
    } catch (error) {
      console.error('Failed to switch audio device:', error);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        偏好设置
      </Typography>

      <Box mt={4}>
        <Typography variant="h6" gutterBottom>
          已配置的音频输出设备
        </Typography>
        <List>
          {configuredAudioDevices.map((device, index) => (
            <ListItem
              key={index}
              secondaryAction={
                <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteDevice(index)}>
                  <DeleteIcon />
                </IconButton>
              }
            >
              <ListItemText primary={device} onClick={() => handleSwitchDevice(device)} sx={{ cursor: 'pointer' }} />
            </ListItem>
          ))}
        </List>
        {configuredAudioDevices.length < 4 && (
          <Box mt={2}>
            <TextField
              select
              label="选择设备"
              value={selectedDeviceToAdd}
              onChange={(e) => setSelectedDeviceToAdd(e.target.value)}
              variant="outlined"
              size="small"
              fullWidth
              sx={{ mb: 1 }}
            >
              {availableAudioDevices.map((device) => (
                <MenuItem key={device.id} value={device.id}>
                  {device.name}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddDevice}
              disabled={!selectedDeviceToAdd || configuredAudioDevices.includes(selectedDeviceToAdd)}
              fullWidth
            >
              添加
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <PreferenceApp />
    </ThemeProvider>
  </React.StrictMode>,
);