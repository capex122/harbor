use std::collections::HashMap;
use std::time::Duration;

const EXTRACT_TIMEOUT: Duration = Duration::from_secs(90);
const MAX_SRT_BYTES: usize = 4 * 1024 * 1024;

#[tauri::command]
pub async fn subtitle_extract(
    source: String,
    stream_index: Option<u32>,
    ff_index: Option<u32>,
    timestamps_only: Option<bool>,
    headers: Option<HashMap<String, String>>,
) -> Result<String, String> {
    let ffmpeg = crate::transcode::locate_ffmpeg().ok_or_else(|| "ffmpeg not found".to_string())?;
    let ordinal = stream_index.unwrap_or(0);
    let mut maps = ff_index
        .map(|i| vec![(format!("0:{}", i), i.to_string())])
        .unwrap_or_default();
    maps.push((format!("0:s:{}", ordinal), format!("s:{}", ordinal)));
    maps.dedup();
    let headers = headers.unwrap_or_default();
    let mut error = "no subtitle content extracted".to_string();
    for (map, _) in &maps {
        let mut cmd = tokio::process::Command::new(&ffmpeg);
        cmd.arg("-nostdin").arg("-loglevel").arg("error");
        apply_headers(&mut cmd, &headers);
        cmd.arg("-i")
            .arg(&source)
            .arg("-map")
            .arg(map)
            .arg("-f")
            .arg("srt")
            .arg("-");
        #[cfg(windows)]
        cmd.creation_flags(0x0800_0000);
        cmd.stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        let output = match tokio::time::timeout(EXTRACT_TIMEOUT, cmd.output()).await {
            Ok(Ok(o)) => o,
            Ok(Err(e)) => {
                error = format!("ffmpeg spawn: {}", e);
                continue;
            }
            Err(_) => {
                error = "subtitle extraction timed out".to_string();
                continue;
            }
        };
        if output.status.success() && !output.stdout.is_empty() {
            let mut bytes = output.stdout;
            if bytes.len() > MAX_SRT_BYTES {
                bytes.truncate(MAX_SRT_BYTES);
            }
            return Ok(String::from_utf8_lossy(&bytes).to_string());
        }
        error = format!(
            "ffmpeg failed: {}",
            String::from_utf8_lossy(&output.stderr)
                .chars()
                .take(200)
                .collect::<String>()
        );
    }
    if timestamps_only == Some(true) {
        for (_, selector) in maps {
            if let Ok(srt) = probe_timestamps(&source, &selector, &headers).await {
                return Ok(srt);
            }
        }
    }
    Err(error)
}

fn apply_headers(cmd: &mut tokio::process::Command, headers: &HashMap<String, String>) {
    let mut blob = String::new();
    for (k, v) in headers {
        if k.eq_ignore_ascii_case("user-agent") {
            cmd.arg("-user_agent").arg(v);
        } else {
            blob.push_str(&format!("{}: {}\r\n", k, v));
        }
    }
    if !blob.is_empty() {
        cmd.arg("-headers").arg(blob);
    }
}

async fn probe_timestamps(
    source: &str,
    selector: &str,
    headers: &HashMap<String, String>,
) -> Result<String, String> {
    let ffprobe =
        crate::transcode::locate_ffprobe().ok_or_else(|| "ffprobe not found".to_string())?;
    let mut cmd = tokio::process::Command::new(ffprobe);
    cmd.arg("-v").arg("error");
    apply_headers(&mut cmd, headers);
    cmd.arg("-select_streams")
        .arg(selector)
        .arg("-show_packets")
        .arg("-show_entries")
        .arg("packet=pts_time,duration_time")
        .arg("-of")
        .arg("csv=p=0")
        .arg(source);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);
    let output = match tokio::time::timeout(EXTRACT_TIMEOUT, cmd.output()).await {
        Ok(Ok(o)) => o,
        Ok(Err(e)) => return Err(format!("ffprobe spawn: {}", e)),
        Err(_) => return Err("subtitle timestamp probe timed out".to_string()),
    };
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let stamp = |s: f64| {
        let ms = (s.max(0.0) * 1000.0).round() as u64;
        format!(
            "{:02}:{:02}:{:02},{:03}",
            ms / 3_600_000,
            ms / 60_000 % 60,
            ms / 1000 % 60,
            ms % 1000
        )
    };
    let rows: Vec<_> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let mut v = line.split(',');
            Some((
                v.next()?.parse::<f64>().ok()?,
                v.next()
                    .and_then(|x| x.parse::<f64>().ok())
                    .filter(|d| *d > 0.0),
            ))
        })
        .collect();
    let mut srt = String::new();
    let mut i = 0;
    let mut n = 1;
    while i < rows.len() {
        let (start, duration) = rows[i];
        let paired = duration.is_none() && i + 1 < rows.len();
        let end = duration
            .map(|d| start + d)
            .unwrap_or_else(|| rows.get(i + 1).map(|r| r.0).unwrap_or(start + 2.0));
        srt.push_str(&format!(
            "{}\n{} --> {}\n.\n\n",
            n,
            stamp(start),
            stamp(end)
        ));
        i += if paired { 2 } else { 1 };
        n += 1;
    }
    if srt.is_empty() {
        Err("no subtitle timestamps found".to_string())
    } else {
        Ok(srt)
    }
}

const ASS_HEADER_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_ASS_BYTES: usize = 2 * 1024 * 1024;

#[tauri::command]
pub async fn subtitle_extract_ass(
    source: String,
    stream_index: Option<u32>,
    headers: Option<HashMap<String, String>>,
) -> Result<String, String> {
    let ffmpeg = crate::transcode::locate_ffmpeg().ok_or_else(|| "ffmpeg not found".to_string())?;
    let map = format!("0:s:{}", stream_index.unwrap_or(0));
    let mut cmd = tokio::process::Command::new(&ffmpeg);
    cmd.arg("-nostdin").arg("-loglevel").arg("error");
    if let Some(h) = &headers {
        if let Some(ua) = h.get("User-Agent").or_else(|| h.get("user-agent")) {
            cmd.arg("-user_agent").arg(ua);
        }
    }
    cmd.arg("-i")
        .arg(&source)
        .arg("-map")
        .arg(&map)
        .arg("-c:s")
        .arg("copy")
        .arg("-f")
        .arg("ass")
        .arg("-");
    #[cfg(windows)]
    {
        cmd.creation_flags(0x0800_0000);
    }
    cmd.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    let output = match tokio::time::timeout(ASS_HEADER_TIMEOUT, cmd.output()).await {
        Ok(Ok(o)) => o,
        Ok(Err(e)) => return Err(format!("ffmpeg spawn: {}", e)),
        Err(_) => return Err("ass header extraction timed out".to_string()),
    };
    let mut bytes = output.stdout;
    if bytes.len() > MAX_ASS_BYTES {
        bytes.truncate(MAX_ASS_BYTES);
    }
    let text = String::from_utf8_lossy(&bytes).to_string();
    if text.contains("[V4+ Styles]") || text.contains("[V4 Styles]") {
        return Ok(text);
    }
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "ffmpeg failed: {}",
            err.chars().take(200).collect::<String>()
        ));
    }
    Err("no ass header extracted".to_string())
}
