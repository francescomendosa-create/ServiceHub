(function () {
  'use strict';

  var APP_ID = 'stabile-2026-v4';
  var state = {
    pass: 0,
    hp: 0,
    modules: { chemicals: { enabled: false } },
    ready: false,
    authOk: false
  };

  var db = null;
  var auth = null;
  var rapportiniRef = null;
  var unsub = null;

  function $(id) { return document.getElementById(id); }

  function setScrollTheme(viewId) {
    document.body.classList.remove('sw-bg-home', 'sw-bg-panel');
    document.body.classList.add(viewId === 'view-home' ? 'sw-bg-home' : 'sw-bg-panel');
    var root = $('sw-scroll-root');
    if (root) root.scrollTop = 0;
  }

  function showView(name) {
    ['view-home', 'view-menu', 'view-chemicals', 'view-empty'].forEach(function (id) {
      var el = $(id);
      if (el) el.classList.toggle('sw-view--hidden', id !== name);
    });
    setScrollTheme(name);
  }

  function getChemCounts(data) {
    data = data || {};
    return {
      pass: Math.max(0, parseInt(data._nottChemPass, 10) || 0),
      hp: Math.max(0, parseInt(data._nottChemHp, 10) || 0)
    };
  }

  function updateChemUI() {
    var p = $('sw-chem-pass');
    var h = $('sw-chem-hp');
    if (p) p.textContent = String(state.pass);
    if (h) h.textContent = String(state.hp);
  }

  function applyRemoteStore(remote) {
    if (!remote) return;
    if (remote.serviceWatch && remote.serviceWatch.modules) {
      state.modules = JSON.parse(JSON.stringify(remote.serviceWatch.modules));
    }
    var nott = remote.items && remote.items.notturno;
    var c = getChemCounts(nott && nott.data);
    state.pass = c.pass;
    state.hp = c.hp;
    state.ready = true;
    updateChemUI();
  }

  function enabledModules() {
    var list = [];
    if (state.modules.chemicals && state.modules.chemicals.enabled) {
      list.push({ id: 'chemicals', title: 'Chemicals' });
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
      btn.className = 'sw-menu-btn sw-menu-btn--chem';
      btn.textContent = m.title;
      btn.addEventListener('click', function () {
        if (m.id === 'chemicals') showView('view-chemicals');
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
    updateChemUI();
    if (!db || !auth || !state.authOk || !rapportiniRef) return;
    try {
      var mod = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
      var snap = await mod.getDoc(rapportiniRef);
      var remote = snap.exists() ? snap.data() : { items: {}, activeId: 'generale' };
      if (!remote.items) remote.items = {};
      if (!remote.items.notturno) {
        remote.items.notturno = {
          id: 'notturno',
          name: 'Notturno',
          data: {},
          updatedAt: new Date().toISOString()
        };
      }
      if (!remote.items.notturno.data) remote.items.notturno.data = {};
      remote.items.notturno.data._nottChemPass = state.pass;
      remote.items.notturno.data._nottChemHp = state.hp;
      remote.items.notturno.updatedAt = new Date().toISOString();
      remote.lastUpdate = new Date().toISOString();
      await mod.setDoc(rapportiniRef, remote);
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
        if (confirm('Azzerare PASS e HP?')) persistChemCounts(0, 0);
      });
    }
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
    await authMod.signInAnonymously(auth);
    state.authOk = true;
    if (unsub) unsub();
    unsub = fsMod.onSnapshot(rapportiniRef, function (snap) {
      if (!snap.exists()) return;
      var md = snap.metadata;
      if (md && md.hasPendingWrites) return;
      applyRemoteStore(snap.data());
    });
    var first = await fsMod.getDoc(rapportiniRef);
    if (first.exists()) applyRemoteStore(first.data());
    else state.ready = true;
  }

  bindUI();
  showView('view-home');
  initFirebase().catch(function (e) {
    console.warn('[ServiceWatch] init:', e && e.message);
    state.ready = true;
  });
})();
