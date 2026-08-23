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
    }
}
