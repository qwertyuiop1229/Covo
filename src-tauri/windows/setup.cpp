// Native Covo setup/maintenance shell. No WebView2 is needed to run this UI.
// Installation is delegated to the embedded, version-matched NSIS engine.
#define UNICODE
#define _UNICODE
#include <windows.h>
#include <commctrl.h>
#include <shellapi.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <tlhelp32.h>
#include <bcrypt.h>
#include <dwmapi.h>
#include <filesystem>
#include <fstream>
#include <thread>
#include <vector>
#include <string>
#include <stdexcept>
#include <cstring>
#include "setup_version.h"
#pragma comment(lib, "comctl32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "advapi32.lib")
#pragma comment(lib, "bcrypt.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "uuid.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "gdi32.lib")
#pragma comment(lib, "dwmapi.lib")
#pragma comment(linker, "/manifestdependency:\"type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'\"")
namespace fs = std::filesystem;
static constexpr wchar_t registryKey[] = L"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Covo";
static HWND root, statusText, actionButton, closeButton, eraseCheck, progress;
static HBRUSH background;
static HFONT font, headingFont;
static bool working = false, completed = false;
static bool lightTheme = false;
static bool navyTheme = false;
static COLORREF backgroundColor() { return lightTheme ? RGB(247,248,250) : navyTheme ? RGB(30,41,59) : RGB(30,31,34); }
static COLORREF accentColor() { return lightTheme ? RGB(71,82,196) : RGB(165,180,252); }
static bool progressOnly = false;
static HANDLE progressProcess = nullptr;
static std::wstring failure;
static constexpr UINT doneMessage = WM_APP + 1;
static HICON brandIcon;

static LRESULT CALLBACK progressProcedure(HWND window,UINT message,WPARAM wparam,LPARAM lparam) {
  switch(message) {
  case PBM_SETMARQUEE: {
    KillTimer(window,1);BOOL animated=TRUE;SystemParametersInfoW(SPI_GETCLIENTAREAANIMATION,0,&animated,0);
    if(wparam && animated)SetTimer(window,1,16,nullptr);InvalidateRect(window,nullptr,FALSE);return TRUE;
  }
  case WM_TIMER: InvalidateRect(window,nullptr,FALSE);return 0;
  case WM_SHOWWINDOW: if(!wparam)KillTimer(window,1);break;
  case WM_ERASEBKGND: return 1;
  case WM_PAINT: {
    PAINTSTRUCT paint;HDC dc=BeginPaint(window,&paint);RECT area;GetClientRect(window,&area);
    FillRect(dc,&area,background);HBRUSH track=CreateSolidBrush(lightTheme?RGB(226,230,237):navyTheme?RGB(44,58,80):RGB(56,58,64));
    auto brush=SelectObject(dc,track);auto pen=SelectObject(dc,GetStockObject(NULL_PEN));
    RoundRect(dc,0,0,area.right,area.bottom,8,8);SelectObject(dc,brush);DeleteObject(track);
    BOOL animated=TRUE;SystemParametersInfoW(SPI_GETCLIENTAREAANIMATION,0,&animated,0);
    const int width=area.right,segment=width/3;
    const double phase=animated?static_cast<double>(GetTickCount64()%1600)/1600.0:0.5;
    const int position=static_cast<int>((width+segment)*phase)-segment;
    HRGN clip=CreateRoundRectRgn(0,0,width,area.bottom,8,8);SelectClipRgn(dc,clip);
    HBRUSH accent=CreateSolidBrush(accentColor());brush=SelectObject(dc,accent);RoundRect(dc,position,0,position+segment,area.bottom,8,8);
    SelectObject(dc,brush);SelectObject(dc,pen);SelectClipRgn(dc,nullptr);DeleteObject(accent);DeleteObject(clip);EndPaint(window,&paint);return 0;
  }
  case WM_DESTROY: KillTimer(window,1);return 0;
  }
  return DefWindowProcW(window,message,wparam,lparam);
}

static std::wstring readRegistry(const wchar_t* name) {
  wchar_t value[32768] = {}; DWORD bytes = sizeof(value);
  if (RegGetValueW(HKEY_CURRENT_USER, registryKey, name, RRF_RT_REG_SZ, nullptr, value, &bytes) != ERROR_SUCCESS) return {};
  return value;
}
static fs::path modulePath() {
  wchar_t value[32768] = {}; if (!GetModuleFileNameW(nullptr, value, 32768)) throw std::runtime_error("module-path");
  return fs::path(value);
}
static fs::path installedDirectory() {
  auto value = readRegistry(L"InstallLocation");
  if (value.empty()) return {};
  if (value.size() >= 2 && value.front() == L'"' && value.back() == L'"') value = value.substr(1, value.size() - 2);
  if (value.find(L'"') != std::wstring::npos) throw std::runtime_error("invalid-install-path");
  fs::path path(value);
  if (!path.is_absolute() || path == path.root_path() || value.rfind(L"\\\\", 0) == 0) throw std::runtime_error("invalid-install-path");
  return fs::weakly_canonical(path);
}
static bool isApplicationRunning(const fs::path& directory) {
  if (directory.empty()) return false;
  HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snapshot == INVALID_HANDLE_VALUE) throw std::runtime_error("process-snapshot");
  PROCESSENTRY32W entry = { sizeof(entry) }; bool found = false;
  if (Process32FirstW(snapshot, &entry)) do {
    if (entry.th32ProcessID == GetCurrentProcessId()) continue;
    HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, entry.th32ProcessID);
    if (!process) continue;
    wchar_t executable[32768]; DWORD count = 32768;
    if (QueryFullProcessImageNameW(process, 0, executable, &count)) {
      const fs::path candidate(executable);
      if (_wcsicmp(candidate.parent_path().c_str(), directory.c_str()) == 0 && _wcsicmp(candidate.filename().c_str(), L"CovoMaintenance.exe") != 0 && _wcsicmp(candidate.filename().c_str(), L"uninstall.exe") != 0) found = true;
    }
    CloseHandle(process);
  } while (!found && Process32NextW(snapshot, &entry));
  CloseHandle(snapshot); return found;
}
static DWORD runEngine(const fs::path& executable, const std::wstring& args) {
  std::wstring command = L"\"" + executable.wstring() + L"\" " + args;
  STARTUPINFOW startup = { sizeof(startup) }; PROCESS_INFORMATION process = {};
  if (!CreateProcessW(executable.c_str(), command.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW, nullptr, executable.parent_path().c_str(), &startup, &process)) throw std::runtime_error("start-engine");
  CloseHandle(process.hThread); WaitForSingleObject(process.hProcess, INFINITE);
  DWORD result = 1; GetExitCodeProcess(process.hProcess, &result); CloseHandle(process.hProcess);
  return result;
}
static void removeOwnedDirectory(const fs::path& directory) {
  if (!fs::exists(directory)) return;
  // Never traverse junctions/symlinks into another application's or backup data.
  const auto attributes = GetFileAttributesW(directory.c_str());
  if (attributes == INVALID_FILE_ATTRIBUTES) return;
  if (attributes & FILE_ATTRIBUTE_REPARSE_POINT) { RemoveDirectoryW(directory.c_str()); return; }
  for (const auto& item : fs::directory_iterator(directory)) {
    const auto flags = GetFileAttributesW(item.path().c_str());
    if (flags & FILE_ATTRIBUTE_DIRECTORY) removeOwnedDirectory(item.path());
    else if (!DeleteFileW(item.path().c_str())) throw std::runtime_error("delete-file");
  }
  if (!RemoveDirectoryW(directory.c_str())) throw std::runtime_error("delete-directory");
}
static void eraseDeviceData() {
  for (const auto& known : { FOLDERID_LocalAppData, FOLDERID_RoamingAppData }) {
    PWSTR location = nullptr;
    if (FAILED(SHGetKnownFolderPath(known, 0, nullptr, &location))) throw std::runtime_error("appdata-path");
    const fs::path base(location); CoTaskMemFree(location);
    const fs::path target = (base / L"com.simplechat.desktop").lexically_normal();
    if (!base.is_absolute() || target.parent_path() != base || target.filename() != L"com.simplechat.desktop") throw std::runtime_error("unsafe-data-path");
    removeOwnedDirectory(target);
  }
}
#ifndef COVO_MAINTENANCE
static fs::path extractEngine(fs::path& temporaryDirectory) {
  HRSRC resource = FindResourceW(nullptr, MAKEINTRESOURCEW(101), RT_RCDATA);
  if (!resource) throw std::runtime_error("missing-engine");
  HGLOBAL loaded = LoadResource(nullptr, resource); const auto length = SizeofResource(nullptr, resource);
  const auto bytes = static_cast<const unsigned char*>(LockResource(loaded));
  if (!bytes || length < 500000) throw std::runtime_error("incomplete-engine");
  BCRYPT_ALG_HANDLE algorithm = nullptr; unsigned char hash[32] = {};
  if (BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) < 0) throw std::runtime_error("hash-provider");
  const auto hashed = BCryptHash(algorithm, nullptr, 0, const_cast<PUCHAR>(bytes), length, hash, sizeof(hash));
  BCryptCloseAlgorithmProvider(algorithm, 0);
  if (hashed < 0) throw std::runtime_error("hash-failed");
  constexpr unsigned char expected[32] = { COVO_ENGINE_SHA256 };
  if (memcmp(hash, expected, sizeof(hash))) throw std::runtime_error("engine-integrity");
  wchar_t base[32768], unique[32768];
  if (!GetTempPathW(32768, base) || !GetTempFileNameW(base, L"cvo", 0, unique)) throw std::runtime_error("temp-path");
  DeleteFileW(unique); if (!CreateDirectoryW(unique, nullptr)) throw std::runtime_error("temp-directory");
  temporaryDirectory = unique; const auto destination = temporaryDirectory / L"CovoEngine.exe";
  std::ofstream file(destination, std::ios::binary); file.write(reinterpret_cast<const char*>(bytes), length); file.close();
  if (!file) throw std::runtime_error("extract-engine");
  return destination;
}
#endif
static void perform(bool erase) {
  fs::path temporary;
  try {
    const auto installed = installedDirectory();
    if (isApplicationRunning(installed)) throw std::runtime_error("Covoをトレイの「終了」で閉じてから、もう一度操作してください。");
#ifdef COVO_MAINTENANCE
    if (installed.empty()) throw std::runtime_error("インストール先が見つかりません。");
    const auto engine = installed / L"uninstall.exe";
    if (!fs::is_regular_file(engine) || fs::is_symlink(engine)) throw std::runtime_error("アンインストーラーが見つかりません。Covoセットアップから修復してください。");
    const DWORD result = runEngine(engine, L"/S _?=" + installed.wstring());
    if (result != 0 && result != 3010) throw std::runtime_error("アンインストールを完了できませんでした。");
    DeleteFileW(engine.c_str()); RemoveDirectoryW(installed.c_str());
    if (erase) eraseDeviceData();
#else
    const auto engine = extractEngine(temporary);
    const DWORD result = runEngine(engine, installed.empty() ? L"/S /COVOSETUP" : L"/S /UPDATE /COVOSETUP");
    if (result != 0 && result != 3010) throw std::runtime_error("インストールを完了できませんでした。空き容量とネットワーク接続を確認してください。");
#endif
    if (!temporary.empty()) removeOwnedDirectory(temporary);
    PostMessageW(root, doneMessage, 0, 0);
  } catch (const std::exception& error) {
    const int length = MultiByteToWideChar(CP_UTF8, 0, error.what(), -1, nullptr, 0);
    std::vector<wchar_t> text(length > 0 ? length : 1);
    MultiByteToWideChar(CP_UTF8, 0, error.what(), -1, text.data(), static_cast<int>(text.size()));
    failure = text.data(); PostMessageW(root, doneMessage, 1, 0);
  }
}
static HWND control(const wchar_t* type, const wchar_t* text, DWORD style, int x, int y, int width, int height, int id) {
  HWND item = CreateWindowW(type, text, WS_CHILD | WS_VISIBLE | style, x, y, width, height, root, reinterpret_cast<HMENU>(static_cast<INT_PTR>(id)), nullptr, nullptr);
  SendMessageW(item, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE); return item;
}
static LRESULT CALLBACK procedure(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
  switch (message) {
  case WM_CREATE: {
    root = window;
    DWORD light = 0, length = sizeof(light);
    RegGetValueW(HKEY_CURRENT_USER, L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", L"AppsUseLightTheme", RRF_RT_REG_DWORD, nullptr, &light, &length);
    lightTheme = light != 0; background = CreateSolidBrush(lightTheme ? RGB(255, 255, 255) : RGB(30, 31, 34));
    wchar_t savedTheme[32] = {}; DWORD themeBytes = sizeof(savedTheme);
    if (RegGetValueW(HKEY_CURRENT_USER, L"Software\\Covo", L"AppTheme", RRF_RT_REG_SZ, nullptr, savedTheme, &themeBytes) == ERROR_SUCCESS) {
      lightTheme = !_wcsicmp(savedTheme, L"light"); navyTheme = !_wcsicmp(savedTheme, L"dark-navy");
    }
    DeleteObject(background); background = CreateSolidBrush(backgroundColor());
    font = CreateFontW(-16, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET, 0, 0, CLEARTYPE_QUALITY, 0, L"Segoe UI");
    headingFont = CreateFontW(-32, 0, 0, 0, FW_SEMIBOLD, FALSE, FALSE, FALSE, DEFAULT_CHARSET, 0, 0, CLEARTYPE_QUALITY, 0, L"Segoe UI Variable");
    HWND title = control(L"STATIC", L"Covo", 0, 104, 31, 428, 48, 0); SendMessageW(title, WM_SETFONT, reinterpret_cast<WPARAM>(headingFont), TRUE);
#ifdef COVO_MAINTENANCE
    control(L"STATIC", progressOnly ? L"アップデート" : L"アンインストール", 0, 36, 90, 490, 30, 0);
    statusText = control(L"STATIC", progressOnly ? L"Covoの更新を適用しています。\n完了後にアプリが再起動します。" : L"Covoを削除します。暗号鍵と端末の履歴は標準で保持します。", 0, 36, 132, 490, 60, 0);
    if (!progressOnly) eraseCheck = control(L"BUTTON", L"端末の暗号鍵・履歴・送信待ちも完全に削除する", BS_AUTOCHECKBOX | WS_TABSTOP, 36, 202, 490, 30, 10);
    actionButton = control(L"BUTTON", L"アンインストール", BS_OWNERDRAW | WS_TABSTOP, 322, 316, 210, 42, 1);
    if (progressOnly) ShowWindow(actionButton, SW_HIDE);
#else
    control(L"STATIC", L"セットアップ  " COVO_SETUP_VERSION, 0, 36, 90, 490, 30, 0);
    statusText = control(L"STATIC", L"会話を、いつでもすぐそばに。\n既存の設定・暗号鍵・履歴を保持してインストールします。", 0, 36, 136, 490, 84, 0);
    actionButton = control(L"BUTTON", L"インストール / 修復", BS_OWNERDRAW | WS_TABSTOP, 322, 316, 210, 42, 1);
#endif
    progress = control(L"CovoSetupProgress", L"", 0, 36, 260, 496, 8, 0);
    ShowWindow(progress, SW_HIDE);
    closeButton = control(L"BUTTON", progressOnly ? L"終了" : L"キャンセル", BS_OWNERDRAW | WS_TABSTOP, 168, 316, 140, 42, 2);
    if(progressOnly)ShowWindow(closeButton,SW_HIDE);
    SetFocus(progressOnly ? closeButton : actionButton); return 0;
  }
  case WM_CTLCOLORSTATIC: case WM_CTLCOLORBTN:
    SetTextColor(reinterpret_cast<HDC>(wparam), lightTheme ? RGB(32, 35, 43) : RGB(242, 243, 245)); SetBkColor(reinterpret_cast<HDC>(wparam), backgroundColor()); return reinterpret_cast<LRESULT>(background);
  case WM_DRAWITEM: {
    auto item = reinterpret_cast<DRAWITEMSTRUCT*>(lparam);
    if (item->CtlType != ODT_BUTTON) break;
    const bool primary = item->CtlID == 1, disabled = (item->itemState & ODS_DISABLED) != 0;
    HBRUSH fill = CreateSolidBrush(primary ? (disabled ? RGB(100, 116, 139) : accentColor()) : lightTheme ? RGB(237, 239, 243) : navyTheme ? RGB(44,58,80) : RGB(49,51,56));
    auto oldBrush = SelectObject(item->hDC, fill); auto oldPen = SelectObject(item->hDC, GetStockObject(NULL_PEN));
    RECT buttonRect=item->rcItem;if(item->itemState & ODS_SELECTED)OffsetRect(&buttonRect,0,1);
    RoundRect(item->hDC, buttonRect.left, buttonRect.top, buttonRect.right, buttonRect.bottom, 20, 20);
    SelectObject(item->hDC, oldPen); SelectObject(item->hDC, oldBrush); DeleteObject(fill); SetBkMode(item->hDC, TRANSPARENT);
    SetTextColor(item->hDC, primary && !disabled ? (lightTheme ? RGB(255,255,255) : backgroundColor()) : !lightTheme || primary ? RGB(255,255,255) : RGB(32,35,43)); SelectObject(item->hDC, font);
    wchar_t label[128]; GetWindowTextW(item->hwndItem, label, 128); DrawTextW(item->hDC, label, -1, &item->rcItem, DT_CENTER | DT_VCENTER | DT_SINGLELINE);
    if (item->itemState & ODS_FOCUS) { RECT focus = item->rcItem; InflateRect(&focus, -3, -3); HPEN ring=CreatePen(PS_SOLID,1,primary?(lightTheme?RGB(255,255,255):backgroundColor()):accentColor());auto pen=SelectObject(item->hDC,ring);auto brush=SelectObject(item->hDC,GetStockObject(NULL_BRUSH));RoundRect(item->hDC,focus.left,focus.top,focus.right,focus.bottom,16,16);SelectObject(item->hDC,brush);SelectObject(item->hDC,pen);DeleteObject(ring); }
    return TRUE;
  }
  case WM_ERASEBKGND: { RECT area; GetClientRect(window, &area); FillRect(reinterpret_cast<HDC>(wparam), &area, background); return 1; }
  case WM_PAINT: {
    PAINTSTRUCT paint;HDC dc=BeginPaint(window,&paint);
    if(brandIcon)DrawIconEx(dc,36,28,brandIcon,52,52,0,nullptr,DI_NORMAL);
    HPEN line=CreatePen(PS_SOLID,1,lightTheme?RGB(225,228,234):navyTheme?RGB(59,73,96):RGB(56,58,64));auto pen=SelectObject(dc,line);MoveToEx(dc,36,296,nullptr);LineTo(dc,532,296);SelectObject(dc,pen);DeleteObject(line);
    EndPaint(window,&paint);return 0;
  }
  case WM_COMMAND:
    if (LOWORD(wparam) == 2 && !working) { DestroyWindow(window); return 0; }
    if (LOWORD(wparam) == 1 && !working) {
      working = true; EnableWindow(actionButton, FALSE); EnableWindow(closeButton, FALSE); if (eraseCheck) EnableWindow(eraseCheck, FALSE);
      ShowWindow(closeButton,SW_HIDE);ShowWindow(actionButton,SW_HIDE);
      SetWindowTextW(statusText, L"処理中です。この画面を閉じずにお待ちください。\n必要な構成の導入には数分かかる場合があります。");
      ShowWindow(progress, SW_SHOW); SendMessageW(progress, PBM_SETMARQUEE, TRUE, 40);
      const bool erase = eraseCheck && SendMessageW(eraseCheck, BM_GETCHECK, 0, 0) == BST_CHECKED;
      std::thread([erase] { perform(erase); }).detach(); return 0;
    }
    break;
  case doneMessage:
    if (progressOnly && wparam == 0) { completed = true; DestroyWindow(window); return 0; }
    working = false; completed = wparam == 0; ShowWindow(progress, SW_HIDE); EnableWindow(closeButton, TRUE); SetWindowTextW(closeButton, L"終了");
    if(!completed)ShowWindow(closeButton,SW_SHOW);
    SetWindowTextW(statusText, completed ? L"完了しました。この画面は自動で閉じます。" : failure.c_str());
    if(completed){ShowWindow(closeButton,SW_HIDE);ShowWindow(actionButton,SW_HIDE);SetTimer(window,2,1600,nullptr);}
    if (!completed && !progressOnly) {EnableWindow(actionButton, TRUE);ShowWindow(actionButton,SW_SHOW);} SetFocus(closeButton); return 0;
  case WM_TIMER: if(wparam==2&&completed){KillTimer(window,2);DestroyWindow(window);}return 0;
  case WM_NCHITTEST: {const LRESULT hit=DefWindowProcW(window,message,wparam,lparam);POINT point={static_cast<short>(LOWORD(lparam)),static_cast<short>(HIWORD(lparam))};ScreenToClient(window,&point);return hit==HTCLIENT&&point.y<104?HTCAPTION:hit;}
  case WM_CLOSE: return 0;
  case WM_DESTROY: DeleteObject(font); DeleteObject(headingFont); DeleteObject(background); PostQuitMessage(0); return 0;
  }
  return DefWindowProcW(window, message, wparam, lparam);
}
int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR arguments, int) {
  // Maintenance must run outside the installation directory so NSIS can remove it.
#ifdef COVO_MAINTENANCE
  try {
    int count = 0; auto argv = CommandLineToArgvW(GetCommandLineW(), &count);
    bool quiet = false, update = false, engineRequest = false;
    bool resetData = false;
    for (int index = 1; argv && index < count; index++) {
      if (!_wcsicmp(argv[index], L"--reset-data")) resetData = true;
      if (!_wcsicmp(argv[index], L"--update-progress") && index + 1 < count) {
        wchar_t* end = nullptr; const auto value = wcstoul(argv[index + 1], &end, 10);
        if (!end || *end || value <= 4 || value == GetCurrentProcessId()) { LocalFree(argv); return 1; }
        progressProcess = OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, value);
        if (!progressProcess) { LocalFree(argv); return 1; }
        progressOnly = true;
      }
      if (!_wcsicmp(argv[index], L"/S") || !_wcsicmp(argv[index], L"/P") || !_wcsicmp(argv[index], L"--silent")) quiet = true;
      if (!_wcsicmp(argv[index], L"/UPDATE") || !_wcsicmp(argv[index], L"--update")) { quiet = true; update = true; }
      if (!_wcsicmp(argv[index], L"--engine-request") || !_wcsnicmp(argv[index], L"_?=", 3)) engineRequest = true;
    }
    if (argv) LocalFree(argv);
    if (resetData) {
      const auto installedPath = installedDirectory();
      if (installedPath.empty() || isApplicationRunning(installedPath)) return 1;
      eraseDeviceData(); return 0;
    }
    const auto installed = progressOnly ? fs::path() : installedDirectory();
    if (!installed.empty() && _wcsicmp(modulePath().parent_path().c_str(), installed.c_str()) == 0) {
      wchar_t base[32768], unique[32768];
      if (!GetTempPathW(32768, base) || !GetTempFileNameW(base, L"cvm", 0, unique)) return 1;
      DeleteFileW(unique); const fs::path copied = fs::path(unique).replace_extension(L".exe");
      if (!CopyFileW(modulePath().c_str(), copied.c_str(), TRUE)) return 1;
      if (quiet || engineRequest) {
        const auto result = runEngine(copied, std::wstring(L"--engine-request") + (quiet ? L" --silent" : L"") + (update ? L" --update" : L""));
        DeleteFileW(copied.c_str()); return static_cast<int>(result);
      }
      SHELLEXECUTEINFOW launch = { sizeof(launch) }; launch.fMask = SEE_MASK_NOCLOSEPROCESS; launch.lpFile = copied.c_str(); launch.nShow = SW_SHOWNORMAL;
      if (!ShellExecuteExW(&launch)) return 1; if (launch.hProcess) CloseHandle(launch.hProcess); return 0;
    }
    if (quiet) {
      if (installed.empty() || isApplicationRunning(installed)) return 1;
      const auto engine = installed / L"uninstall.exe";
      if (!fs::is_regular_file(engine) || fs::is_symlink(engine)) return 1;
      return static_cast<int>(runEngine(engine, std::wstring(L"/S") + (update ? L" /UPDATE" : L"") + L" _?=" + installed.wstring()));
    }
  } catch (...) { return 1; }
#else
  if (std::wstring(arguments) == L"/S") { fs::path temp; try { const auto engine = extractEngine(temp); const auto result = runEngine(engine, L"/S"); removeOwnedDirectory(temp); return static_cast<int>(result); } catch (...) { return 1; } }
#endif
  INITCOMMONCONTROLSEX controls = { sizeof(controls), ICC_PROGRESS_CLASS }; InitCommonControlsEx(&controls);
  brandIcon=static_cast<HICON>(LoadImageW(instance,MAKEINTRESOURCEW(201),IMAGE_ICON,64,64,LR_SHARED));SetCurrentProcessExplicitAppUserModelID(L"app.covo.setup");
  WNDCLASSW progressType={};progressType.lpfnWndProc=progressProcedure;progressType.hInstance=instance;progressType.lpszClassName=L"CovoSetupProgress";RegisterClassW(&progressType);
  WNDCLASSW type = {}; type.lpfnWndProc = procedure; type.hInstance = instance; type.lpszClassName = L"CovoSetupWindow"; type.hIcon=brandIcon;type.hCursor = LoadCursor(nullptr, IDC_ARROW); RegisterClassW(&type);
  HWND window = CreateWindowExW(WS_EX_APPWINDOW, type.lpszClassName, L"Covo", WS_POPUP, CW_USEDEFAULT, CW_USEDEFAULT, 568, 394, nullptr, nullptr, instance, nullptr);
  SendMessageW(window,WM_SETICON,ICON_BIG,reinterpret_cast<LPARAM>(brandIcon));SendMessageW(window,WM_SETICON,ICON_SMALL,reinterpret_cast<LPARAM>(brandIcon));
  if (!window) return 1;
  POINT pointer; GetCursorPos(&pointer); MONITORINFO monitor = { sizeof(monitor) };
  if (GetMonitorInfoW(MonitorFromPoint(pointer, MONITOR_DEFAULTTONEAREST), &monitor)) {
    RECT rectangle; GetWindowRect(window, &rectangle);
    SetWindowPos(window, nullptr, monitor.rcWork.left + ((monitor.rcWork.right - monitor.rcWork.left) - (rectangle.right - rectangle.left)) / 2,
      monitor.rcWork.top + ((monitor.rcWork.bottom - monitor.rcWork.top) - (rectangle.bottom - rectangle.top)) / 2, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
  }
  BOOL dark = !lightTheme; DwmSetWindowAttribute(window, 20, &dark, sizeof(dark));
  const DWORD roundedCorners=2;DwmSetWindowAttribute(window,33,&roundedCorners,sizeof(roundedCorners));
  HANDLE mutex = CreateMutexW(nullptr, FALSE, L"Local\\CovoSetupMaintenance");
  if (mutex && GetLastError() == ERROR_ALREADY_EXISTS) {
    DestroyWindow(window); CloseHandle(mutex); return 1;
  }
  ShowWindow(window, SW_SHOW); UpdateWindow(window);
  if (progressOnly) {
    working = true; EnableWindow(closeButton, FALSE);
    ShowWindow(actionButton, SW_HIDE); if (eraseCheck) ShowWindow(eraseCheck, SW_HIDE);
    SetWindowTextW(closeButton, L"閉じる");
    SetWindowTextW(statusText, L"Covoの更新を適用しています。\n完了後にアプリが再起動します。");
    ShowWindow(progress, SW_SHOW); SendMessageW(progress, PBM_SETMARQUEE, TRUE, 40);
    std::thread([] {
      WaitForSingleObject(progressProcess, INFINITE); DWORD code = 1;
      GetExitCodeProcess(progressProcess, &code); CloseHandle(progressProcess);
      if (code != 0 && code != 3010) failure = L"更新を完了できませんでした。Covoセットアップから修復してください。";
      PostMessageW(root, doneMessage, code != 0 && code != 3010, 0);
    }).detach();
  }
  MSG message;
  while (GetMessageW(&message, nullptr, 0, 0) > 0) {
    if (message.message == WM_KEYDOWN && message.wParam == VK_ESCAPE) { SendMessageW(window, WM_CLOSE, 0, 0); continue; }
    if (message.message == WM_KEYDOWN && message.wParam == VK_RETURN && (GetFocus() == actionButton || GetFocus() == closeButton)) {
      SendMessageW(window, WM_COMMAND, GetDlgCtrlID(GetFocus()), 0); continue;
    }
    if (!IsDialogMessageW(window, &message)) { TranslateMessage(&message); DispatchMessageW(&message); }
  }
  if (mutex) CloseHandle(mutex);
  return completed ? 0 : 1;
}
