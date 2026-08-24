const COMMANDS: &[&str] = &["call"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).ios_path("ios").build();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
        let out_dir = std::env::var("OUT_DIR").unwrap();
        let slice = if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("sim") {
            "ios-arm64_x86_64-simulator"
        } else {
            "ios-arm64"
        };
        let pattern = format!("*/{slice}/VLCKit.framework");
        let output = std::process::Command::new("find")
            .args([out_dir.as_str(), "-path", &pattern])
            .output()
            .unwrap();
        let framework = String::from_utf8(output.stdout)
            .unwrap()
            .lines()
            .next()
            .map(std::path::PathBuf::from)
            .expect("VLCKit iOS framework not found");
        println!(
            "cargo:rustc-link-search=framework={}",
            framework.parent().unwrap().display()
        );
        println!("cargo:rustc-link-lib=framework=VLCKit");
        for framework in [
            "AVFoundation",
            "AudioToolbox",
            "CFNetwork",
            "CoreFoundation",
            "CoreGraphics",
            "CoreMedia",
            "CoreText",
            "CoreVideo",
            "Foundation",
            "OpenGLES",
            "QuartzCore",
            "Security",
            "UIKit",
            "VideoToolbox",
        ] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
        for library in ["bz2", "iconv", "xml2", "c++"] {
            println!("cargo:rustc-link-lib={library}");
        }
        let destination = std::path::Path::new(
            &std::env::var("TAURI_IOS_PROJECT_PATH").expect("TAURI_IOS_PROJECT_PATH is not set"),
        )
        .join("Externals/arm64")
        .join(std::env::var("PROFILE").unwrap())
        .join("VLCKit.framework");
        std::fs::create_dir_all(destination.parent().unwrap()).unwrap();
        let _ = std::fs::remove_dir_all(&destination);
        assert!(
            std::process::Command::new("ditto")
                .args([&framework, &destination])
                .status()
                .unwrap()
                .success(),
            "failed to stage VLCKit.framework"
        );
    }
}
