// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "tauri-plugin-harbor-mpv",
    platforms: [.iOS(.v15)],
    products: [.library(name: "tauri-plugin-harbor-mpv", type: .static, targets: ["tauri-plugin-harbor-mpv"])],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api"),
        .package(url: "https://github.com/mpvkit/MPVKit.git", from: "1.0.0")
    ],
    targets: [
        .target(
            name: "tauri-plugin-harbor-mpv",
            dependencies: [.byName(name: "Tauri"), .product(name: "MPVKit", package: "MPVKit")],
            path: "Sources"
        )
    ]
)
