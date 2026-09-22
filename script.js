/* =========================================================
   Catch — script.js
   1) 큰 숫자 타이머(카운트다운) — 프로토타입용 시뮬레이션
   2) 긴급 상황 카드의 경로/대안 열차 패널 토글
   3) 베타 신청 폼 제출(백엔드 없이 클라이언트 처리)
   4) 카카오맵(Kakao Maps JS SDK) — 추천 경로 표시
   ========================================================= */

/* -----------------------------------------------------------
   0) 카카오맵 설정
   -----------------------------------------------------------
   1. https://developers.kakao.com 에서 애플리케이션을 만드세요.
   2. [앱 설정 > 플랫폼 > Web] 에 사용할 도메인을 등록하세요.
      (예: http://localhost:8000 — 아래 "주의" 참고)
   3. [앱 설정 > 앱 키] 에서 "JavaScript 키"를 복사해 아래에
      붙여넣으세요. (REST API 키가 아니라 JavaScript 키입니다)

   키를 넣기 전까지는 지도 영역에 안내 문구(fallback)가 표시됩니다.

   주의:
   - Kakao Maps SDK는 file:// 로 열면 동작하지 않습니다.
     반드시 로컬 서버로 열어야 합니다. 예)
       cd 프로젝트폴더
       python3 -m http.server 8000
     그 다음 http://localhost:8000 으로 접속하세요.
   - 카카오 개발자 콘솔의 Web 플랫폼 도메인에 위 접속 주소가
     등록되어 있어야 지도가 정상적으로 표시됩니다.
------------------------------------------------------------ */
const KAKAO_MAP_APP_KEY = 'd36ccaefdad2aee3a4dc1887f616c04d';

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1) 카운트다운 타이머 ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }

  function startCountdown(el, totalSeconds, withHours) {
    if (!el) return;
    var remaining = totalSeconds;

    function render() {
      if (withHours) {
        var h = Math.floor(remaining / 3600);
        var m = Math.floor((remaining % 3600) / 60);
        var s = remaining % 60;
        el.textContent = h + ':' + pad(m) + ':' + pad(s);
      } else {
        var mm = Math.floor(remaining / 60);
        var ss = remaining % 60;
        el.textContent = pad(mm) + ':' + pad(ss);
      }
    }

    render();
    if (reduceMotion) return;

    setInterval(function () {
      remaining -= 1;
      if (remaining < 0) remaining = totalSeconds;
      render();
    }, 1000);
  }

  startCountdown(document.getElementById('heroTimer'), 1 * 3600 + 42 * 60, true);
  startCountdown(document.getElementById('emergencyTimer'), 28 * 60, false);

  /* ---------- 2) 패널 토글 (경로 보기 / 대안 열차 보기) ---------- */
  function wireToggle(btnId, panelId, onFirstOpen) {
    var btn = document.getElementById(btnId);
    var panel = document.getElementById(panelId);
    if (!btn || !panel) return;
    var openedOnce = false;

    btn.addEventListener('click', function () {
      var willOpen = panel.hidden;
      panel.hidden = !willOpen;
      btn.setAttribute('aria-expanded', String(willOpen));
      btn.classList.toggle('is-active', willOpen);

      if (willOpen && !openedOnce) {
        openedOnce = true;
        if (typeof onFirstOpen === 'function') onFirstOpen();
      } else if (willOpen && window.__catchKakaoMap) {
        // 다시 열릴 때 지도 타일이 비어 보이지 않도록 재배치/재중심
        window.__catchKakaoMap.relayout();
        window.__catchKakaoMap.setCenter(window.__catchKakaoMapCenter);
      }
    });
  }

  wireToggle('btnRoute', 'panelRoute', loadKakaoMap);
  wireToggle('btnAlt', 'panelAlt');

  /* ---------- 3) 베타 신청 폼 ---------- */
  var betaForm = document.getElementById('betaForm');
  var betaSuccess = document.getElementById('betaSuccess');
  if (betaForm) {
    betaForm.addEventListener('submit', function (e) {
      e.preventDefault();
      betaForm.hidden = true;
      betaSuccess.hidden = false;
    });
  }

  /* ---------- 4) 카카오맵: 추천 경로 (정적 목업 경로) ---------- */
  function loadKakaoMap() {
    var fallback = document.getElementById('routeMapFallback');

    if (!KAKAO_MAP_APP_KEY || KAKAO_MAP_APP_KEY === 'YOUR_KAKAO_MAP_APP_KEY') {
      // 키가 아직 없으면 안내 문구만 보여주고 종료
      return;
    }

    var script = document.createElement('script');
    // autoload=false: 스크립트 로드 후 kakao.maps.load()로 초기화 시점을 직접 제어
    script.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + KAKAO_MAP_APP_KEY + '&autoload=false';
    script.onload = function () {
      window.kakao.maps.load(initRouteMap);
    };
    script.onerror = function () {
      if (fallback) {
        fallback.querySelector('p').textContent = '지도를 불러오지 못했어요. JavaScript 키와 Web 플랫폼 도메인 등록 상태를 확인해 주세요.';
      }
    };
    document.head.appendChild(script);
  }

  function initRouteMap() {
    if (!(window.kakao && window.kakao.maps)) return;

    var mapEl = document.getElementById('routeMap');
    var fallback = document.getElementById('routeMapFallback');
    if (!mapEl) return;

    // 집(예시 좌표) → 서울역
    var home = new kakao.maps.LatLng(37.5665, 126.9910);
    var midA = new kakao.maps.LatLng(37.5623, 126.9840);
    var midB = new kakao.maps.LatLng(37.5588, 126.9762);
    var station = new kakao.maps.LatLng(37.5547, 126.9707);

    var map = new kakao.maps.Map(mapEl, {
      center: home,
      level: 5
    });

    if (fallback) fallback.hidden = true;

    // 추천 경로 — 실제 길찾기 계산이 아닌 시각화용 정적 경로입니다.
    new kakao.maps.Polyline({
      map: map,
      path: [home, midA, midB, station],
      strokeWeight: 5,
      strokeColor: '#17E27E',
      strokeOpacity: 0.95,
      strokeStyle: 'solid'
    });

    new kakao.maps.CustomOverlay({
      map: map,
      position: home,
      xAnchor: 0.5,
      yAnchor: 0.5,
      content: '<div class="map-pin map-pin-home"><svg viewBox="0 0 24 24"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v10h12V10"/></svg></div>'
    });

    new kakao.maps.CustomOverlay({
      map: map,
      position: station,
      xAnchor: 0.5,
      yAnchor: 0.5,
      content: '<div class="map-pin map-pin-dest"><svg viewBox="0 0 24 24"><path d="M6 21V4"/><path d="M6 4.5h11l-2.7 3.5L17 11.5H6"/></svg></div>'
    });

    window.__catchKakaoMap = map;
    window.__catchKakaoMapCenter = home;

    addCurrentLocation(map, home, station);
  }

  // 기기의 실제 현재 위치를 지도 위에 표시 (브라우저 위치 권한 필요)
  function addCurrentLocation(map, home, station) {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var me = new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude);

        new kakao.maps.CustomOverlay({
          map: map,
          position: me,
          xAnchor: 0.5,
          yAnchor: 0.5,
          zIndex: 10,
          content: '<div class="map-dot" title="현재 위치"></div>'
        });

        // 집·서울역·현재 위치가 모두 보이도록 범위 재조정
        var bounds = new kakao.maps.LatLngBounds();
        bounds.extend(home);
        bounds.extend(station);
        bounds.extend(me);
        map.setBounds(bounds, 48);

        window.__catchKakaoMapCenter = me;
      },
      function (err) {
        // 권한 거부·타임아웃 등: 조용히 무시하고 목업 경로만 표시
        console.info('[Catch] 현재 위치를 가져오지 못했어요:', err.message);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }
})();
