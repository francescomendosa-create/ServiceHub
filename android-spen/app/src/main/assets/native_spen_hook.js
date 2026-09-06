(function () {
    window.__SH_NATIVE_ANDROID = true;
    window.__shSpenSkipIme = true;
    window.__SPEN_COMMIT_MS = 700;
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
    window.__shSpenRecognizeDigitsLocal = function () { return ''; };

    function onlyNumber(text) {
        if (text == null) return '';
        var s = String(text).trim()
            .replace(/[oO]/g, '0').replace(/[lI|]/g, '1')
            .replace(/[sS]/g, '5').replace(/[bB]/g, '8')
            .replace(/\s+/g, '').replace(/\./g, ',')
            .replace(/[^0-9,]/g, '');
        var i = s.indexOf(',');
        if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/,/g, '');
        return (s === ',' || s === '') ? '' : s;
    }
    window.__shSpenNormalizeNumber = onlyNumber;

    function isPlantField(el) {
        if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return false;
        if (el.id === 'inp-sec-note') return false;
        return !!(el.closest && el.closest('.main-container'));
    }

    function ensureInk() {
        if (typeof window.__initAndroidSpenInk === 'function') {
            try { window.__initAndroidSpenInk(); } catch (e) {}
        }
        if (!window.__shSpenInk) {
            window.__shSpenInk = { active: false, strokes: [], current: null, input: null, inputId: '', originValue: '' };
        }
        return window.__shSpenInk;
    }

    function wireCanvas(host, ink) {
        if (!host || !ink) return null;
        var cvs = host.querySelector('canvas');
        if (!cvs) {
            cvs = document.createElement('canvas');
            cvs.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none;touch-action:none;';
            host.appendChild(cvs);
        }
        ink.host = host;
        ink.canvas = cvs;
        ink.ctx = cvs.getContext('2d');
        return cvs;
    }

    function ensureHost() {
        var ink = ensureInk();
        var host = document.getElementById('sh-spen-ink-host');
        if (!host) {
            if (!document.body) return null;
            host = document.createElement('div');
            host.id = 'sh-spen-ink-host';
            host.setAttribute('aria-hidden', 'true');
            host.style.cssText = 'position:fixed;z-index:12050;pointer-events:none;'
                + 'outline:2px solid #2563eb;outline-offset:-2px;background:transparent;display:none;';
            document.body.appendChild(host);
        }
        wireCanvas(host, ink);
        return host;
    }

    function sizeCanvas(ink, w, h) {
        var cvs = ink && ink.canvas;
        if (!cvs || !ink.ctx || w < 2 || h < 2) return;
        var dpr = Math.max(1, window.devicePixelRatio || 1);
        var nw = Math.max(1, Math.round(w * dpr));
        var nh = Math.max(1, Math.round(h * dpr));
        if (cvs.width === nw && cvs.height === nh) return;
        cvs.width = nw;
        cvs.height = nh;
        ink.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ink.ctx.lineCap = 'round';
        ink.ctx.lineJoin = 'round';
        ink.ctx.strokeStyle = '#1d4ed8';
        ink.ctx.lineWidth = 2.2;
    }

    function clearInkPixels(ink, keepStrokes) {
        if (!ink) return;
        if (!keepStrokes) {
            ink.strokes = [];
            ink.current = null;
            ink.pendingPred = null;
            ink.pendingPredCount = 0;
        }
        if (ink.ctx && ink.hostRect) {
            try { ink.ctx.clearRect(0, 0, ink.hostRect.w, ink.hostRect.h); } catch (e) {}
        } else if (ink.ctx && ink.canvas) {
            try { ink.ctx.clearRect(0, 0, ink.canvas.width, ink.canvas.height); } catch (e) {}
        }
    }

    function layoutBoxOn(input) {
        if (!input || !input.isConnected) return false;
        var ink = ensureInk();
        var host = ensureHost();
        if (!host) return false;
        var box = window.__shSpenFieldBox ? window.__shSpenFieldBox(input) : input;
        var r = box.getBoundingClientRect();
        var pad = 6;
        var left = Math.max(0, r.left - pad);
        var top = Math.max(0, r.top - pad);
        var w = r.width + pad * 2;
        var h = r.height + pad * 2;
        if (w < 2 || h < 2) return false;
        var key = (input.id || '') + ':' + Math.round(left) + ':' + Math.round(top) + ':' + Math.round(w) + ':' + Math.round(h);
        var fieldChanged = !!(ink.hoverInput && ink.hoverInput !== input);
        ink.hoverInput = input;
        ink.hostRect = { left: left, top: top, w: w, h: h };
        if (fieldChanged && !window.__shPenIsDown) clearInkPixels(ink, true);
        if (ink.layoutKey === key && ink.canvas && ink.ctx && host.style.display === 'block') {
            syncWriteLock(window.__shPenIsDown);
            return true;
        }
        ink.layoutKey = key;
        host.style.display = 'block';
        host.style.left = left + 'px';
        host.style.top = top + 'px';
        host.style.width = w + 'px';
        host.style.height = h + 'px';
        host.style.pointerEvents = 'none';
        host.style.outline = '2px solid #2563eb';
        host.classList.add('sh-spen-ink-on');
        if (!ink.canvas || !ink.ctx) sizeCanvas(ink, w, h);
        else if (!window.__shPenIsDown) sizeCanvas(ink, w, h);
        syncWriteLock(window.__shPenIsDown);
        return true;
    }

    function syncWriteLock(writing) {
        if (!document.body) return;
        if (writing) {
            document.body.classList.add('sh-spen-ink-open', 'sh-spen-writing');
        } else {
            document.body.classList.remove('sh-spen-writing');
            document.body.classList.remove('sh-spen-ink-open');
        }
    }

    function hideBox() {
        window.__shSpenWantBox = false;
        var ink = window.__shSpenInk;
        if (ink) ink.layoutKey = '';
        var host = document.getElementById('sh-spen-ink-host');
        if (host) {
            host.style.display = 'none';
            host.classList.remove('sh-spen-ink-on', 'sh-spen-ink-capture');
        }
        syncWriteLock(false);
        if (ink && ink.ctx && ink.hostRect) {
            try { ink.ctx.clearRect(0, 0, ink.hostRect.w, ink.hostRect.h); } catch (e) {}
        }
    }
    window.__shSpenHideBox = function () {
        var ink = window.__shSpenInk;
        if (ink && ink.active && ((ink.strokes && ink.strokes.length) || ink.current)) return;
        hideBox();
    };

    function allStrokes(ink) {
        if (!ink) return [];
        var raw = (ink.strokes || []).slice();
        if (ink.current && ink.current.length) raw.push(ink.current);
        return raw;
    }

    function strokeBox(pts) {
        if (!pts || pts.length < 2) return null;
        var minx = pts[0].x, maxx = pts[0].x, miny = pts[0].y, maxy = pts[0].y;
        for (var i = 1; i < pts.length; i++) {
            if (pts[i].x < minx) minx = pts[i].x;
            if (pts[i].x > maxx) maxx = pts[i].x;
            if (pts[i].y < miny) miny = pts[i].y;
            if (pts[i].y > maxy) maxy = pts[i].y;
        }
        return { w: maxx - minx, h: maxy - miny };
    }

    function isFullStrikethrough(strokes, hostRect) {
        if (!strokes || strokes.length !== 1 || !hostRect) return false;
        var b = strokeBox(strokes[0]);
        if (!b) return false;
        var fieldW = hostRect.w || 36;
        var fieldH = hostRect.h || 28;
        return b.w >= Math.max(28, fieldW * 0.72)
            && b.w > b.h * 4
            && b.h <= Math.max(10, fieldH * 0.32);
    }

    function boundInput(ink) {
        if (!ink) return null;
        if (ink.input && ink.input.isConnected) return ink.input;
        if (ink.inputId) return document.getElementById(ink.inputId);
        return null;
    }

    function looksLikeCut(ink) {
        if (!ink || ink.imeCleared || ink.holdClear) return false;
        var input = boundInput(ink);
        var origin = ink.originValue || (input && input.value) || '';
        if (!String(origin).trim()) return false;
        return isFullStrikethrough(allStrokes(ink), ink.hostRect);
    }

    function findFieldAt(x, y) {
        var inp = null;
        if (typeof window.__shSpenFindWritableInputAt === 'function') inp = window.__shSpenFindWritableInputAt(x, y);
        if (!inp) {
            try {
                var el = document.elementFromPoint(x, y);
                if (typeof window.__shSpenFindWritableInput === 'function') inp = window.__shSpenFindWritableInput(el);
            } catch (e) {}
        }
        return inp;
    }

    function pinScrollHere() {
        var ink = window.__shSpenInk;
        if (!ink) return;
        ink.lockX = window.scrollX || 0;
        ink.lockY = window.scrollY || document.documentElement.scrollTop || 0;
    }

    function beginWrite(ink, input, continueWrite) {
        if (!ink) return;
        pinScrollHere();
        if (ink.idleTimer) {
            clearTimeout(ink.idleTimer);
            ink.idleTimer = null;
        }
        ink.imeCleared = false;
        ink.holdClear = false;
        ink.cutGuardUntil = 0;
        ink.showResult = false;
        ink.released = false;
        ink.imePending = '';
        ink.imeText = '';
        if (!continueWrite) {
            ink.pendingPred = null;
            ink.pendingPredCount = 0;
            ink.writeGen = (ink.writeGen || 0) + 1;
        }
        window.__shSpenSkipIme = true;
        if (input) {
            if (!continueWrite) ink.originValue = String(input.value || '');
            ink.clearInputId = '';
            if (input.id !== 'inp-sec-note') {
                input.setAttribute('inputmode', 'decimal');
                input.setAttribute('pattern', '[0-9,]*');
            }
        }
    }

    function applyFinal(input, rec, origin, mode) {
        if (!input) return false;
        if (typeof window.__shSpenApplyFieldEdit === 'function') {
            return window.__shSpenApplyFieldEdit(input, rec, origin, mode);
        }
        input.value = rec || '';
        try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
        if (typeof window.saveData === 'function') window.saveData(true);
        return true;
    }

    function keepEmpty(input) {
        if (!input) return;
        if (String(input.value || '') !== '') input.value = '';
    }

    function forceClear(ink) {
        var input = boundInput(ink);
        var origin = ink ? (ink.originValue || '') : '';
        if (ink) {
            ink.imeCleared = true;
            ink.holdClear = true;
            ink.imePending = '';
            ink.imeText = '';
            ink.originValue = '';
            ink.showResult = true;
            ink.released = true;
            ink.strokes = [];
            ink.current = null;
            ink.clearInputId = input && input.id ? input.id : '';
            ink.cutGuardUntil = Date.now() + 1600;
        }
        if (!input) return;
        applyFinal(input, '', origin, 'clear');
        keepEmpty(input);
        layoutBoxOn(input);
        if (ink && ink.ctx && ink.hostRect) {
            try { ink.ctx.clearRect(0, 0, ink.hostRect.w, ink.hostRect.h); } catch (e) {}
        }
    }

    function retarget(input) {
        if (!input || (window.__shSpenIsWritableInput && !window.__shSpenIsWritableInput(input))) return false;
        var ink = ensureInk();
        if (ink.input === input && ink.active) {
            beginWrite(ink, input, true);
            layoutBoxOn(input);
            if (document.activeElement !== input) {
                try { input.focus({ preventScroll: true }); } catch (e) { try { input.focus(); } catch (e2) {} }
            }
            return true;
        }
        if (ink.active && ink.input && ink.input !== input) {
            if (looksLikeCut(ink)) forceClear(ink);
        }
        ink.epoch = (ink.epoch || 0) + 1;
        clearInkPixels(ink);
        ink.imeText = '';
        ink.imePending = '';
        ink.active = true;
        ink.input = input;
        ink.inputId = input.id || '';
        ink.hoverInput = input;
        ink.sessionStartMs = Date.now();
        beginWrite(ink, input);
        layoutBoxOn(input);
        if (document.activeElement !== input) {
            try { input.focus({ preventScroll: true }); } catch (e) { try { input.focus(); } catch (e2) {} }
        }
        return true;
    }

    function nativeRecognize(strokes) {
        return new Promise(function (resolve) {
            try {
                if (!window.ServiceHubAndroidSpen || typeof window.ServiceHubAndroidSpen.recognize !== 'function') {
                    resolve('');
                    return;
                }
                var id = 'r' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
                var done = false;
                var finish = function (t) {
                    if (done) return;
                    done = true;
                    try { delete window.__shSpenNativeCbs[id]; } catch (e) {}
                    resolve(onlyNumber(t));
                };
                window.__shSpenNativeCbs[id] = finish;
                setTimeout(function () { finish(''); }, 2500);
                window.ServiceHubAndroidSpen.recognize(id, JSON.stringify(strokes || []));
            } catch (e) {
                resolve('');
            }
        });
    }

    function cloneStrokes(raw) {
        var out = [];
        if (!raw) return out;
        for (var i = 0; i < raw.length; i++) {
            var pts = raw[i];
            if (!pts || !pts.length) continue;
            out.push(pts.map(function (p) { return { x: p.x, y: p.y, t: p.t }; }));
        }
        return out;
    }

    window.__shSpenHoverAt = function (x, y) {
        if (window.__shPenIsDown) return false;
        var ink = ensureInk();
        var writing = !!(ink.active && ((ink.strokes && ink.strokes.length) || (ink.current && ink.current.length)));
        if (writing) {
            var stay = boundInput(ink);
            if (stay) return layoutBoxOn(stay);
        }
        var inp = findFieldAt(x, y);
        if (!inp) {
            if (!writing) hideBox();
            return false;
        }
        ink.hoverInput = inp;
        return layoutBoxOn(inp);
    };

    window.__shSpenPointAt = function (x, y) {
        var ink = window.__shSpenInk;
        var inp = findFieldAt(x, y) || (ink && ink.hoverInput);
        if (!inp) return false;
        return retarget(inp);
    };

    window.__shSpenRecognizeStrokes = function (strokeSnap) {
        var ink = window.__shSpenInk;
        if (ink && (ink.imeCleared || ink.holdClear)) return Promise.resolve('');
        if (ink && looksLikeCut(ink)) {
            forceClear(ink);
            return Promise.resolve('');
        }
        var gen = ink ? ink.writeGen : 0;
        return nativeRecognize(strokeSnap || []).then(function (n) {
            var now = window.__shSpenInk;
            if (!now || now.writeGen !== gen) return '';
            return n;
        });
    };

    function canCommitTo(input) {
        var ink = window.__shSpenInk;
        if (!input || !input.id || !ink || !ink.pendingCommitIds) return false;
        return !!ink.pendingCommitIds[input.id];
    }

    function markPendingCommit(input) {
        var ink = window.__shSpenInk;
        if (!ink || !input || !input.id) return;
        ink.pendingCommitIds = ink.pendingCommitIds || {};
        ink.pendingCommitIds[input.id] = Date.now();
    }

    function consumePendingCommit(input) {
        var ink = window.__shSpenInk;
        if (!ink || !ink.pendingCommitIds || !input || !input.id) return;
        delete ink.pendingCommitIds[input.id];
    }

    function pickFinalNumber(origin, rec) {
        var orig = onlyNumber(origin);
        rec = onlyNumber(rec);
        if (!rec) return '';
        if (!orig) return rec;
        if (rec === orig) return rec;
        if (rec.indexOf(orig) === 0) return rec;
        if (orig.indexOf(rec) === 0) return orig;
        return rec;
    }

    if (typeof window.__shSpenApplyFieldEdit === 'function' && !window.__shSpenApplyFieldEdit.__shV29) {
        var applyOrig = window.__shSpenApplyFieldEdit;
        window.__shSpenApplyFieldEdit = function (input, recognized, origin, mode) {
            var ink = window.__shSpenInk;
            if (mode === 'clear') {
                var cleared = applyOrig(input, '', origin, 'clear');
                clearInkPixels(ink);
                if (ink) ink.imeText = '';
                return cleared;
            }
            if (ink && ink.holdClear) return true;
            var rec = onlyNumber(recognized);
            if (!rec) return false;
            if (!canCommitTo(input)) return true;
            if (window.__shPenIsDown) return true;
            var live = input ? onlyNumber(input.value) : '';
            var from = live || onlyNumber(origin) || (ink && onlyNumber(ink.originValue)) || '';
            rec = pickFinalNumber(from, rec);
            if (!rec) return false;
            if (ink) {
                ink.showResult = true;
                ink.originValue = rec;
                ink.imePending = '';
                ink.imeText = '';
            }
            var ok = (input && onlyNumber(input.value) === rec) ? true : applyOrig(input, rec, from, 'replace');
            consumePendingCommit(input);
            clearInkPixels(ink);
            hideBox();
            return ok;
        };
        window.__shSpenApplyFieldEdit.__shV29 = true;
    }

    if (typeof window.__shSpenOnPenDown === 'function' && !window.__shSpenOnPenDown.__shV23) {
        var downOrig = window.__shSpenOnPenDown;
        window.__shSpenOnPenDown = function (ev) {
            pinScrollHere();
            var inp = ev ? findFieldAt(ev.clientX, ev.clientY) : null;
            if (!inp && ev && window.__shSpenFindWritableInput) inp = window.__shSpenFindWritableInput(ev.target);
            var ink = ensureInk();
            if (!inp && ink) inp = ink.hoverInput;
            if (inp) {
                retarget(inp);
                layoutBoxOn(inp);
            }
            return downOrig.apply(this, arguments);
        };
        window.__shSpenOnPenDown.__shV23 = true;
    }

    if (typeof window.__shSpenOnPenMove === 'function' && !window.__shSpenOnPenMove.__shV23) {
        var moveOrig = window.__shSpenOnPenMove;
        window.__shSpenOnPenMove = function (ev) {
            var ink = window.__shSpenInk;
            if (ink && ink.holdClear) return;
            var r = moveOrig.apply(this, arguments);
            ink = window.__shSpenInk;
            if (ink && !ink.holdClear && looksLikeCut(ink)) forceClear(ink);
            return r;
        };
        window.__shSpenOnPenMove.__shV23 = true;
    }

    if (typeof window.__shSpenOnPenUp === 'function' && !window.__shSpenOnPenUp.__shV27) {
        var upOrig = window.__shSpenOnPenUp;
        window.__shSpenOnPenUp = function (ev, cancelled) {
            var ink = window.__shSpenInk;
            if (ink && (ink.holdClear || looksLikeCut(ink))) {
                if (!ink.holdClear) forceClear(ink);
                ink.strokes = [];
                ink.current = null;
                keepEmpty(boundInput(ink));
                hideBox();
                return;
            }
            var target = boundInput(ink);
            if (target && allStrokes(ink).length) markPendingCommit(target);
            return upOrig.apply(this, arguments);
        };
        window.__shSpenOnPenUp.__shV27 = true;
    }

    if (!window.__shNativeHookV25) {
        window.__shNativeHookV25 = true;
        if (!document.getElementById('sh-spen-noflicker-css')) {
            var css = document.createElement('style');
            css.id = 'sh-spen-noflicker-css';
            css.textContent = 'html.sh-android-tablet-boot .main-container input,html.sh-android-tablet-boot .main-container textarea{-webkit-tap-highlight-color:transparent;caret-color:transparent;}'
                + 'html.sh-android-tablet-boot body.sh-spen-ink-open:not(.sh-spen-writing) .main-container{overflow:auto!important;overscroll-behavior:auto!important;}';
            (document.head || document.documentElement).appendChild(css);
        }
        if (typeof window.__shSpenKeepWriteViewport === 'function' && !window.__shSpenKeepWriteViewport.__shV28) {
            window.__shSpenKeepWriteViewport = function () {
                pinScrollHere();
            };
            window.__shSpenKeepWriteViewport.__shV28 = true;
        }
        document.addEventListener('beforeinput', function (e) {
            if (!isPlantField(e.target)) return;
            var typ = e.inputType || '';
            if (typ.indexOf('delete') === 0) return;
            var ink = window.__shSpenInk;
            if (ink && ink.holdClear && (ink.input === e.target || ink.clearInputId === e.target.id)) {
                if (e.cancelable) e.preventDefault();
                keepEmpty(e.target);
                return;
            }
            if (window.__shPenIsDown) {
                if (e.cancelable) e.preventDefault();
                return;
            }
            var data = e.data == null ? '' : String(e.data);
            if (data && !/^[0-9,]+$/.test(data) && e.cancelable) e.preventDefault();
        }, true);
        document.addEventListener('input', function (e) {
            if (!isPlantField(e.target)) return;
            var ink = window.__shSpenInk;
            if (ink && ink.holdClear && (ink.input === e.target || ink.clearInputId === e.target.id)) {
                keepEmpty(e.target);
                return;
            }
            if (window.__shPenIsDown && ink && (ink.input === e.target || ink.inputId === e.target.id)) {
                if (String(e.target.value || '') !== String(ink.originValue || '')) {
                    e.target.value = ink.originValue || '';
                }
                return;
            }
            var v = String(e.target.value || '');
            var n = onlyNumber(v);
            if (v && v !== n) e.target.value = n;
        }, true);
        document.addEventListener('pointermove', function (ev) {
            if (!ev || ev.pointerType !== 'pen') return;
            if ((ev.buttons & 1) === 1 || window.__shPenIsDown) return;
            if (typeof ev.pressure === 'number' && ev.pressure > 0.08) return;
            window.__shSpenHoverAt(ev.clientX, ev.clientY);
        }, { capture: true, passive: true });
        document.addEventListener('pointerleave', function (ev) {
            if (!ev || ev.pointerType !== 'pen' || window.__shPenIsDown) return;
            var ink = window.__shSpenInk;
            if (ink && ink.active && ((ink.strokes && ink.strokes.length) || ink.current)) return;
            hideBox();
        }, true);
        setInterval(function () {
            var ink = window.__shSpenInk;
            if (!ink || !ink.holdClear) return;
            keepEmpty(boundInput(ink));
            if (ink.clearInputId) keepEmpty(document.getElementById(ink.clearInputId));
        }, 80);
    }
    if (typeof window.__shSpenKeepWriteViewport === 'function' && !window.__shSpenKeepWriteViewport.__shV28) {
        window.__shSpenKeepWriteViewport = function () {
            pinScrollHere();
        };
        window.__shSpenKeepWriteViewport.__shV28 = true;
    }
})();
