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
    // 既に初期化されている場合、再表示時にマップのサイズを再計算する（バグ防止）
    if (leafletMap) {
      setTimeout(() => {
        leafletMap.invalidateSize();
      }, 100);
    }
  }
}

function closeGeoStudy() {
  const container = document.getElementById('geoStudyContainer');
  if (container) {
    container.classList.add('hidden');
    container.style.display = 'none';
    
    // ウィンドウを閉じたときにリセットしておく
    closeResultOverlay();
    if (document.getElementById('gs-guess-btn')) {
        startNewLocation();
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
      
      <!-- 結果表示オーバーレイ -->
      <div id="gs-result-overlay" class="hidden absolute inset-0 z-[500] bg-gray-900/90 backdrop-blur-md flex items-center justify-center p-4">
         <div class="bg-gray-800 p-8 rounded-3xl border border-gray-700 text-center shadow-2xl max-w-sm w-full">
            <div class="w-16 h-16 bg-blue-500/20 rounded-2xl mx-auto flex items-center justify-center text-blue-400 text-3xl mb-4 border border-blue-500/30">
                <i class="fas fa-map-marker-alt"></i>
            </div>
            <h2 class="text-xl font-bold text-white mb-2">推測結果</h2>
            <div class="text-5xl font-bold text-blue-400 mb-1"><span id="gs-distance-text">--</span> <span class="text-xl">km</span></div>
            <div class="text-sm text-gray-400 mb-2">実際の場所との誤差距離</div>
            
            <div id="gs-result-answer" class="text-sm font-bold text-gray-200 bg-gray-900 p-3 rounded-xl mb-6 mt-4 border border-gray-700">正解: 読込中...</div>
            
            <div class="flex gap-3">
              <button onclick="closeResultOverlay()" class="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-xl transition text-sm">地図を見る</button>
              <button onclick="event.stopPropagation(); closeResultOverlay(); startNewLocation();" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-xl transition shadow-lg text-sm"><i class="fas fa-play mr-1"></i>次へ</button>
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
    // 既に読み込み済みの場合はスキップ
    if (window.L) {
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
    document.head.appendChild(script);
  });
}

let resultLine = null;
let resultMarker = null;

function initMap() {
  // Leafletの初期化
  leafletMap = L.map('gs-map', {
    center: [20, 0],
    zoom: 2,
    zoomControl: false, // UIが狭いので非表示
    attributionControl: false // UIが狭いので非表示
  });
  
  // 右下に小さく帰属表示
  L.control.attribution({position: 'bottomleft', prefix: false}).addAttribution('&copy; OSM').addTo(leafletMap);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(leafletMap);

  leafletMap.on('click', (e) => {
    // 結果表示中は操作不可
    if (!document.getElementById('gs-result-overlay').classList.contains('hidden')) return;
    
    // 全画面でない場合は、マップを拡大するだけ（ピンは刺さない）
    if (!isMapFullscreen) {
        toggleMapSwap();
        return;
    }
    
    if (leafletMarker) {
      leafletMap.removeLayer(leafletMarker);
    }
    const wrappedLatLng = e.latlng.wrap(); // 経度を -180〜180 に丸める
    leafletMarker = L.marker(wrappedLatLng).addTo(leafletMap);
    
    const guessBtn = document.getElementById('gs-guess-btn');
    guessBtn.disabled = false;
    guessBtn.classList.add('animate-pulse');
    setTimeout(()=>guessBtn.classList.remove('animate-pulse'), 1000);
    
    document.getElementById('gs-status-text').textContent = "ピンを変更できます";
    document.getElementById('gs-status-text').classList.add('text-indigo-400');
  });
}

async function startNewLocation() {
  currentRoundId++;
  const thisRound = currentRoundId;
  showLoading(true);
  
  // マップのリセット
  if (leafletMarker) {
    leafletMap.removeLayer(leafletMarker);
    leafletMarker = null;
  }
  if (resultLine) {
    leafletMap.removeLayer(resultLine);
    resultLine = null;
  }
  if (resultMarker) {
    leafletMap.removeLayer(resultMarker);
    resultMarker = null;
  }
  
  if (isMapFullscreen) {
      toggleMapSwap();
  }
  
  leafletMap.setView([20, 0], 2);
  document.getElementById('gs-guess-btn').disabled = true;
  document.getElementById('gs-status-text').textContent = isMapFullscreen ? "地図をタップしてピンを刺す" : "地図をクリックして拡大";
  document.getElementById('gs-status-text').classList.remove('text-indigo-400');
  
  const mode = document.getElementById('gs-mode-select').value;
  
  if (mode === 'photo') {
    document.getElementById('gs-photo-container').classList.add('loading');
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
    
    // フォールバック（スクリプトがロードされていない場合）
    if (!pool || pool.length === 0) {
        pool = [
            { name: "エッフェル塔, パリ", lat: 48.8584, lng: 2.2945, q: "Eiffel Tower", imgUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Tour_Eiffel_Wikimedia_Commons.jpg/800px-Tour_Eiffel_Wikimedia_Commons.jpg" },
            { name: "富士山, 日本", lat: 35.3606, lng: 138.7274, q: "Mount Fuji", imgUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/080103_hakkai_fuji.jpg/800px-080103_hakkai_fuji.jpg" }
        ];
    }
    
    loc = pool[Math.floor(Math.random() * pool.length)];
    currentAnswerLatLng = L.latLng(loc.lat, loc.lng);
    imgUrl = loc.imgUrl;
    
    if (roundId !== currentRoundId) return; // 非同期処理中にスキップされた場合は中断
    
    document.getElementById('gs-result-answer').textContent = `正解: ${loc.name}`;
    
    if (imgUrl) {
      const photoEl = document.getElementById('gs-photo-container');
      const panzoomEl = document.getElementById('gs-photo-panzoom');
      photoEl.style.opacity = 0;
      let safeImgUrl = imgUrl.replace(/'/g, "%27").replace(/"/g, "%22");
      if (safeImgUrl.startsWith("http://")) safeImgUrl = "https://" + safeImgUrl.substring(7);
      
      // ユーザーの要望により、軽量化パラメータを削除してWikipediaオリジナル高画質画像を使用する
      safeImgUrl = safeImgUrl.split("?")[0];
      
      // Panzoomがまだ初期化されていなければ初期化する
      if (!window.geoStudyPanzoom && window.Panzoom) {
          window.geoStudyPanzoom = Panzoom(panzoomEl, {
              maxScale: 20,       // 拡大限界を大幅に引き上げ
              minScale: 1,
              step: 0.1,          // マウスホイールの刻みを細かくし、滑らかなズームにする
              contain: 'outside'
          });
          
          const panzoomContainer = panzoomEl.parentElement;
          panzoomContainer.style.touchAction = 'none'; // スマホのスクロール干渉防止
          
          // ホイールイベントの追加
          panzoomContainer.addEventListener('wheel', window.geoStudyPanzoom.zoomWithWheel);
          
          // ダブルクリック（ダブルタップ）でのズーム切り替え
          let lastTap = 0;
          panzoomEl.addEventListener('click', (e) => {
              const currentTime = new Date().getTime();
              const tapLength = currentTime - lastTap;
              if (tapLength < 300 && tapLength > 0) {
                  // ダブルクリック
                  e.preventDefault();
                  const currentScale = window.geoStudyPanzoom.getScale();
                  if (currentScale > 1.2) {
                      window.geoStudyPanzoom.reset();
                  } else {
                      window.geoStudyPanzoom.zoom(2.5, { animate: true });
                  }
              }
              lastTap = currentTime;
          });
      }
      
      setTimeout(() => {
          if (roundId !== currentRoundId) return;
          panzoomEl.style.backgroundImage = `url('${safeImgUrl}')`;
          photoEl.style.opacity = 1;
          photoEl.classList.remove('loading');
          
          if (window.geoStudyPanzoom) {
              window.geoStudyPanzoom.reset(); // 新しい写真になったらズームをリセット
          }
      }, 50);
      document.getElementById('gs-hint-text').textContent = "この風景・建造物がある場所を地図から推測してください。";
    } else {
      document.getElementById('gs-hint-text').textContent = "画像の取得に失敗しました。スキップしてください。";
    }
  } catch (e) {
    console.error(e);
    if (roundId === currentRoundId) {
        document.getElementById('gs-hint-text').textContent = "画像の取得に失敗しました。スキップしてください。";
    }
  }
}

function submitGuess() {
  if (!leafletMarker || !currentAnswerLatLng) return;
  
  const guessLatLng = leafletMarker.getLatLng().wrap();
  
  // 地球一周のバグを防ぐため、経度を補正したコピーを作成する
  // (例: guessが170度、answerが-170度の場合、最短距離は20度だが、線が340度引かれるのを防ぐ)
  const drawAnswerLatLng = L.latLng(currentAnswerLatLng.lat, currentAnswerLatLng.lng);
  let lngDiff = drawAnswerLatLng.lng - guessLatLng.lng;
  if (lngDiff > 180) {
      drawAnswerLatLng.lng -= 360;
  } else if (lngDiff < -180) {
      drawAnswerLatLng.lng += 360;
  }
  
  // 距離の計算 (haversine)
  // 地球一周バグ等の影響を受けないように、自前で最短距離を計算
  const R = 6371; // km
  const dLat = (drawAnswerLatLng.lat - guessLatLng.lat) * Math.PI / 180;
  const dLng = (drawAnswerLatLng.lng - guessLatLng.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(guessLatLng.lat * Math.PI / 180) * Math.cos(drawAnswerLatLng.lat * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distanceKm = Math.round(R * c);
  
  // 正解マーカーと線の描画
  resultMarker = L.marker(drawAnswerLatLng, {
    icon: L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    })
  }).addTo(leafletMap);
  
  resultLine = L.polyline([guessLatLng, drawAnswerLatLng], {
    color: '#ef4444',
    weight: 3,
    opacity: 0.8,
    dashArray: '8, 8'
  }).addTo(leafletMap);
  
  // 地図のズーム調整
  leafletMap.fitBounds(L.latLngBounds(guessLatLng, drawAnswerLatLng).pad(0.2));
  
  // 結果オーバーレイ表示
  // 数値のアニメーション
  animateValue("gs-distance-text", 0, distanceKm, 1000);
  
  const overlay = document.getElementById('gs-result-overlay');
  overlay.classList.remove('hidden');
  
  // マップコンテナのホバーを解除
  document.getElementById('gs-minimap-container').classList.remove('active-map');
}

function animateValue(id, start, end, duration) {
    if (start === end) return;
    const obj = document.getElementById(id);
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        // Easing (easeOutExpo)
        const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        obj.innerHTML = Math.floor(easeProgress * (end - start) + start).toLocaleString();
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

function closeResultOverlay() {
  document.getElementById('gs-result-overlay').classList.add('hidden');
}

function showLoading(show) {
  const el = document.getElementById('gs-loading');
  if (show) {
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}
