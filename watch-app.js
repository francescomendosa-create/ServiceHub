(function () {

  'use strict';



  var APP_ID = 'stabile-2026-v4';

  var SW_CFG_KEY = 'servicehub_service_watch_v1';

  var CNT_FIELD_ID = 'cnt-tk9000';

  var CNT_MAX_LEN = 12;



  var state = {

    pass: 0,

    hp: 0,

    contatori: { 'cnt-tk9000': '' },

    numpadBuffer: '',

    modules: { chemicals: { enabled: false }, contatori: { enabled: false } },

    ready: false,

    authOk: false,

    currentView: 'view-home'

  };



  var db = null;

  var auth = null;

  var rapportiniRef = null;

  var plantRef = null;

  var cachedRapportiniRemote = null;

  var cachedPlantRemote = null;

  var unsub = null;

  var unsubPlant = null;



  function $(id) { return document.getElementById(id); }



  function setScrollTheme(viewId) {

    var isHome = viewId === 'view-home';

    document.body.classList.remove('sw-bg-home', 'sw-bg-panel', 'sw-home-only');

    document.body.classList.add(isHome ? 'sw-bg-home' : 'sw-bg-panel');

    if (isHome) {

      document.body.classList.add('sw-home-only');

      window.scrollTo(0, 0);

    } else {

      var topPad = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sw-scroll-top')) || 54;

      window.scrollTo(0, topPad);

    }

    if (window.swEnsurePageHeight) window.swEnsurePageHeight();

  }



  function showView(name) {

    state.currentView = name;

    ['view-home', 'view-menu', 'view-chemicals', 'view-contatori', 'view-empty'].forEach(function (id) {

      var el = $(id);

      if (el) el.classList.toggle('sw-view--hidden', id !== name);

    });

    closeContatoriNumpad();

    setScrollTheme(name);

  }



  function rapportinoHasChemModule(item) {

    var sc = item && item.schedeConfig && item.schedeConfig.modules &&

      item.schedeConfig.modules['sec-chemicals'];

    return !!(sc && sc.enabled !== false);

  }



  function parseChemFromPlant(plantData) {

    if (!plantData || (plantData.chemPass == null && plantData.chemHp == null)) return null;

    return {

      pass: Math.max(0, parseInt(plantData.chemPass, 10) || 0),

      hp: Math.max(0, parseInt(plantData.chemHp, 10) || 0)

    };

  }



  function getChemCountsFromRapportiniFallback(remote) {

    var pass = 0;

    var hp = 0;

    if (!remote || !remote.items) return { pass: 0, hp: 0 };

    Object.keys(remote.items).forEach(function (rid) {

      var item = remote.items[rid];

      if (!rapportinoHasChemModule(item)) return;

      var d = item && item.data;

      if (!d) return;

      pass = Math.max(pass, parseInt(d._nottChemPass, 10) || 0);

      hp = Math.max(hp, parseInt(d._nottChemHp, 10) || 0);

    });

    return { pass: pass, hp: hp };

  }



  function getContatoriFromRapportini(remote) {

    var out = { 'cnt-tk9000': '' };

    if (!remote || !remote.items || !remote.items.fuochista) return out;

    var d = remote.items.fuochista.data;

    if (d && d[CNT_FIELD_ID] != null && String(d[CNT_FIELD_ID]).trim() !== '') {

      out[CNT_FIELD_ID] = String(d[CNT_FIELD_ID]);

    }

    return out;

  }



  /** Fonte unica Firestore: sharedDial/plant (chemPass/chemHp), fallback rapportini. */

  function resolveChemCountsFromFirestore() {

    var fromPlant = parseChemFromPlant(cachedPlantRemote);

    if (fromPlant) return fromPlant;

    return getChemCountsFromRapportiniFallback(cachedRapportiniRemote);

  }



  function applyChemCountsFromFirestore() {

    var c = resolveChemCountsFromFirestore();

    state.pass = c.pass;

    state.hp = c.hp;

    state.ready = true;

    updateChemUI();

  }



  function applyContatoriFromRapportini() {

    state.contatori = getContatoriFromRapportini(cachedRapportiniRemote);

    updateContatoriUI();

  }



  function updateChemUI() {

    var p = $('sw-chem-pass');

    var h = $('sw-chem-hp');

    if (p) p.textContent = String(state.pass);

    if (h) h.textContent = String(state.hp);

  }



  function formatContatoreDisplay(val) {

    if (val == null || String(val).trim() === '') return '—';

    return String(val);

  }



  function updateContatoriUI() {

    var el = $('sw-cnt-tk9000-val');

    if (el) el.textContent = formatContatoreDisplay(state.contatori[CNT_FIELD_ID]);

  }



  function fitNumpadDisplayFont() {

    var disp = $('sw-cnt-numpad-display');

    if (!disp) return;

    var len = state.numpadBuffer.length;

    if (!len) {

      disp.style.fontSize = '';

      disp.style.letterSpacing = '';

      return;

    }

    var base = Math.min(window.innerWidth || 200, 260);

    var fs = Math.round(Math.min(32, Math.max(15, base * 0.13 - len * 1.05)));

    disp.style.fontSize = fs + 'px';

    disp.style.letterSpacing = len > 8 ? '-0.03em' : (len > 5 ? '0' : '0.02em');

  }



  function updateNumpadDisplay() {

    var disp = $('sw-cnt-numpad-display');

    if (disp) disp.textContent = state.numpadBuffer || '—';

    fitNumpadDisplayFont();

  }



  function dismissActiveKeyboard() {

    var ae = document.activeElement;

    if (ae && ae !== document.body && typeof ae.blur === 'function') {

      try { ae.blur(); } catch (_) {}

    }

  }



  function openContatoriNumpad() {

    dismissActiveKeyboard();

    closeNativeDictationInput();

    state.numpadBuffer = state.contatori[CNT_FIELD_ID] || '';

    updateNumpadDisplay();

    var pad = $('sw-cnt-numpad');

    if (pad) pad.classList.remove('sw-view--hidden');

  }



  function closeContatoriNumpad() {

    stopAllVoice();

    closeNativeDictationInput();

    clearNumpadHint();

    dismissActiveKeyboard();

    var pad = $('sw-cnt-numpad');

    if (pad) pad.classList.add('sw-view--hidden');

    state.numpadBuffer = '';

  }



  var cntSpeechRecognition = null;

  var cntSpeechListening = false;

  var cntSpeechWanted = false;

  var cntMicHintTimer = null;

  var cntMicPermissionOk = null;

  var cntVoiceMode = 'none';

  var cntMediaRecorder = null;

  var cntMediaStream = null;

  var cntRecordChunks = [];

  var cntRecording = false;

  var cntRecordTimer = null;

  var CNT_SPEECH_LANG = 'it-IT';

  var CNT_RECORD_MAX_MS = 8000;



  function normalizeSpeechText(text) {

    return String(text || '').toLowerCase()

      .replace(/[àá]/g, 'a').replace(/[èé]/g, 'e').replace(/[ìí]/g, 'i')

      .replace(/[òó]/g, 'o').replace(/[ùú]/g, 'u');

  }



  function parseSpokenCounterDigits(transcript) {

    var raw = normalizeSpeechText(transcript);

    var wordMap = {

      zero: '0', zeri: '0',

      uno: '1', una: '1', un: '1',

      due: '2', tre: '3', quattro: '4', cinque: '5',

      sei: '6', sette: '7', otto: '8', nove: '9'

    };

    var fromDigits = raw.replace(/[^\d]/g, '');

    var fromWords = '';

    raw.split(/[\s,.;:+\-/]+/).forEach(function (tok) {

      tok = tok.replace(/[^a-z0-9]/g, '');

      if (!tok) return;

      if (/^\d+$/.test(tok)) {

        fromWords += tok;

        return;

      }

      if (wordMap[tok] != null) fromWords += wordMap[tok];

    });

    var out = fromWords.length >= fromDigits.length ? fromWords : (fromWords || fromDigits);

    return out.slice(0, CNT_MAX_LEN);

  }



  function setCntMicButtonState(active) {

    var btn = $('sw-cnt-numpad-mic');

    if (!btn) return;

    btn.classList.toggle('sw-cnt-numpad-mic--active', !!active);

  }



  function clearNumpadHint() {

    if (cntMicHintTimer) {

      clearTimeout(cntMicHintTimer);

      cntMicHintTimer = null;

    }

    var hint = $('sw-cnt-numpad-hint');

    if (hint) hint.textContent = '';

  }



  function showNumpadHint(msg) {

    var hint = $('sw-cnt-numpad-hint');

    if (!hint) return;

    clearNumpadHint();

    hint.textContent = msg;

    cntMicHintTimer = setTimeout(clearNumpadHint, 2400);

  }



  function getWatchGeminiKey() {

    var localCfg = loadWatchLocalConfig();

    if (localCfg && localCfg.geminiVoiceKey) return String(localCfg.geminiVoiceKey).trim();

    if (cachedRapportiniRemote && cachedRapportiniRemote.serviceWatch && cachedRapportiniRemote.serviceWatch.geminiVoiceKey) {

      return String(cachedRapportiniRemote.serviceWatch.geminiVoiceKey).trim();

    }

    return '';

  }



  function canUseMediaRecorderVoice() {

    return !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  }



  function canUseNativeDictationInput() {

    var ua = navigator.userAgent || '';

    var sw = window.screen ? Math.min(window.screen.width, window.screen.height) : 999;

    var isWatchLike = /Watch/i.test(ua) || sw <= 230;

    return isWatchLike || (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window) && !canUseMediaRecorderVoice());

  }



  function updateMicButtonForVoiceMode() {

    var btn = $('sw-cnt-numpad-mic');

    if (!btn) return;

    var label = btn.querySelector('.sw-cnt-numpad-mic-label');

    if (!label) return;

    if (cntVoiceMode === 'native') label.textContent = 'Detta';

    else label.textContent = 'Voce';

  }



  function syncNativeVoiceInputFromBuffer() {

    var inp = $('sw-cnt-voice-input');

    if (inp && document.activeElement !== inp) inp.value = state.numpadBuffer || '';

  }



  function applyNativeVoiceInputValue(raw) {

    var digits = parseSpokenCounterDigits(raw);

    if (digits) {

      state.numpadBuffer = digits;

      updateNumpadDisplay();

      clearNumpadHint();

      try { navigator.vibrate(10); } catch (_) {}

    }

    syncNativeVoiceInputFromBuffer();

  }



  function closeNativeDictationInput() {

    var inp = $('sw-cnt-voice-input');

    if (!inp) return;

    inp.classList.remove('sw-cnt-voice-input--live');

    try { inp.blur(); } catch (_) {}

    setCntMicButtonState(false);

  }



  function startNativeDictation() {

    var inp = $('sw-cnt-voice-input');

    if (!inp) {

      showNumpadHint('Dettatura non disponibile');

      return;

    }

    inp.value = state.numpadBuffer || '';

    inp.classList.add('sw-cnt-voice-input--live');

    showNumpadHint('Tocca il microfono sulla tastiera Watch');

    setCntMicButtonState(true);

    try { navigator.vibrate(12); } catch (_) {}

    setTimeout(function () {

      try {

        inp.focus();

        if (inp.setSelectionRange) inp.setSelectionRange(0, inp.value.length);

      } catch (_) {}

    }, 80);

  }



  function bindNativeVoiceInput() {

    var inp = $('sw-cnt-voice-input');

    if (!inp || inp.dataset.boundNative === '1') return;

    inp.dataset.boundNative = '1';

    inp.addEventListener('input', function () {

      applyNativeVoiceInputValue(inp.value);

    });

    inp.addEventListener('change', function () {

      applyNativeVoiceInputValue(inp.value);

    });

    inp.addEventListener('blur', function () {

      closeNativeDictationInput();

    });

    inp.addEventListener('keydown', function (e) {

      if (e.key === 'Enter') {

        e.preventDefault();

        applyNativeVoiceInputValue(inp.value);

        closeNativeDictationInput();

        confirmContatoriNumpad();

      }

    });

  }



  function pickRecorderMime() {

    var types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/aac'];

    for (var i = 0; i < types.length; i++) {

      if (MediaRecorder.isTypeSupported(types[i])) return types[i];

    }

    return '';

  }



  function blobToBase64(blob) {

    return new Promise(function (resolve, reject) {

      var reader = new FileReader();

      reader.onload = function () {

        var dataUrl = String(reader.result || '');

        resolve(dataUrl.split(',')[1] || '');

      };

      reader.onerror = reject;

      reader.readAsDataURL(blob);

    });

  }



  async function callGeminiAudioDigits(base64Data, mimeType, apiKey) {

    var models = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];

    var prompt = 'Contatore numerico italiano. Estrai SOLO cifre 0-9 pronunciate. Rispondi solo con le cifre attaccate, esempio 12345. Niente parole, spazi o unità.';

    var lastErr = null;

    for (var i = 0; i < models.length; i++) {

      try {

        var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + models[i] + ':generateContent?key=' + encodeURIComponent(apiKey);

        var res = await fetch(url, {

          method: 'POST',

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify({

            contents: [{

              parts: [

                { text: prompt },

                { inline_data: { mime_type: mimeType || 'audio/webm', data: base64Data } }

              ]

            }]

          })

        });

        if (!res.ok) {

          lastErr = new Error('HTTP ' + res.status);

          continue;

        }

        var json = await res.json();

        var parts = json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts;

        var text = parts ? parts.map(function (p) { return p.text || ''; }).join('') : '';

        return String(text || '').trim();

      } catch (e) {

        lastErr = e;

      }

    }

    throw lastErr || new Error('Gemini voice failed');

  }



  function initCntVoiceSupport() {

    var speech = initCntSpeechRecognition();

    if (speech) {

      cntSpeechRecognition = speech;

      return 'speech';

    }

    if (canUseMediaRecorderVoice()) return 'record';

    if (canUseNativeDictationInput()) return 'native';

    return 'none';

  }

  function speechErrorMessage(code) {

    var map = {

      'not-allowed': 'Microfono non autorizzato',

      'service-not-allowed': 'Dettatura non consentita',

      'no-speech': 'Non ho sentito nulla',

      'network': 'Serve connessione per la voce',

      'audio-capture': 'Microfono non disponibile',

      'aborted': ''

    };

    return map[code] || 'Errore dettatura';

  }



  function initCntSpeechRecognition() {

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {

      return null;

    }

    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    var rec = new SR();

    rec.lang = CNT_SPEECH_LANG;

    rec.interimResults = true;

    rec.continuous = true;

    rec.maxAlternatives = 1;



    rec.onresult = function (e) {

      var transcript = '';

      for (var i = 0; i < e.results.length; i++) {

        transcript += e.results[i][0].transcript;

      }

      var digits = parseSpokenCounterDigits(transcript);

      if (digits) {

        state.numpadBuffer = digits;

        updateNumpadDisplay();

        clearNumpadHint();

      }

    };



    rec.onstart = function () {

      cntSpeechListening = true;

      setCntMicButtonState(true);

      showNumpadHint('Ascolto… parla ora');

      try { navigator.vibrate(12); } catch (_) {}

    };



    rec.onend = function () {

      cntSpeechListening = false;

      if (cntSpeechWanted) {

        try {

          rec.start();

          return;

        } catch (_) {

          cntSpeechWanted = false;

        }

      }

      setCntMicButtonState(false);

    };



    rec.onerror = function (ev) {

      var code = ev && ev.error ? ev.error : '';

      if (code === 'aborted') return;

      cntSpeechWanted = false;

      cntSpeechListening = false;

      setCntMicButtonState(false);

      var msg = speechErrorMessage(code);

      if (msg) showNumpadHint(msg);

      if (code && code !== 'no-speech') {

        console.warn('[ServiceWatch] dettatura:', code);

      }

    };



    return rec;

  }



  async function ensureMicPermission() {

    if (cntMicPermissionOk === true) return true;

    if (cntMicPermissionOk === false) return false;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {

      cntMicPermissionOk = true;

      return true;

    }

    try {

      var stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      stream.getTracks().forEach(function (t) { t.stop(); });

      cntMicPermissionOk = true;

      return true;

    } catch (_) {

      cntMicPermissionOk = false;

      showNumpadHint('Microfono non autorizzato');

      return false;

    }

  }



  function stopCntSpeech() {

    cntSpeechWanted = false;

    if (cntSpeechRecognition && cntSpeechListening) {

      try { cntSpeechRecognition.stop(); } catch (_) {}

    }

    cntSpeechListening = false;

    setCntMicButtonState(false);

  }



  function startCntSpeech() {

    if (!cntSpeechRecognition) return false;

    cntSpeechWanted = true;

    clearNumpadHint();

    try {

      cntSpeechRecognition.start();

      return true;

    } catch (e) {

      try {

        cntSpeechRecognition.stop();

      } catch (_) {}

      setTimeout(function () {

        if (!cntSpeechWanted) return;

        try { cntSpeechRecognition.start(); } catch (_) {

          cntSpeechWanted = false;

          showNumpadHint('Impossibile avviare ascolto');

        }

      }, 150);

      return true;

    }

  }



  function stopCntVoiceRecord(transcribe) {

    if (cntRecordTimer) {

      clearTimeout(cntRecordTimer);

      cntRecordTimer = null;

    }

    if (cntMediaRecorder && cntRecording) {

      if (transcribe === false) cntMediaRecorder.onstop = null;

      try {

        if (cntMediaRecorder.state === 'recording') cntMediaRecorder.stop();

      } catch (_) {}

    }

    cntRecording = false;

    if (cntMediaStream) {

      cntMediaStream.getTracks().forEach(function (t) { t.stop(); });

      cntMediaStream = null;

    }

    if (transcribe === false) {

      cntRecordChunks = [];

      setCntMicButtonState(false);

    }

  }



  async function transcribeRecordedAudio() {

    setCntMicButtonState(false);

    if (!cntRecordChunks.length) {

      showNumpadHint('Non ho sentito nulla');

      return;

    }

    var mimeType = (cntMediaRecorder && cntMediaRecorder.mimeType) || pickRecorderMime() || 'audio/webm';

    var blob = new Blob(cntRecordChunks, { type: mimeType });

    cntRecordChunks = [];

    var apiKey = getWatchGeminiKey();

    if (!apiKey) {

      showNumpadHint('Su iPhone: Impostazioni → Chiave Gemini');

      return;

    }

    showNumpadHint('Trascrizione…');

    try {

      var base64 = await blobToBase64(blob);

      var text = await callGeminiAudioDigits(base64, mimeType, apiKey);

      var digits = parseSpokenCounterDigits(text);

      if (digits) {

        state.numpadBuffer = digits;

        updateNumpadDisplay();

        clearNumpadHint();

        try { navigator.vibrate(10); } catch (_) {}

        return;

      }

      showNumpadHint('Non ho capito i numeri');

    } catch (e) {

      console.warn('[ServiceWatch] gemini voice:', e && e.message);

      showNumpadHint('Errore trascrizione voce');

    }

  }



  async function startCntVoiceRecord() {

    var allowed = await ensureMicPermission();

    if (!allowed) return false;

    if (!getWatchGeminiKey()) {

      showNumpadHint('Su iPhone: Impostazioni → Chiave Gemini');

      return false;

    }

    try {

      var stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      cntMediaStream = stream;

      cntRecordChunks = [];

      var mimeType = pickRecorderMime();

      cntMediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType: mimeType }) : new MediaRecorder(stream);

      cntMediaRecorder.ondataavailable = function (ev) {

        if (ev.data && ev.data.size) cntRecordChunks.push(ev.data);

      };

      cntMediaRecorder.onstop = function () {

        void transcribeRecordedAudio();

      };

      cntMediaRecorder.start();

      cntRecording = true;

      setCntMicButtonState(true);

      showNumpadHint('Parla ora…');

      try { navigator.vibrate(12); } catch (_) {}

      cntRecordTimer = setTimeout(function () {

        if (cntRecording) stopCntVoiceRecord(true);

      }, CNT_RECORD_MAX_MS);

      return true;

    } catch (e) {

      console.warn('[ServiceWatch] record:', e && e.message);

      stopCntVoiceRecord(false);

      showNumpadHint('Microfono non disponibile');

      return false;

    }

  }



  function stopAllVoice() {

    stopCntSpeech();

    stopCntVoiceRecord(false);

  }



  async function handleMicPress() {

    try { navigator.vibrate(12); } catch (_) {}

    if (cntVoiceMode === 'native') {

      var nativeInp = $('sw-cnt-voice-input');

      if (nativeInp && nativeInp.classList.contains('sw-cnt-voice-input--live')) {

        closeNativeDictationInput();

        clearNumpadHint();

        return;

      }

      startNativeDictation();

      return;

    }

    dismissActiveKeyboard();

    if (cntVoiceMode === 'speech') {

      if (!cntSpeechRecognition) {

        showNumpadHint('Voce non supportata qui');

        return;

      }

      if (cntSpeechWanted || cntSpeechListening) {

        stopCntSpeech();

        clearNumpadHint();

        return;

      }

      var allowedSpeech = await ensureMicPermission();

      if (!allowedSpeech) return;

      startCntSpeech();

      return;

    }

    if (cntVoiceMode === 'record') {

      if (cntRecording) {

        stopCntVoiceRecord(true);

        return;

      }

      await startCntVoiceRecord();

      return;

    }

    showNumpadHint('Voce non disponibile — usa il tastierino');

  }



  function bindMicButton(btn) {

    if (!btn || btn.dataset.boundMic === '1') return;

    btn.dataset.boundMic = '1';

    var lastMicTap = 0;

    var onMic = function (e) {

      if (e && e.type === 'touchend') e.preventDefault();

      var now = Date.now();

      if (now - lastMicTap < 380) return;

      lastMicTap = now;

      if (e) e.stopPropagation();

      handleMicPress();

    };

    btn.addEventListener('click', onMic);

    btn.addEventListener('touchend', onMic);

  }



  function numpadAppendDigit(d) {

    if (state.numpadBuffer.length >= CNT_MAX_LEN) return;

    state.numpadBuffer += d;

    updateNumpadDisplay();

    try { navigator.vibrate(8); } catch (_) {}

  }



  function numpadBackspace() {

    state.numpadBuffer = state.numpadBuffer.slice(0, -1);

    updateNumpadDisplay();

    try { navigator.vibrate(8); } catch (_) {}

  }



  function buildNumpadGrid() {

    var grid = $('sw-cnt-numpad-grid');

    if (!grid || grid.dataset.built === '1') return;

    grid.dataset.built = '1';

    grid.innerHTML = '';

    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (d) {

      var btn = document.createElement('button');

      btn.type = 'button';

      btn.className = 'sw-numpad-key';

      btn.textContent = d;

      btn.addEventListener('click', function () { numpadAppendDigit(d); });

      grid.appendChild(btn);

    });

    var del = document.createElement('button');

    del.type = 'button';

    del.className = 'sw-numpad-key sw-numpad-key--action sw-numpad-key--del';

    del.textContent = '⌫';

    del.setAttribute('aria-label', 'Cancella');

    del.addEventListener('click', numpadBackspace);

    grid.appendChild(del);

    var zero = document.createElement('button');

    zero.type = 'button';

    zero.className = 'sw-numpad-key';

    zero.textContent = '0';

    zero.addEventListener('click', function () { numpadAppendDigit('0'); });

    grid.appendChild(zero);

    var ok = document.createElement('button');

    ok.type = 'button';

    ok.className = 'sw-numpad-key sw-numpad-key--ok';

    ok.textContent = 'OK';

    ok.addEventListener('click', confirmContatoriNumpad);

    grid.appendChild(ok);

  }



  async function persistContatore(fieldId, value) {

    var val = value != null ? String(value).trim() : '';

    state.contatori[fieldId] = val;

    updateContatoriUI();

    if (!db || !auth || !state.authOk || !rapportiniRef) return;

    try {

      var mod = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');

      var snap = await mod.getDoc(rapportiniRef);

      var remote = snap.exists() ? snap.data() : { items: {}, activeId: 'generale' };

      var now = new Date().toISOString();

      if (!remote.items) remote.items = {};

      if (!remote.items.fuochista) {

        remote.items.fuochista = {

          id: 'fuochista',

          name: 'FUOCHISTA',

          data: {},

          updatedAt: now

        };

      }

      if (!remote.items.fuochista.data) remote.items.fuochista.data = {};

      if (val) remote.items.fuochista.data[fieldId] = val;

      else delete remote.items.fuochista.data[fieldId];

      remote.items.fuochista.updatedAt = now;

      remote.lastUpdate = now;

      await mod.setDoc(rapportiniRef, remote);

      cachedRapportiniRemote = remote;

    } catch (e) {

      console.warn('[ServiceWatch] persist contatore:', e && e.message);

    }

  }



  function confirmContatoriNumpad() {

    persistContatore(CNT_FIELD_ID, state.numpadBuffer);

    closeContatoriNumpad();

    try { navigator.vibrate(20); } catch (_) {}

  }



  function loadWatchLocalConfig() {

    try {

      var raw = localStorage.getItem(SW_CFG_KEY);

      if (raw) {

        var p = JSON.parse(raw);

        if (p && p.modules) return p;

      }

    } catch (_) {}

    return null;

  }



  function saveWatchLocalConfig(cfg) {

    try {

      localStorage.setItem(SW_CFG_KEY, JSON.stringify(cfg));

    } catch (_) {}

  }



  function mergeWatchModules(localMods, remoteMods) {

    localMods = localMods || {};

    remoteMods = remoteMods || {};

    var out = JSON.parse(JSON.stringify(localMods));

    Object.keys(remoteMods).forEach(function (mid) {

      if (!out[mid]) out[mid] = {};

      var locEn = !!(localMods[mid] && localMods[mid].enabled);

      var remEn = !!(remoteMods[mid] && remoteMods[mid].enabled);

      out[mid].enabled = locEn ? true : remEn;

    });

    return out;

  }



  function mergeWatchConfig(local, remote) {

    local = local || { modules: state.modules };

    remote = remote || { modules: {} };

    var localTs = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;

    var remoteTs = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0;

    if (localTs > remoteTs && local.modules) {

      var localOut = { modules: JSON.parse(JSON.stringify(local.modules)), updatedAt: local.updatedAt };

      if (remote && remote.geminiVoiceKey) localOut.geminiVoiceKey = remote.geminiVoiceKey;

      return localOut;

    }

    var merged = {

      modules: mergeWatchModules(local.modules, remote.modules),

      updatedAt: remoteTs > localTs

        ? remote.updatedAt

        : (local.updatedAt || remote.updatedAt || new Date().toISOString())

    };

    if (remote && remote.geminiVoiceKey) merged.geminiVoiceKey = remote.geminiVoiceKey;

    else if (local && local.geminiVoiceKey) merged.geminiVoiceKey = local.geminiVoiceKey;

    return merged;

  }



  function applyRemoteStore(remote) {

    if (!remote) return;

    cachedRapportiniRemote = remote;

    var localCfg = loadWatchLocalConfig();

    var remoteSw = remote.serviceWatch;

    if (remoteSw && remoteSw.modules || localCfg) {

      var merged = mergeWatchConfig(localCfg, remoteSw || {});

      if (!merged.modules.contatori) merged.modules.contatori = { enabled: false };

      state.modules = merged.modules;

      saveWatchLocalConfig(merged);

      renderMenu();

    }

    applyChemCountsFromFirestore();

    applyContatoriFromRapportini();

  }



  function applyRemotePlant(plantData) {

    cachedPlantRemote = plantData || null;

    applyChemCountsFromFirestore();

  }



  function enabledModules() {

    var list = [];

    if (state.modules.chemicals && state.modules.chemicals.enabled) {

      list.push({ id: 'chemicals', title: 'Chemicals' });

    }

    if (state.modules.contatori && state.modules.contatori.enabled) {

      list.push({ id: 'contatori', title: 'Contatori' });

    }

    return list;

  }



  function renderMenu() {

    var list = $('sw-menu-list');

    var empty = $('sw-menu-empty');

    if (!list) return;

    var mods = enabledModules();

    list.innerHTML = '';

    if (!mods.length) {

      if (empty) empty.classList.remove('sw-view--hidden');

      return;

    }

    if (empty) empty.classList.add('sw-view--hidden');

    mods.forEach(function (m) {

      var btn = document.createElement('button');

      btn.type = 'button';

      btn.className = 'sw-menu-btn ' + (m.id === 'contatori' ? 'sw-menu-btn--cnt' : 'sw-menu-btn--chem');

      btn.textContent = m.title;

      btn.addEventListener('click', function () {

        if (m.id === 'chemicals') showView('view-chemicals');

        if (m.id === 'contatori') showView('view-contatori');

      });

      list.appendChild(btn);

    });

  }



  function openMenuFromHome() {

    renderMenu();

    var mods = enabledModules();

    if (!mods.length) {

      showView('view-empty');

      return;

    }

    showView('view-menu');

  }



  async function persistChemCounts(pass, hp) {

    state.pass = Math.max(0, pass | 0);

    state.hp = Math.max(0, hp | 0);

    var now = new Date().toISOString();

    var rev = Date.now();

    cachedPlantRemote = Object.assign({}, cachedPlantRemote || {}, {

      chemPass: state.pass,

      chemHp: state.hp,

      lastUpdate: now,

      syncRevision: rev

    });

    updateChemUI();

    if (!db || !auth || !state.authOk || !rapportiniRef || !plantRef) return;

    try {

      var mod = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');

      await mod.setDoc(plantRef, {

        chemPass: state.pass,

        chemHp: state.hp,

        lastUpdate: now,

        syncRevision: rev

      }, { merge: true });

      var snap = await mod.getDoc(rapportiniRef);

      var remote = snap.exists() ? snap.data() : { items: {}, activeId: 'generale' };

      if (!remote.items) remote.items = {};

      if (!remote.items.notturno) {

        remote.items.notturno = {

          id: 'notturno',

          name: 'Notturno',

          data: {},

          updatedAt: now

        };

      }

      if (!remote.items.notturno.data) remote.items.notturno.data = {};

      remote.items.notturno.data._nottChemPass = state.pass;

      remote.items.notturno.data._nottChemHp = state.hp;

      remote.items.notturno.updatedAt = now;

      Object.keys(remote.items).forEach(function (rid) {

        var item = remote.items[rid];

        if (!item) return;

        if (!rapportinoHasChemModule(item)) return;

        if (!item.data) item.data = {};

        item.data._nottChemPass = state.pass;

        item.data._nottChemHp = state.hp;

        item.updatedAt = now;

      });

      remote.lastUpdate = now;

      await mod.setDoc(rapportiniRef, remote);

      cachedRapportiniRemote = remote;

    } catch (e) {

      console.warn('[ServiceWatch] persist chem:', e && e.message);

    }

  }



  function isContatoriNumpadOpen() {

    var pad = $('sw-cnt-numpad');

    return !!(pad && !pad.classList.contains('sw-view--hidden'));

  }



  function goBackOneStep() {

    if (isContatoriNumpadOpen()) {

      closeContatoriNumpad();

      try { navigator.vibrate(8); } catch (_) {}

      return;

    }

    var v = state.currentView || 'view-home';

    if (v === 'view-chemicals' || v === 'view-contatori') {

      showView('view-menu');

      try { navigator.vibrate(10); } catch (_) {}

      return;

    }

    if (v === 'view-menu' || v === 'view-empty') {

      showView('view-home');

      try { navigator.vibrate(10); } catch (_) {}

    }

  }



  function bindSwipeBackGesture() {

    var track = null;

    var EDGE_PX = 32;

    var MIN_DX = 64;

    var MAX_DY = 56;



    function resetSwipeTrack() {

      track = null;

    }



    document.addEventListener('touchstart', function (e) {

      if (!e.touches || e.touches.length !== 1) return;

      if (e.target && e.target.closest && e.target.closest('#sw-cnt-numpad-mic, #sw-cnt-numpad-cancel, #sw-cnt-numpad-grid, .sw-numpad-key, #sw-cnt-numpad-display')) {

        return;

      }

      var t = e.touches[0];

      if (t.clientX > EDGE_PX) return;

      if (!isContatoriNumpadOpen() && state.currentView === 'view-home') return;

      track = { startX: t.clientX, startY: t.clientY };

    }, { passive: true });



    document.addEventListener('touchmove', function (e) {

      if (!track || !e.touches || e.touches.length !== 1) return;

      var t = e.touches[0];

      var dx = t.clientX - track.startX;

      var dy = Math.abs(t.clientY - track.startY);

      if (dx < 0 || dy > MAX_DY) resetSwipeTrack();

    }, { passive: true });



    document.addEventListener('touchend', function (e) {

      if (!track) return;

      var c = e.changedTouches && e.changedTouches[0];

      if (!c) {

        resetSwipeTrack();

        return;

      }

      var dx = c.clientX - track.startX;

      var dy = Math.abs(c.clientY - track.startY);

      if (dx >= MIN_DX && dy <= MAX_DY) goBackOneStep();

      resetSwipeTrack();

    }, { passive: true });



    document.addEventListener('touchcancel', resetSwipeTrack, { passive: true });

  }



  function bindUI() {

    var home = $('view-home');

    if (home) {

      home.addEventListener('click', openMenuFromHome);

    }

    var backMenu = $('sw-back-menu');

    if (backMenu) backMenu.addEventListener('click', function () { showView('view-home'); });

    var backChem = $('sw-back-chem');

    if (backChem) backChem.addEventListener('click', function () { showView('view-menu'); });

    var backCnt = $('sw-back-cnt');

    if (backCnt) backCnt.addEventListener('click', function () { showView('view-menu'); });

    var backEmpty = $('sw-back-empty');

    if (backEmpty) backEmpty.addEventListener('click', function () { showView('view-home'); });



    var passBtn = $('sw-btn-pass');

    if (passBtn) {

      passBtn.addEventListener('click', function () {

        persistChemCounts(state.pass + 1, state.hp);

        try { navigator.vibrate(20); } catch (_) {}

      });

    }

    var hpBtn = $('sw-btn-hp');

    if (hpBtn) {

      hpBtn.addEventListener('click', function () {

        persistChemCounts(state.pass, state.hp + 1);

        try { navigator.vibrate(20); } catch (_) {}

      });

    }

    var resetBtn = $('sw-btn-reset');

    if (resetBtn) {

      resetBtn.addEventListener('click', function () {

        persistChemCounts(0, 0);

        try { navigator.vibrate(15); } catch (_) {}

      });

    }



    var cntBtn = $('sw-cnt-tk9000-btn');

    if (cntBtn) {

      cntBtn.addEventListener('click', openContatoriNumpad);

    }

    var numpadCancel = $('sw-cnt-numpad-cancel');

    if (numpadCancel) {

      numpadCancel.addEventListener('click', closeContatoriNumpad);

    }

    cntVoiceMode = initCntVoiceSupport();

    bindNativeVoiceInput();

    updateMicButtonForVoiceMode();

    bindMicButton($('sw-cnt-numpad-mic'));

    buildNumpadGrid();

    bindSwipeBackGesture();

  }



  async function initFirebase() {

    var firebaseConfig = {

      apiKey: 'AIzaSyASdslVw8q_1Bz9RbN7Q_Fg_PEsbPOSkjM',

      authDomain: 'servicehub-18309.firebaseapp.com',

      projectId: 'servicehub-18309',

      storageBucket: 'servicehub-18309.firebasestorage.app',

      messagingSenderId: '844169156848',

      appId: '1:844169156848:web:91b6c4e08900a350078a35'

    };

    var appMod = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js');

    var authMod = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js');

    var fsMod = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');

    var app = appMod.initializeApp(firebaseConfig);

    auth = authMod.getAuth(app);

    db = fsMod.getFirestore(app);

    rapportiniRef = fsMod.doc(db, 'artifacts', APP_ID, 'sharedDial', 'rapportini');

    plantRef = fsMod.doc(db, 'artifacts', APP_ID, 'sharedDial', 'plant');

    await authMod.signInAnonymously(auth);

    state.authOk = true;

    if (unsub) unsub();

    if (unsubPlant) unsubPlant();

    unsubPlant = fsMod.onSnapshot(plantRef, function (snap) {

      if (!snap.exists()) return;

      var md = snap.metadata;

      if (md && md.hasPendingWrites) return;

      applyRemotePlant(snap.data());

    });

    unsub = fsMod.onSnapshot(rapportiniRef, function (snap) {

      if (!snap.exists()) return;

      var md = snap.metadata;

      if (md && md.hasPendingWrites) return;

      applyRemoteStore(snap.data());

    });

    var plantFirst = await fsMod.getDoc(plantRef);

    if (plantFirst.exists()) applyRemotePlant(plantFirst.data());

    var rapportiniFirst = await fsMod.getDoc(rapportiniRef);

    if (rapportiniFirst.exists()) applyRemoteStore(rapportiniFirst.data());

    else if (!plantFirst.exists()) state.ready = true;

  }



  (function hydrateWatchModulesFromLocal() {

    var localCfg = loadWatchLocalConfig();

    if (localCfg && localCfg.modules) {

      state.modules = JSON.parse(JSON.stringify(localCfg.modules));

      if (!state.modules.contatori) state.modules.contatori = { enabled: false };

    }

  })();



  bindUI();

  showView('view-home');

  initFirebase().catch(function (e) {

    console.warn('[ServiceWatch] init:', e && e.message);

    state.ready = true;

  });

})();


