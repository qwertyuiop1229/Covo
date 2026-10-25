# UI, maintenance and update refinements — 2026-10-25

## Changes

- Link previews: maximum card width 340px, image height 128px, border-box sizing and parent-width constraints. Existing URL/title escaping and Worker OG retrieval are unchanged.
- Reinstall: clearer heading, explanation and data-preservation option; responsive option/action/status layout. Preserving device data remains the default, and destructive confirmation/signature checks remain required.
- Progress: update and reinstall share a theme-token progress style. Unknown-length progress no longer switches back to OS-native appearance (the source of the green bar). Activity animation uses a soft accent segment, honors reduced motion, and reports no invented percentage. Known-length progress displays actual download fractions.
- Administrator tabs: vertical wheel input moves overflowing tabs horizontally; native horizontal input, Ctrl+wheel and wheel input at an edge are released to the browser. Delegated binding works when the shared panel is moved between desktop/mobile settings and is not installed twice.
- Windows setup: refined subtitle/action wording and section separation. Existing branded icon, close guards, engine signature/hash verification and data-preservation behavior remain intact.
- A deferred Windows update has a theme-compatible green download button beside Inbox. During download it opens progress; when ready it explicitly applies the retained signed resource. Busy/maintenance guards remain enforced. App info remains another entry point. No duplicate download is needed to reopen the panel.

## Version-lock behavior

The existing storage key is retained for compatibility/recovery. The setting pauses automatic checks and new background downloads, including the delayed resume path and the case where the user enables it during an in-flight check. An already running download can finish. Explicit manual checking/download/application remains available. Compatibility-required updates continue to bypass this background pause, and installation is never automatic. Unlocking can resume ordinary checks. The setting is hidden from the web app, where it does not pin the served frontend version.

## Live maintenance and traffic

The old stop procedure removed the maintenance listener and went offline, preventing automatic release detection. The new watcher reads only `maintenance/enabled`:

- Normal use shares the existing application RTDB connection; one watcher is installed.
- When application traffic is stopped, the watcher is moved to an isolated anonymous control-only Firebase connection. The application RTDB connection is offline and Firestore networking is disabled. On admission, any control connection is returned to the shared connection and closed.
- Duplicate snapshots do not call the API. Changes trigger authenticated authoritative verification; the public boolean cannot grant access or confer admin privileges. Fast toggles are serialized, and replacement watchers wait for an older verification rather than accepting its stale result. Generation checks discard delayed attachment of an application listener after blocking.
- No polling, per-message signal reads, client signal writes or additional message copies were added. The JSON boolean itself is 4–5 bytes; that is **not** the total transfer size, which includes Firebase connection, framing and encryption overhead. Transitioning to the isolated connection has connection overhead, but an extra connection is not kept during normal use.
- If a previously active account was fully stopped, release triggers one automatic page reload to reinitialize the session safely. A blocked startup without an active session retries authentication initialization. The user does not need to refresh manually. Offline/suspended devices detect current state when connectivity resumes.

## Review and validation

Reviewed: public status remains read-only in existing RTDB rules; backend authorization remains authoritative; no client-supplied room/user ownership checks were weakened; key/outbox preservation and signed update checks are unchanged. Control monitoring never writes Firestore/RTDB. No new server deployment or rule relaxation is required by these client changes; the existing maintenance API and mirror must be deployed.

Full browser suite: 90 passed; subsequent focused suite covers the additional in-flight lock and watcher-replacement cases. Full unit suite: 231 passed, with further focused maintenance verification after connection-sharing cleanup. Secret guard, JavaScript parsing and CSS import hashing passed. Screenshots were checked in light, navy and Discord dark themes.

Native Windows C++ compilation/rendering still cannot be exercised here because MSVC is unavailable. Installer changes need CI/native verification. Automated notification/updater tests use mocks and do not prove OS delivery. No production data was modified; no push, deployment, installer execution or actual update installation was performed.
