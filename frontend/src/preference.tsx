import React from 'react';
import ReactDOM from 'react-dom/client';
import './App.css'; // 可以复用主应用的 CSS，或者创建新的 CSS 文件

function PreferenceApp() {
  return (
    <div className="container">
      <h1>偏好设置</h1>
      <p>这是偏好设置界面。</p>
      {/* 在这里添加您的偏好设置组件 */}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <PreferenceApp />
  </React.StrictMode>,
);