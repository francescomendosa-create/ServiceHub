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
    window.__shSpenRecognizeStrokes = function (strokeSnap) {
        var raw = strokeSnap || [];
        if (!raw || !raw.length) return Promise.resolve('');
        return window.__shSpenNativeRecognize(raw).then(function (text) {
            return (window.__shSpenNormalizeNumber ? window.__shSpenNormalizeNumber(text) : String(text || '')) || '';
        });
    };

    window.__shSpenRecognizeDigitsLocal = function () { return ''; };

    function killImeAttr(el) {
        if (!el || el.nodeType !== 1) return;
        el.setAttribute('writingsuggestions', 'false');
    }
    killImeAttr(document.documentElement);
    if (document.body) killImeAttr(document.body);
    var mc = document.querySelector('.main-container');
    if (mc) killImeAttr(mc);
    document.querySelectorAll('.main-container input, .main-container textarea').forEach(killImeAttr);

    if (!window.__shNativeImeGuardReady) {
        window.__shNativeImeGuardReady = true;
        document.addEventListener('beforeinput', function (e) {
            var ink = window.__shSpenInk;
            if (!ink || !ink.active || e.target !== ink.input) return;
            if (window.__shPenIsDown || (ink.current && ink.current.length)) {
                if (e.cancelable) e.preventDefault();
            }
        }, true);
    }
})();
