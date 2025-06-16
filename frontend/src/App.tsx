import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Box, Typography, List, ListItem, ListItemText, Chip } from '@mui/material';
import "./App.css";

interface AudioDevice {
  id: string;
  name: string;
  is_default: boolean;
}

function App() {
  const [currentAudioDevice, setCurrentAudioDevice] = useState<AudioDevice | null>(null);
  const [allAudioDevices, setAllAudioDevices] = useState<AudioDevice[]>([]);

  useEffect(() => {
    loadCurrentAudioDevice();
    loadAllAudioDevices();
  }, []);

  const loadCurrentAudioDevice = async () => {
    try {
      console.log('Calling get_current_audio_device...');
      const device = await invoke('get_current_audio_device');
      console.log('Current device response:', device);
      setCurrentAudioDevice(device as AudioDevice);
    } catch (error) {
      console.error('Failed to get current audio device:', error);
      setCurrentAudioDevice(null);
    }
  };

  const loadAllAudioDevices = async () => {
    try {
      console.log('Calling get_audio_output_devices...');
      const devices = await invoke('get_audio_output_devices');
      console.log('All devices response:', devices);
      setAllAudioDevices(devices as AudioDevice[]);
    } catch (error) {
      console.error('Failed to get audio devices:', error);
      setAllAudioDevices([]);
    }
  };

  const handleSwitchDevice = async (device: AudioDevice) => {
    try {
      await invoke('set_audio_device', { deviceId: device.id });
      // 重新加载当前设备信息
      await loadCurrentAudioDevice();
      console.log(`Switched to device: ${device.name}`);
    } catch (error) {
      console.error('Failed to switch audio device:', error);
    }
  };

  return (
    <main className="container">
      <Box mt={4}>
        <Typography variant="h6" gutterBottom>
          当前音频输出设备: {currentAudioDevice ? currentAudioDevice.name : '加载中...'}
          {currentAudioDevice?.is_default && <Chip label="默认" size="small" color="primary" sx={{ ml: 1 }} />}
        </Typography>
        <Typography variant="h6" gutterBottom>
          所有音频设备
        </Typography>
        <List>
          {allAudioDevices.map((device) => (
            <ListItem
              key={device.id}
              onClick={() => handleSwitchDevice(device)}
              sx={{
                cursor: 'pointer',
                backgroundColor: device.is_default ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
                '&:hover': {
                  backgroundColor: 'rgba(0, 0, 0, 0.04)'
                }
              }}
            >
              <ListItemText
                primary={device.name}
                secondary={device.id}
              />
              {device.is_default && <Chip label="当前默认" size="small" color="primary" />}
            </ListItem>
          ))}
        </List>
      </Box>
    </main>
  );
}

export default App;
