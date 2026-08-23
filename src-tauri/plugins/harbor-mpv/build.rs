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
                archives.push(path.join(path.file_stem().unwrap()));
            } else {
                archives.push(path.to_path_buf());
            }
        }
        assert!(!archives.is_empty(), "MPVKit iOS archives not found");
        let destination = std::path::Path::new(
            &std::env::var("TAURI_IOS_PROJECT_PATH").expect("TAURI_IOS_PROJECT_PATH is not set"),
        )
        .join("Externals/arm64")
        .join(std::env::var("PROFILE").unwrap());
        std::fs::create_dir_all(&destination).unwrap();
        let mut command = std::process::Command::new("/usr/bin/libtool");
        command.args(["-static", "-o"]);
        command.arg(destination.join("libHarborMPVKit.a"));
        assert!(command.args(archives).status().unwrap().success());
    }
}
