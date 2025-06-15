import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import './App.css'; // 可以复用主应用的 CSS，或者创建新的 CSS 文件

const theme = createTheme({
  // 您可以在这里自定义 MUI 主题
});

function PreferenceApp() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        偏好设置
      </Typography>
      <Typography variant="body1">
        这是偏好设置界面。
      </Typography>
      {/* 在这里添加您的偏好设置组件 */}
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