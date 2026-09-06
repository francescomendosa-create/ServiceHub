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
        return !!(el.closest && el.closest('.main-container'));
    }

    function ensureInk() {
        if (!window.__shSpenInk && typeof window.__initAndroidSpenInk === 'function') {
            window.__initAndroidSpenInk();
        }
        if (!window.__shSpenInk) {
            window.__shSpenInk = {
                active: false, strokes: [], current: null, input: null, inputId: '',
                originValue: '', imeText: '', hoverInput: null
            };
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
        host.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;touch-action:none;'
            + 'outline:2px solid #2563eb;outline-offset:-2px;background:transparent;display:none;margin:0;padding:0;';
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
        host.style.outlineOffset = '-2px';
        host.classList.add('sh-spen-ink-on');
        ink.hoverInput = input;
        ink.hostRect = { left: left, top: top, w: w, h: h };
        if (document.body) document.body.classList.add('sh-spen-ink-open');
        return true;
    }

    function isCut(strokes, hostRect) {
        if (!strokes || !strokes.length) return false;
        var fieldW = (hostRect && hostRect.w) || 36;
        var fieldH = (hostRect && hostRect.h) || 28;
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
            if (horiz >= Math.max(10, fieldW * 0.22) && horiz > vert * 1.05 && vert <= Math.max(26, fieldH * 0.9)) return true;
            if (reversals >= 1 && horiz >= Math.max(10, fieldW * 0.2) && vert <= Math.max(28, fieldH)) return true;
        }
        return false;
    }

    function allStrokes(ink) {
        if (!ink) return [];
        var raw = (ink.strokes || []).slice();
        if (ink.current && ink.current.length) raw.push(ink.current);
        return raw;
    }

    function maskField(input) {
        if (!input) return;
        input.style.setProperty('color', 'transparent', 'important');
        input.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
        input.style.setProperty('caret-color', 'transparent', 'important');
    }

    function unmaskField(input) {
        if (!input) return;
        input.style.removeProperty('color');
        input.style.removeProperty('-webkit-text-fill-color');
        input.style.removeProperty('caret-color');
    }

    function isLiveWrite(ink) {
        if (window.__shPenIsDown) return true;
        return !!(ink && ink.active && !ink.showResult && !ink.released);
    }

    function hideLive(input, ink) {
        if (!input || !ink || ink.showResult) return;
        if (ink.cutGuardUntil && Date.now() < ink.cutGuardUntil) return;
        if (isLiveWrite(ink)) maskField(input);
        var hold = ink.originValue != null ? String(ink.originValue) : '';
        if (String(input.value || '') !== hold) input.value = hold;
    }

    function markCleared(ink) {
        if (!ink) return;
        ink.imeCleared = true;
        ink.imePending = '';
        ink.imeText = ink.originValue || '';
        ink.pendingPred = Promise.resolve('');
        ink.cutGuardUntil = Date.now() + 1200;
        ink.showResult = true;
        ink.strokes = [];
        ink.current = null;
        window.__shSpenSkipIme = true;
    }

    function forceClear(ink) {
        markCleared(ink);
        var input = ink && (ink.input || (ink.inputId && document.getElementById(ink.inputId)));
        if (!input) return;
        var origin = ink.originValue || input.value || '';
        input.value = '';
        if (typeof window.__shSpenApplyFieldEdit === 'function') {
            window.__shSpenApplyFieldEdit(input, '', origin, 'clear');
        } else {
            try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
            try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
            if (typeof window.saveData === 'function') window.saveData(true);
        }
        input.value = '';
        unmaskField(input);
        layoutBoxOn(input);
    }

    function shouldClear(ink) {
        if (!ink) return false;
        if (ink.sawImeClear || ink.imeCleared) return true;
        if (!onlyNumber(ink.originValue)) return false;
        return isCut(allStrokes(ink), ink.hostRect);
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
        ink.sawImeClear = false;
        ink.cutGuardUntil = 0;
        ink.showResult = false;
        ink.released = false;
        ink.imePending = '';
        ink.pendingPred = null;
        window.__shSpenSkipIme = false;
        if (input) {
            ink.originValue = input.value || '';
            maskField(input);
            if (String(input.value || '') !== String(ink.originValue)) input.value = ink.originValue;
        }
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
            if (shouldClear(ink)) forceClear(ink);
            else if (((ink.strokes && ink.strokes.length) || ink.imePending) && typeof window.__shSpenCommitNow === 'function') {
                window.__shSpenCommitNow();
            }
        }
        ink.strokes = [];
        ink.current = null;
        ink.imePending = '';
        ink.imeCleared = false;
        ink.sawImeClear = false;
        ink.showResult = false;
        ink.cutGuardUntil = 0;
        ink.pendingPred = null;
        ink.active = true;
        ink.input = input;
        ink.inputId = input.id || '';
        ink.originValue = input.value || '';
        ink.imeText = input.value || '';
        ink.hoverInput = input;
        ink.sessionStartMs = Date.now();
        ink.startMs = ink.sessionStartMs;
        beginWrite(ink, input);
        layoutBoxOn(input);
        try { input.focus({ preventScroll: true }); } catch (e) { try { input.focus(); } catch (e2) {} }
        return true;
    }

    window.__shSpenHoverAt = function (x, y) {
        if (window.__shPenIsDown) return false;
        var ink = window.__shSpenInk;
        if (ink && ink.current && ink.current.length) return false;
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

    window.__shSpenRecognizeDigitsLocal = function () { return ''; };

    window.__shSpenRecognizeStrokes = function (strokeSnap) {
        var raw = strokeSnap || [];
        var ink = window.__shSpenInk;
        if (ink && (ink.imeCleared || (ink.cutGuardUntil && Date.now() < ink.cutGuardUntil))) {
            return Promise.resolve('');
        }
        if (ink && isCut(raw, ink.hostRect) && onlyNumber(ink.originValue)) {
            forceClear(ink);
            return Promise.resolve('');
        }
        return new Promise(function (resolve) {
            var t0 = Date.now();
            var last = '';
            var tick = function () {
                if (ink && ink.imeCleared) {
                    resolve('');
                    return;
                }
                var n = onlyNumber(ink && (ink.imePending || ink.imeText));
                var origin = onlyNumber(ink && ink.originValue);
                if (n && n !== origin) last = n;
                if (Date.now() - t0 >= 750) {
                    resolve(last);
                    return;
                }
                setTimeout(tick, 40);
            };
            tick();
        });
    };

    if (typeof window.__shSpenApplyFieldEdit === 'function' && !window.__shSpenApplyFieldEdit.__shV15) {
        var applyOrig = window.__shSpenApplyFieldEdit;
        var applySafe = function (input, recognized, origin, mode) {
            var ink = window.__shSpenInk;
            if (mode === 'clear') {
                if (ink) markCleared(ink);
                return applyOrig(input, '', origin, 'clear');
            }
            if (ink && ink.imeCleared && ink.cutGuardUntil && Date.now() < ink.cutGuardUntil && !recognized) {
                input.value = '';
                return applyOrig(input, '', origin, 'clear');
            }
            var rec = onlyNumber(recognized);
            if (!rec) return false;
            if (window.__shPenIsDown) return false;
            if (ink) {
                ink.showResult = true;
                ink.released = true;
                ink.imeCleared = false;
                ink.cutGuardUntil = 0;
                unmaskField(input);
            }
            return applyOrig(input, rec, origin, mode || 'replace');
        };
        applySafe.__shV15 = true;
        window.__shSpenApplyFieldEdit = applySafe;
    }

    if (typeof window.__shSpenIsStrikethrough === 'function' && !window.__shSpenIsStrikethrough.__shV14) {
        var cutOrig = window.__shSpenIsStrikethrough;
        window.__shSpenIsStrikethrough = function (strokes, hostRect, textBox) {
            try { if (cutOrig(strokes, hostRect, textBox)) return true; } catch (e) {}
            return isCut(strokes, hostRect);
        };
        window.__shSpenIsStrikethrough.__shV14 = true;
    }

    if (typeof window.__shSpenOnPenDown === 'function' && !window.__shSpenOnPenDown.__shV15) {
        var downOrig = window.__shSpenOnPenDown;
        window.__shSpenOnPenDown = function (ev) {
            var inp = ev ? findFieldAt(ev.clientX, ev.clientY) : null;
            if (!inp && ev && window.__shSpenFindWritableInput) inp = window.__shSpenFindWritableInput(ev.target);
            var ink = ensureInk();
            if (!inp && ink) inp = ink.hoverInput;
            if (inp) {
                retarget(inp);
                beginWrite(ink, inp);
                layoutBoxOn(inp);
            }
            var ret = downOrig.apply(this, arguments);
            ink = window.__shSpenInk;
            if (ink && ink.input) {
                layoutBoxOn(ink.input);
                hideLive(ink.input, ink);
            }
            return ret;
        };
        window.__shSpenOnPenDown.__shV15 = true;
    }

    if (typeof window.__shSpenOnPenMove === 'function' && !window.__shSpenOnPenMove.__shV14) {
        var moveOrig = window.__shSpenOnPenMove;
        window.__shSpenOnPenMove = function (ev) {
            var ret = moveOrig.apply(this, arguments);
            var ink = window.__shSpenInk;
            if (ink && ink.input) layoutBoxOn(ink.input);
            if (ink && onlyNumber(ink.originValue) && isCut(allStrokes(ink), ink.hostRect)) {
                window.__shSpenSkipIme = true;
            }
            return ret;
        };
        window.__shSpenOnPenMove.__shV14 = true;
    }

    if (typeof window.__shSpenOnPenUp === 'function' && !window.__shSpenOnPenUp.__shV15) {
        var upOrig = window.__shSpenOnPenUp;
        window.__shSpenOnPenUp = function (ev, cancelled) {
            var ink = window.__shSpenInk;
            if (ink && ink.input) layoutBoxOn(ink.input);
            if (ink) ink.released = true;
            if (ink && shouldClear(ink)) {
                forceClear(ink);
                if (ink.input) unmaskField(ink.input);
                return;
            }
            if (ink && ink.imePending) ink.imeText = ink.imePending;
            if (ink && ink.input) hideLive(ink.input, ink);
            return upOrig.apply(this, arguments);
        };
        window.__shSpenOnPenUp.__shV15 = true;
    }

    if (!window.__shNativeHookV16) {
        window.__shNativeHookV16 = true;
        document.addEventListener('beforeinput', function (e) {
            if (!isPlantField(e.target)) return;
            var typ = e.inputType || '';
            if (typ.indexOf('delete') === 0) return;
            var ink = window.__shSpenInk;
            var data = e.data == null ? '' : String(e.data);
            if (isLiveWrite(ink)) {
                var n = onlyNumber(data);
                if (n && ink) ink.imePending = n;
                if (data && !/^[0-9,]+$/.test(data) && e.cancelable) e.preventDefault();
                hideLive(e.target, ink);
                return;
            }
            if (data && !/^[0-9,]+$/.test(data) && e.cancelable) e.preventDefault();
        }, true);
        document.addEventListener('input', function (e) {
            if (!isPlantField(e.target)) return;
            var ink = window.__shSpenInk;
            if (!ink || (ink.input !== e.target && ink.inputId !== e.target.id)) return;
            if (ink.cutGuardUntil && Date.now() < ink.cutGuardUntil) {
                if (e.target.value) e.target.value = '';
                ink.imeCleared = true;
                return;
            }
            var next = onlyNumber(e.target.value);
            if (ink.active && !ink.showResult) {
                if (next && next !== onlyNumber(ink.originValue)) ink.imePending = next;
                if (!next && onlyNumber(ink.originValue)) {
                    ink.sawImeClear = true;
                    return;
                }
                hideLive(e.target, ink);
            }
        }, true);
        document.addEventListener('pointermove', function (ev) {
            if (!ev || ev.pointerType !== 'pen') return;
            if ((ev.buttons & 1) === 1 || window.__shPenIsDown) return;
            if (typeof ev.pressure === 'number' && ev.pressure > 0.08) return;
            window.__shSpenHoverAt(ev.clientX, ev.clientY);
        }, { capture: true, passive: true });
        setInterval(function () {
            var ink = window.__shSpenInk;
            if (ink && ink.cutGuardUntil && Date.now() >= ink.cutGuardUntil) {
                ink.imeCleared = false;
                ink.cutGuardUntil = 0;
            }
            if (ink && ink.active && ink.input) layoutBoxOn(ink.hoverInput || ink.input);
            if (ink && ink.active && !ink.showResult && !ink.imeCleared && ink.input) hideLive(ink.input, ink);
            if (!ink || !ink.active) return;
            var age = Date.now() - (ink.sessionStartMs || ink.startMs || 0);
            if (window.__shPenIsDown && (Date.now() - (window.__shPenLastEventTs || 0)) > 1600) window.__shPenIsDown = false;
            if (age > 5000 && !window.__shPenIsDown && typeof window.__shSpenCommitNow === 'function') {
                if (!ink.imeCleared) window.__shSpenCommitNow();
            }
        }, 350);
    }
})();
