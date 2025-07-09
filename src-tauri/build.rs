fn main() {
    // 监听图标文件变化，强制重新构建
    println!("cargo:rerun-if-changed=icons/");
    println!("cargo:rerun-if-changed=icons/icon.png");
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/icon.icns");
    println!("cargo:rerun-if-changed=icons/32x32.png");
    println!("cargo:rerun-if-changed=icons/128x128.png");

    tauri_build::build()
}
