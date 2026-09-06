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
            var flat = horiz >= Math.max(12, fieldW * 0.28) && vert <= Math.max(22, fieldH * 0.75) && horiz > vert * 1.1;
            var scribble = reversals >= 1 && horiz >= Math.max(12, fieldW * 0.24) && vert <= Math.max(24, fieldH * 0.85);
            if (flat || scribble) return true;
        }
        return false;
    }

    function allStrokes(ink) {
        if (!ink) return [];
        var raw = (ink.strokes || []).slice();
        if (ink.current && ink.current.length) raw.push(ink.current);
        return raw;
    }

    function holdValue(ink) {
        return ink && ink.originValue != null ? String(ink.originValue) : '';
    }

    function hideLive(input, ink) {
        if (!input || !ink || ink.showResult || ink.imeCleared) return;
        if (ink.cutGuardUntil && Date.now() < ink.cutGuardUntil) return;
        var hold = holdValue(ink);
        if (String(input.value || '') !== hold) input.value = hold;
    }

    function markCleared(ink) {
        if (!ink) return;
        ink.imeCleared = true;
        ink.imePending = '';
        ink.imeText = ink.originValue || '';
        ink.pendingPred = Promise.resolve('');
        ink.cutGuardUntil = Date.now() + 4000;
        ink.showResult = true;
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
    }

    function shouldClear(ink) {
        if (!ink) return false;
        if (ink.sawImeClear) return true;
        if (ink.imeCleared) return true;
        if (!onlyNumber(ink.originValue)) return false;
        return isCut(allStrokes(ink), ink.hostRect);
    }

    function imeNumberNow() {
        var ink = window.__shSpenInk;
        if (!ink || ink.imeCleared) return '';
        return onlyNumber(ink.imePending || ink.imeText || '');
    }

    function waitIme(ms) {
        return new Promise(function (resolve) {
            var t0 = Date.now();
            var tick = function () {
                var ink = window.__shSpenInk;
                if (ink && ink.imeCleared) {
                    resolve('');
                    return;
                }
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

    function keepBox() {
        var ink = window.__shSpenInk;
        if (!ink || !ink.input || !ink.input.isConnected) return;
        var host = document.getElementById('sh-spen-ink-host');
        if (!host) return;
        var box = window.__shSpenFieldBox ? window.__shSpenFieldBox(ink.input) : ink.input;
        var r = box.getBoundingClientRect();
        var pad = 6;
        var left = Math.max(0, r.left - pad);
        var top = Math.max(0, r.top - pad);
        var w = r.width + pad * 2;
        var h = r.height + pad * 2;
        if (w < 2 || h < 2) return;
        host.style.display = 'block';
        host.style.left = left + 'px';
        host.style.top = top + 'px';
        host.style.width = w + 'px';
        host.style.height = h + 'px';
        host.style.pointerEvents = 'none';
        host.classList.add('sh-spen-ink-on');
        if (document.body) document.body.classList.add('sh-spen-ink-open');
        ink.active = true;
        ink.hostRect = { left: left, top: top, w: w, h: h };
        if (!ink.imeCleared) hideLive(ink.input, ink);
    }

    window.__shSpenRecognizeDigitsLocal = function () { return ''; };

    window.__shSpenRecognizeStrokes = function (strokeSnap) {
        var raw = strokeSnap || [];
        var ink = window.__shSpenInk;
        if (ink && ink.imeCleared) return Promise.resolve('');
        if (ink && isCut(raw, ink.hostRect) && ink.originValue) {
            forceClear(ink);
            return Promise.resolve('');
        }
        return waitIme(620).then(function (ime) {
            if (ink && ink.imeCleared) return '';
            var n = onlyNumber(ime);
            if (n) return n;
            if (!raw.length) return '';
            return window.__shSpenNativeRecognize(raw).then(onlyNumber);
        });
    };

    if (typeof window.__shSpenIsStrikethrough === 'function' && !window.__shSpenIsStrikethrough.__shV10) {
        var cutOrig = window.__shSpenIsStrikethrough;
        var cutLoose = function (strokes, hostRect, textBox) {
            try {
                if (cutOrig(strokes, hostRect, textBox)) return true;
            } catch (e) {}
            return isCut(strokes, hostRect);
        };
        cutLoose.__shV10 = true;
        window.__shSpenIsStrikethrough = cutLoose;
    }

    if (typeof window.__shSpenApplyFieldEdit === 'function' && !window.__shSpenApplyFieldEdit.__shV10) {
        var applyOrig = window.__shSpenApplyFieldEdit;
        var applySafe = function (input, recognized, origin, mode) {
            var ink = window.__shSpenInk;
            if (ink && (ink.imeCleared || (ink.cutGuardUntil && Date.now() < ink.cutGuardUntil))) {
                ink.showResult = true;
                return applyOrig(input, '', origin, 'clear');
            }
            if (mode === 'clear') {
                if (ink) {
                    markCleared(ink);
                    ink.showResult = true;
                }
                return applyOrig(input, '', origin, 'clear');
            }
            var rec = onlyNumber(recognized);
            if (!rec) return false;
            if (ink) ink.showResult = true;
            return applyOrig(input, rec, origin, mode || 'replace');
        };
        applySafe.__shV10 = true;
        window.__shSpenApplyFieldEdit = applySafe;
    }

    if (typeof window.__shSpenEditModeFromStrokes === 'function' && !window.__shSpenEditModeFromStrokes.__shV10) {
        var modeOrig = window.__shSpenEditModeFromStrokes;
        var modeSafe = function (strokes, input, origin, hostRect) {
            if (isCut(strokes, hostRect) && origin) return 'clear';
            return modeOrig(strokes, input, origin, hostRect);
        };
        modeSafe.__shV10 = true;
        window.__shSpenEditModeFromStrokes = modeSafe;
    }

    function retarget(input, commitOld) {
        if (!input || (window.__shSpenIsWritableInput && !window.__shSpenIsWritableInput(input))) return false;
        if (!window.__shSpenInk && window.__initAndroidSpenInk) window.__initAndroidSpenInk();
        var ink = window.__shSpenInk;
        if (!ink) return false;
        if (ink.input === input && ink.active) {
            keepBox();
            try { input.focus({ preventScroll: true }); } catch (e) { try { input.focus(); } catch (e2) {} }
            return true;
        }
        if (commitOld !== false && ink.active && ink.input && ink.input !== input) {
            var had = (ink.strokes && ink.strokes.length) || ink.imePending || ink.current;
            if (had && typeof window.__shSpenCommitNow === 'function') window.__shSpenCommitNow();
        }
        ink.strokes = [];
        ink.current = null;
        ink.imePending = '';
        ink.imeCleared = false;
        ink.sawImeClear = false;
        ink.showResult = false;
        ink.cutGuardUntil = 0;
        ink.pendingPred = null;
        ink.pendingPredCount = 0;
        ink.active = true;
        ink.watchOnly = false;
        ink.input = input;
        ink.inputId = input.id || '';
        ink.originValue = input.value || '';
        ink.imeText = input.value || '';
        ink.sessionStartMs = Date.now();
        ink.startMs = ink.sessionStartMs;
        ink.laidOut = false;
        ink.epoch = (ink.epoch || 0) + 1;
        window.__shSpenSkipIme = false;
        keepBox();
        try { input.focus({ preventScroll: true }); } catch (e) { try { input.focus(); } catch (e2) {} }
        if (document.body) document.body.classList.add('sh-spen-ink-open');
        return true;
    }

    window.__shSpenPointAt = function (x, y) {
        var inp = null;
        if (typeof window.__shSpenFindWritableInputAt === 'function') {
            inp = window.__shSpenFindWritableInputAt(x, y);
        }
        if (!inp) {
            try {
                var el = document.elementFromPoint(x, y);
                if (typeof window.__shSpenFindWritableInput === 'function') {
                    inp = window.__shSpenFindWritableInput(el);
                }
            } catch (e) {}
        }
        if (!inp) return false;
        return retarget(inp, true);
    };

    if (typeof window.__shSpenOnPenDown === 'function' && !window.__shSpenOnPenDown.__shV12) {
        var downOrig = window.__shSpenOnPenDown;
        var downReset = function (ev) {
            var inp = null;
            if (ev && typeof window.__shSpenFindWritableInputAt === 'function') {
                inp = window.__shSpenFindWritableInputAt(ev.clientX, ev.clientY);
            }
            if (!inp && ev && typeof window.__shSpenFindWritableInput === 'function') {
                inp = window.__shSpenFindWritableInput(ev.target);
            }
            if (inp) {
                retarget(inp, true);
            } else if (window.__shSpenInk && window.__shSpenInk.active && !window.__shPenIsDown) {
                if (typeof window.__shSpenCommitNow === 'function') window.__shSpenCommitNow();
                return;
            }
            var ret = downOrig.apply(this, arguments);
            var ink = window.__shSpenInk;
            if (ink && ink.input) hideLive(ink.input, ink);
            return ret;
        };
        downReset.__shV12 = true;
        window.__shSpenOnPenDown = downReset;
    }

    if (typeof window.__shSpenOnPenMove === 'function' && !window.__shSpenOnPenMove.__shV11) {
        var moveOrig = window.__shSpenOnPenMove;
        var moveCut = function (ev) {
            var ret = moveOrig.apply(this, arguments);
            var ink = window.__shSpenInk;
            if (ink && onlyNumber(ink.originValue) && isCut(allStrokes(ink), ink.hostRect)) {
                window.__shSpenSkipIme = true;
            }
            return ret;
        };
        moveCut.__shV11 = true;
        window.__shSpenOnPenMove = moveCut;
    }

    if (typeof window.__shSpenOnPenUp === 'function' && !window.__shSpenOnPenUp.__shV11) {
        var upOrig = window.__shSpenOnPenUp;
        var upKeep = function (ev, cancelled) {
            var ink = window.__shSpenInk;
            if (ink && shouldClear(ink)) {
                forceClear(ink);
                if (cancelled) {
                    ink.current = null;
                    ink.pointerId = null;
                }
                return;
            }
            if (ink && ink.imePending) ink.imeText = ink.imePending;
            if (cancelled) {
                if (ink) {
                    ink.current = null;
                    ink.pointerId = null;
                }
                keepBox();
                return;
            }
            if (ink && ink.input) hideLive(ink.input, ink);
            return upOrig.apply(this, arguments);
        };
        upKeep.__shV11 = true;
        window.__shSpenOnPenUp = upKeep;
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
        ink.showResult = false;
        var host = document.getElementById('sh-spen-ink-host');
        if (host) {
            host.classList.remove('sh-spen-ink-on', 'sh-spen-ink-capture', 'sh-spen-samsung-on');
            host.style.display = 'none';
        }
    }

    if (!window.__shNativeNumHookV10) {
        window.__shNativeNumHookV10 = true;
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
            if (!ink || (ink.input !== e.target && ink.inputId !== e.target.id)) return;
            if (ink.cutGuardUntil && Date.now() < ink.cutGuardUntil) {
                if (e.target.value) e.target.value = '';
                ink.imeCleared = true;
                ink.imePending = '';
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
                return;
            }
            if (next && String(e.target.value || '') !== next) e.target.value = next;
        }, true);
        setInterval(function () {
            var ink = window.__shSpenInk;
            if (ink && ink.active && !ink.showResult && !ink.imeCleared && ink.input) hideLive(ink.input, ink);
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
            if (age > 4500 && !window.__shPenIsDown) {
                if (typeof window.__shSpenCommitNow === 'function') window.__shSpenCommitNow();
            }
            if (age > 8000) unlockInk();
        }, 400);
    }

    if (!window.__shNativeHoverV12) {
        window.__shNativeHoverV12 = true;
        var lastHoverAt = 0;
        document.addEventListener('pointermove', function (ev) {
            if (!ev || ev.pointerType !== 'pen') return;
            if ((ev.buttons & 1) === 1 || window.__shPenIsDown) return;
            var now = Date.now();
            if (now - lastHoverAt < 32) return;
            lastHoverAt = now;
            window.__shSpenPointAt(ev.clientX, ev.clientY);
        }, { capture: true, passive: true });
        document.addEventListener('pointerover', function (ev) {
            if (!ev || ev.pointerType !== 'pen') return;
            if ((ev.buttons & 1) === 1 || window.__shPenIsDown) return;
            window.__shSpenPointAt(ev.clientX, ev.clientY);
        }, { capture: true, passive: true });
    }
})();
