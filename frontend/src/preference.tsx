import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import {
  Box, Typography, TextField, Button, IconButton,
  MenuItem, Card, CardContent, Stack, Paper, Alert,
  List, ListItem, ListItemIcon, ListItemText, ListItemButton,
  Switch, Divider, Drawer
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import WindowIcon from '@mui/icons-material/Window';
import TestIcon from '@mui/icons-material/PlayArrow';
import TimerIcon from '@mui/icons-material/Timer';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import MonitorIcon from '@mui/icons-material/Monitor';
import SettingsIcon from '@mui/icons-material/Settings';
import InfoIcon from '@mui/icons-material/Info';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import DescriptionIcon from '@mui/icons-material/Description';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { appDataDir, join } from '@tauri-apps/api/path';
import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { BaseDirectory } from '@tauri-apps/api/path'; // BaseDirectory 可能在 @tauri-apps/api/path 中
import './App.css'; // 可以复用主应用的 CSS，或者创建新的 CSS 文件

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
  const [autoHideDelay, setAutoHideDelay] = useState<number>(5);
  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  useEffect(() => {
    loadConfiguredAudioDevices();
    loadAvailableAudioDevices();
    loadMonitoredWindows();
    loadAvailableWindows();
    loadAutoHideDelay();
    loadDarkMode();

    // 监听深色模式变化
    const setupDarkModeListener = async () => {
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen<boolean>('dark-mode-changed', (event) => {
        console.log('Dark mode changed in preference window:', event.payload);
        setDarkMode(event.payload);
      });
      return unlisten;
    };

    const cleanup = setupDarkModeListener();
    return () => {
      cleanup.then(unlisten => unlisten());
    };
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

  const loadDarkMode = async () => {
    try {
      const currentMode = await invoke<boolean>('get_dark_mode');
      setDarkMode(currentMode);
      console.log('Dark mode:', currentMode);
    } catch (error) {
      console.error('Failed to load dark mode:', error);
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

  const openConfigFolder = async () => {
    try {
      const result = await invoke<string>('open_config_folder');
      console.log('Config folder opened:', result);
    } catch (error) {
      console.error('Failed to open config folder:', error);
    }
  };

  const getConfigFilePath = async () => {
    try {
      const path = await invoke<string>('get_config_file_path');
      console.log('Config file path:', path);
      return path;
    } catch (error) {
      console.error('Failed to get config file path:', error);
      return '';
    }
  };

  // 定义标签页配置
  const tabs = [
    { id: 'general', label: '通用设置', icon: <SettingsIcon /> },
    { id: 'audio', label: '音效设置', icon: <VolumeUpIcon /> },
    { id: 'window', label: '窗口监听', icon: <WindowIcon /> },
    { id: 'about', label: '关于', icon: <InfoIcon /> }
  ];

  // 渲染不同标签页的内容
  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return renderGeneralSettings();
      case 'audio':
        return renderAudioSettings();
      case 'window':
        return renderWindowSettings();
      case 'about':
        return renderAboutSettings();
      default:
        return renderGeneralSettings();
    }
  };

  const renderGeneralSettings = () => (
    <Box>
      <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
        通用设置
      </Typography>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 500 }}>
            主题设置
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="body2">
              深色模式
            </Typography>
            <Switch
              checked={darkMode}
              onChange={(e) => {
                const newMode = e.target.checked;
                setDarkMode(newMode);
                invoke('set_dark_mode', { darkMode: newMode });
              }}
            />
          </Box>
        </CardContent>
      </Card>
    </Box>
  );

  const renderAudioSettings = () => (
    <Box>
      <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
        音效设置
      </Typography>
      {/* 原有的音频设备配置内容 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <VolumeUpIcon sx={{ mr: 1, color: 'primary.main' }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
              已配置的音频输出设备
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            点击设备名称可以切换到该设备，最多可配置4个设备
          </Typography>

          {configuredAudioDevices.length === 0 ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              还没有配置任何音频设备。请在下方添加设备。
            </Alert>
          ) : (
            <Stack spacing={1} sx={{ mb: 2 }}>
              {configuredAudioDevices.map((deviceName, index) => (
                <Box
                  key={index}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    backgroundColor: 'background.paper'
                  }}
                >
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {deviceName}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => handleDeleteDevice(index)}
                    color="error"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Stack>
          )}

          {configuredAudioDevices.length < 4 && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                select
                size="small"
                value={selectedDeviceToAdd}
                onChange={(e) => setSelectedDeviceToAdd(e.target.value)}
                placeholder="选择要监听的窗口"
                sx={{ flex: 1 }}
                disabled={availableAudioDevices.length === 0}
              >
                {availableAudioDevices
                  .filter(device => !configuredAudioDevices.includes(device.name))
                  .map((device) => (
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
                size="small"
                sx={{
                  borderRadius: 1.5,
                  textTransform: 'none',
                  fontSize: '0.9rem'
                }}
              >
                添加设备
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );

  const renderWindowSettings = () => (
    <Box>
      <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
        窗口监听设置
      </Typography>
      {/* 原有的窗口监听配置内容 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <WindowIcon sx={{ mr: 1, color: 'primary.main' }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
              窗口监听设置
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            当监听的窗口关闭时，音频切换器会自动置顶显示
          </Typography>

          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" sx={{ mb: 2, fontWeight: 500 }}>
              自动隐藏延迟设置
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <TextField
                type="number"
                value={autoHideDelay}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (!isNaN(value) && value >= 0 && value <= 60) {
                    setAutoHideDelay(value);
                  }
                }}
                onBlur={() => handleDelayChange(autoHideDelay)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleDelayChange(autoHideDelay);
                  }
                }}
                slotProps={{
                  htmlInput: {
                    min: 0,
                    max: 60,
                    step: 1
                  }
                }}
                size="small"
                sx={{
                  width: 80,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 1.5,
                  }
                }}
              />
              <Typography variant="body2" color="text.secondary">
                秒 (0-60)
              </Typography>
              <Button
                variant="outlined"
                size="small"
                startIcon={<TestIcon />}
                onClick={testCountdown}
                sx={{
                  borderRadius: 1.5,
                  textTransform: 'none',
                  fontSize: '0.8rem',
                  ml: 'auto'
                }}
              >
                测试倒计时
              </Button>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              设置为0秒表示立即隐藏，设置为其他值表示延迟指定秒数后隐藏
            </Typography>
          </Box>

          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 500 }}>
            监听的窗口 (最多10个)
          </Typography>

          {monitoredWindows.length === 0 ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              还没有配置任何监听窗口。请在下方添加窗口。
            </Alert>
          ) : (
            <Stack spacing={1} sx={{ mb: 2 }}>
              {monitoredWindows.map((windowTitle, index) => (
                <Box
                  key={index}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    backgroundColor: 'background.paper'
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    <MonitorIcon sx={{ mr: 1, fontSize: '1.2rem', color: 'text.secondary' }} />
                    <Typography variant="body2">
                      {windowTitle}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={() => handleDeleteWindow(index)}
                    color="error"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Stack>
          )}

          {monitoredWindows.length < 10 && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                select
                size="small"
                value={selectedWindowToAdd}
                onChange={(e) => setSelectedWindowToAdd(e.target.value)}
                placeholder="选择要监听的窗口"
                sx={{ flex: 1 }}
                disabled={availableWindows.length === 0}
              >
                {availableWindows
                  .filter(window => !monitoredWindows.includes(window))
                  .map((window) => (
                    <MenuItem key={window} value={window}>
                      {window}
                    </MenuItem>
                  ))}
              </TextField>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleAddWindow}
                disabled={!selectedWindowToAdd}
                size="small"
                sx={{
                  borderRadius: 1.5,
                  textTransform: 'none',
                  fontSize: '0.9rem'
                }}
              >
                添加窗口
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );

  const renderAboutSettings = () => (
    <Box>
      <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
        关于
      </Typography>

      {/* 应用信息卡片 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <VolumeUpIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
            <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
              音频输出切换器
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              版本 1.0.0
            </Typography>
            <Typography variant="body2" color="text.secondary">
              一个简单易用的音频输出设备切换工具
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* 配置文件管理卡片 */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <DescriptionIcon sx={{ mr: 1, color: 'primary.main' }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
              配置文件管理
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            管理应用程序的配置文件和数据存储位置
          </Typography>

          <Stack spacing={2}>
            <Button
              variant="outlined"
              startIcon={<FolderOpenIcon />}
              onClick={openConfigFolder}
              fullWidth
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                justifyContent: 'flex-start',
                py: 1.5
              }}
            >
              <Box sx={{ textAlign: 'left' }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  打开配置文件夹
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  查看应用程序的配置文件和数据
                </Typography>
              </Box>
            </Button>

            <Button
              variant="outlined"
              startIcon={<DescriptionIcon />}
              onClick={async () => {
                const path = await getConfigFilePath();
                if (path) {
                  // 复制路径到剪贴板
                  try {
                    await navigator.clipboard.writeText(path);
                    console.log('Config file path copied to clipboard:', path);
                  } catch (error) {
                    console.error('Failed to copy to clipboard:', error);
                  }
                }
              }}
              fullWidth
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                justifyContent: 'flex-start',
                py: 1.5
              }}
            >
              <Box sx={{ textAlign: 'left' }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  复制配置文件路径
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  将配置文件路径复制到剪贴板
                </Typography>
              </Box>
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );

  return (
    <Box sx={{
        minHeight: '100vh',
        height: '100vh',
        background: darkMode
          ? 'linear-gradient(135deg, #2c2c2c 0%, #1a1a1a 100%)'
          : 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
        display: 'flex'
      }}>
        {/* 左侧导航栏 */}
        <Box sx={{
          width: 240,
          backgroundColor: darkMode
            ? 'rgba(20, 20, 20, 0.95)'
            : 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          borderRight: darkMode
            ? '1px solid rgba(255, 255, 255, 0.1)'
            : '1px solid rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* 标题 */}
          <Box sx={{ p: 3, borderBottom: darkMode ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: darkMode ? '#ffffff' : 'inherit' }}>
              偏好设置
            </Typography>
          </Box>

          {/* 导航菜单 */}
          <List sx={{ flex: 1, p: 1 }}>
            {tabs.map((tab) => (
              <ListItemButton
                key={tab.id}
                selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                sx={{
                  borderRadius: 2,
                  mb: 0.5,
                  '&.Mui-selected': {
                    backgroundColor: darkMode
                      ? 'rgba(100, 149, 237, 0.2)'
                      : 'rgba(25, 118, 210, 0.1)',
                    '&:hover': {
                      backgroundColor: darkMode
                        ? 'rgba(100, 149, 237, 0.3)'
                        : 'rgba(25, 118, 210, 0.15)',
                    }
                  },
                  '&:hover': {
                    backgroundColor: darkMode
                      ? 'rgba(255, 255, 255, 0.05)'
                      : 'rgba(0, 0, 0, 0.04)',
                  }
                }}
              >
                <ListItemIcon sx={{ color: activeTab === tab.id ? 'primary.main' : 'inherit' }}>
                  {tab.icon}
                </ListItemIcon>
                <ListItemText
                  primary={tab.label}
                  sx={{
                    '& .MuiListItemText-primary': {
                      fontWeight: activeTab === tab.id ? 600 : 400,
                      color: darkMode ? '#ffffff' : 'inherit'
                    }
                  }}
                />
              </ListItemButton>
            ))}
          </List>
        </Box>

        {/* 右侧内容区域 */}
        <Box sx={{
          flex: 1,
          overflow: 'auto',
          p: 3
        }}>
          <Box sx={{
            maxWidth: 800,
            backgroundColor: darkMode
              ? 'rgba(30, 30, 30, 0.95)'
              : 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            border: darkMode
              ? '1px solid rgba(255, 255, 255, 0.1)'
              : '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: 3,
            p: 3,
            color: darkMode ? '#ffffff' : 'inherit'
          }}>
            {renderTabContent()}
          </Box>
        </Box>
      </Box>
  );
}

function App() {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    // 加载深色模式状态
    const loadDarkMode = async () => {
      try {
        const currentMode = await invoke<boolean>('get_dark_mode');
        setDarkMode(currentMode);
      } catch (error) {
        console.error('Failed to load dark mode:', error);
      }
    };

    loadDarkMode();

    // 监听深色模式变化
    const setupDarkModeListener = async () => {
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen<boolean>('dark-mode-changed', (event) => {
        console.log('Dark mode changed in preference App:', event.payload);
        setDarkMode(event.payload);
      });
      return unlisten;
    };

    const cleanup = setupDarkModeListener();
    return () => {
      cleanup.then(unlisten => unlisten());
    };
  }, []);

  // 创建与主窗口一致的主题
  const theme = createTheme({
    palette: {
      mode: darkMode ? 'dark' : 'light',
      ...(darkMode ? {
        background: {
          default: 'transparent',
          paper: 'rgba(30, 30, 30, 0.95)',
        },
        text: {
          primary: '#e8e8e8',
          secondary: '#b0b0b0',
        },
      } : {
        background: {
          default: 'transparent',
          paper: 'rgba(255, 255, 255, 0.95)',
        },
        text: {
          primary: '#1a1a1a',
          secondary: '#666666',
        },
      }),
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            backdropFilter: 'blur(10px)',
            ...(darkMode ? {
              backgroundColor: 'rgba(30, 30, 30, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            } : {
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
            }),
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            backdropFilter: 'blur(10px)',
            boxShadow: 'none',
            ...(darkMode ? {
              backgroundColor: 'rgba(40, 40, 40, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            } : {
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
              border: '1px solid rgba(0, 0, 0, 0.1)',
            }),
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            textTransform: 'none',
            fontWeight: 500,
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: 8,
            },
          },
        },
      },
    },
  });

  return (
    <ThemeProvider theme={theme}>
      <PreferenceApp />
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);