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
        let mut archives = Vec::new();
        for path in String::from_utf8(output.stdout).unwrap().lines() {
            let path = std::path::Path::new(path);
            if path.is_dir() {
                println!(
                    "cargo:rustc-link-search=framework={}",
                    path.parent().unwrap().display()
                );
                archives.push(path.join(path.file_stem().unwrap()));
            } else {
                std::fs::copy(
                    path,
                    std::path::Path::new(&out_dir).join("libHarborMoltenVK.a"),
                )
                .unwrap();
                println!("cargo:rustc-link-search=native={out_dir}");
                archives.push(path.to_path_buf());
            }
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
        println!("cargo:rustc-link-lib=static=HarborMoltenVK");
        for library in ["bz2", "iconv", "expat", "resolv", "xml2", "z", "c++"] {
            println!("cargo:rustc-link-lib={library}");
        }
        assert!(!archives.is_empty(), "MPVKit iOS archives not found");
        let destination = std::path::Path::new(
            &std::env::var("TAURI_IOS_PROJECT_PATH").expect("TAURI_IOS_PROJECT_PATH is not set"),
        )
        .join("Externals/arm64")
        .join(std::env::var("PROFILE").unwrap());
        std::fs::create_dir_all(&destination).unwrap();
        let sdk = std::process::Command::new("xcrun")
            .args(["--sdk", "iphoneos", "--show-sdk-path"])
            .output()
            .unwrap();
        assert!(sdk.status.success(), "iPhoneOS SDK not found");
        let sdk =
            std::path::Path::new(std::str::from_utf8(&sdk.stdout).unwrap().trim()).join("usr/lib");
        for library in ["bz2", "iconv", "expat", "resolv", "xml2", "z", "c++"] {
            std::fs::copy(
                sdk.join(format!("lib{library}.tbd")),
                destination.join(format!("lib{library}.tbd")),
            )
            .unwrap();
        }
        let mut command = std::process::Command::new("/usr/bin/libtool");
        command.args(["-static", "-o"]);
        command.arg(destination.join("libHarborMPVKit.a"));
        assert!(command.args(archives).status().unwrap().success());
    }
}
