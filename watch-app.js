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
    authOk: false
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

  function updateNumpadDisplay() {
    var disp = $('sw-cnt-numpad-display');
    if (disp) disp.textContent = state.numpadBuffer || '—';
  }

  function openContatoriNumpad() {
    state.numpadBuffer = state.contatori[CNT_FIELD_ID] || '';
    updateNumpadDisplay();
    var pad = $('sw-cnt-numpad');
    if (pad) pad.classList.remove('sw-view--hidden');
  }

  function closeContatoriNumpad() {
    var pad = $('sw-cnt-numpad');
    if (pad) pad.classList.add('sw-view--hidden');
    state.numpadBuffer = '';
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
      return { modules: JSON.parse(JSON.stringify(local.modules)), updatedAt: local.updatedAt };
    }
    return {
      modules: mergeWatchModules(local.modules, remote.modules),
      updatedAt: remoteTs > localTs
        ? remote.updatedAt
        : (local.updatedAt || remote.updatedAt || new Date().toISOString())
    };
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
    buildNumpadGrid();
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
