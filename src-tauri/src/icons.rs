//! High-quality app icons via the Windows Shell (IShellItemImageFactory). Works for
//! .exe, .lnk, folders, Microsoft Store apps (shell:AppsFolder\…) and the default browser.

use base64::Engine;
use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Foundation::SIZE;
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
    DIB_RGB_COLORS, HGDIOBJ,
};
use windows::Win32::Storage::FileSystem::SearchPathW;
use windows::Win32::UI::Shell::{
    AssocQueryStringW, IShellItemImageFactory, SHCreateItemFromParsingName, ASSOCF_NONE, ASSOCSTR_EXECUTABLE,
    SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY,
};

use crate::util::{com_blocking, expand_env, wide};

/// Well-known targets for built-in system actions and bare commands.
fn known_target(t: &str) -> Option<String> {
    let windir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".into());
    Some(match t.to_lowercase().as_str() {
        "sys:file_explorer" | "explorer.exe" => format!("{windir}\\explorer.exe"),
        "sys:task_manager" | "taskmgr.exe" => format!("{windir}\\System32\\Taskmgr.exe"),
        "sys:settings" => "shell:AppsFolder\\windows.immersivecontrolpanel_cw5n1h2txyewy!microsoft.windows.immersivecontrolpanel".into(),
        "sys:snip" => "shell:AppsFolder\\Microsoft.ScreenSketch_8wekyb3d8bbwe!App".into(),
        "wt.exe" | "wt" => "shell:AppsFolder\\Microsoft.WindowsTerminal_8wekyb3d8bbwe!App".into(),
        "sys:lock" => format!("{windir}\\System32\\LockScreenContent"),
        _ => return None,
    })
}

pub fn default_browser_exe() -> Option<String> {
    unsafe {
        let assoc = wide("https");
        let verb = wide("open");
        let mut buf = vec![0u16; 1024];
        let mut len = buf.len() as u32;
        AssocQueryStringW(ASSOCF_NONE, ASSOCSTR_EXECUTABLE, PCWSTR(assoc.as_ptr()), PCWSTR(verb.as_ptr()), PWSTR(buf.as_mut_ptr()), &mut len)
            .ok()
            .ok()?;
        let s = String::from_utf16_lossy(&buf[..(len as usize).saturating_sub(1)]);
        (!s.is_empty()).then_some(s)
    }
}

fn search_path(name: &str) -> Option<String> {
    let n = wide(name);
    let mut buf = vec![0u16; 1024];
    let len = unsafe { SearchPathW(PCWSTR::null(), PCWSTR(n.as_ptr()), PCWSTR::null(), Some(&mut buf), None) };
    (len > 0 && (len as usize) < buf.len()).then(|| String::from_utf16_lossy(&buf[..len as usize]))
}

/// Candidate shell parsing names for a target, best first.
fn candidates(target: &str) -> Vec<String> {
    let t = expand_env(target.trim().trim_matches('"'));
    let mut out = Vec::new();
    if t.eq_ignore_ascii_case("browser:") {
        if let Some(b) = default_browser_exe() {
            out.push(b);
        }
        return out;
    }
    if let Some(k) = known_target(&t) {
        out.push(k);
    }
    if let Some(rest) = t.strip_prefix("shell:AppsFolder\\").or_else(|| t.strip_prefix("shell:appsfolder\\")) {
        out.push(format!("shell:AppsFolder\\{rest}"));
        out.push(format!("shell:::{{4234d49b-0245-4df3-b780-3893943456e1}}\\{rest}"));
    } else if !t.starts_with("sys:") {
        if std::path::Path::new(&t).exists() {
            out.push(t.clone());
        } else if !t.contains('\\') {
            if let Some(p) = search_path(&t) {
                out.push(p);
            }
        }
    }
    out
}

fn hbitmap_to_png(hbmp: windows::Win32::Graphics::Gdi::HBITMAP) -> Result<Vec<u8>, String> {
    unsafe {
        let mut bm = BITMAP::default();
        if GetObjectW(HGDIOBJ(hbmp.0), std::mem::size_of::<BITMAP>() as i32, Some(&mut bm as *mut _ as *mut _)) == 0 {
            return Err("Could not read icon bitmap".into());
        }
        let (w, h) = (bm.bmWidth, bm.bmHeight.abs());
        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut px = vec![0u8; (w * h * 4) as usize];
        let dc = CreateCompatibleDC(None);
        let lines = GetDIBits(dc, hbmp, 0, h as u32, Some(px.as_mut_ptr() as *mut _), &mut info, DIB_RGB_COLORS);
        let _ = DeleteDC(dc);
        if lines == 0 {
            return Err("Could not copy icon pixels".into());
        }
        let has_alpha = px.chunks_exact(4).any(|p| p[3] != 0);
        for p in px.chunks_exact_mut(4) {
            let (b, g, r, a) = (p[0], p[1], p[2], if has_alpha { p[3] } else { 255 });
            // Shell bitmaps are premultiplied BGRA: convert to straight RGBA.
            let un = |c: u8| if a == 0 { 0 } else { ((c as u32 * 255 + a as u32 / 2) / a as u32).min(255) as u8 };
            if has_alpha {
                p.copy_from_slice(&[un(r), un(g), un(b), a]);
            } else {
                p.copy_from_slice(&[r, g, b, 255]);
            }
        }
        let mut out = Vec::new();
        {
            let mut enc = png::Encoder::new(&mut out, w as u32, h as u32);
            enc.set_color(png::ColorType::Rgba);
            enc.set_depth(png::BitDepth::Eight);
            let mut wr = enc.write_header().map_err(|e| e.to_string())?;
            wr.write_image_data(&px).map_err(|e| e.to_string())?;
        }
        Ok(out)
    }
}

pub fn icon_png(target: &str, size: i32) -> Result<Vec<u8>, String> {
    let list = candidates(target);
    if list.is_empty() {
        return Err(format!("No icon source for \"{target}\""));
    }
    let mut last = String::new();
    for c in list {
        let name = wide(&c);
        let factory: Result<IShellItemImageFactory, _> = unsafe { SHCreateItemFromParsingName(PCWSTR(name.as_ptr()), None) };
        let Ok(factory) = factory else { last = format!("Windows can't find \"{c}\""); continue };
        match unsafe { factory.GetImage(SIZE { cx: size, cy: size }, SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK) } {
            Ok(hbmp) => {
                let png = hbitmap_to_png(hbmp);
                unsafe {
                    let _ = DeleteObject(HGDIOBJ(hbmp.0));
                }
                return png;
            }
            Err(e) => last = e.message().to_string(),
        }
    }
    Err(format!("No icon available: {last}"))
}

/// Returns a PNG data URL of the real icon for a path, shortcut, Store app (`shell:AppsFolder\…`),
/// bare command (`wt.exe`), system action (`sys:settings`) or the default browser (`browser:`).
#[tauri::command]
pub async fn extract_icon(path: String, size: Option<i32>) -> Result<String, String> {
    let size = size.unwrap_or(96).clamp(16, 256);
    com_blocking(move || {
        let png = icon_png(&path, size)?;
        Ok(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png)))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "uses the Windows shell"]
    fn e2e_real_icons() {
        crate::util::with_sta(|| {
            for t in ["explorer.exe", "sys:task_manager", "browser:", "C:\\Windows"] {
                let png = icon_png(t, 96).unwrap_or_else(|e| panic!("{t}: {e}"));
                assert!(png.starts_with(&[0x89, b'P', b'N', b'G']), "{t} not png");
                assert!(png.len() > 500, "{t} icon suspiciously small");
            }
        });
    }
}
