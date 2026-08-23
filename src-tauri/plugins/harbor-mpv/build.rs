const COMMANDS: &[&str] = &["call"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).ios_path("ios").build();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
        let out_dir = std::env::var("OUT_DIR").unwrap();
        let output = std::process::Command::new("find")
            .args([
                out_dir.as_str(),
                "(",
                "-path",
                "*/ios-arm64/*.framework",
                "-o",
                "-path",
                "*/ios-arm64/libMoltenVK.a",
                ")",
                "!",
                "-path",
                "*/artifacts/mpvkit/*-GPL/*",
            ])
            .output()
            .unwrap();
        for path in String::from_utf8(output.stdout).unwrap().lines() {
            let path = std::path::Path::new(path);
            println!(
                "cargo:rustc-link-search={}={}",
                if path.is_dir() { "framework" } else { "native" },
                path.parent().unwrap().display()
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
        println!("cargo:rustc-link-lib=static=MoltenVK");
        for library in ["bz2", "iconv", "expat", "resolv", "xml2", "z", "c++"] {
            println!("cargo:rustc-link-lib={library}");
        }
    }
}
