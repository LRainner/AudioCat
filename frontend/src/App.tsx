import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize } from "@tauri-apps/api/dpi";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Paper,
  Divider,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  VolumeUp as VolumeUpIcon,
  RadioButtonChecked as RadioButtonCheckedIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon,
  PanTool as PanToolIcon
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [countdownTimer, setCountdownTimer] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    // 添加键盘事件监听器，用于打开开发者工具
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F12' || (event.ctrlKey && event.shiftKey && event.key === 'I')) {
        event.preventDefault();
        // 在开发模式下打开开发者工具
        if ((window as any).__TAURI__) {
          console.log('Attempting to open dev tools...');
          // 这里可以添加打开开发者工具的逻辑
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    const initializeApp = async () => {
      if (!mounted) return;

      await loadData();

      // 监听配置更新事件
      const unlisten = await listen('config-updated', (event) => {
        console.log('Received config-updated event, refreshing...', event.payload);
        if (mounted) {
          loadData();
        }
      });

      // 监听来自托盘菜单的固定模式变化
      const unlistenPin = await listen<boolean>('pin-mode-changed', (event) => {
        console.log('Pin mode changed from tray menu:', event.payload);
        if (mounted) {
          setIsPinned(event.payload);
        }
      });

      // 监听测试倒计时事件
      const unlistenTest = await listen<{delay: number}>('test-countdown', (event) => {
        console.log('Test countdown triggered:', event.payload);
        if (mounted) {
          handleWindowClosed(['测试窗口']);
        }
      });

      // 每5秒刷新一次当前设备状态（只刷新当前设备，不重新加载所有数据）
      const deviceInterval = setInterval(() => {
        if (mounted) {
          loadCurrentAudioDevice();
        }
      }, 5000);

      // 每2秒检查窗口变化
      const windowInterval = setInterval(async () => {
        if (mounted) {
          try {
            const closedWindows = await invoke<string[]>('check_window_changes');
            if (closedWindows.length > 0) {
              console.log('Detected closed windows:', closedWindows);
              // 有监听的窗口关闭了，置顶显示
              await handleWindowClosed(closedWindows);
            }
          } catch (error) {
            console.error('Failed to check window changes:', error);
          }
        }
      }, 2000);

      return () => {
        mounted = false;
        clearInterval(deviceInterval);
        clearInterval(windowInterval);
        if (countdownTimer) {
          clearInterval(countdownTimer);
        }
        unlisten();
        unlistenPin();
        unlistenTest();
      };
    };

    const cleanup = initializeApp();

    return () => {
      mounted = false;
      document.removeEventListener('keydown', handleKeyDown);
      cleanup.then(cleanupFn => cleanupFn && cleanupFn());
    };
  }, []);

  // 当配置设备列表变化时，调整窗口大小
  useEffect(() => {
    console.log('Configured devices changed:', configuredDevices);
    if (configuredDevices.length >= 0) { // 确保已经加载了配置
      const timer = setTimeout(() => {
        console.log('Triggering window size adjustment...');
        adjustWindowSize();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [configuredDevices]);

  const loadData = async () => {
    await Promise.all([
      loadCurrentAudioDevice(),
      loadConfiguredDevices(),
      loadAvailableDevices(),
      loadPinMode()
    ]);

    // 启动窗口监听
    try {
      await invoke('start_window_monitoring');
      console.log('Window monitoring started');
    } catch (error) {
      console.error('Failed to start window monitoring:', error);
    }

    // 数据加载完成后调整窗口大小，给更多时间让DOM更新
    setTimeout(adjustWindowSize, 300);
  };

  const loadPinMode = async () => {
    try {
      const currentMode = await invoke<boolean>('get_window_pinned');
      setIsPinned(currentMode);
    } catch (error) {
      console.error('Failed to load pin mode:', error);
    }
  };

  const adjustWindowSize = async () => {
    try {
      const window = getCurrentWebviewWindow();

      // 等待DOM完全渲染
      await new Promise(resolve => setTimeout(resolve, 200));

      // 获取当前窗口大小
      const currentSize = await window.innerSize();

      // 获取容器元素
      if (containerRef.current) {
        const container = containerRef.current;

        // 强制重新计算布局
        container.offsetHeight;

        // 获取实际内容尺寸
        const contentHeight = container.scrollHeight;
        const contentWidth = container.scrollWidth;
        const offsetHeight = container.offsetHeight;
        const offsetWidth = container.offsetWidth;
        const clientHeight = container.clientHeight;
        const clientWidth = container.clientWidth;

        console.log('Container dimensions:', {
          scrollHeight: contentHeight,
          scrollWidth: contentWidth,
          offsetHeight,
          offsetWidth,
          clientHeight,
          clientWidth
        });

        // 使用最精确的尺寸，优先使用 offsetWidth/Height，但确保不小于内容
        const newHeight = Math.max(offsetHeight, contentHeight, 150);
        const newWidth = Math.max(offsetWidth, contentWidth, 320);

        // 获取 Paper 组件的实际渲染尺寸
        const paperElement = container.querySelector('[elevation="8"]') || container;
        const paperRect = paperElement.getBoundingClientRect();

        console.log('Paper element dimensions:', {
          width: paperRect.width,
          height: paperRect.height,
          top: paperRect.top,
          left: paperRect.left
        });

        // 使用 Paper 组件的实际尺寸
        const finalWidth = Math.max(Math.ceil(paperRect.width), 320);
        const finalHeight = Math.max(Math.ceil(paperRect.height), 150);

        console.log('Calculated window size:', {
          current: { width: currentSize.width, height: currentSize.height },
          container: { width: newWidth, height: newHeight },
          paper: { width: finalWidth, height: finalHeight },
          difference: {
            width: Math.abs(finalWidth - currentSize.width),
            height: Math.abs(finalHeight - currentSize.height)
          }
        });

        console.log('Detailed size info:', {
          'container.offsetWidth': offsetWidth,
          'container.scrollWidth': contentWidth,
          'paper.width': paperRect.width,
          'paper.height': paperRect.height,
          'final window size': { width: finalWidth, height: finalHeight }
        });

        // 使用 Paper 组件的精确尺寸
        await window.setSize(new LogicalSize(finalWidth, finalHeight));
        console.log('Window size adjusted to exact Paper component size');
      } else {
        // 备用方法：使用文档尺寸
        const docHeight = Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
          200
        );
        const docWidth = Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
          320
        );

        await window.setSize(new LogicalSize(docWidth + 10, docHeight + 10));
      }

    } catch (error) {
      console.error('Failed to adjust window size:', error);
    }
  };

  // 拖动功能
  const handleMouseDown = async (e: React.MouseEvent) => {
    // 避免在可交互元素上拖动
    const target = e.target as HTMLElement;
    if (target.closest('button') ||
        target.closest('[role="button"]') ||
        target.closest('li') ||
        target.closest('[data-testid]')) {
      return;
    }

    e.preventDefault();
    setIsDragging(true);

    try {
      const window = getCurrentWebviewWindow();
      await window.startDragging();
    } catch (error) {
      console.error('Failed to start dragging:', error);
    } finally {
      setIsDragging(false);
    }
  };

  // 取消置顶状态
  const unpinWindow = async () => {
    try {
      console.log('Attempting to unpin window...');

      // 清理倒计时
      if (countdownTimer) {
        clearInterval(countdownTimer);
        setCountdownTimer(null);
      }
      setCountdown(null);

      const result = await invoke('set_window_pinned', { pinned: false });
      console.log('Backend response:', result);

      setIsPinned(false);
      console.log('Window unpinned successfully');
    } catch (error) {
      console.error('Failed to unpin window:', error);
    }
  };

  // 处理监听的窗口关闭事件
  const handleWindowClosed = async (closedWindows: string[]) => {
    try {
      console.log('Handling window closed event for:', closedWindows);

      // 置顶窗口
      const result = await invoke('set_window_pinned', { pinned: true });
      console.log('Window pinned due to monitored window closure:', result);

      setIsPinned(true);

      // 显示窗口（如果被隐藏了）
      const window = getCurrentWebviewWindow();
      await window.show();
      await window.setFocus();

      // 获取自动隐藏延迟
      const delay = await invoke<number>('get_auto_hide_delay');
      console.log(`Will auto-unpin after ${delay} seconds`);

      // 开始倒计时
      setCountdown(delay);

      // 设置倒计时定时器
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev === null || prev <= 1) {
            // 倒计时结束，自动取消置顶
            clearInterval(timer);
            setCountdownTimer(null);
            setCountdown(null);

            // 异步取消置顶
            (async () => {
              try {
                await invoke('set_window_pinned', { pinned: false });
                setIsPinned(false);
                console.log('Auto-unpinned window after countdown');
              } catch (error) {
                console.error('Failed to auto-unpin window:', error);
              }
            })();

            return null;
          }
          return prev - 1;
        });
      }, 1000);

      setCountdownTimer(timer);

    } catch (error) {
      console.error('Failed to handle window closed event:', error);
    }
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
    <Paper
      ref={containerRef}
      onMouseDown={handleMouseDown}
      elevation={8}
      sx={{
        borderRadius: 3,
        backdropFilter: 'blur(10px)',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        margin: 0,
        padding: 0,
        width: 'fit-content',
        minWidth: 320,
        minHeight: 150,
        boxSizing: 'border-box',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        '@media (prefers-color-scheme: dark)': {
          backgroundColor: 'rgba(30, 30, 30, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }
      }}
    >
        {/* 标题栏 */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: 2,
            pb: 1,
            userSelect: 'none'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <VolumeUpIcon color="primary" />
            <Typography variant="subtitle1" fontWeight="medium">
              音频输出
            </Typography>
          </Box>
          {isPinned && (
            <Tooltip title={countdown ? `${countdown}秒后自动取消置顶，点击立即取消` : "取消置顶"}>
              <IconButton
                size="small"
                onClick={unpinWindow}
                color="primary"
                sx={{
                  position: 'relative',
                  backgroundColor: countdown ? 'rgba(25, 118, 210, 0.1)' : 'transparent',
                  '&:hover': {
                    backgroundColor: countdown ? 'rgba(25, 118, 210, 0.2)' : 'rgba(0, 0, 0, 0.04)',
                  }
                }}
              >
                <PanToolIcon fontSize="small" />
                {countdown && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-4px',
                      backgroundColor: 'error.main',
                      color: 'white',
                      borderRadius: '50%',
                      width: '18px',
                      height: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      border: '1px solid white',
                      zIndex: 1,
                    }}
                  >
                    {countdown}
                  </Box>
                )}
              </IconButton>
            </Tooltip>
          )}
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
  );
}

export default App;
