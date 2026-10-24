#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationTarget {
    pub owner_id: Option<String>,
    pub server_id: Option<String>,
    pub room_id: Option<String>,
    pub dm_id: Option<String>,
}

fn escape_xml(value: &str) -> String {
    value
        .chars()
        .filter(|c| !c.is_control() || matches!(c, '\n' | '\r' | '\t'))
        .take(2000)
        .collect::<String>()
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[tauri::command]
pub fn send_desktop_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
    target: Option<NotificationTarget>,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::{
            core::HSTRING,
            Data::Xml::Dom::XmlDocument,
            UI::Notifications::{ToastNotification, ToastNotificationManager},
        };
        let mut url = url::Url::parse("covo-notification://open").map_err(|e| e.to_string())?;
        if let Some(target) = target {
            for (key, value) in [
                ("ownerId", target.owner_id),
                ("serverId", target.server_id),
                ("roomId", target.room_id),
                ("dmId", target.dm_id),
            ] {
                if let Some(value) = value {
                    url.query_pairs_mut().append_pair(key, &value);
                }
            }
        }
        // Protocol activation also works from Action Center and after process termination.
        let xml = format!("<toast activationType=\"protocol\" launch=\"{}\"><visual><binding template=\"ToastGeneric\"><text>{}</text><text>{}</text></binding></visual></toast>", escape_xml(url.as_str()), escape_xml(&title), escape_xml(&body));
        let doc = XmlDocument::new().map_err(|e| e.to_string())?;
        doc.LoadXml(&HSTRING::from(xml))
            .map_err(|e| e.to_string())?;
        let toast = ToastNotification::CreateToastNotification(&doc).map_err(|e| e.to_string())?;
        use std::hash::{Hash, Hasher};
        let mut tag = std::collections::hash_map::DefaultHasher::new();
        url.as_str().hash(&mut tag);
        toast
            .SetTag(&HSTRING::from(format!("{:016x}", tag.finish())))
            .map_err(|e| e.to_string())?;
        toast
            .SetGroup(&HSTRING::from("covo-messages"))
            .map_err(|e| e.to_string())?;
        let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(
            app.config().identifier.clone(),
        ))
        .map_err(|e| e.to_string())?;
        notifier.Show(&toast).map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        use tauri_plugin_notification::NotificationExt;
        let _ = target;
        app.notification()
            .builder()
            .title(title)
            .body(body)
            .show()
            .map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn toast_content_cannot_change_xml_structure() {
        assert_eq!(
            super::escape_xml("<a x=\"&\">'"),
            "&lt;a x=&quot;&amp;&quot;&gt;&apos;"
        );
    }
}
