use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::Serialize;
use std::{path::Path, time::Duration};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioChapter {
    title: String,
    start: f64,
    end: f64,
}

fn supported(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| {
            matches!(
                value.to_ascii_lowercase().as_str(),
                "m4b" | "m4a" | "mp3" | "aac" | "ogg" | "opus" | "flac" | "wav"
            )
        })
}

#[tauri::command]
pub async fn ebook_audio_cover(path: String) -> Result<Option<String>, String> {
    let source = std::fs::canonicalize(path).map_err(|_| "audiobook file not found".to_string())?;
    if !source.is_file() || !supported(&source) {
        return Err("unsupported audiobook file".into());
    }
    let ffmpeg = crate::transcode::locate_ffmpeg().ok_or_else(|| "ffmpeg not found".to_string())?;
    let mut command = tokio::process::Command::new(ffmpeg);
    command
        .args(["-nostdin", "-loglevel", "error", "-i"])
        .arg(source)
        .args([
            "-map",
            "0:v:0?",
            "-frames:v",
            "1",
            "-c:v",
            "mjpeg",
            "-q:v",
            "3",
            "-f",
            "image2pipe",
            "pipe:1",
        ])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());
    #[cfg(windows)]
    command.creation_flags(0x0800_0000);
    let output = tokio::time::timeout(Duration::from_secs(15), command.output())
        .await
        .map_err(|_| "cover extraction timed out".to_string())?
        .map_err(|error| format!("ffmpeg spawn: {error}"))?;
    if !output.status.success() || output.stdout.is_empty() {
        return Ok(None);
    }
    if output.stdout.len() > 5 * 1024 * 1024 {
        return Err("embedded cover is too large".into());
    }
    Ok(Some(format!(
        "data:image/jpeg;base64,{}",
        BASE64.encode(output.stdout)
    )))
}

#[tauri::command]
pub async fn ebook_audio_chapters(path: String) -> Result<Vec<AudioChapter>, String> {
    let source = std::fs::canonicalize(path).map_err(|_| "audiobook file not found".to_string())?;
    if !source.is_file() || !supported(&source) {
        return Err("unsupported audiobook file".into());
    }
    let ffprobe =
        crate::transcode::locate_ffprobe().ok_or_else(|| "ffprobe not found".to_string())?;
    let mut command = tokio::process::Command::new(ffprobe);
    command
        .args(["-v", "error", "-show_chapters", "-of", "json"])
        .arg(source)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());
    #[cfg(windows)]
    command.creation_flags(0x0800_0000);
    let output = tokio::time::timeout(Duration::from_secs(15), command.output())
        .await
        .map_err(|_| "chapter scan timed out".to_string())?
        .map_err(|error| format!("ffprobe spawn: {error}"))?;
    if !output.status.success() {
        return Err("chapter scan failed".into());
    }
    let value: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("chapter metadata: {error}"))?;
    Ok(value["chapters"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|chapter| {
            let start = chapter["start_time"].as_str()?.parse().ok()?;
            let end = chapter["end_time"].as_str()?.parse().ok()?;
            Some(AudioChapter {
                title: chapter["tags"]["title"]
                    .as_str()
                    .unwrap_or("Chapter")
                    .to_string(),
                start,
                end,
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restricts_cover_extraction_to_audio() {
        assert!(supported(Path::new("book.M4B")));
        assert!(!supported(Path::new("book.exe")));
    }
}
