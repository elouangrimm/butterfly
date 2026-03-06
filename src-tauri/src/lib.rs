use std::sync::Mutex;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

// ── Managed state ────────────────────────────────────────────────────────────

/// Holds the sidecar child process so it stays alive for the app's lifetime.
struct SidecarChild(Mutex<Option<CommandChild>>);

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Strip a PRONOTE URL down to its base directory, removing any .html page.
/// "https://host/pronote/eleve.html" → "https://host/pronote"
/// "https://host/pronote/"           → "https://host/pronote"
fn derive_pronote_base(url: &str) -> String {
    let s = url.trim_end_matches('/');
    if let Some(pos) = s.rfind('/') {
        let segment = &s[pos + 1..];
        if segment.contains('.') {
            return s[..pos].to_string();
        }
    }
    s.to_string()
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Open a native WebviewWindow pointed at the PRONOTE mobile page with all the
/// cookie injection and login-state hooks pre-loaded as an init script.
///
/// When PRONOTE's JS sets `window.loginState`, the init script navigates to
/// `butterfly://auth?state=<encoded-json>`.  The `on_navigation` callback
/// intercepts that URL, emits the "login-state" Tauri event to the main window,
/// and closes the auth window.
#[tauri::command]
fn open_auth_webview(
    app: tauri::AppHandle,
    pronote_url: String,
    device_uuid: String,
    jeton_cas: Option<String>,
) -> Result<(), String> {
    // Close any lingering auth window from a previous attempt
    if let Some(w) = app.get_webview_window("pronote-auth") {
        w.close().ok();
    }

    let base = derive_pronote_base(&pronote_url);
    let target = format!("{}/mobile.eleve.html?fd=1", base);
    let target_url: url::Url = target.parse().map_err(|e: url::ParseError| e.to_string())?;

    let has_cas = jeton_cas.is_some();
    let jeton = jeton_cas.unwrap_or_default();
    let uuid_json  = serde_json::to_string(&device_uuid).unwrap();
    let jeton_json = serde_json::to_string(&jeton).unwrap();

    // Injected into every page load of the auth webview (runs before page JS)
    let init_script = format!(
        r#"(function() {{
    var _uuid   = {uuid_json};
    var _jeton  = {jeton_json};
    var _hasCAS = {has_cas};
    var _far  = new Date(Date.now() + 365*24*60*60*1000).toUTCString();
    var _soon = new Date(Date.now() +   5*60*1000).toUTCString();

    // ── Cookie injection ─────────────────────────────────────────────────────
    document.cookie = "appliMobile=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "ielang=1036; expires=" + _far;
    if (_hasCAS) {{
        document.cookie = "validationAppliMobile=" + _jeton + "; expires=" + _soon;
        document.cookie = "uuidAppliMobile=" + _uuid + "; expires=" + _soon;
    }}

    // ── PRONOTE mobile hooks ─────────────────────────────────────────────────
    var _dev = JSON.stringify({{ uuid: _uuid, model: "Butterfly", platform: "Android" }});

    // Pre-hook: fires before GInterface is initialised by page scripts
    window.hookAccesDepuisAppli = function() {{
        try {{ this.passerEnModeValidationAppliMobile("", _uuid, void 0, void 0, _dev); }} catch(_e) {{}}
    }};

    // Post-hook: patch GInterface after page scripts run
    try {{ window.GInterface && window.GInterface.passerEnModeValidationAppliMobile("", _uuid, void 0, void 0, _dev); }} catch(_e) {{}}

    // ── Poll for loginState ──────────────────────────────────────────────────
    // PRONOTE sets window.loginState when mobile auth succeeds.
    // We communicate back to Tauri by navigating to a custom butterfly:// URL.
    var _t = setInterval(function() {{
        if (window.loginState && window.loginState.status === 0) {{
            clearInterval(_t);
            window.location.href =
                "butterfly://auth?state=" +
                encodeURIComponent(JSON.stringify(window.loginState));
        }}
    }}, 250);
}})();"#,
        uuid_json  = uuid_json,
        jeton_json = jeton_json,
        has_cas    = if has_cas { "true" } else { "false" },
    );

    let app_nav = app.clone();

    tauri::WebviewWindowBuilder::new(
        &app,
        "pronote-auth",
        tauri::WebviewUrl::External(target_url),
    )
    .title("Connexion EduConnect — Butterfly")
    .inner_size(960.0, 720.0)
    .center()
    .initialization_script(&init_script)
    .on_navigation(move |nav_url| {
        // Intercept butterfly://auth?state=... — do NOT let WebKit navigate there
        if nav_url.scheme() == "butterfly" && nav_url.host_str() == Some("auth") {
            let state = nav_url
                .query_pairs()
                .find(|(k, _)| k == "state")
                .map(|(_, v)| v.into_owned())
                .unwrap_or_default();

            // Broadcast to the main window (and any other listener)
            app_nav.emit("login-state", state).ok();

            // Close the auth window
            if let Some(w) = app_nav.get_webview_window("pronote-auth") {
                w.close().ok();
            }
            return false; // block the butterfly:// navigation
        }
        true // allow all other URLs
    })
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ── Entry point ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(SidecarChild(Mutex::new(None)))
        .setup(|app| {
            // ── Launch the Node.js API sidecar ───────────────────────────────
            let sidecar = app
                .shell()
                .sidecar("butterfly-server")
                .expect("butterfly-server sidecar binary not found — did you run `npm run build:sidecar`?");

            let (_rx, child) = sidecar
                .spawn()
                .expect("failed to spawn butterfly-server");

            // Store child so it lives as long as the app does
            *app.state::<SidecarChild>().0.lock().unwrap() = Some(child);

            // ── System tray ──────────────────────────────────────────────────
            let show_item =
                MenuItem::with_id(app, "show", "Afficher Butterfly", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_item =
                MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;

            let tray_menu = Menu::with_items(app, &[&show_item, &sep, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .tooltip("Butterfly — Pronote")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => std::process::exit(0),
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            w.show().ok();
                            w.set_focus().ok();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Left-click on the tray icon → show/raise main window
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            w.show().ok();
                            w.set_focus().ok();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        // Hide the window on close instead of quitting (tray keeps app alive)
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    window.hide().ok();
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![open_auth_webview])
        .run(tauri::generate_context!())
        .expect("error while running Butterfly");
}
