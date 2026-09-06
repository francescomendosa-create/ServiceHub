(function () {
    window.__SH_NATIVE_ANDROID = true;
    window.__shSpenSkipIme = true;
    window.__SPEN_COMMIT_MS = 280;
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
        if (!window.__shSpenInk && typeof window.__initAndroidSpenInk === 'function') {
            window.__initAndroidSpenInk();
        }
        if (!window.__shSpenInk) {
            window.__shSpenInk = { active: false, strokes: [], current: null, input: null, inputId: '', originValue: '' };
        }
        return window.__shSpenInk;
    }

    function ensureHost() {
        var host = document.getElementById('sh-spen-ink-host');
        if (host) return host;
        if (!document.body) return null;
        host = document.createElement('div');
        host.id = 'sh-spen-ink-host';
        host.setAttribute('aria-hidden', 'true');
        host.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;'
            + 'outline:2px solid #2563eb;outline-offset:-2px;background:transparent;display:none;';
        document.body.appendChild(host);
        return host;
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
        host.style.display = 'block';
        host.style.left = left + 'px';
        host.style.top = top + 'px';
        host.style.width = w + 'px';
        host.style.height = h + 'px';
        host.style.pointerEvents = 'none';
        host.style.outline = '2px solid #2563eb';
        host.classList.add('sh-spen-ink-on');
        ink.hoverInput = input;
        ink.hostRect = { left: left, top: top, w: w, h: h };
        if (document.body) document.body.classList.add('sh-spen-ink-open');
        return true;
    }

    function allStrokes(ink) {
        if (!ink) return [];
        var raw = (ink.strokes || []).slice();
        if (ink.current && ink.current.length) raw.push(ink.current);
        return raw;
    }

    function isFlatCut(strokes, hostRect) {
        if (!strokes || !strokes.length) return false;
        var fieldW = (hostRect && hostRect.w) || 36;
        var fieldH = (hostRect && hostRect.h) || 28;
        var needW = Math.max(22, fieldW * 0.5);
        for (var s = 0; s < strokes.length; s++) {
            var pts = strokes[s];
            if (!pts || pts.length < 2) continue;
            var minx = pts[0].x, maxx = pts[0].x, miny = pts[0].y, maxy = pts[0].y;
            for (var i = 1; i < pts.length; i++) {
                if (pts[i].x < minx) minx = pts[i].x;
                if (pts[i].x > maxx) maxx = pts[i].x;
                if (pts[i].y < miny) miny = pts[i].y;
                if (pts[i].y > maxy) maxy = pts[i].y;
            }
            var horiz = maxx - minx;
            var vert = maxy - miny;
            if (horiz >= needW && horiz > vert * 2.8 && vert <= Math.max(12, fieldH * 0.42)) {
                return true;
            }
        }
        return false;
    }

    function boundInput(ink) {
        if (!ink) return null;
        if (ink.input && ink.input.isConnected) return ink.input;
        if (ink.inputId) return document.getElementById(ink.inputId);
        return null;
    }

    function looksLikeCut(ink) {
        if (!ink || ink.imeCleared) return false;
        var input = boundInput(ink);
        var origin = ink.originValue || (input && input.value) || '';
        if (!String(origin).trim()) return false;
        var strokes = allStrokes(ink);
        if (typeof window.__shSpenIsStrikethrough === 'function' && ink.hostRect && input) {
            try {
                var box = window.__shSpenMeasureFieldText
                    ? window.__shSpenMeasureFieldText(input, ink.hostRect, origin)
                    : null;
                if (window.__shSpenIsStrikethrough(strokes, ink.hostRect, box)) return true;
            } catch (e) {}
        }
        return isFlatCut(strokes, ink.hostRect);
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

    function beginWrite(ink, input) {
        if (!ink) return;
        ink.imeCleared = false;
        ink.cutGuardUntil = 0;
        ink.showResult = false;
        ink.released = false;
        ink.imePending = '';
        window.__shSpenSkipIme = true;
        if (input) {
            ink.originValue = String(input.value || '');
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

    function forceClear(ink) {
        var input = boundInput(ink);
        var origin = ink ? (ink.originValue || '') : '';
        if (ink) {
            ink.imeCleared = true;
            ink.imePending = '';
            ink.imeText = '';
            ink.originValue = '';
            ink.showResult = true;
            ink.released = true;
            ink.strokes = [];
            ink.current = null;
            ink.cutGuardUntil = Date.now() + 600;
        }
        if (!input) return;
        applyFinal(input, '', origin, 'clear');
        input.value = '';
        layoutBoxOn(input);
    }

    function retarget(input) {
        if (!input || (window.__shSpenIsWritableInput && !window.__shSpenIsWritableInput(input))) return false;
        var ink = ensureInk();
        if (ink.input === input && ink.active) {
            beginWrite(ink, input);
            layoutBoxOn(input);
            try { input.focus({ preventScroll: true }); } catch (e) { try { input.focus(); } catch (e2) {} }
            return true;
        }
        if (ink.active && ink.input && ink.input !== input) {
            if (looksLikeCut(ink)) forceClear(ink);
            else if ((ink.strokes && ink.strokes.length) && typeof window.__shSpenCommitNow === 'function') {
                window.__shSpenCommitNow();
            }
        }
        ink.strokes = [];
        ink.current = null;
        ink.active = true;
        ink.input = input;
        ink.inputId = input.id || '';
        ink.hoverInput = input;
        ink.sessionStartMs = Date.now();
        beginWrite(ink, input);
        layoutBoxOn(input);
        try { input.focus({ preventScroll: true }); } catch (e) { try { input.focus(); } catch (e2) {} }
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

    window.__shSpenHoverAt = function (x, y) {
        if (window.__shPenIsDown) return false;
        var inp = findFieldAt(x, y);
        if (!inp) return false;
        ensureInk().hoverInput = inp;
        return layoutBoxOn(inp);
    };

    window.__shSpenPointAt = function (x, y) {
        var ink = window.__shSpenInk;
        var inp = findFieldAt(x, y) || (ink && ink.hoverInput);
        if (!inp) return false;
        return retarget(inp);
    };

    window.__shSpenRecognizeStrokes = function (strokeSnap) {
        var raw = strokeSnap || [];
        var ink = window.__shSpenInk;
        if (ink && ink.imeCleared) return Promise.resolve('');
        if (ink && looksLikeCut(ink)) {
            forceClear(ink);
            return Promise.resolve('');
        }
        return nativeRecognize(raw);
    };

    if (typeof window.__shSpenApplyFieldEdit === 'function' && !window.__shSpenApplyFieldEdit.__shV20) {
        var applyOrig = window.__shSpenApplyFieldEdit;
        window.__shSpenApplyFieldEdit = function (input, recognized, origin, mode) {
            if (mode === 'clear') return applyOrig(input, '', origin, 'clear');
            if (window.__shPenIsDown) return false;
            var rec = onlyNumber(recognized);
            if (!rec) return false;
            var ink = window.__shSpenInk;
            if (ink) {
                ink.showResult = true;
                ink.originValue = rec;
                ink.imePending = '';
            }
            return applyOrig(input, rec, origin, mode || 'replace');
        };
        window.__shSpenApplyFieldEdit.__shV20 = true;
    }

    if (typeof window.__shSpenOnPenDown === 'function' && !window.__shSpenOnPenDown.__shV20) {
        var downOrig = window.__shSpenOnPenDown;
        window.__shSpenOnPenDown = function (ev) {
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
        window.__shSpenOnPenDown.__shV20 = true;
    }

    if (typeof window.__shSpenOnPenMove === 'function' && !window.__shSpenOnPenMove.__shV20) {
        var moveOrig = window.__shSpenOnPenMove;
        window.__shSpenOnPenMove = function (ev) {
            var ink = window.__shSpenInk;
            if (ink && ink.imeCleared) return;
            var r = moveOrig.apply(this, arguments);
            ink = window.__shSpenInk;
            if (ink && !ink.imeCleared && looksLikeCut(ink)) forceClear(ink);
            return r;
        };
        window.__shSpenOnPenMove.__shV20 = true;
    }

    if (typeof window.__shSpenOnPenUp === 'function' && !window.__shSpenOnPenUp.__shV20) {
        var upOrig = window.__shSpenOnPenUp;
        window.__shSpenOnPenUp = function (ev, cancelled) {
            var ink = window.__shSpenInk;
            if (ink && (ink.imeCleared || looksLikeCut(ink))) {
                if (!ink.imeCleared) forceClear(ink);
                ink.strokes = [];
                ink.current = null;
            }
            return upOrig.apply(this, arguments);
        };
        window.__shSpenOnPenUp.__shV20 = true;
    }

    if (!window.__shNativeHookV20) {
        window.__shNativeHookV20 = true;
        document.addEventListener('beforeinput', function (e) {
            if (!isPlantField(e.target)) return;
            var typ = e.inputType || '';
            if (typ.indexOf('delete') === 0) return;
            var data = e.data == null ? '' : String(e.data);
            if (window.__shPenIsDown) {
                if (e.cancelable) e.preventDefault();
                return;
            }
            if (data && !/^[0-9,]+$/.test(data) && e.cancelable) e.preventDefault();
        }, true);
        document.addEventListener('compositionupdate', function (e) {
            if (!isPlantField(e.target)) return;
            if (window.__shPenIsDown && e.cancelable) e.preventDefault();
        }, true);
        document.addEventListener('input', function (e) {
            if (!isPlantField(e.target)) return;
            var ink = window.__shSpenInk;
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
    }
})();
