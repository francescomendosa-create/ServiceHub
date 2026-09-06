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
            setTimeout(function () { finish(''); }, 5000);
        });
    };

    function onlyNumber(text) {
        if (text == null) return '';
        var s = String(text).trim()
            .replace(/[oO]/g, '0')
            .replace(/[lI|]/g, '1')
            .replace(/[sS]/g, '5')
            .replace(/[bB]/g, '8')
            .replace(/\s+/g, '')
            .replace(/\./g, ',')
            .replace(/[^0-9,]/g, '');
        var i = s.indexOf(',');
        if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/,/g, '');
        if (s === ',' || s === '') return '';
        return s;
    }

    window.__shSpenNormalizeNumber = onlyNumber;

    function isPlantField(el) {
        if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return false;
        if (el.id === 'inp-sec-note') return false;
        if (!el.closest || !el.closest('.main-container')) return false;
        return true;
    }

    function isCut(strokes, hostRect) {
        if (!strokes || !strokes.length || !hostRect) return false;
        var fieldW = hostRect.w || 0;
        var fieldH = hostRect.h || 0;
        if (fieldW < 10) return false;
        for (var s = 0; s < strokes.length; s++) {
            var pts = strokes[s];
            if (!pts || pts.length < 2) continue;
            var minx = pts[0].x, maxx = pts[0].x, miny = pts[0].y, maxy = pts[0].y;
            var reversals = 0, dir = 0;
            for (var i = 1; i < pts.length; i++) {
                if (pts[i].x < minx) minx = pts[i].x;
                if (pts[i].x > maxx) maxx = pts[i].x;
                if (pts[i].y < miny) miny = pts[i].y;
                if (pts[i].y > maxy) maxy = pts[i].y;
                var dx = pts[i].x - pts[i - 1].x;
                if (Math.abs(dx) > 3) {
                    var nd = dx > 0 ? 1 : -1;
                    if (dir && nd !== dir) reversals++;
                    dir = nd;
                }
            }
            var horiz = maxx - minx;
            var vert = maxy - miny;
            var flat = horiz >= Math.max(18, fieldW * 0.42) && vert <= Math.max(14, fieldH * 0.45);
            var scribble = reversals >= 2 && horiz >= Math.max(16, fieldW * 0.36) && vert <= Math.max(18, fieldH * 0.55);
            if (flat || scribble) return true;
        }
        return false;
    }

    window.__shSpenRecognizeDigitsLocal = function () { return ''; };

    window.__shSpenRecognizeStrokes = function (strokeSnap) {
        var raw = strokeSnap || [];
        var ink = window.__shSpenInk;
        var hostRect = ink && ink.hostRect;
        if (isCut(raw, hostRect) && ink && ink.originValue) {
            return Promise.resolve('');
        }
        if (!raw.length) return Promise.resolve('');
        return window.__shSpenNativeRecognize(raw).then(function (text) {
            return onlyNumber(text);
        });
    };

    if (typeof window.__shSpenIsStrikethrough === 'function' && !window.__shSpenIsStrikethrough.__shLoose) {
        var cutOrig = window.__shSpenIsStrikethrough;
        var cutLoose = function (strokes, hostRect, textBox) {
            try {
                if (cutOrig(strokes, hostRect, textBox)) return true;
            } catch (e) {}
            return isCut(strokes, hostRect);
        };
        cutLoose.__shLoose = true;
        window.__shSpenIsStrikethrough = cutLoose;
    }

    if (typeof window.__shSpenApplyFieldEdit === 'function' && !window.__shSpenApplyFieldEdit.__shNumOnly) {
        var applyOrig = window.__shSpenApplyFieldEdit;
        var applySafe = function (input, recognized, origin, mode) {
            if (mode === 'clear') return applyOrig(input, '', origin, 'clear');
            var rec = onlyNumber(recognized);
            if (!rec) return false;
            return applyOrig(input, rec, origin, mode || 'replace');
        };
        applySafe.__shNumOnly = true;
        window.__shSpenApplyFieldEdit = applySafe;
    }

    if (typeof window.__shSpenEditModeFromStrokes === 'function' && !window.__shSpenEditModeFromStrokes.__shCut) {
        var modeOrig = window.__shSpenEditModeFromStrokes;
        var modeSafe = function (strokes, input, origin, hostRect) {
            if (isCut(strokes, hostRect) && origin) return 'clear';
            return modeOrig(strokes, input, origin, hostRect);
        };
        modeSafe.__shCut = true;
        window.__shSpenEditModeFromStrokes = modeSafe;
    }

    function unlockInk() {
        var ink = window.__shSpenInk;
        window.__shPenIsDown = false;
        window.__shPenPointerId = null;
        if (document.body) {
            document.body.classList.remove('sh-spen-ink-open', 'sh-stylus-pen-active', 'sh-long-press-lock');
        }
        if (!ink) return;
        ink.active = false;
        ink.watchOnly = false;
        ink.capture = false;
        ink.current = null;
        ink.strokes = [];
        ink.pointerId = null;
        var host = document.getElementById('sh-spen-ink-host');
        if (host) {
            host.classList.remove('sh-spen-ink-on', 'sh-spen-ink-capture', 'sh-spen-samsung-on');
            host.style.display = 'none';
        }
    }

    if (!window.__shNativeNumHookReady) {
        window.__shNativeNumHookReady = true;
        document.addEventListener('beforeinput', function (e) {
            if (!isPlantField(e.target)) return;
            var typ = e.inputType || '';
            if (typ.indexOf('delete') === 0 || typ === 'historyUndo' || typ === 'historyRedo') return;
            var data = e.data == null ? '' : String(e.data);
            if (!data) return;
            if (!/^[0-9,]+$/.test(data) && e.cancelable) e.preventDefault();
        }, true);
        document.addEventListener('input', function (e) {
            if (!isPlantField(e.target)) return;
            var ink = window.__shSpenInk;
            if (ink && (ink.input === e.target || ink.inputId === e.target.id)) {
                ink.imeText = onlyNumber(e.target.value);
            }
            var next = onlyNumber(e.target.value);
            if (String(e.target.value || '') !== next && next !== '') {
                e.target.value = next;
            }
        }, true);
        setInterval(function () {
            var ink = window.__shSpenInk;
            if (!ink || !ink.active) {
                if (document.body && document.body.classList.contains('sh-spen-ink-open') && !window.__shPenIsDown) {
                    document.body.classList.remove('sh-spen-ink-open');
                }
                return;
            }
            var age = Date.now() - (ink.sessionStartMs || ink.startMs || 0);
            if (window.__shPenIsDown && (Date.now() - (window.__shPenLastEventTs || 0)) > 1600) {
                window.__shPenIsDown = false;
            }
            if (age > 3500 && !window.__shPenIsDown) {
                if (typeof window.__shSpenCommitNow === 'function') window.__shSpenCommitNow();
            }
            if (age > 7000) unlockInk();
        }, 400);
    }
})();
