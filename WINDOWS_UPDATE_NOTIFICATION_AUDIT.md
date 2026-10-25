# Windows update and notification changes — 2026-10-25

## Notification test

The test passed `true` as the fourth argument of `showNotification`, which is the server ID; the fifth `forceOs` argument remained false. A focused Chrome tab therefore suppressed its own test. The test now passes the correct arguments, awaits the result and reports an OS display request rather than claiming delivery. Browser permission denial and API failure remain visible failures. Native clients use the native API without requiring the browser Notification API.

Existing Service Worker registration lookup replaces the unbounded `serviceWorker.ready` wait. Lookup has a 1.5-second bound and direct Notification fallback; no registration polling or new server request is added. This is an on-device display test, not proof of FCM delivery or Windows notification settings. Focus assist and OS policy can suppress visible banners after an API call succeeds.

## Update flow and appearance

Downloaded updates retain their signed updater resource. Manual checks now reopen downloading/ready state instead of hiding it or replacing the app-info text with a permanent preparing message. App info changes its action to “更新画面を開く”. Reopening does not check or download again. Installation still requires the explicit restart action, and call/transfer/send guards remain enforced.

The panel uses Covo theme tokens, separate heading/status/help/actions, readable primary buttons and a rounded themed progress track. Known download lengths show actual percentages; unknown lengths remain indeterminate. The later action explains where to resume. The duplicate diagnostics settings entries and dedicated mobile detail are removed; reports remain in app info.

## Native installer, updater and uninstaller

- Embedded Covo icon resource in both setup and maintenance executables; window/taskbar icon and header use it.
- Centered frameless window without title-bar close/minimize buttons. Header can be dragged.
- Custom rounded progress track replaces the standard Windows progress control. The moving segment indicates activity, not a fabricated completion percentage. It respects the system animation preference and stops its timer on hiding/destruction. Microsoft documents the distinction between determinate and activity-only progress in its [progress control guidance](https://learn.microsoft.com/en-us/windows/win32/controls/progress-bar-control).
- Theme colors, typography, rounded buttons and keyboard focus indicator match the web update panel.
- Cancel remains available before installation/removal. Controls are hidden while processing and WM_CLOSE is ignored. Success closes automatically; failure leaves retry/exit available, so an error cannot trap the user.
- Signature checking, embedded-engine hash verification, installer execution and device-data preservation/deletion logic are unchanged.

## Verification and limits

- Full browser suite: 83 passed. Includes focused notification request, API failure, Service Worker fallback, later/reopen without duplicate download in three themes, progress reopening, and app-info diagnostics on phone/iPad/desktop.
- Unit suite: 228 passed. Secret guard and JavaScript/PowerShell parsing passed.
- Light/dark update panel and download progress screenshots were generated and visually inspected.
- Browser notification APIs and the updater package are mocked in automated tests; actual Windows notification delivery and native installation were not exercised.
- This PC has no discoverable MSVC C++ toolchain. Native C++ compilation, resource linking and frameless-window rendering still require Windows CI/build validation. No installer was run, no data was erased, and no push/deployment was performed.
