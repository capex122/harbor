use serde_json::Value;
use tauri::{plugin::Builder, AppHandle, Manager, Runtime};

tauri::ios_plugin_binding!(init_plugin_harbor_mpv);

struct HarborMpv<R: Runtime>(tauri::plugin::PluginHandle<R>);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CallRequest {
    method: String,
    args: Value,
}

#[tauri::command]
async fn call<R: Runtime>(app: AppHandle<R>, method: String, args: Value) -> Result<Value, String> {
    app.state::<HarborMpv<R>>()
        .0
        .run_mobile_plugin("call", CallRequest { method, args })
        .map_err(|error| error.to_string())
}

pub fn init<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    Builder::new("harbor-mpv")
        .invoke_handler(tauri::generate_handler![call])
        .setup(|app, api| {
            let handle = api.register_ios_plugin(init_plugin_harbor_mpv)?;
            app.manage(HarborMpv(handle));
            Ok(())
        })
        .build()
}
