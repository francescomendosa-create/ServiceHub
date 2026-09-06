(function () {
    window.__SH_NATIVE_ANDROID = true;
    window.__shSpenHasNativeEngine = function () {
        try {
            return !!(window.ServiceHubAndroidSpen && typeof window.ServiceHubAndroidSpen.recognize === 'function');
        } catch (e) {
            return false;
        }
    };
    window.__shSpenNativeCbs = window.__shSpenNativeCbs || {};
    window.__shSpenNativeResult = function (id, text) {
        var cb = window.__shSpenNativeCbs && window.__shSpenNativeCbs[id];
        if (cb) cb(text);
    };
    window.__shSpenNativeRecognize = function (strokes) {
        return new Promise(function (resolve) {
            var b = window.ServiceHubAndroidSpen;
            if (!b || typeof b.recognize !== 'function') {
                resolve('');
                return;
            }
            var id = 'n' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
            var done = false;
            var finish = function (t) {
                if (done) return;
                done = true;
                delete window.__shSpenNativeCbs[id];
                resolve(t || '');
            };
            window.__shSpenNativeCbs[id] = finish;
            try {
                b.recognize(id, JSON.stringify(strokes || []));
            } catch (e) {
                finish('');
                return;
            }
            setTimeout(function () { finish(''); }, 8000);
        });
    };

    function imeNumberNow() {
        var ink = window.__shSpenInk;
        if (!ink) return '';
        var origin = window.__shSpenNormalizeNumber
            ? window.__shSpenNormalizeNumber(ink.originValue)
            : String(ink.originValue || '');
        var live = ink.input && window.__shSpenNormalizeNumber
            ? window.__shSpenNormalizeNumber(ink.input.value)
            : '';
        var ime = window.__shSpenNormalizeNumber
            ? window.__shSpenNormalizeNumber(ink.imeText || '')
            : '';
        var best = '';
        if (ime && ime !== origin) best = ime;
        if (live && live !== origin && live.length >= best.length) best = live;
        return best || '';
    }

    function waitIme(ms) {
        return new Promise(function (resolve) {
            var t0 = Date.now();
            var tick = function () {
                var n = imeNumberNow();
                if (n || Date.now() - t0 >= ms) {
                    resolve(n);
                    return;
                }
                setTimeout(tick, 40);
            };
            tick();
        });
    }

    window.__shSpenRecognizeStrokes = function (strokeSnap) {
        var raw = strokeSnap || [];
        return waitIme(380).then(function (ime) {
            if (ime) return ime;
            if (!raw.length) return '';
            return window.__shSpenNativeRecognize(raw).then(function (text) {
                return (window.__shSpenNormalizeNumber
                    ? window.__shSpenNormalizeNumber(text)
                    : String(text || '')) || '';
            });
        });
    };

    window.__shSpenRecognizeDigitsLocal = function () { return ''; };

    function allowIme(el) {
        if (!el || el.nodeType !== 1) return;
        if (el.id === 'inp-sec-note') return;
        el.setAttribute('writingsuggestions', 'true');
    }
    allowIme(document.documentElement);
    if (document.body) allowIme(document.body);
    var mc = document.querySelector('.main-container');
    if (mc) allowIme(mc);
    document.querySelectorAll('.main-container input, .main-container textarea').forEach(allowIme);
})();
