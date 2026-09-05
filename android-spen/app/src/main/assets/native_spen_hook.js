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
    var origRec = window.__shSpenRecognizeStrokes;
    window.__shSpenRecognizeStrokes = function (strokeSnap) {
        var raw = strokeSnap || [];
        if (!raw || !raw.length) return Promise.resolve('');
        if (window.ServiceHubAndroidSpen && typeof window.ServiceHubAndroidSpen.recognize === 'function') {
            return window.__shSpenNativeRecognize(raw).then(function (text) {
                return (window.__shSpenNormalizeNumber ? window.__shSpenNormalizeNumber(text) : String(text || '')) || '';
            });
        }
        return origRec ? origRec(strokeSnap) : Promise.resolve('');
    };

    function killImeAttr(el) {
        if (!el || el.nodeType !== 1) return;
        el.setAttribute('writingsuggestions', 'false');
    }
    killImeAttr(document.documentElement);
    if (document.body) killImeAttr(document.body);
    var mc = document.querySelector('.main-container');
    if (mc) killImeAttr(mc);
    document.querySelectorAll('.main-container input, .main-container textarea').forEach(killImeAttr);

    var css = document.getElementById('sh-native-spen-css');
    if (!css) {
        css = document.createElement('style');
        css.id = 'sh-native-spen-css';
        css.textContent =
            '.main-container input.sh-spen-writing,.main-container textarea.sh-spen-writing{' +
            'color:transparent!important;-webkit-text-fill-color:transparent!important;' +
            'caret-color:transparent!important;}';
        document.documentElement.appendChild(css);
    }

    if (!window.__shNativeImeGuardReady) {
        window.__shNativeImeGuardReady = true;
        var block = function (e) {
            var ink = window.__shSpenInk;
            if (!ink || !ink.active || !ink.input) return;
            if (e.target !== ink.input) return;
            if (e.cancelable) e.preventDefault();
        };
        document.addEventListener('beforeinput', block, true);
        document.addEventListener('compositionstart', block, true);
        document.addEventListener('input', function (e) {
            var ink = window.__shSpenInk;
            if (!ink || !ink.active || !ink.input) return;
            if (e.target !== ink.input) return;
            e.target.value = ink.originValue || '';
            ink.imeText = ink.originValue || '';
        }, true);
        setInterval(function () {
            var ink = window.__shSpenInk;
            var nodes = document.querySelectorAll('.sh-spen-writing');
            for (var i = 0; i < nodes.length; i++) {
                if (!ink || !ink.active || ink.input !== nodes[i]) nodes[i].classList.remove('sh-spen-writing');
            }
            if (ink && ink.active && ink.input) {
                ink.input.classList.add('sh-spen-writing');
                ink.input.setAttribute('writingsuggestions', 'false');
                if (!ink.input.readOnly) {
                    if (ink.input.getAttribute('data-sh-spen-ro') == null) {
                        ink.input.setAttribute('data-sh-spen-ro', '0');
                    }
                    ink.input.readOnly = true;
                }
                ink.imeText = ink.originValue || '';
            }
        }, 80);
    }
})();
