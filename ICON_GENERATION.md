# AudioCat 图标生成指南

本文档说明如何为 AudioCat 应用程序生成各种平台所需的图标文件。

## 前置要求

- **ImageMagick**：用于图标转换
  - 确保安装了 `librsvg` 支持以正确渲染 SVG
  - 检查命令：`magick -list delegate | findstr svg`
  - 应该看到：`svg => "rsvg-convert" --dpi-x %x --dpi-y %y -o "%o" "%i"`

## 源文件

- `audiocat-icon.svg` - 主图标源文件（128x128）
- `audiocat-icon-tray-optimized.svg` - 系统托盘优化版本（简化设计）

## 生成所有图标

### 方法一：批量生成（推荐）

```bash
# 生成所有 PNG 图标
magick -background none -density 300 audiocat-icon.svg -resize 32x32 src-tauri/icons/32x32.png
magick -background none -density 300 audiocat-icon.svg -resize 128x128 src-tauri/icons/128x128.png
magick -background none -density 300 audiocat-icon.svg -resize 256x256 src-tauri/icons/128x128@2x.png
magick -background none -density 300 audiocat-icon.svg -resize 128x128 src-tauri/icons/icon.png
magick -background none -density 300 audiocat-icon.svg -resize 128x128 src-tauri/icons/icon.ico

# Windows Store 图标
magick -background none -density 300 audiocat-icon.svg -resize 30x30 src-tauri/icons/Square30x30Logo.png
magick -background none -density 300 audiocat-icon.svg -resize 44x44 src-tauri/icons/Square44x44Logo.png
magick -background none -density 300 audiocat-icon.svg -resize 71x71 src-tauri/icons/Square71x71Logo.png
magick -background none -density 300 audiocat-icon.svg -resize 89x89 src-tauri/icons/Square89x89Logo.png
magick -background none -density 300 audiocat-icon.svg -resize 107x107 src-tauri/icons/Square107x107Logo.png
magick -background none -density 300 audiocat-icon.svg -resize 142x142 src-tauri/icons/Square142x142Logo.png
magick -background none -density 300 audiocat-icon.svg -resize 150x150 src-tauri/icons/Square150x150Logo.png
magick -background none -density 300 audiocat-icon.svg -resize 284x284 src-tauri/icons/Square284x284Logo.png
magick -background none -density 300 audiocat-icon.svg -resize 310x310 src-tauri/icons/Square310x310Logo.png
magick -background none -density 300 audiocat-icon.svg -resize 50x50 src-tauri/icons/StoreLogo.png

# macOS ICNS 文件
magick -background none -density 300 audiocat-icon.svg -resize 1024x1024 temp-1024.png
magick temp-1024.png src-tauri/icons/icon.icns
del temp-1024.png
```

### 方法二：PowerShell 批量命令

```powershell
# 生成所有 PNG 图标（PowerShell）
magick -background none -density 300 audiocat-icon.svg -resize 32x32 src-tauri/icons/32x32.png; `
magick -background none -density 300 audiocat-icon.svg -resize 128x128 src-tauri/icons/128x128.png; `
magick -background none -density 300 audiocat-icon.svg -resize 256x256 src-tauri/icons/128x128@2x.png; `
magick -background none -density 300 audiocat-icon.svg -resize 128x128 src-tauri/icons/icon.png; `
magick -background none -density 300 audiocat-icon.svg -resize 128x128 src-tauri/icons/icon.ico; `
magick -background none -density 300 audiocat-icon.svg -resize 30x30 src-tauri/icons/Square30x30Logo.png; `
magick -background none -density 300 audiocat-icon.svg -resize 44x44 src-tauri/icons/Square44x44Logo.png; `
magick -background none -density 300 audiocat-icon.svg -resize 71x71 src-tauri/icons/Square71x71Logo.png; `
magick -background none -density 300 audiocat-icon.svg -resize 89x89 src-tauri/icons/Square89x89Logo.png; `
magick -background none -density 300 audiocat-icon.svg -resize 107x107 src-tauri/icons/Square107x107Logo.png; `
magick -background none -density 300 audiocat-icon.svg -resize 142x142 src-tauri/icons/Square142x142Logo.png; `
magick -background none -density 300 audiocat-icon.svg -resize 150x150 src-tauri/icons/Square150x150Logo.png; `
magick -background none -density 300 audiocat-icon.svg -resize 284x284 src-tauri/icons/Square284x284Logo.png; `
magick -background none -density 300 audiocat-icon.svg -resize 310x310 src-tauri/icons/Square310x310Logo.png; `
magick -background none -density 300 audiocat-icon.svg -resize 50x50 src-tauri/icons/StoreLogo.png

# 生成 ICNS（PowerShell）
magick -background none -density 300 audiocat-icon.svg -resize 1024x1024 temp-1024.png; `
magick temp-1024.png src-tauri/icons/icon.icns; `
Remove-Item temp-1024.png
```

### 方法三：PowerShell 脚本

创建 `generate-icons.ps1` 文件：

```powershell
# generate-icons.ps1
Write-Host "正在生成 AudioCat 图标..." -ForegroundColor Green

$sizes = @(
    @{size="32x32"; file="32x32.png"},
    @{size="128x128"; file="128x128.png"},
    @{size="256x256"; file="128x128@2x.png"},
    @{size="128x128"; file="icon.png"},
    @{size="128x128"; file="icon.ico"},
    @{size="30x30"; file="Square30x30Logo.png"},
    @{size="44x44"; file="Square44x44Logo.png"},
    @{size="71x71"; file="Square71x71Logo.png"},
    @{size="89x89"; file="Square89x89Logo.png"},
    @{size="107x107"; file="Square107x107Logo.png"},
    @{size="142x142"; file="Square142x142Logo.png"},
    @{size="150x150"; file="Square150x150Logo.png"},
    @{size="284x284"; file="Square284x284Logo.png"},
    @{size="310x310"; file="Square310x310Logo.png"},
    @{size="50x50"; file="StoreLogo.png"}
)

foreach ($icon in $sizes) {
    Write-Host "生成 $($icon.file) ($($icon.size))" -ForegroundColor Yellow
    & magick -background none -density 300 audiocat-icon.svg -resize $icon.size "src-tauri/icons/$($icon.file)"
}

Write-Host "生成 ICNS 文件..." -ForegroundColor Yellow
& magick -background none -density 300 audiocat-icon.svg -resize 1024x1024 temp-1024.png
& magick temp-1024.png src-tauri/icons/icon.icns
Remove-Item temp-1024.png

Write-Host "图标生成完成！" -ForegroundColor Green
```

运行脚本：
```powershell
.\generate-icons.ps1
```

## 重要参数说明

- **`-background none`**：确保背景透明，避免白边
- **`-density 300`**：高 DPI 渲染，提高图标质量
- **参数顺序**：`-background none` 必须在输入文件之前

## 构建后处理

生成新图标后，必须清理构建缓存：

```bash
cargo clean
cargo tauri build
```

## 验证图标

检查图标是否有透明通道：

```powershell
# 检查是否有 Alpha 通道（PowerShell）
magick identify -verbose src-tauri/icons/128x128.png | Select-String "Alpha"

# 检查平均透明度（应该 > 0）
magick src-tauri/icons/128x128.png -format "%[fx:mean.a]" info:

# 检查所有图标文件是否存在
Get-ChildItem src-tauri/icons/ -Name
```

```bash
# Linux/macOS
magick identify -verbose src-tauri/icons/128x128.png | grep Alpha
magick src-tauri/icons/128x128.png -format "%[fx:mean.a]" info:
```

## 文件清单

生成的图标文件：

```
src-tauri/icons/
├── 32x32.png           # 32x32 标准图标
├── 128x128.png         # 128x128 标准图标
├── 128x128@2x.png      # 256x256 高分辨率图标
├── icon.png            # 通用图标
├── icon.ico            # Windows ICO 格式
├── icon.icns           # macOS ICNS 格式
├── Square30x30Logo.png # Windows Store 30x30
├── Square44x44Logo.png # Windows Store 44x44
├── Square71x71Logo.png # Windows Store 71x71
├── Square89x89Logo.png # Windows Store 89x89
├── Square107x107Logo.png # Windows Store 107x107
├── Square142x142Logo.png # Windows Store 142x142
├── Square150x150Logo.png # Windows Store 150x150
├── Square284x284Logo.png # Windows Store 284x284
├── Square310x310Logo.png # Windows Store 310x310
└── StoreLogo.png       # Windows Store Logo 50x50
```

## 故障排除

### 图标有白边
- 确保使用 `-background none` 参数
- 检查 SVG 源文件是否正确
- 验证 ImageMagick 的 SVG 支持

### 图标模糊
- 增加 `-density` 值（如 `-density 600`）
- 确保源 SVG 是矢量格式

### 构建后图标未更新
- 运行 `cargo clean` 清理缓存
- 重新构建应用程序
