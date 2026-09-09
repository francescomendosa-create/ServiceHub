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

    function placeFrameFromRect(r, keyId, hoverInput, pad) {
        if (!r || r.width < 2 || r.height < 2) return false;
        var ink = ensureInk();
        var host = ensureHost();
        if (!host) return false;
        pad = pad == null ? 2 : pad;
        var left = Math.max(0, r.left - pad);
        var top = Math.max(0, r.top - pad);
        var w = r.width + pad * 2;
        var h = r.height + pad * 2;
        if (w < 2 || h < 2) return false;
        var key = String(keyId || '') + ':' + Math.round(left) + ':' + Math.round(top) + ':' + Math.round(w) + ':' + Math.round(h);
        if (hoverInput) ink.hoverInput = hoverInput;
        else ink.hoverInput = null;
        ink.hostRect = { left: left, top: top, w: w, h: h };
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

    function placeFrame(boxEl, keyId, hoverInput) {
        if (!boxEl || !boxEl.isConnected) return false;
        var r = boxEl.getBoundingClientRect();
        return placeFrameFromRect({
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height
        }, keyId, hoverInput, 2);
    }

    function clipRectToOverflow(el, left, top, right, bottom) {
        var p = el && el.parentElement;
        while (p && p !== document.body && p !== document.documentElement) {
            var st;
            try { st = window.getComputedStyle(p); } catch (e) { st = null; }
            if (st) {
                var ox = st.overflowX;
                var oy = st.overflowY;
                if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' ||
                    oy === 'auto' || oy === 'scroll' || oy === 'hidden') {
                    var pr = p.getBoundingClientRect();
                    left = Math.max(left, pr.left);
                    top = Math.max(top, pr.top);
                    right = Math.min(right, pr.right);
                    bottom = Math.min(bottom, pr.bottom);
                }
            }
            p = p.parentElement;
        }
        return { left: left, top: top, right: right, bottom: bottom };
    }

    function numericHitRect(input) {
        if (!input || !input.getBoundingClientRect) return null;
        var wrap = (input.closest && input.closest('.amb-input-box, .bd-input-box, .nott-stocc-inp-cell')) || input;
        var r = wrap.getBoundingClientRect();
        var left = r.left;
        var top = r.top;
        var right = r.right;
        var bottom = r.bottom;
        var row = input.closest && input.closest('.amb-row');
        var status = row && row.querySelector('.tank-status-single');
        if (status) {
            var sr = status.getBoundingClientRect();
            if (sr.left > left + 8) right = Math.min(right, sr.left - 2);
        }
        var clipped = clipRectToOverflow(wrap, left, top, right, bottom);
        left = clipped.left;
        top = clipped.top;
        right = clipped.right;
        bottom = clipped.bottom;
        var w = right - left;
        var h = bottom - top;
        if (w < 8 || h < 8) return null;
        return { left: left, top: top, width: w, height: h, right: right, bottom: bottom };
    }

    function layoutBoxOn(input) {
        if (!input || !input.isConnected) return false;
        var nr = numericHitRect(input);
        if (nr) return placeFrameFromRect(nr, input.id || 'inp', input, 1);
        var box = window.__shSpenFieldBox ? window.__shSpenFieldBox(input) : input;
        return placeFrame(box, input.id || 'inp', input);
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
        hoverHorizBar = null;
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

    function isStatusChrome(el) {
        return !!(el && el.closest && el.closest('.tank-status-single, .status-cell-btn, .status-header'));
    }

    function pointInRect(x, y, r, slop) {
        if (!r) return false;
        slop = slop || 0;
        return x >= r.left - slop && x <= r.right + slop && y >= r.top - slop && y <= r.bottom + slop;
    }

    function numericFieldAt(x, y) {
        var over = elementFromPen(x, y);
        if (isStatusChrome(over) || vertLabelFromEl(over) || horizBarFromEl(over) || isAmbPopupTrigger(over)) {
            return null;
        }
        if (over && over.closest && over.closest(SIGLA_SEL) && !over.closest('.amb-input-box, .bd-input-box, input, textarea')) {
            return null;
        }
        var best = null;
        var bestArea = Infinity;
        var nodes = document.querySelectorAll('.main-container input:not([type="hidden"]), .main-container textarea');
        var i;
        for (i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            if (writableOrNull(n) !== n) continue;
            var nr = numericHitRect(n);
            if (!nr || !pointInRect(x, y, nr, 0)) continue;
            var area = Math.max(1, nr.width * nr.height);
            if (area < bestArea) {
                bestArea = area;
                best = n;
            }
        }
        return best;
    }

    function findFieldAt(x, y) {
        return numericFieldAt(x, y);
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
        if (!continueWrite) {
            ink.pendingPred = null;
            ink.pendingPredCount = 0;
            ink.writeGen = (ink.writeGen || 0) + 1;
            ink.writeLocked = false;
            if (input) ink.sessionOrigin = String(input.value || '');
            ink.sessionStartedEmpty = !onlyNumber(ink.sessionOrigin);
        }
        ink.originValue = ink.sessionOrigin != null ? String(ink.sessionOrigin) : (input ? String(input.value || '') : '');
        ink.imeText = ink.originValue;
        window.__shSpenSkipIme = true;
        if (input) {
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
            var more = !!(!ink.showResult && ink.strokes && ink.strokes.length);
            beginWrite(ink, input, more);
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

    var AMB_POPUP_SEL = '[data-vwt-trigger],[data-vwt-meter-trigger],[data-osmosi-trigger],[data-analisi-trigger],[data-sf3-run-trigger],#amb-row-vwt,#amb-row-osmosi,#amb-row-analisi,#inp-sf3';
    var AMB_MODAL_SEL = '#vwt-modal,#vwt-meter-modal,#osmosi-modal,#osmosi-match-modal,#analisi-choice-modal,#analisi-choice-modal-page2,#sf3-run-modal';
    var HORIZ_BAR_SEL = '.cond-tendina-bar, .nott-filtra-tendina-bar, .nott-stocc-tendina-bar, .nott-chem-tendina-bar, .rapportino-custom-tendina-bar';
    var penUiTap = null;
    var penChrome = null;
    var hoverHorizBar = null;

    function elementFromPen(x, y) {
        var host = document.getElementById('sh-spen-ink-host');
        var prev = host ? host.style.pointerEvents : '';
        if (host) host.style.pointerEvents = 'none';
        var el = null;
        try { el = document.elementFromPoint(x, y); } catch (e) {}
        if (host) host.style.pointerEvents = prev || 'none';
        return el;
    }

    function isAmbPopupTrigger(el) {
        if (!el) return false;
        try {
            if (typeof window.__isAmbSpecialPopupTarget === 'function' && window.__isAmbSpecialPopupTarget(el)) return true;
        } catch (e) {}
        return !!(el.closest && el.closest(AMB_POPUP_SEL));
    }

    function isAmbModalEl(el) {
        return !!(el && el.closest && el.closest(AMB_MODAL_SEL));
    }

    function markPenPopupClick() {
        window.__ambSpecialPopupFromTouch = true;
        setTimeout(function () { window.__ambSpecialPopupFromTouch = false; }, 600);
    }

    function openAmbPopupFromEl(el) {
        if (!el || !el.closest) return false;
        if (el.closest(AMB_MODAL_SEL)) return false;
        var meter = el.closest('[data-vwt-meter-trigger]');
        var vwt = el.closest('[data-vwt-trigger]');
        var osm = el.closest('[data-osmosi-trigger]');
        var an = el.closest('[data-analisi-trigger]');
        var sf3 = el.closest('[data-sf3-run-trigger], #inp-sf3');
        markPenPopupClick();
        try {
            if (meter && !vwt && typeof window.openVwtMeterPopup === 'function') { window.openVwtMeterPopup(); return true; }
            if (vwt && typeof window.openVwtPopup === 'function') { window.openVwtPopup(); return true; }
            if (osm && typeof window.openOsmosiPopup === 'function') { window.openOsmosiPopup(); return true; }
            if (an && typeof window.openAnalisiPopup === 'function') { window.openAnalisiPopup(); return true; }
            if (sf3 && typeof window.openSf3RunPopup === 'function') { window.openSf3RunPopup(); return true; }
        } catch (e) {}
        return false;
    }

    function clickPenTarget(el) {
        if (!el) return false;
        var hit = el;
        if (el.closest) {
            hit = el.closest('button, [onclick], .vwt-btn, .osmosi-btn, .analisi-choice-btn, [data-vwt-trigger], [data-osmosi-trigger], [data-analisi-trigger], [data-sf3-run-trigger], [data-vwt-meter-trigger]') || el;
        }
        markPenPopupClick();
        try {
            hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, composed: true }));
            return true;
        } catch (e) {
            try { hit.click(); return true; } catch (e2) { return false; }
        }
    }

    function vertLabelFromEl(el) {
        return (el && el.closest) ? el.closest('.v-label-container') : null;
    }

    function horizBarFromEl(el) {
        return (el && el.closest) ? el.closest(HORIZ_BAR_SEL) : null;
    }

    var SIGLA_SEL = '.cell-label-main, .bd-label, .amb-label, .nott-stocc-sigla-cell, .cond-tendina-lbl';

    function writableOrNull(inp) {
        if (!inp) return null;
        if (window.__shSpenIsWritableInput && !window.__shSpenIsWritableInput(inp)) return null;
        return inp;
    }

    function pairInputFromLabel(lab) {
        if (!lab || !lab.closest) return null;
        var inp = null;
        try {
            if (typeof window.resolveNumpadInputFromLabel === 'function') inp = window.resolveNumpadInputFromLabel(lab);
        } catch (e) {}
        if (!inp && lab.classList.contains('cond-tendina-lbl')) {
            var cell = lab.closest('.cond-tendina-cell');
            if (cell) inp = cell.querySelector('input:not([type="hidden"]), textarea');
        }
        if (!inp) {
            var nxt = lab.nextElementSibling;
            if (nxt) {
                if (nxt.tagName === 'INPUT' || nxt.tagName === 'TEXTAREA') inp = nxt;
                else if (nxt.querySelector) inp = nxt.querySelector('input:not([type="hidden"]), textarea');
            }
        }
        if (!inp) {
            var row = lab.closest('tr, .amb-row, .bd-input-row, .nott-stocc-row, .cond-tendina-cell, .analisi-inline-cell');
            if (row) inp = row.querySelector('input:not([type="hidden"]), textarea');
        }
        return writableOrNull(inp);
    }

    function labelFromEl(el) {
        if (!el || !el.closest) return null;
        if (vertLabelFromEl(el) || horizBarFromEl(el) || isAmbPopupTrigger(el)) return null;
        return el.closest(SIGLA_SEL);
    }

    function inputFromSigla(el) {
        return pairInputFromLabel(labelFromEl(el));
    }

    function inputFromSiglaAt(x, y) {
        var hit = inputFromSigla(elementFromPen(x, y));
        if (hit) return hit;
        var labs = document.querySelectorAll(SIGLA_SEL);
        for (var i = 0; i < labs.length; i++) {
            var lab = labs[i];
            if (vertLabelFromEl(lab) || horizBarFromEl(lab) || isAmbPopupTrigger(lab)) continue;
            var r = lab.getBoundingClientRect();
            if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
            var inp = pairInputFromLabel(lab);
            if (inp) return inp;
        }
        return null;
    }

    function horizBarNear(x, y) {
        var bar = hoverHorizBar;
        if (!bar || !bar.isConnected) return null;
        var r = bar.getBoundingClientRect();
        var pad = 18;
        if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) return bar;
        return null;
    }

    function startPressIdFromEl(el) {
        if (!el) return '';
        var a = (el.getAttribute('ontouchstart') || '') + ' ' + (el.getAttribute('onmousedown') || '');
        var m = a.match(/startPress\s*\(\s*event\s*,\s*['"]([^'"]+)['"]/);
        return m ? m[1] : '';
    }

    function fakeTouch(target, type, x, y) {
        return {
            type: type,
            touches: type === 'touchend' ? [] : [{ clientX: x, clientY: y }],
            changedTouches: [{ clientX: x, clientY: y }],
            clientX: x,
            clientY: y,
            currentTarget: target,
            target: target,
            pointerType: 'touch',
            preventDefault: function () {},
            stopPropagation: function () {}
        };
    }

    function callToggle(name, arg) {
        try {
            if (typeof window[name] === 'function') {
                window[name](arg);
                return true;
            }
        } catch (e) {}
        return false;
    }

    function openHorizBar(bar) {
        if (!bar) return false;
        var dummy = { preventDefault: function () {}, stopPropagation: function () {} };
        var pid = (bar.parentElement && bar.parentElement.id) || '';
        var sid = startPressIdFromEl(bar);
        if (bar.classList.contains('rapportino-custom-tendina-bar')) {
            return callToggle('toggleCustomRapportinoSchedaTendina', sid || pid);
        }
        var byParent = {
            'notturno-filtra-tendina': 'toggleNotturnoFiltraTendina',
            'sec-stoccaggio-interno': 'toggleNotturnoStoccaggioTendina',
            'notturno-chemicals-tendina': 'toggleNotturnoChemicalsTendina',
            'rapportino-conducibilita-tendina': 'toggleConducibilitaTendina',
            'rapportino-livelli-lavaggi-tendina': 'toggleLivelliLavaggiTendina',
            'rapportino-contatori-tendina': 'toggleContatoriTendina',
            'rapportino-conteggio-filtra-tendina': 'toggleConteggioFiltraTendina',
            'rapportino-rigenerazione-tendina': 'toggleRigenerazioneTendina',
            'rapportino-note-tendina': 'toggleNoteSchedaTendina'
        };
        if (byParent[pid] && callToggle(byParent[pid], dummy)) return true;
        var raw = (bar.getAttribute('ontouchend') || bar.getAttribute('onmouseup') || '');
        var endName = (raw.match(/window\.(\w+)\s*\(/) || [])[1] || '';
        var toggles = {
            endPressNotturnoFiltraTendina: 'toggleNotturnoFiltraTendina',
            endPressNotturnoStoccaggioTendina: 'toggleNotturnoStoccaggioTendina',
            endPressNotturnoChemicalsTendina: 'toggleNotturnoChemicalsTendina',
            endPressConducibilitaTendina: 'toggleConducibilitaTendina',
            endPressLivelliLavaggiTendina: 'toggleLivelliLavaggiTendina',
            endPressNoteSchedaTendina: 'toggleNoteSchedaTendina',
            endPressContatoriTendina: 'toggleContatoriTendina',
            endPressConteggioFiltraTendina: 'toggleConteggioFiltraTendina',
            endPressRigenerazioneTendina: 'toggleRigenerazioneTendina'
        };
        if (endName === 'endPressCustomSchedaTendina') {
            return callToggle('toggleCustomRapportinoSchedaTendina', sid || pid);
        }
        if (toggles[endName] && callToggle(toggles[endName], dummy)) return true;
        return false;
    }

    function scrollMainBy(dy) {
        var sc = document.querySelector('.main-container');
        if (sc && (sc.scrollHeight > sc.clientHeight + 4)) {
            sc.scrollTop += dy;
            return;
        }
        window.scrollBy(0, dy);
    }

    function clearPenChrome() {
        if (penChrome && penChrome.longTimer) {
            try { clearTimeout(penChrome.longTimer); } catch (e) {}
        }
        penChrome = null;
    }

    window.__shSpenHoverAt = function (x, y) {
        if (window.__shPenIsDown) return false;
        var over = elementFromPen(x, y);
        if (isAmbPopupTrigger(over) || isAmbModalEl(over) || vertLabelFromEl(over) || isStatusChrome(over)) {
            hideBox();
            return false;
        }
        var ink = ensureInk();
        var writing = !!(ink.active && ((ink.strokes && ink.strokes.length) || (ink.current && ink.current.length)));
        if (writing) {
            var stay = boundInput(ink);
            if (stay) return layoutBoxOn(stay);
        }
        var inp = numericFieldAt(x, y);
        if (inp) {
            hoverHorizBar = null;
            return layoutBoxOn(inp);
        }
        var bar = horizBarFromEl(over);
        if (bar) {
            hoverHorizBar = bar;
            return placeFrame(bar, 'hbar', null);
        }
        hoverHorizBar = null;
        if (!writing) hideBox();
        return false;
    };

    window.__shSpenPointAt = function (x, y) {
        var inp = numericFieldAt(x, y);
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
    }

    function canCommitTo(input) {
        var ink = window.__shSpenInk;
        if (!input || !input.id || !ink || !ink.pendingCommitIds) return false;
        if (ink.writeLocked) return false;
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

    function stripDoubledPrefix(prefix, rec) {
        prefix = onlyNumber(prefix);
        rec = onlyNumber(rec);
        if (!prefix || !rec || rec.length <= prefix.length) return rec;
        while (rec.indexOf(prefix + prefix) === 0) rec = rec.slice(prefix.length);
        if (rec.indexOf(prefix) === 0) {
            var extra = rec.slice(prefix.length);
            if (extra.indexOf(prefix) === 0) rec = extra;
        }
        return rec;
    }

    function mergeByPosition(origin, rec, mode) {
        var orig = onlyNumber(origin);
        rec = onlyNumber(rec);
        if (!rec) return orig;
        rec = stripDoubledPrefix(orig, rec);
        if (!orig) return rec;
        if (rec === orig) return orig;
        if (rec.indexOf(orig) === 0) return rec;
        if (rec.length > orig.length && rec.slice(-orig.length) === orig) return rec;
        if (mode === 'prepend') return rec + orig;
        if (mode === 'append') return orig + rec;
        return rec;
    }

    if (typeof window.__shSpenApplyFieldEdit === 'function' && !window.__shSpenApplyFieldEdit.__shV39) {
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
            var from = onlyNumber(ink && ink.sessionOrigin != null ? ink.sessionOrigin : origin);
            rec = stripDoubledPrefix(from, rec);
            rec = stripDoubledPrefix(live, rec);
            rec = stripDoubledPrefix(onlyNumber(origin), rec);
            var useMode = mode || 'replace';
            if (ink && ink.sessionStartedEmpty) useMode = 'replace';
            else if (ink && ink.strokes && ink.strokes.length && typeof window.__shSpenEditModeFromStrokes === 'function') {
                try {
                    useMode = window.__shSpenEditModeFromStrokes(ink.strokes, input, from, ink.hostRect) || useMode;
                } catch (e) {}
            }
            rec = mergeByPosition(from, rec, useMode);
            rec = stripDoubledPrefix(from, rec);
            rec = stripDoubledPrefix(live, rec);
            if (live && rec === live.charAt(0) + live) rec = live;
            if (!rec) return false;
            if (ink) {
                ink.showResult = true;
                ink.writeLocked = true;
                ink.sessionOrigin = rec;
                ink.originValue = rec;
                ink.imePending = '';
                ink.imeText = rec;
            }
            var ok = (input && onlyNumber(input.value) === rec) ? true : applyOrig(input, rec, from, 'replace');
            consumePendingCommit(input);
            clearInkPixels(ink);
            hideBox();
            return ok;
        };
        window.__shSpenApplyFieldEdit.__shV39 = true;
    }

    if (typeof window.__shSpenFindWritableInput === 'function' && !window.__shSpenFindWritableInput.__shV45) {
        var findElOrig = window.__shSpenFindWritableInput;
        window.__shSpenFindWritableInput = function (el) {
            if (isStatusChrome(el)) return null;
            if (el && el.closest && el.closest(SIGLA_SEL) && !el.closest('.amb-input-box, .bd-input-box, input, textarea')) {
                return null;
            }
            return findElOrig.apply(this, arguments);
        };
        window.__shSpenFindWritableInput.__shV45 = true;
    }

    if (typeof window.__shSpenFindWritableInputAt === 'function' && !window.__shSpenFindWritableInputAt.__shV45) {
        window.__shSpenFindWritableInputAt = function (x, y) {
            return numericFieldAt(x, y);
        };
        window.__shSpenFindWritableInputAt.__shV45 = true;
    }

    if (typeof window.__shSpenOnPenDown === 'function' && !window.__shSpenOnPenDown.__shV45) {
        var downOrig = window.__shSpenOnPenDown;
        window.__shSpenOnPenDown = function (ev) {
            pinScrollHere();
            var el = ev ? elementFromPen(ev.clientX, ev.clientY) : null;
            if (!el && ev && ev.target) el = ev.target;
            clearPenChrome();
            if (isAmbPopupTrigger(el) || isAmbModalEl(el) || isStatusChrome(el)) {
                hideBox();
                if (isAmbPopupTrigger(el) || isAmbModalEl(el)) {
                    penUiTap = {
                        x: ev.clientX,
                        y: ev.clientY,
                        el: el,
                        popup: isAmbPopupTrigger(el),
                        modal: isAmbModalEl(el),
                        t: Date.now()
                    };
                } else {
                    penUiTap = null;
                }
                return;
            }
            var vert = vertLabelFromEl(el);
            if (vert) {
                hideBox();
                penUiTap = null;
                penChrome = { kind: 'vert', x: ev.clientX, y: ev.clientY, lastY: ev.clientY, moved: false };
                return;
            }
            var bar = horizBarFromEl(el);
            if (!bar && ev && !numericFieldAt(ev.clientX, ev.clientY)) {
                bar = horizBarNear(ev.clientX, ev.clientY);
            }
            if (bar) {
                placeFrame(bar, 'hbar', null);
                penUiTap = null;
                var sid = startPressIdFromEl(bar);
                penChrome = {
                    kind: 'horiz',
                    x: ev.clientX,
                    y: ev.clientY,
                    el: bar,
                    id: sid,
                    moved: false,
                    didLong: false,
                    longTimer: setTimeout(function () {
                        if (!penChrome || penChrome.kind !== 'horiz' || penChrome.moved) return;
                        penChrome.didLong = true;
                        if (penChrome.id && typeof window.hideModule === 'function') {
                            try { window.hideModule(penChrome.id, true); } catch (e) {}
                        }
                    }, 280)
                };
                return;
            }
            penUiTap = null;
            var inp = ev ? numericFieldAt(ev.clientX, ev.clientY) : null;
            var ink = ensureInk();
            if (!inp && ink && ink.hoverInput && ev) {
                var hr = numericHitRect(ink.hoverInput);
                if (hr && pointInRect(ev.clientX, ev.clientY, hr, 1)) inp = ink.hoverInput;
            }
            if (inp) {
                retarget(inp);
                layoutBoxOn(inp);
            } else {
                hideBox();
                if (ink) ink.hoverInput = null;
                return;
            }
            var r = downOrig.apply(this, arguments);
            ink = window.__shSpenInk;
            if (ink) {
                ink.originValue = ink.sessionOrigin != null ? String(ink.sessionOrigin) : ink.originValue;
                ink.imeText = ink.originValue || '';
            }
            return r;
        };
        window.__shSpenOnPenDown.__shV45 = true;
    }

    if (typeof window.__shSpenOnPenMove === 'function' && !window.__shSpenOnPenMove.__shV45) {
        var moveOrig = window.__shSpenOnPenMove;
        window.__shSpenOnPenMove = function (ev) {
            if (penChrome && ev) {
                var dx = (ev.clientX || 0) - penChrome.x;
                var dy = (ev.clientY || 0) - penChrome.y;
                if ((dx * dx + dy * dy) > 225) penChrome.moved = true;
                if (penChrome.kind === 'vert') {
                    scrollMainBy(penChrome.lastY - ev.clientY);
                    penChrome.lastY = ev.clientY;
                    return;
                }
                if (penChrome.kind === 'horiz' && penChrome.moved && penChrome.longTimer) {
                    try { clearTimeout(penChrome.longTimer); } catch (e) {}
                    penChrome.longTimer = null;
                }
                return;
            }
            var ink = window.__shSpenInk;
            if (ink && ink.holdClear) return;
            var r = moveOrig.apply(this, arguments);
            ink = window.__shSpenInk;
            if (ink && !ink.holdClear && looksLikeCut(ink)) forceClear(ink);
            return r;
        };
        window.__shSpenOnPenMove.__shV45 = true;
    }

    if (typeof window.__shSpenOnPenUp === 'function' && !window.__shSpenOnPenUp.__shV45) {
        var upOrig = window.__shSpenOnPenUp;
        window.__shSpenOnPenUp = function (ev, cancelled) {
            if (penChrome) {
                var ch = penChrome;
                clearPenChrome();
                if (ch.kind === 'horiz' && !ch.didLong && !ch.moved) {
                    openHorizBar(ch.el);
                }
                return;
            }
            if (penUiTap && !cancelled && ev) {
                var dx = (ev.clientX || 0) - penUiTap.x;
                var dy = (ev.clientY || 0) - penUiTap.y;
                var tap = (dx * dx + dy * dy) < 144;
                var el = elementFromPen(ev.clientX, ev.clientY) || penUiTap.el;
                var wasPopup = penUiTap.popup;
                var wasModal = penUiTap.modal;
                penUiTap = null;
                if (tap) {
                    if (wasPopup) openAmbPopupFromEl(el);
                    else if (wasModal) clickPenTarget(el);
                }
                return;
            }
            penUiTap = null;
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
        window.__shSpenOnPenUp.__shV45 = true;
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
            if (ink && (ink.input === e.target || ink.inputId === e.target.id)) {
                ink.imeText = ink.originValue || ink.sessionOrigin || '';
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

    if (!window.__shNativeHookV45Finger) {
        window.__shNativeHookV45Finger = true;
        document.addEventListener('pointerdown', function (ev) {
            if (!ev || ev.pointerType === 'pen') return;
            if (window.__shPenIsDown) return;
            var ink = window.__shSpenInk;
            if (ink && ink.active && ((ink.strokes && ink.strokes.length) || ink.current)) return;
            if (isStatusChrome(ev.target) || !numericFieldAt(ev.clientX, ev.clientY)) hideBox();
        }, true);
    }
})();
