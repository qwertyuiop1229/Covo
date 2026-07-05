
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    dataLayer.push(arguments);
  }
  gtag("js", new Date());
  gtag("config", "G-RY7DKH85XG");


    // iPadのみ全体スクロールを完全に固定する
    if (/iPad/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints && navigator.maxTouchPoints > 1)) {
      document.documentElement.style.setProperty('overflow', 'hidden', 'important');
      document.body.style.setProperty('overflow', 'hidden', 'important');
    }
    
    // meta theme-color と html の背景色を動的に完全同期させる最強システム
    function updateMetaThemeColor() {
      const isDark = document.body.classList.contains('dark-server-theme') || document.documentElement.classList.contains('dark-server-theme');
      const inChat = document.body.classList.contains('in-chat-view');
      
      // 現在のベース背景色（RGB配列）を特定
      let baseRgb = inChat ? (isDark ? [26, 32, 44] : [255, 255, 255]) : (isDark ? [17, 24, 39] : [31, 41, 55]);
      let targetHex = isDark ? (inChat ? '#1a202c' : '#111827') : (inChat ? '#ffffff' : '#1f2937');
      let blendedHex = targetHex;

      // 1. メンバー一覧（#membersSidebar）が開いているかどうかを検知
      const membersSidebar = document.getElementById('membersSidebar');
      const isMembersOpen = membersSidebar && membersSidebar.classList.contains('bottom-sheet-open');

      // 2. ★アイコンタップ等で表示される「暗い背景のオーバーレイ・プレビュー・ポップアップ」がアクティブかどうかを検知
      let activeOverlayBg = null;
      let hasHigherModalOpen = false;

      const overlays = document.querySelectorAll('.modal-overlay, [id*="Modal"], [id*="Preview"], [id*="Overlay"], [id*="Popup"], [class*="modal"], [class*="backdrop"], [class*="bg-black"], [class*="bg-gray-900"]');
      for (let i = 0; i < overlays.length; i++) {
        const el = overlays[i];
        const style = window.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity > 0 && !el.classList.contains('hidden')) {
          if (style.position === 'fixed' || style.position === 'absolute') {
            const bg = style.backgroundColor;
            if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
              if (el.id !== 'bottomSheetOverlay') {
                activeOverlayBg = bg;
                hasHigherModalOpen = true;
                break;
              } else if (!isMembersOpen) {
                activeOverlayBg = bg;
              }
            }
          }
        }
      }

      // ★究極のステート優先順位判定：
      // (A) メンバー一覧の上にさらにアイコンタップ等で別のポップアップ・プレビューが開いた場合 -> 半透明グレー（ブレンド色）
      // (B) メンバー一覧だけが開いている場合 -> 下側の空白部分は絶対にメンバー一覧コンテナの背景色（ライトなら白色 #ffffff、ダークなら #1f2937）にする！
      if (hasHigherModalOpen || (activeOverlayBg && !isMembersOpen)) {
        const rgbaMatch = activeOverlayBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (rgbaMatch) {
          const r = parseInt(rgbaMatch[1], 10);
          const g = parseInt(rgbaMatch[2], 10);
          const b = parseInt(rgbaMatch[3], 10);
          const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;
          
          const blendedR = Math.round(r * a + baseRgb[0] * (1 - a));
          const blendedG = Math.round(g * a + baseRgb[1] * (1 - a));
          const blendedB = Math.round(b * a + baseRgb[2] * (1 - a));
          
          blendedHex = '#' + [blendedR, blendedG, blendedB].map(x => x.toString(16).padStart(2, '0')).join('');
        } else {
          blendedHex = '#71717a';
        }
      } else if (isMembersOpen) {
        blendedHex = isDark ? '#1f2937' : '#ffffff';
      }

      let metaTheme = document.getElementById('metaThemeColor') || document.querySelector('meta[name="theme-color"]');
      if (!metaTheme) {
        metaTheme = document.createElement('meta');
        metaTheme.name = 'theme-color';
        metaTheme.id = 'metaThemeColor';
        document.head.appendChild(metaTheme);
      }
      metaTheme.setAttribute('content', blendedHex);
      
      document.documentElement.classList.toggle('dark-server-theme', isDark);
      document.body.classList.toggle('dark-server-theme', isDark);
      
      if (hasHigherModalOpen || activeOverlayBg || isMembersOpen) {
        document.documentElement.style.setProperty('background-color', blendedHex, 'important');
        document.body.style.setProperty('background-color', blendedHex, 'important');
      } else {
        document.documentElement.style.removeProperty('background-color');
        document.body.style.removeProperty('background-color');
      }
    }

    // ダークテーマを最初のレンダリング前に適用（window.onload 待ちだとつなぎ目が見える）
    if (localStorage.getItem('covo_dark_server') === 'true') {
      document.body.classList.add('dark-server-theme');
      document.documentElement.classList.add('dark-server-theme');
    }
    updateMetaThemeColor();

    // どんな手段でクラスやテーマ、モーダルが開閉されても自動追従する MutationObserver システム
    const themeObserver = new MutationObserver(() => {
      updateMetaThemeColor();
    });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'], subtree: true });

    // iPhone 17 / iOS PWA での予期せぬ拡大（ピンチ＆ダブルタップズーム）を完全防止する最強防壁
    document.addEventListener('touchmove', function(event) {
      if (event.scale !== undefined && event.scale !== 1) {
        event.preventDefault();
      }
      if (event.touches && event.touches.length > 1) {
        event.preventDefault();
      }
    }, { passive: false });

    let lastTouchEnd = 0;
    document.addEventListener('touchend', function(event) {
      const now = (new Date()).getTime();
      if (now - lastTouchEnd <= 300) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    }, { passive: false });

    // =========================================================================
    // 🛡️ 最強フェイルセーフ：画面真っ白・起動フリーズを完全防止するシステムリカバリー＆ウォッチドッグ
    // =========================================================================
    window.__app_fully_loaded__ = false;

    window.showEmergencyRecoveryPanel = function(errMsg, errObj) {
      const panel = document.getElementById('emergencyRecoveryOverlay');
      if (!panel) return;
      panel.classList.remove('hidden');
      panel.style.display = 'flex';
      const detailArea = document.getElementById('emergencyErrorDetail');
      if (detailArea && errMsg) {
        detailArea.value = `エラー発生時刻: ${new Date().toLocaleString()}\nメッセージ: ${errMsg}\n詳細: ${errObj ? (errObj.stack || JSON.stringify(errObj)) : 'なし'}`;
      }
      if (typeof fetchGitHubReleasesHistory === 'function') {
        fetchGitHubReleasesHistory('emergencyPastVersions');
      }
    };

    window.addEventListener('error', function(e) {
      console.error('[Global Error Catcher]', e.message, e.error);
      if (!window.__app_fully_loaded__) {
        showEmergencyRecoveryPanel(e.message || 'JavaScript 実行エラー', e.error);
      }
    });

    window.addEventListener('unhandledrejection', function(e) {
      console.error('[Global Unhandled Rejection]', e.reason);
      if (!window.__app_fully_loaded__) {
        showEmergencyRecoveryPanel(e.reason?.message || '非同期処理エラー (Unhandled Rejection)', e.reason);
      }
    });

    // 8秒間のウォッチドッグタイマー：タイムアウト時に強制的にリカバリーパネルを展開
    setTimeout(function() {
      if (!window.__app_fully_loaded__) {
        console.warn('[Watchdog Timer] 8秒以内にアプリ起動完了フラグが確認できませんでした。リカバリーパネルを展開します。');
        showEmergencyRecoveryPanel('アプリ起動完了タイムアウト（フリーズまたは通信遮断の可能性）', null);
      }
    }, 8000);
  

    if (!window.__TAURI__) {
      const dNotif = document.getElementById('desktopNotifRow');
      if (dNotif) { dNotif.style.display = 'none'; }
    }
  
