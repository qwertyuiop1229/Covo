# Secret exposure audit — 2026-10-25

## Scope and result

- GitHub metadata identifies `qwertyuiop1229/Covo` as public. The old `simplechat` URL resolves to the same repository.
- Read-only remote inspection returned 641 branch/tag ref lines, representing 638 unique objects. Missing public tags were fetched locally; no commits or tags were pushed.
- Gitleaks v8.30.1, downloaded from its official release and checked against the published SHA-256 checksum, scanned all locally available refs with `--all --full-history -m`. It reported 688 scanned commits and 66.45 MB of patches. The reachable graph contains 691 commits; scanner counts are not a claim that every commit contains a patch.
- The 358 historical detections comprise 265 Google API-key detections and 93 generic API-key detections. Reviewed detections are Firebase configuration keys or public Web Push VAPID keys, including copies in old reports and Repomix snapshots. No private-key or credential-token detection was found. The initial current Git-eligible snapshot likewise contained public configuration detections only.
- Actual `.cache/dev-preview/tls/root-key.pem` and `server-key.pem` are ignored and are not tracked. No tracked development private-key file was found. Neither `public/` publication root includes the development TLS directory.
- Release workflow signing uses GitHub Secrets references, rather than a literal signing private key in source. Secret values held by GitHub/Cloudflare are not readable through this audit and were not exported.

## Preventive changes

- Extended Git exclusions for local environment files, private-key containers, service-account credentials and SSH private-key filenames. Exclusions do not remove already tracked files.
- Added `npm run check:secrets`: checks tracked/unignored Git inputs and independently walks `public/`, including ignored files. It rejects sensitive filenames, recognized private-key material, private JWKs, selected token/literal formats, symlinks and unexpected publication roots. Errors contain paths/categories only, never matched values.
- The release script runs this check after Repomix and before staging; Firebase/native frontend bundle preparation runs it before cache reuse or rebuilding.
- Added explicit sensitive-file exclusions to Repomix and Firebase Hosting, plus refusal of sensitive filenames in the local preview static server. Public CA certificate download remains available; private keys remain outside the static root.
- Checks run locally without uploading repository contents or key material. They do not add Firebase traffic or runtime telemetry.

## Validation

- `npm run check:secrets`: passed.
- `node scripts/build_firebase.mjs --if-needed`: passed.
- Playwright secret-safety, development-workflow and CSS-cache suites: 14 passed. Coverage includes force-staged ignored keys, ignored files under `public/`, embedded private keys, private JWKs, secret redaction, unexpected hosting roots and preview HTTP denial. Existing certificate download, HTTPS, HTTP pipelining and proxy cancellation checks also passed.

## Limits

This is not proof of absence of every secret. Encoded/custom formats, encrypted archives and future bypasses require separate review. Historical Actions logs, every release binary/artifact, GitHub caches/forks/PR refs, external backups, other directories on the PC and malware were not exhaustively examined. Google Cloud API-key restrictions and enabled non-Firebase APIs were not verified; public Firebase configuration must not be treated as a replacement for authentication and authorization.

Protect all copies of the local CA private key, including backups. A stolen trusted CA key can support forged certificates when an attacker can redirect traffic; the public `.cer` alone cannot create signatures. If exposure is discovered, removing a file from the latest commit is insufficient: revoke/rotate affected credentials and remove the corresponding trusted CA on devices as appropriate.

No deployment, public push, credential rotation or certificate replacement was performed.
