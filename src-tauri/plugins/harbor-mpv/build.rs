const COMMANDS: &[&str] = &["call"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).ios_path("ios").build();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
        let output = std::process::Command::new("find")
            .args([
                std::env::var("OUT_DIR").unwrap().as_str(),
                "-type",
                "d",
                "-path",
                "*/ios-arm64/*.framework",
            ])
            .output()
            .unwrap();
        for path in String::from_utf8(output.stdout).unwrap().lines() {
            println!(
                "cargo:rustc-link-search=framework={}",
                std::path::Path::new(path).parent().unwrap().display()
            );
        }
        for framework in [
            "Libmpv",
            "Libuchardet",
            "Libbluray",
            "Libavcodec",
            "Libavdevice",
            "Libavfilter",
            "Libavformat",
            "Libavutil",
            "Libswresample",
            "Libswscale",
            "Libssl",
            "Libcrypto",
            "Libass",
            "Libfreetype",
            "Libfribidi",
            "Libharfbuzz",
            "MoltenVK",
            "Libshaderc_combined",
            "lcms2",
            "Libplacebo",
            "Libdovi",
            "Libunibreak",
            "gmp",
            "nettle",
            "hogweed",
            "gnutls",
            "Libdav1d",
            "Libuavs3d",
            "AVFoundation",
            "CoreAudio",
            "AudioToolbox",
            "CoreVideo",
            "CoreFoundation",
            "CoreMedia",
            "Metal",
            "VideoToolbox",
        ] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
        for library in ["bz2", "iconv", "expat", "resolv", "xml2", "z", "c++"] {
            println!("cargo:rustc-link-lib={library}");
        }
    }
}
