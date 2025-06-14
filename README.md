# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Project Setup

### Prerequisites

- Node.js (LTS version recommended)
- Rust (latest stable version recommended)
- Tauri CLI (`cargo install tauri-cli --version "^2.0.0-beta"`)

### Development

To run the application in development mode:

1.  Navigate to the `frontend` directory and install dependencies:
    ```bash
    cd frontend
    npm install
    ```
2.  Go back to the project root and start the Tauri development server:
    ```bash
    cd ..
    cargo tauri dev
    ```

### Build

To build the application for production:

1.  Navigate to the `frontend` directory and build the frontend assets:
    ```bash
    cd frontend
    npm run build
    ```
2.  Go back to the project root and build the Tauri application:
    ```bash
    cd ..
    cargo tauri build
    ```

### Code Style and Quality Checks

To format your Rust code:

```bash
cargo +nightly fmt -- --config-path .\rustfmt.toml
```

To run Rust linter checks:

```bash
cargo clippy -- -D warnings
```

---

# Tauri + React + Typescript (中文)

此模板旨在帮助您开始使用 Tauri、React 和 Typescript 进行开发。

## 推荐的 IDE 设置

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 项目设置

### 先决条件

- Node.js (推荐 LTS 版本)
- Rust (推荐最新稳定版本)
- Tauri CLI (`cargo install tauri-cli --version "^2.0.0-beta"`)

### 开发

要在开发模式下运行应用程序：

1.  进入 `frontend` 目录并安装依赖：
    ```bash
    cd frontend
    npm install
    ```
2.  返回项目根目录并启动 Tauri 开发服务器：
    ```bash
    cd ..
    cargo tauri dev
    ```

### 构建

要构建生产环境应用程序：

1.  进入 `frontend` 目录并构建前端资源：
    ```bash
    cd frontend
    npm run build
    ```
2.  返回项目根目录并构建 Tauri 应用程序：
    ```bash
    cd ..
    cargo tauri build

### 代码风格和质量检查

格式化 Rust 代码：

```bash
cargo +nightly fmt -- --config-path .\rustfmt.toml
```

运行 Rust Lint 检查：

```bash
cargo clippy -- -D warnings
```
