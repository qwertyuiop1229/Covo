// geo_study.js - 隠し機能の制御スクリプト

document.addEventListener('DOMContentLoaded', () => {
  setupHiddenTrigger();
});

function setupHiddenTrigger() {
  const pcTarget = document.getElementById('appInfoVersion');
  const mobileTarget = document.getElementById('mobileAppInfoVersion');
  const targets = [];
  if (pcTarget) targets.push(pcTarget);
  if (mobileTarget) targets.push(mobileTarget);

  if (targets.length === 0) return;

  let pressTimer = null;
  const triggerDuration = 3000; // 3 seconds
  let startX = 0;
  let startY = 0;

  const startPress = (e) => {
    if (e.type === 'mousedown' && e.button !== 0) return;
    if (e.touches && e.touches.length > 0) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      openGeoStudy();
    }, triggerDuration);
  };

  const cancelPress = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  };

  const movePress = (e) => {
    if (!pressTimer) return;
    if (e.touches && e.touches.length > 0) {
      const dx = Math.abs(e.touches[0].clientX - startX);
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (dx > 10 || dy > 10) cancelPress();
    }
  };

  targets.forEach(target => {
    target.addEventListener('mousedown', startPress);
    target.addEventListener('touchstart', startPress, {passive: true});
    
    target.addEventListener('mouseup', cancelPress);
    target.addEventListener('mouseleave', cancelPress);
    target.addEventListener('touchend', cancelPress);
    target.addEventListener('touchcancel', cancelPress);
    target.addEventListener('touchmove', movePress, {passive: true});
    
    // スマホでの長押しによるテキスト選択やメニュー表示を防ぐ
    target.style.webkitUserSelect = 'none';
    target.style.userSelect = 'none';
    target.style.webkitTouchCallout = 'none';
    target.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
  });
}

let isGeoStudyInitialized = false;
let leafletMap = null;
let leafletMarker = null;
let currentAnswerLatLng = null;
let currentRoundId = 0;
let gameLayers = null;
let isGuessed = false;
let currentDistanceKm = 0;
let currentLocationData = null;

function openGeoStudy() {
  const container = document.getElementById('geoStudyContainer');
  if (!container) return;
  
  // モーダル等が重ならないように最高前面へ
  container.classList.remove('hidden');
  container.style.display = 'flex';
  
  // 起動時アニメーション
  container.classList.add('gs-fade-in');
  setTimeout(() => container.classList.remove('gs-fade-in'), 500);
  
  if (!isGeoStudyInitialized) {
    buildGeoStudyUI(container);
    loadDependencies().then(() => {
      startNewLocation();
    });
    isGeoStudyInitialized = true;
  } else {
    // 既に初期化されている場合、前回回答済み状態なら自動で新規ゲームを開始
    if (isGuessed || !currentAnswerLatLng) {
      startNewLocation();
    } else if (leafletMap) {
      setTimeout(() => {
        if (leafletMap) leafletMap.invalidateSize();
      }, 100);
    }
  }
}

function closeGeoStudy() {
  const container = document.getElementById('geoStudyContainer');
  if (container) {
    container.classList.add('hidden');
    container.style.display = 'none';
    
    // ウィンドウを閉じたときにリセット
    closeResultOverlay();
    const postBar = document.getElementById('gs-post-guess-bar');
    if (postBar) postBar.classList.add('hidden');
    
    // 回答済みだった場合は、次回開いたときに前の線やピンが残らないようにクリーンアップ
    if (isGuessed) {
      clearGameMapLayers();
      isGuessed = false;
    }
  }
}

function buildGeoStudyUI(container) {
  container.innerHTML = `
    <div class="flex justify-between items-center p-4 bg-gray-900 border-b border-gray-800 shrink-0">
      <div class="font-bold text-gray-200"><i class="fas fa-globe-americas mr-2"></i>げっさー</div>
      <button onclick="closeGeoStudy()" class="text-gray-400 hover:text-white p-2 transition"><i class="fas fa-times text-xl"></i></button>
    </div>
    
    <div class="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
      <!-- 写真表示エリア -->
      <div id="gs-photo-container" class="absolute inset-0 z-0 gs-swap-transition" onclick="if(isMapFullscreen) toggleMapSwap()">
        <!-- Panzoom適用要素 -->
        <div id="gs-photo-panzoom" class="w-full h-full bg-cover bg-center bg-no-repeat" style="transition: opacity 0.3s ease;"></div>
        
        <div id="gs-photo-overlay-icon" class="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/40 hidden cursor-pointer rounded-xl">
           <i class="fas fa-expand text-white text-3xl"></i>
        </div>
      </div>
      
      <!-- ローディング -->
      <div id="gs-loading" class="absolute inset-0 z-[10] flex items-center justify-center bg-gray-900/50 backdrop-blur-sm hidden">
         <div class="gs-spinner"></div>
      </div>

      <!-- コントロールパネル -->
      <div class="absolute top-4 right-4 z-[999] bg-gray-900/90 backdrop-blur rounded-xl p-3 border border-gray-700 shadow-xl w-48 flex flex-col gap-2">
        <div class="text-xs text-gray-400 font-bold">モード</div>
        <select id="gs-mode-select" class="w-full bg-gray-800 text-white rounded p-1.5 text-sm border border-gray-600 focus:outline-none focus:border-blue-500" onchange="closeResultOverlay(); startNewLocation()">
          <option value="photo">写真から推測</option>
        </select>
        <div class="text-xs text-gray-400 font-bold mt-1">難易度</div>
        <select id="gs-difficulty-select" class="w-full bg-gray-800 text-white rounded p-1.5 text-sm border border-gray-600 focus:outline-none focus:border-blue-500" onchange="closeResultOverlay(); startNewLocation()">
          <option value="easy">かんたん（首都など）</option>
          <option value="normal" selected>ふつう（主要都市）</option>
          <option value="hard">むずかしい（全地域）</option>
        </select>
        <div class="text-xs text-gray-400 mt-1">ヒント</div>
        <div id="gs-hint-text" class="text-xs text-gray-200 bg-gray-800 p-2 rounded border border-gray-700 max-h-20 overflow-y-auto break-words">読込中...</div>
        <button onclick="closeResultOverlay(); startNewLocation()" class="w-full mt-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-1.5 rounded-lg text-xs transition shadow border border-gray-600"><i class="fas fa-forward mr-1"></i>スキップ</button>
      </div>

      <!-- ミニマップ -->
      <div id="gs-minimap-container" class="absolute bottom-4 right-4 z-[999] w-48 h-32 md:w-80 md:h-64 rounded-xl border-2 border-gray-600 shadow-2xl overflow-hidden bg-gray-800 flex flex-col group cursor-crosshair gs-swap-transition"
           onmouseenter="if(!isMapFullscreen) this.classList.add('active-map')" 
           onmouseleave="this.classList.remove('active-map')">
        <div id="gs-map" class="flex-1 w-full bg-gray-200" style="min-height: 100px;"></div>
        <div class="bg-gray-900/95 text-white text-xs p-1.5 flex justify-center items-center shrink-0">
          <span id="gs-status-text" class="text-gray-300 font-bold text-[10px] md:text-xs text-center w-full">地図をクリックして拡大</span>
        </div>
      </div>
      
      <!-- 独立した決定ボタン -->
      <div class="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] flex justify-center w-full pointer-events-none">
         <button id="gs-guess-btn" onclick="submitGuess()" class="bg-indigo-600 hover:bg-indigo-500 text-white px-10 py-3 rounded-full font-bold transition-all shadow-[0_0_20px_rgba(79,70,229,0.5)] disabled:opacity-0 disabled:translate-y-4 disabled:scale-95 text-lg pointer-events-auto" disabled>決定</button>
      </div>

      <!-- 地図確認中の下部コントロールバー -->
      <div id="gs-post-guess-bar" class="hidden absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] flex items-center justify-center gap-3 w-full pointer-events-none">
         <button onclick="reopenResultOverlay()" class="bg-gray-800/95 hover:bg-gray-700 text-gray-200 hover:text-white px-6 py-3 rounded-full font-bold transition-all shadow-xl backdrop-blur-sm border border-gray-600 pointer-events-auto text-sm flex items-center gap-2">
            <i class="fas fa-chart-bar"></i>結果を見る
         </button>
         <button onclick="startNewLocation()" class="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-full font-bold transition-all shadow-[0_0_20px_rgba(79,70,229,0.5)] pointer-events-auto text-sm flex items-center gap-2">
            <i class="fas fa-forward"></i>次の問題へ
         </button>
      </div>
      
      <!-- 結果表示オーバーレイ (z-indexを1200に引き上げ、背後要素の突き抜けを防止) -->
      <div id="gs-result-overlay" class="hidden absolute inset-0 z-[1200] bg-gray-900/90 backdrop-blur-md flex items-center justify-center p-4">
         <div class="bg-gray-800 p-8 rounded-3xl border border-gray-700 text-center shadow-2xl max-w-sm w-full">
            <div class="w-16 h-16 bg-blue-500/20 rounded-2xl mx-auto flex items-center justify-center text-blue-400 text-3xl mb-4 border border-blue-500/30">
                <i class="fas fa-map-marker-alt"></i>
            </div>
            <h2 class="text-xl font-bold text-white mb-2">推測結果</h2>
            <div class="text-5xl font-bold text-blue-400 mb-1"><span id="gs-distance-text">--</span> <span class="text-xl">km</span></div>
            <div class="text-sm text-gray-400 mb-2">実際の場所との誤差距離</div>
            
            <div id="gs-result-answer" class="text-sm font-bold text-gray-200 bg-gray-900 p-3 rounded-xl mb-6 mt-4 border border-gray-700 select-text">正解: 判定中...</div>
            
            <div class="flex gap-3">
              <button onclick="viewResultOnMap()" class="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-xl transition text-sm flex items-center justify-center gap-1.5"><i class="fas fa-map"></i>地図を見る</button>
              <button onclick="event.stopPropagation(); closeResultOverlay(); startNewLocation();" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-xl transition shadow-lg text-sm flex items-center justify-center gap-1.5"><i class="fas fa-play mr-1"></i>次へ</button>
            </div>
         </div>
      </div>
    </div>
  `;
  
  // スマホでマップ外をタッチしたらマップを縮小する
  /*
  container.addEventListener('touchstart', (e) => {
      const minimap = document.getElementById('gs-minimap-container');
      if (minimap && !minimap.contains(e.target)) {
          minimap.classList.remove('active-map');
      }
  });
  */
}

let isMapFullscreen = false;
function toggleMapSwap() {
  const mapContainer = document.getElementById('gs-minimap-container');
  const photoContainer = document.getElementById('gs-photo-container');
  const photoOverlayIcon = document.getElementById('gs-photo-overlay-icon');
  
  isMapFullscreen = !isMapFullscreen;
  
  if (isMapFullscreen) {
    mapContainer.classList.add('is-fullscreen');
    photoContainer.classList.add('is-minimap');
    photoOverlayIcon.classList.remove('hidden');
    mapContainer.classList.remove('active-map');
    document.getElementById('gs-status-text').textContent = "地図をタップしてピンを刺す";
  } else {
    mapContainer.classList.remove('is-fullscreen');
    photoContainer.classList.remove('is-minimap');
    photoOverlayIcon.classList.add('hidden');
    document.getElementById('gs-status-text').textContent = "地図をクリックして拡大";
  }
  
  setTimeout(() => {
    if (leafletMap) leafletMap.invalidateSize();
  }, 500);
}

function loadDependencies() {
  return new Promise((resolve) => {
    // 既に読み込み済みの場合はマップ初期化を確認してスキップ
    if (window.L) {
      if (!leafletMap) initMap();
      resolve();
      return;
    }

    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    css.crossOrigin = '';
    document.head.appendChild(css);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    script.crossOrigin = '';
    script.onload = () => {
      initMap();
      resolve();
    };
    script.onerror = (e) => {
      console.error("Leaflet load error:", e);
      showLoading(false);
      const hint = document.getElementById('gs-hint-text');
      if (hint) hint.textContent = "地図ライブラリの読み込みに失敗しました。";
      resolve();
    };
    document.head.appendChild(script);
  });
}

let resultLine = null;
let resultMarker = null;

// 自前インラインSVGピンアイコン生成（外部画像URL依存・404破損の完全防止）
function createGuessIcon() {
  return L.divIcon({
    className: 'gs-custom-marker-wrapper',
    html: `
      <div style="position: relative; width: 32px; height: 42px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4));">
        <svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.163 0 0 7.163 0 16C0 26.5 16 42 16 42C16 42 32 26.5 32 16C32 7.163 24.837 0 16 0Z" fill="#3B82F6"/>
          <circle cx="16" cy="15" r="7" fill="white"/>
          <circle cx="16" cy="15" r="4" fill="#3B82F6"/>
        </svg>
      </div>
    `,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -38]
  });
}

function createAnswerIcon() {
  return L.divIcon({
    className: 'gs-custom-marker-wrapper',
    html: `
      <div style="position: relative; width: 32px; height: 42px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4));">
        <svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.163 0 0 7.163 0 16C0 26.5 16 42 16 42C16 42 32 26.5 32 16C32 7.163 24.837 0 16 0Z" fill="#EF4444"/>
          <circle cx="16" cy="15" r="7" fill="white"/>
          <circle cx="16" cy="15" r="4" fill="#EF4444"/>
        </svg>
      </div>
    `,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -38]
  });
}

// 全ゲームレイヤー（ピン・正解・ライン）の一括完全消去
function clearGameMapLayers() {
  if (gameLayers) {
    try { gameLayers.clearLayers(); } catch (_) {}
  }
  if (leafletMap) {
    if (leafletMarker) {
      try { leafletMap.removeLayer(leafletMarker); } catch (_) {}
    }
    if (resultMarker) {
      try { leafletMap.removeLayer(resultMarker); } catch (_) {}
    }
    if (resultLine) {
      try { leafletMap.removeLayer(resultLine); } catch (_) {}
    }
  }
  leafletMarker = null;
  resultMarker = null;
  resultLine = null;
}

function initMap() {
  const mapEl = document.getElementById('gs-map');
  if (!mapEl) return;
  
  if (leafletMap) {
    try { leafletMap.remove(); } catch (_) {}
    leafletMap = null;
    gameLayers = null;
  }

  // Leafletの初期化（世界ループ防止と境界固定）
  leafletMap = L.map(mapEl, {
    center: [20, 0],
    zoom: 2,
    minZoom: 2,
    maxZoom: 18,
    maxBounds: [[-85, -180], [85, 180]],
    maxBoundsViscosity: 1.0,
    worldCopyJump: false,
    zoomControl: false, // UIが狭いので非表示
    attributionControl: false // UIが狭いので非表示
  });
  
  // 右下に小さく帰属表示
  L.control.attribution({position: 'bottomleft', prefix: false}).addAttribution('&copy; OSM').addTo(leafletMap);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    minZoom: 2,
    maxZoom: 19,
    noWrap: true,
    bounds: [[-85, -180], [85, 180]]
  }).addTo(leafletMap);

  // ゲーム専用レイヤーグループを初期化してマップに追加
  gameLayers = L.layerGroup().addTo(leafletMap);

  leafletMap.on('click', (e) => {
    // 回答済み・結果確認中・地図確認中はピン移動・再推測を不可にする
    if (isGuessed) return;
    
    // 結果表示中は操作不可
    const resOverlay = document.getElementById('gs-result-overlay');
    if (resOverlay && !resOverlay.classList.contains('hidden')) return;
    
    // 全画面でない場合は、マップを拡大するだけ（ピンは刺さない）
    if (!isMapFullscreen) {
        toggleMapSwap();
        return;
    }
    
    // 既存の推測ピンを削除
    if (leafletMarker) {
      if (gameLayers) gameLayers.removeLayer(leafletMarker);
      else leafletMap.removeLayer(leafletMarker);
      leafletMarker = null;
    }
    const wrappedLatLng = e.latlng.wrap(); // 経度を -180〜180 に丸める
    leafletMarker = L.marker(wrappedLatLng, {
      icon: createGuessIcon()
    }).addTo(gameLayers || leafletMap);
    
    const guessBtn = document.getElementById('gs-guess-btn');
    if (guessBtn) {
      guessBtn.disabled = false;
      guessBtn.classList.remove('hidden');
      guessBtn.classList.add('animate-pulse');
      setTimeout(() => guessBtn.classList.remove('animate-pulse'), 1000);
    }
    
    const statusText = document.getElementById('gs-status-text');
    if (statusText) {
      statusText.textContent = "ピンを変更できます（決定ボタンを押して確定）";
      statusText.classList.add('text-indigo-400');
    }
  });
}

async function startNewLocation() {
  currentRoundId++;
  const thisRound = currentRoundId;
  isGuessed = false;
  currentAnswerLatLng = null;
  currentLocationData = null;
  currentDistanceKm = 0;
  showLoading(true);
  
  // 前問の画像を直ちに完全消去し、前回の画像が残る不具合を根本防止
  const panzoomEl = document.getElementById('gs-photo-panzoom');
  if (panzoomEl) panzoomEl.style.backgroundImage = 'none';
  const photoContainer = document.getElementById('gs-photo-container');
  if (photoContainer) {
    photoContainer.style.opacity = '0';
    photoContainer.classList.add('loading');
  }

  // マップのリセット（全レイヤー完全一括消去）
  clearGameMapLayers();
  
  const postBar = document.getElementById('gs-post-guess-bar');
  if (postBar) postBar.classList.add('hidden');

  const guessBtn = document.getElementById('gs-guess-btn');
  if (guessBtn) {
    guessBtn.disabled = true;
    guessBtn.classList.remove('hidden');
    guessBtn.classList.remove('animate-pulse');
  }

  const ansEl = document.getElementById('gs-result-answer');
  if (ansEl) ansEl.textContent = "正解: 判定中...";

  const distText = document.getElementById('gs-distance-text');
  if (distText) distText.textContent = "--";
  
  if (isMapFullscreen) {
      toggleMapSwap();
  }
  
  if (leafletMap) {
    leafletMap.setView([20, 0], 2);
    setTimeout(() => {
      if (leafletMap) leafletMap.invalidateSize();
    }, 400);
  }

  const statusText = document.getElementById('gs-status-text');
  if (statusText) {
    statusText.textContent = isMapFullscreen ? "地図をタップしてピンを刺す" : "地図をクリックして拡大";
    statusText.classList.remove('text-indigo-400');
  }
  
  const modeSelect = document.getElementById('gs-mode-select');
  const mode = modeSelect ? modeSelect.value : 'photo';
  
  if (mode === 'photo') {
    const photoContainer = document.getElementById('gs-photo-container');
    if (photoContainer) photoContainer.classList.add('loading');
    await loadNewPhoto(thisRound);
  }
  
  if (thisRound === currentRoundId) {
      showLoading(false);
  }
}

async function loadNewPhoto(roundId) {
  try {
    const difficulty = document.getElementById('gs-difficulty-select') ? document.getElementById('gs-difficulty-select').value : 'easy';
    let loc = null;
    let imgUrl = "";
    
    // Auto-generated JS からデータを取得
    let pool = window.EASY_LOCATIONS || [];
    if (difficulty === 'normal') pool = window.NORMAL_LOCATIONS || window.EASY_LOCATIONS || [];
    if (difficulty === 'hard') pool = window.HARD_LOCATIONS || window.NORMAL_LOCATIONS || window.EASY_LOCATIONS || [];
    
    // フォールバック（スクリプト未ロード時でも多様に出題）
    if (!pool || pool.length === 0) {
        pool = [
            { name: "エッフェル塔, パリ (フランス)", lat: 48.8584, lng: 2.2945, q: "Eiffel Tower", imgUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Tour_Eiffel_Wikimedia_Commons.jpg/800px-Tour_Eiffel_Wikimedia_Commons.jpg" },
            { name: "富士山, 日本", lat: 35.3606, lng: 138.7274, q: "Mount Fuji", imgUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/080103_hakkai_fuji.jpg/800px-080103_hakkai_fuji.jpg" },
            { name: "自由の女神像, ニューヨーク (アメリカ)", lat: 40.6892, lng: -74.0445, q: "Statue of Liberty", imgUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Statue_of_Liberty_7.jpg/800px-Statue_of_Liberty_7.jpg" },
            { name: "コロッセオ, ローマ (イタリア)", lat: 41.8902, lng: 12.4922, q: "Colosseum", imgUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Colosseum_in_Rome-April_2007-1-_copie_2B.jpg/800px-Colosseum_in_Rome-April_2007-1-_copie_2B.jpg" },
            { name: "タージ・マハル, アーグラ (インド)", lat: 27.1751, lng: 78.0421, q: "Taj Mahal", imgUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Taj_Mahal_%28Edited%29.jpeg/800px-Taj_Mahal_%28Edited%29.jpeg" },
            { name: "シドニー・オペラハウス, シドニー (オーストラリア)", lat: -33.8568, lng: 151.2153, q: "Sydney Opera House", imgUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Sydney_Opera_House_-_Dec_2008.jpg/800px-Sydney_Opera_House_-_Dec_2008.jpg" },
            { name: "ギザの大ピラミッド, カイロ (エジプト)", lat: 29.9792, lng: 31.1342, q: "Great Pyramid of Giza", imgUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Kheops-Pyramid.jpg/800px-Kheops-Pyramid.jpg" },
            { name: "サグラダ・ファミリア, バルセロナ (スペイン)", lat: 41.4036, lng: 2.1744, q: "Sagrada Familia", imgUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/Sagrada_Familia_01.jpg/800px-Sagrada_Familia_01.jpg" }
        ];
    }
    
    // 直近に出題された問題を除外して抽選（2問連続同じ問題の出現を完全防止）
    window._gsRecentLocationHistory = window._gsRecentLocationHistory || [];
    let candidatePool = pool.filter(p => !window._gsRecentLocationHistory.includes(p.name));
    if (candidatePool.length === 0) {
      window._gsRecentLocationHistory = [];
      candidatePool = pool;
    }

    loc = candidatePool[Math.floor(Math.random() * candidatePool.length)];
    currentLocationData = loc;
    window._gsRecentLocationHistory.push(loc.name);
    const maxHistory = Math.max(1, Math.min(30, Math.floor(pool.length / 2)));
    if (window._gsRecentLocationHistory.length > maxHistory) {
      window._gsRecentLocationHistory.shift();
    }

    currentAnswerLatLng = L.latLng(loc.lat, loc.lng);
    imgUrl = loc.imgUrl;
    
    if (roundId !== currentRoundId) return; // 非同期処理中にスキップされた場合は中断
    
    if (imgUrl && typeof imgUrl === 'string') {
      const photoEl = document.getElementById('gs-photo-container');
      const panzoomEl = document.getElementById('gs-photo-panzoom');
      if (photoEl) photoEl.style.opacity = '0';
      if (panzoomEl) panzoomEl.style.backgroundImage = 'none';

      let safeImgUrl = imgUrl.trim();
      if (safeImgUrl.startsWith("http://")) safeImgUrl = "https://" + safeImgUrl.substring(7);
      if (!safeImgUrl.startsWith("https://")) {
        showLoading(false);
        return;
      }
      
      // Special:FilePath 画像の場合はサムネイルパラメータ (?width=1000) を確実に付与・維持（数十MBの巨大原寸大取得によるエラーを防止）
      if (safeImgUrl.includes("Special:FilePath")) {
        if (!safeImgUrl.includes("?width=") && !safeImgUrl.includes("&width=")) {
          safeImgUrl += (safeImgUrl.includes("?") ? "&" : "?") + "width=1000";
        }
      }
      // URLサニタイズ（CSSインジェクション防止）
      safeImgUrl = encodeURI(decodeURI(safeImgUrl)).replace(/['"()]/g, encodeURIComponent);
      
      // Panzoom初期化
      if (window.Panzoom && panzoomEl) {
        if (window.geoStudyPanzoom) {
          try { window.geoStudyPanzoom.destroy(); } catch (_) {}
          window.geoStudyPanzoom = null;
        }

        window.geoStudyPanzoom = Panzoom(panzoomEl, {
            maxScale: 20,
            minScale: 1,
            step: 0.2,
            contain: 'outside'
        });
        
        const panzoomContainer = panzoomEl.parentElement;
        if (panzoomContainer) {
          panzoomContainer.style.touchAction = 'none';
          panzoomContainer.onwheel = window.geoStudyPanzoom.zoomWithWheel;
        }
        
        let lastTap = 0;
        const handleDoubleTap = (e) => {
            if (isMapFullscreen) return; // ミニマップ時は拡大スワップを優先
            const currentTime = Date.now();
            const tapLength = currentTime - lastTap;
            if (tapLength < 350 && tapLength > 0) {
                e.preventDefault();
                const currentScale = window.geoStudyPanzoom.getScale();
                if (currentScale > 1.2) {
                    window.geoStudyPanzoom.reset();
                } else {
                    window.geoStudyPanzoom.zoom(2.5);
                }
            }
            lastTap = currentTime;
        };
        
        panzoomEl.ontouchend = (e) => {
            if (e.touches && e.touches.length > 0) return;
            handleDoubleTap(e);
        };
        panzoomEl.onclick = (e) => {
            if (isMapFullscreen) return;
            handleDoubleTap(e);
        };
      }
      
      // 画像を完全プリロードしてからフェードイン（黒画面・ちらつき完全防止）
      const preloader = new Image();
      preloader.onload = () => {
        if (roundId !== currentRoundId) return;
        if (panzoomEl) {
          panzoomEl.style.backgroundImage = `url("${safeImgUrl}")`;
        }
        if (photoEl) {
          photoEl.style.opacity = 1;
          photoEl.classList.remove('loading');
        }
        if (window.geoStudyPanzoom) {
          try { window.geoStudyPanzoom.reset(); } catch (_) {}
        }
        const hintEl = document.getElementById('gs-hint-text');
        if (hintEl) hintEl.textContent = "この風景・建造物がある場所を地図から推測してください。";
        showLoading(false);
      };

      preloader.onerror = () => {
        if (roundId !== currentRoundId) return;
        if (panzoomEl) panzoomEl.style.backgroundImage = 'none';
        if (photoEl) {
          photoEl.style.opacity = '0';
          photoEl.classList.add('loading');
        }
        console.warn("[GeoStudy] Image load failed for:", safeImgUrl, "Auto-skipping to next location...");
        const hintEl = document.getElementById('gs-hint-text');
        if (hintEl) hintEl.textContent = "画像を再取得中...";
        // 前の画像が残ったまま正解の場所だけがズレる不具合を防止するため、自動的に次の候補へ安全にスキップ
        setTimeout(() => {
          if (roundId === currentRoundId) {
            loadNewPhoto(roundId);
          }
        }, 150);
      };

      preloader.src = safeImgUrl;
    } else {
      const hintEl = document.getElementById('gs-hint-text');
      if (hintEl) hintEl.textContent = "画像の取得に失敗しました。スキップしてください。";
      showLoading(false);
    }
  } catch (e) {
    console.error("loadNewPhoto error:", e);
    if (roundId === currentRoundId) {
      const hintEl = document.getElementById('gs-hint-text');
      if (hintEl) hintEl.textContent = "画像の取得に失敗しました。スキップしてください。";
      showLoading(false);
    }
  }
}

function submitGuess() {
  if (isGuessed) return; // 二重提出ガード
  if (!leafletMarker || !currentAnswerLatLng) return;
  isGuessed = true;

  // 決定ボタンを無効化＆非表示
  const guessBtn = document.getElementById('gs-guess-btn');
  if (guessBtn) {
    guessBtn.disabled = true;
    guessBtn.classList.add('hidden');
  }

  // もしミニマップ状態なら、結果の全貌が見えるように自動全画面化
  if (!isMapFullscreen) {
    toggleMapSwap();
  }
  
  const guessLatLng = leafletMarker.getLatLng().wrap();
  const answerLatLng = L.latLng(currentAnswerLatLng.lat, currentAnswerLatLng.lng).wrap();
  
  // 距離の計算 (Haversine法)
  const R = 6371; // km
  let dLngRaw = answerLatLng.lng - guessLatLng.lng;
  if (dLngRaw > 180) dLngRaw -= 360;
  else if (dLngRaw < -180) dLngRaw += 360;

  const dLat = (answerLatLng.lat - guessLatLng.lat) * Math.PI / 180;
  const dLng = dLngRaw * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(guessLatLng.lat * Math.PI / 180) * Math.cos(answerLatLng.lat * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distanceKm = Math.round(R * c);
  currentDistanceKm = distanceKm;
  
  // 古い結果オブジェクトがあれば念のため除去
  if (resultMarker) {
    if (gameLayers) gameLayers.removeLayer(resultMarker);
    else if (leafletMap) leafletMap.removeLayer(resultMarker);
    resultMarker = null;
  }
  if (resultLine) {
    if (gameLayers) gameLayers.removeLayer(resultLine);
    else if (leafletMap) leafletMap.removeLayer(resultLine);
    resultLine = null;
  }

  // 正解マーカーの描画（自己完結型SVGアイコン）
  resultMarker = L.marker(answerLatLng, {
    icon: createAnswerIcon()
  }).addTo(gameLayers || leafletMap);

  // 日付変更線（経度180度 / -180度）をまたぐ場合の最短ルート分割描画（地球一周横断線の完全防止）
  const lngDiff = answerLatLng.lng - guessLatLng.lng;
  const lineCoords = [];

  if (Math.abs(lngDiff) > 180) {
    if (lngDiff > 180) {
      const adjLng2 = answerLatLng.lng - 360;
      const t = (-180 - guessLatLng.lng) / (adjLng2 - guessLatLng.lng);
      const crossLat = guessLatLng.lat + t * (answerLatLng.lat - guessLatLng.lat);
      lineCoords.push([[guessLatLng.lat, guessLatLng.lng], [crossLat, -180]]);
      lineCoords.push([[crossLat, 180], [answerLatLng.lat, answerLatLng.lng]]);
    } else {
      const adjLng2 = answerLatLng.lng + 360;
      const t = (180 - guessLatLng.lng) / (adjLng2 - guessLatLng.lng);
      const crossLat = guessLatLng.lat + t * (answerLatLng.lat - guessLatLng.lat);
      lineCoords.push([[guessLatLng.lat, guessLatLng.lng], [crossLat, 180]]);
      lineCoords.push([[crossLat, -180], [answerLatLng.lat, answerLatLng.lng]]);
    }
  } else {
    lineCoords.push([[guessLatLng.lat, guessLatLng.lng], [answerLatLng.lat, answerLatLng.lng]]);
  }
  
  resultLine = L.polyline(lineCoords, {
    color: '#ef4444',
    weight: 3,
    opacity: 0.85,
    dashArray: '8, 8'
  }).addTo(gameLayers || leafletMap);
  
  // 地図のズーム調整
  if (leafletMap) {
    if (Math.abs(lngDiff) <= 180) {
      leafletMap.fitBounds(L.latLngBounds(guessLatLng, answerLatLng), {
        padding: [50, 50],
        maxZoom: 14
      });
    } else {
      const autoZoom = Math.max(2, Math.min(7, Math.round(14.5 - Math.log2(Math.max(50, distanceKm)))));
      leafletMap.setView(answerLatLng, autoZoom);
    }
  }

  // 正解名の表示
  const resultAnswerEl = document.getElementById('gs-result-answer');
  if (resultAnswerEl && currentLocationData) {
    resultAnswerEl.textContent = `正解: ${currentLocationData.name}`;
  }
  
  // 数値のアニメーション (0km対応済み)
  animateValue("gs-distance-text", 0, distanceKm, 1000);
  
  const overlay = document.getElementById('gs-result-overlay');
  if (overlay) overlay.classList.remove('hidden');
  
  // マップコンテナのホバーを解除
  const minimapContainer = document.getElementById('gs-minimap-container');
  if (minimapContainer) minimapContainer.classList.remove('active-map');

  const statusText = document.getElementById('gs-status-text');
  if (statusText) {
    statusText.textContent = `正解との距離: ${distanceKm.toLocaleString()} km`;
  }
}

function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    if (!obj) return;
    if (start === end) {
      obj.textContent = end.toLocaleString();
      return;
    }
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        obj.textContent = Math.floor(easeProgress * (end - start) + start).toLocaleString();
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.textContent = end.toLocaleString();
        }
    };
    window.requestAnimationFrame(step);
}

function closeResultOverlay() {
  const overlay = document.getElementById('gs-result-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function viewResultOnMap() {
  closeResultOverlay();
  const postBar = document.getElementById('gs-post-guess-bar');
  if (postBar) postBar.classList.remove('hidden');
  if (!isMapFullscreen) {
    toggleMapSwap();
  }
  const statusText = document.getElementById('gs-status-text');
  if (statusText) {
    statusText.textContent = `「次の問題へ」または「結果を見る」を押してください`;
  }
}

function reopenResultOverlay() {
  const overlay = document.getElementById('gs-result-overlay');
  if (overlay) overlay.classList.remove('hidden');
  const postBar = document.getElementById('gs-post-guess-bar');
  if (postBar) postBar.classList.add('hidden');
}

function showLoading(show) {
  const el = document.getElementById('gs-loading');
  if (el) {
    if (show) el.classList.remove('hidden');
    else el.classList.add('hidden');
  }
}

// キーボード操作サポート (ESC: 閉じる, Enter: 決定/次へ, Space: 地図スワップ)
document.addEventListener('keydown', (e) => {
  const container = document.getElementById('geoStudyContainer');
  if (!container || container.classList.contains('hidden') || container.style.display === 'none') return;
  
  if (e.key === 'Escape') {
    e.preventDefault();
    closeGeoStudy();
  } else if (e.key === 'Enter' && !e.shiftKey) {
    if (e.isComposing || e.keyCode === 229) return;
    const resultOverlay = document.getElementById('gs-result-overlay');
    if (resultOverlay && !resultOverlay.classList.contains('hidden')) {
      e.preventDefault();
      closeResultOverlay();
      startNewLocation();
    } else if (!isGuessed) {
      const guessBtn = document.getElementById('gs-guess-btn');
      if (guessBtn && !guessBtn.disabled && !guessBtn.classList.contains('hidden')) {
        e.preventDefault();
        submitGuess();
      }
    } else {
      const postBar = document.getElementById('gs-post-guess-bar');
      if (postBar && !postBar.classList.contains('hidden')) {
        e.preventDefault();
        startNewLocation();
      }
    }
  } else if (e.key === ' ' || e.code === 'Space') {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'SELECT' || activeEl.tagName === 'INPUT' || activeEl.tagName === 'BUTTON')) return;
    e.preventDefault();
    toggleMapSwap();
  }
});

if (typeof window !== 'undefined') {
  window.openGeoStudy = openGeoStudy;
  window.closeGeoStudy = closeGeoStudy;
  window.toggleMapSwap = toggleMapSwap;
  window.startNewLocation = startNewLocation;
  window.submitGuess = submitGuess;
  window.closeResultOverlay = closeResultOverlay;
  window.viewResultOnMap = viewResultOnMap;
  window.reopenResultOverlay = reopenResultOverlay;
}
