import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir } from '@tauri-apps/api/path';
import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { BaseDirectory } from '@tauri-apps/api/path';
import { Box, Typography, Button, List, ListItem, ListItemText } from '@mui/material';
import "./App.css";

const CONFIG_FILE_NAME = 'audio_devices.json';

function App() {
  const [currentAudioDevice, setCurrentAudioDevice] = useState('加载中...');
  const [configuredAudioDevices, setConfiguredAudioDevices] = useState<string[]>([]);

  useEffect(() => {
    loadCurrentAudioDevice();
    loadConfiguredAudioDevices();
  }, []);

  const getConfigFile = async () => {
    const appDataDirPath = await appDataDir();
    return `${appDataDirPath}${CONFIG_FILE_NAME}`;
  };

  const loadCurrentAudioDevice = async () => {
    try {
      const device = await invoke('get_current_audio_device');
      setCurrentAudioDevice(device as string);
    } catch (error) {
      console.error('Failed to get current audio device:', error);
      setCurrentAudioDevice('获取失败');
    }
  };

  const loadConfiguredAudioDevices = async () => {
    try {
      const configFilePath = await getConfigFile();
      if (await exists(configFilePath, { baseDir: BaseDirectory.AppData })) {
        const contents = await readTextFile(configFilePath);
        setConfiguredAudioDevices(JSON.parse(contents));
      }
    } catch (error) {
      console.error('Failed to load configured audio devices:', error);
    }
  };

  const handleSwitchDevice = async (deviceName: string) => {
    try {
      await invoke('set_audio_device', { deviceName });
      setCurrentAudioDevice(deviceName); // 假设切换成功后更新当前设备
      console.log(`Switched to device: ${deviceName}`);
    } catch (error) {
      console.error('Failed to switch audio device:', error);
    }
  };

  return (
    <main className="container">
      <Box mt={4}>
        <Typography variant="h6" gutterBottom>
          当前音频输出设备: {currentAudioDevice}
        </Typography>
        <Typography variant="h6" gutterBottom>
          快速切换音频设备
        </Typography>
        <List>
          {configuredAudioDevices.map((device, index) => (
            <ListItem key={index} onClick={() => handleSwitchDevice(device)} sx={{ cursor: 'pointer' }}>
              <ListItemText primary={device} />
            </ListItem>
          ))}
        </List>
      </Box>
    </main>
  );
}

export default App;
