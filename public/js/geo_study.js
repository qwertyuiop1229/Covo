// geo_study.js - 隠し機能の制御スクリプト

document.addEventListener('DOMContentLoaded', () => {
  setupHiddenTrigger();
});

function setupHiddenTrigger() {
  const target = document.getElementById('appInfoVersion');
  if (!target) return;

  let pressTimer = null;
  const triggerDuration = 3000; // 3 seconds

  const startPress = (e) => {
    if (e.type === 'mousedown' && e.button !== 0) return;
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

  target.addEventListener('mousedown', startPress);
  target.addEventListener('touchstart', startPress, {passive: true});
  
  target.addEventListener('mouseup', cancelPress);
  target.addEventListener('mouseleave', cancelPress);
  target.addEventListener('touchend', cancelPress);
  target.addEventListener('touchcancel', cancelPress);
  target.addEventListener('touchmove', cancelPress, {passive: true});
  
  // スマホでの長押しによるテキスト選択やメニュー表示を防ぐ
  target.style.webkitUserSelect = 'none';
  target.style.userSelect = 'none';
  target.addEventListener('contextmenu', (e) => {
      e.preventDefault();
  });
}

let isGeoStudyInitialized = false;
let leafletMap = null;
let leafletMarker = null;
let currentAnswerLatLng = null;

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
  }
}

function buildGeoStudyUI(container) {
  container.innerHTML = `
    <div class="flex justify-between items-center p-4 bg-gray-900 border-b border-gray-800 shrink-0">
      <div class="font-bold text-gray-200"><i class="fas fa-globe-americas mr-2"></i>地理・景観推測システム</div>
      <button onclick="closeGeoStudy()" class="text-gray-400 hover:text-white p-2 transition"><i class="fas fa-times text-xl"></i></button>
    </div>
    
    <div class="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
      <!-- 写真表示エリア -->
      <div id="gs-photo-container" class="absolute inset-0 z-0 gs-swap-transition" onclick="if(isMapFullscreen) toggleMapSwap()">
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
        <select id="gs-mode-select" class="w-full bg-gray-800 text-white rounded p-1.5 text-sm border border-gray-600 focus:outline-none focus:border-blue-500" onchange="startNewLocation()">
          <option value="photo">写真 (Wiki)</option>
          <option value="mapillary" disabled>ストリートビュー (準備中)</option>
        </select>
        <div class="text-xs text-gray-400 font-bold mt-1">難易度</div>
        <select id="gs-difficulty-select" class="w-full bg-gray-800 text-white rounded p-1.5 text-sm border border-gray-600 focus:outline-none focus:border-blue-500" onchange="startNewLocation()">
          <option value="easy">初級 (有名スポット)</option>
          <option value="normal">中級 (都市)</option>
          <option value="hard">上級 (ランダム)</option>
        </select>
        <div class="text-xs text-gray-400 mt-1">ヒント</div>
        <div id="gs-hint-text" class="text-xs text-gray-200 bg-gray-800 p-2 rounded border border-gray-700 max-h-20 overflow-y-auto break-words">読込中...</div>
        <button onclick="startNewLocation()" class="w-full mt-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-1.5 rounded-lg text-xs transition shadow border border-gray-600"><i class="fas fa-forward mr-1"></i>スキップ</button>
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
              <button onclick="startNewLocation(); closeResultOverlay();" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-xl transition shadow-lg text-sm"><i class="fas fa-play mr-1"></i>次へ</button>
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
    leafletMarker = L.marker(e.latlng).addTo(leafletMap);
    
    const guessBtn = document.getElementById('gs-guess-btn');
    guessBtn.disabled = false;
    guessBtn.classList.add('animate-pulse');
    setTimeout(()=>guessBtn.classList.remove('animate-pulse'), 1000);
    
    document.getElementById('gs-status-text').textContent = "ピンを変更できます";
    document.getElementById('gs-status-text').classList.add('text-indigo-400');
  });
}

async function startNewLocation() {
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
  leafletMap.setView([20, 0], 2);
  document.getElementById('gs-guess-btn').disabled = true;
  document.getElementById('gs-status-text').textContent = isMapFullscreen ? "地図をタップしてピンを刺す" : "地図をクリックして拡大";
  document.getElementById('gs-status-text').classList.remove('text-indigo-400');
  
  const mode = document.getElementById('gs-mode-select').value;
  
  if (mode === 'photo') {
    document.getElementById('gs-photo-container').classList.add('loading');
    await loadRandomWikipediaPhoto();
    document.getElementById('gs-photo-container').classList.remove('loading');
  }
  
  showLoading(false);
}

const EASY_LOCATIONS = [
  { name: "エッフェル塔, パリ", lat: 48.8584, lng: 2.2945, q: "Eiffel Tower" },
  { name: "自由の女神, ニューヨーク", lat: 40.6892, lng: -74.0445, q: "Statue of Liberty" },
  { name: "富士山, 日本", lat: 35.3606, lng: 138.7274, q: "Mount Fuji" },
  { name: "コロッセオ, ローマ", lat: 41.8902, lng: 12.4922, q: "Colosseum" },
  { name: "オペラハウス, シドニー", lat: -33.8568, lng: 151.2153, q: "Sydney Opera House" },
  { name: "タージ・マハル, インド", lat: 27.1751, lng: 78.0421, q: "Taj Mahal" },
  { name: "ピラミッド, エジプト", lat: 29.9792, lng: 31.1342, q: "Great Pyramid of Giza" },
  { name: "マチュピチュ, ペルー", lat: -13.1631, lng: -72.5450, q: "Machu Picchu" },
  { name: "タイムズスクエア, NY", lat: 40.7580, lng: -73.9855, q: "Times Square" },
  { name: "サグラダ・ファミリア, スペイン", lat: 41.4036, lng: 2.1744, q: "Sagrada Família" },
  { name: "ナイアガラの滝, カナダ", lat: 43.0828, lng: -79.0742, q: "Niagara Falls" },
  { name: "金閣寺, 京都", lat: 35.0394, lng: 135.7292, q: "Kinkaku-ji" },
  { name: "サハラ砂漠", lat: 23.4162, lng: 25.6628, q: "Sahara" },
  { name: "グランドキャニオン, 米国", lat: 36.1070, lng: -112.1130, q: "Grand Canyon" },
  { name: "マウント・ラシュモア, 米国", lat: 43.8791, lng: -103.4591, q: "Mount Rushmore" }
];

const NORMAL_LOCATIONS = [
  { name: "東京, 日本", lat: 35.6762, lng: 139.6503, q: "Tokyo" },
  { name: "ロンドン, 英国", lat: 51.5074, lng: -0.1278, q: "London" },
  { name: "ニューヨーク, 米国", lat: 40.7128, lng: -74.0060, q: "New York City" },
  { name: "パリ, フランス", lat: 48.8566, lng: 2.3522, q: "Paris" },
  { name: "北京, 中国", lat: 39.9042, lng: 116.4074, q: "Beijing" },
  { name: "シドニー, 豪州", lat: -33.8688, lng: 151.2093, q: "Sydney" },
  { name: "リオデジャネイロ, ブラジル", lat: -22.9068, lng: -43.1729, q: "Rio de Janeiro" },
  { name: "ケープタウン, 南アフリカ", lat: -33.9249, lng: 18.4241, q: "Cape Town" },
  { name: "モスクワ, ロシア", lat: 55.7558, lng: 37.6173, q: "Moscow" },
  { name: "バンコク, タイ", lat: 13.7563, lng: 100.5018, q: "Bangkok" },
  { name: "ベルリン, ドイツ", lat: 52.5200, lng: 13.4050, q: "Berlin" },
  { name: "ソウル, 韓国", lat: 37.5665, lng: 126.9780, q: "Seoul" },
  { name: "ローマ, イタリア", lat: 41.9028, lng: 12.4964, q: "Rome" },
  { name: "ドバイ, UAE", lat: 25.2048, lng: 55.2708, q: "Dubai" },
  { name: "イスタンブール, トルコ", lat: 41.0082, lng: 28.9784, q: "Istanbul" },
  { name: "メキシコシティ, メキシコ", lat: 19.4326, lng: -99.1332, q: "Mexico City" },
  { name: "ブエノスアイレス, アルゼンチン", lat: -34.6037, lng: -58.3816, q: "Buenos Aires" },
  { name: "シンガポール", lat: 1.3521, lng: 103.8198, q: "Singapore" },
  { name: "トロント, カナダ", lat: 43.6510, lng: -79.3470, q: "Toronto" },
  { name: "ムンバイ, インド", lat: 19.0760, lng: 72.8777, q: "Mumbai" }
];

async function loadRandomWikipediaPhoto() {
  try {
    const difficulty = document.getElementById('gs-difficulty-select') ? document.getElementById('gs-difficulty-select').value : 'easy';
    let loc = null;
    let imgUrl = "";
    
    if (difficulty === 'hard') {
        // 上級: WikipediaAPIからランダムな記事（画像＋座標あり）を取得
        document.getElementById('gs-hint-text').textContent = "ランダムな場所を検索中...";
        for (let i = 0; i < 5; i++) { // 最大5回トライ
           const randRes = await fetch(`https://ja.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=10&format=json&origin=*`);
           const randData = await randRes.json();
           const randomPages = randData.query.random;
           
           for (let rPage of randomPages) {
               // その記事が座標と画像を持っているかチェック
               const detailRes = await fetch(`https://ja.wikipedia.org/w/api.php?action=query&prop=coordinates|pageimages&pageids=${rPage.id}&format=json&pithumbsize=1000&origin=*`);
               const detailData = await detailRes.json();
               const pageDetail = detailData.query.pages[rPage.id];
               
               if (pageDetail.coordinates && pageDetail.coordinates.length > 0 && pageDetail.thumbnail) {
                   loc = {
                       name: rPage.title,
                       lat: pageDetail.coordinates[0].lat,
                       lng: pageDetail.coordinates[0].lon,
                       q: rPage.title
                   };
                   imgUrl = pageDetail.thumbnail.source;
                   break;
               }
           }
           if (loc) break;
        }
        if (!loc) {
            // 見つからなかった場合のフォールバック（中級から選ぶ）
            loc = NORMAL_LOCATIONS[Math.floor(Math.random() * NORMAL_LOCATIONS.length)];
        }
    } else {
        const pool = difficulty === 'normal' ? NORMAL_LOCATIONS : EASY_LOCATIONS;
        loc = pool[Math.floor(Math.random() * pool.length)];
    }

    
    currentAnswerLatLng = L.latLng(loc.lat, loc.lng);
    document.getElementById('gs-result-answer').textContent = `正解: ${loc.name}`;
    
    if (!imgUrl) {
        // 画像URLがまだない（Easy/Normalモードの場合）
        const res = await fetch(`https://ja.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(loc.name.split(',')[0])}&prop=pageimages&format=json&pithumbsize=1000&origin=*`);
        const data = await res.json();
        
        const pages = data.query.pages;
        for (let pageId in pages) {
          if (pages[pageId].thumbnail) {
            imgUrl = pages[pageId].thumbnail.source;
          }
        }
        
        if (!imgUrl) {
           const resEn = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(loc.q)}&prop=pageimages&format=json&pithumbsize=1000&origin=*`);
           const dataEn = await resEn.json();
           const pagesEn = dataEn.query.pages;
           for (let pageId in pagesEn) {
             if (pagesEn[pageId].thumbnail) {
               imgUrl = pagesEn[pageId].thumbnail.source;
             }
           }
        }
    }

    if (imgUrl) {
      // 一瞬見えない状態にしてから画像をセットし、クロスフェードさせる
      const photoEl = document.getElementById('gs-photo-container');
      photoEl.style.opacity = 0;
      setTimeout(() => {
          photoEl.style.backgroundImage = `url('${imgUrl}')`;
          photoEl.style.opacity = 1;
      }, 50);
      document.getElementById('gs-hint-text').textContent = "この風景・建造物がある場所を地図から推測してください。";
    } else {
      // 念のためのフォールバック（無限ループ防止）
      document.getElementById('gs-hint-text').textContent = "画像の取得に失敗しました。スキップしてください。";
    }
  } catch (e) {
    console.error(e);
    document.getElementById('gs-hint-text').textContent = "画像の取得に失敗しました。スキップしてください。";
  }
}

function submitGuess() {
  if (!leafletMarker || !currentAnswerLatLng) return;
  
  const guessLatLng = leafletMarker.getLatLng();
  
  // 距離の計算 (haversine)
  const distanceKm = Math.round(leafletMap.distance(guessLatLng, currentAnswerLatLng) / 1000);
  
  // 正解マーカーと線の描画
  resultMarker = L.marker(currentAnswerLatLng, {
    icon: L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    })
  }).addTo(leafletMap);
  
  resultLine = L.polyline([guessLatLng, currentAnswerLatLng], {
    color: '#ef4444',
    weight: 3,
    opacity: 0.8,
    dashArray: '8, 8'
  }).addTo(leafletMap);
  
  // 地図のズーム調整
  leafletMap.fitBounds(L.latLngBounds(guessLatLng, currentAnswerLatLng).pad(0.2));
  
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
