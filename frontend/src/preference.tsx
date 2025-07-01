import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Box, Typography, TextField, Button, List, ListItem, ListItemText, IconButton, MenuItem, Divider, Slider } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import WindowIcon from '@mui/icons-material/Window';
import TestIcon from '@mui/icons-material/PlayArrow';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
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

  // 窗口监听相关状态
  const [monitoredWindows, setMonitoredWindows] = useState<string[]>([]);
  const [availableWindows, setAvailableWindows] = useState<string[]>([]);
  const [selectedWindowToAdd, setSelectedWindowToAdd] = useState('');
  const [autoHideDelay, setAutoHideDelay] = useState<number>(10);

  useEffect(() => {
    loadConfiguredAudioDevices();
    loadAvailableAudioDevices();
    loadMonitoredWindows();
    loadAvailableWindows();
    loadAutoHideDelay();
  }, []);

  const getConfigFile = async () => {
    const appDataDirPath = await appDataDir();
    console.log('App Data Directory:', appDataDirPath);
    return await join(appDataDirPath, CONFIG_FILE_NAME);
  };

  const loadConfiguredAudioDevices = async () => {
    try {
      const appDataDirPath = await appDataDir();
      const configFilePath = await join(appDataDirPath, CONFIG_FILE_NAME);
      console.log('Loading from:', configFilePath);

      const fileExists = await exists(configFilePath);
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

  const loadMonitoredWindows = async () => {
    try {
      const windows = await invoke('get_monitored_windows');
      setMonitoredWindows(windows as string[]);
      console.log('Monitored windows:', windows);
    } catch (error) {
      console.error('Failed to get monitored windows:', error);
    }
  };

  const loadAvailableWindows = async () => {
    try {
      const windows = await invoke('get_running_windows');
      setAvailableWindows(windows as string[]);
      console.log('Available windows:', windows);
    } catch (error) {
      console.error('Failed to get available windows:', error);
    }
  };

  const loadAutoHideDelay = async () => {
    try {
      const delay = await invoke('get_auto_hide_delay');
      setAutoHideDelay(delay as number);
      console.log('Auto hide delay:', delay);
    } catch (error) {
      console.error('Failed to get auto hide delay:', error);
    }
  };

  const saveConfiguredAudioDevices = async (devices: string[]) => {
    try {
      const appDataDirPath = await appDataDir();
      console.log('App data dir:', appDataDirPath);
      // 确保父目录存在
      await invoke('create_app_data_dir', { path: appDataDirPath });

      const configFilePath = await join(appDataDirPath, CONFIG_FILE_NAME);
      console.log('Saving to:', configFilePath);

      await writeTextFile(configFilePath, JSON.stringify(devices));
      setConfiguredAudioDevices(devices);
      console.log('Saved devices:', devices);

      // 发送配置更新事件通知主窗口
      await emit('config-updated', { devices });
      console.log('Emitted config-updated event');
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

  const handleAddWindow = async () => {
    if (selectedWindowToAdd && monitoredWindows.length < 10 && !monitoredWindows.includes(selectedWindowToAdd)) {
      const updatedWindows = [...monitoredWindows, selectedWindowToAdd];
      try {
        await invoke('set_monitored_windows', { windows: updatedWindows });
        setMonitoredWindows(updatedWindows);
        setSelectedWindowToAdd('');
        console.log('Added monitored window:', selectedWindowToAdd);
      } catch (error) {
        console.error('Failed to add monitored window:', error);
      }
    }
  };

  const handleDeleteWindow = async (index: number) => {
    const updatedWindows = monitoredWindows.filter((_, i) => i !== index);
    try {
      await invoke('set_monitored_windows', { windows: updatedWindows });
      setMonitoredWindows(updatedWindows);
      console.log('Removed monitored window at index:', index);
    } catch (error) {
      console.error('Failed to remove monitored window:', error);
    }
  };

  const handleDelayChange = async (newDelay: number) => {
    try {
      await invoke('set_auto_hide_delay', { delay: newDelay });
      setAutoHideDelay(newDelay);
      console.log('Updated auto hide delay:', newDelay);
    } catch (error) {
      console.error('Failed to update auto hide delay:', error);
    }
  };

  const testCountdown = async () => {
    try {
      // 模拟窗口关闭事件，触发倒计时
      await invoke('set_window_pinned', { pinned: true });
      await emit('test-countdown', { delay: autoHideDelay });
      console.log('Test countdown triggered');
    } catch (error) {
      console.error('Failed to test countdown:', error);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        偏好设置
      </Typography>

      <Box mt={4}>
        <Typography variant="h6" gutterBottom>
          窗口监听设置
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          当监听的窗口关闭时，音频切换器将自动置顶显示
        </Typography>

        <Box mt={2}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="subtitle2">
              自动隐藏延迟: {autoHideDelay} 秒
            </Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<TestIcon />}
              onClick={testCountdown}
            >
              测试倒计时
            </Button>
          </Box>
          <Slider
            value={autoHideDelay}
            onChange={(_, value) => handleDelayChange(value as number)}
            min={5}
            max={60}
            step={5}
            marks={[
              { value: 5, label: '5s' },
              { value: 10, label: '10s' },
              { value: 30, label: '30s' },
              { value: 60, label: '60s' }
            ]}
            valueLabelDisplay="auto"
            sx={{ mb: 2 }}
          />
        </Box>

        <Typography variant="subtitle2" gutterBottom>
          监听的窗口 (最多10个)
        </Typography>
        <List>
          {monitoredWindows.map((window, index) => (
            <ListItem
              key={index}
              secondaryAction={
                <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteWindow(index)}>
                  <DeleteIcon />
                </IconButton>
              }
            >
              <WindowIcon sx={{ mr: 2, color: 'primary.main' }} />
              <ListItemText primary={window} />
            </ListItem>
          ))}
        </List>

        {monitoredWindows.length < 10 && (
          <Box mt={2}>
            <TextField
              select
              label="选择要监听的窗口"
              value={selectedWindowToAdd}
              onChange={(e) => setSelectedWindowToAdd(e.target.value)}
              variant="outlined"
              size="small"
              fullWidth
              sx={{ mb: 1 }}
            >
              {availableWindows.map((window, index) => (
                <MenuItem key={index} value={window}>
                  {window}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddWindow}
              disabled={!selectedWindowToAdd || monitoredWindows.includes(selectedWindowToAdd)}
              fullWidth
            >
              添加监听窗口
            </Button>
          </Box>
        )}
      </Box>

      <Divider sx={{ my: 4 }} />

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
              disabled={!selectedDeviceToAdd || configuredAudioDevices.some(device =>
                availableAudioDevices.find(d => d.id === selectedDeviceToAdd)?.name === device
              )}
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