// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "tauri-plugin-harbor-mpv",
    platforms: [.macOS(.v12), .iOS(.v15)],
    products: [.library(name: "tauri-plugin-harbor-mpv", type: .static, targets: ["tauri-plugin-harbor-mpv"])],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api"),
        .package(url: "https://github.com/videolan/vlckit.git", exact: "4.0.0-a23")
    ],
    targets: [
        .target(
            name: "tauri-plugin-harbor-mpv",
            dependencies: [.byName(name: "Tauri"), .product(name: "VLCKit", package: "vlckit")],
            path: "Sources"
        )
    ]
)
