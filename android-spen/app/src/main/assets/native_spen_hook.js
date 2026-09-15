(function () {
    window.__SH_NATIVE_ANDROID = true;
    window.__shSpenSkipIme = true;
    window.__SPEN_COMMIT_MS = 600;
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

    var SH_BLOCKED_GEMINI_KEY = 'AIzaSyCx80ru6-RXeTi3GvqkFsMVyMf-vpgIoVw';
    var SH_LIVE_GEMINI_KEY = 'AIzaSyBSsRE_1Os04-bxpd5JTLIniy3UK4OqKys';
    // Non seminare la chiave del progetto 747271305155: ogni tentativo è una chiamata Gemini bruciata.
    window.GEMINI_BUILTIN_KEYS = [SH_LIVE_GEMINI_KEY, '', ''];

    function persistGeminiCfgLocal(cfg) {
        try {
            if (typeof window.persistGeminiKeysLocalAll === 'function') {
                window.persistGeminiKeysLocalAll(cfg);
                return;
            }
            var raw = JSON.stringify(cfg);
            localStorage.setItem('servicehub_gemini_api_keys_v1', raw);
            localStorage.setItem('servicehub_gemini_api_keys_v1_backup', raw);
            localStorage.setItem('servicehub_gemini_api_keys_v1_mirror', raw);
            var active = (cfg.keys && cfg.keys[cfg.activeIndex]) || '';
            if (active) localStorage.setItem('servicehub_gemini_api_key', active);
        } catch (eP) {}
    }

    function stripBlockedGeminiKey(cfg) {
        if (!cfg || !cfg.keys) return cfg;
        var changed = false;
        var i;
        for (i = 0; i < cfg.keys.length; i++) {
            if (cfg.keys[i] === SH_BLOCKED_GEMINI_KEY) {
                cfg.keys[i] = '';
                changed = true;
            }
        }
        if (changed || !cfg.keys[cfg.activeIndex]) {
            cfg.activeIndex = 0;
            for (i = 0; i < cfg.keys.length; i++) {
                if (cfg.keys[i] && String(cfg.keys[i]).length > 8) {
                    cfg.activeIndex = i;
                    break;
                }
            }
        }
        cfg.__shStrippedBlocked = changed;
        return cfg;
    }

    function alignGeminiCallBudgetWithWeb() {
        window.GEMINI_BUILTIN_KEYS = [SH_LIVE_GEMINI_KEY, '', ''];
        if (typeof window.isGeminiInvalidKeyError === 'function' && !window.isGeminiInvalidKeyError.__shV139) {
            var origInv = window.isGeminiInvalidKeyError;
            window.isGeminiInvalidKeyError = function (message) {
                var msg = String(message || '');
                if (/API_KEY_SERVICE_BLOCKED|SERVICE_DISABLED|has not been used in project|API has not been enabled|blocked.*generativelanguage/i.test(msg)) {
                    return true;
                }
                return origInv(message);
            };
            window.isGeminiInvalidKeyError.__shV139 = true;
        }
        if (typeof window.getGeminiKeySlots === 'function' && !window.getGeminiKeySlots.__shV140) {
            var origSlots = window.getGeminiKeySlots;
            window.getGeminiKeySlots = function () {
                return origSlots.apply(this, arguments).filter(function (s) {
                    return s && s.key && s.key !== SH_BLOCKED_GEMINI_KEY;
                });
            };
            window.getGeminiKeySlots.__shV140 = true;
        }
        if (typeof window.__geminiCfgFromBuiltin === 'function' && !window.__geminiCfgFromBuiltin.__shV140) {
            var origBuilt = window.__geminiCfgFromBuiltin;
            window.__geminiCfgFromBuiltin = function () {
                return stripBlockedGeminiKey(origBuilt.apply(this, arguments));
            };
            window.__geminiCfgFromBuiltin.__shV140 = true;
        }
        if (typeof window.geminiFetchModelOnce === 'function' && !window.geminiFetchModelOnce.__shV140Guard) {
            var origFetch = window.geminiFetchModelOnce;
            window.geminiFetchModelOnce = function (apiKey, modelName, parts, timeoutMs, genConfig) {
                if (String(apiKey || '') === SH_BLOCKED_GEMINI_KEY) {
                    var err = new Error('API_KEY_SERVICE_BLOCKED');
                    err.geminiApiError = true;
                    return Promise.reject(err);
                }
                return origFetch.apply(this, arguments);
            };
            window.geminiFetchModelOnce.__shV140Guard = true;
        }
        if (typeof window.geminiGenerateWithOneKey === 'function' && !window.geminiGenerateWithOneKey.__shV140) {
            var origGen = window.geminiGenerateWithOneKey;
            window.geminiGenerateWithOneKey = function (apiKey, parts, opts) {
                if (String(apiKey || '') === SH_BLOCKED_GEMINI_KEY) {
                    return Promise.reject(new Error('API_KEY_SERVICE_BLOCKED'));
                }
                return origGen.apply(this, arguments);
            };
            window.geminiGenerateWithOneKey.__shV140 = true;
        }
        try {
            var cfg = null;
            try { cfg = JSON.parse(localStorage.getItem('servicehub_gemini_api_keys_v1') || 'null'); } catch (e0) {}
            if (cfg && cfg.keys) {
                stripBlockedGeminiKey(cfg);
                if (cfg.__shStrippedBlocked) persistGeminiCfgLocal(cfg);
            }
        } catch (e1) {}
    }
    function seedAndroidGeminiKeys() {
        var built = (window.GEMINI_BUILTIN_KEYS || []).map(function (k) { return String(k || '').trim(); });
        while (built.length < 3) built.push('');
        var existing = null;
        try { existing = JSON.parse(localStorage.getItem('servicehub_gemini_api_keys_v1') || 'null'); } catch (e) {}
        if (existing && existing.keys) {
            stripBlockedGeminiKey(existing);
            if (existing.__shStrippedBlocked) persistGeminiCfgLocal(existing);
        } else {
            var cfg = { keys: built.slice(0, 3), activeIndex: 0, keyMeta: {} };
            persistGeminiCfgLocal(cfg);
            if (typeof window.ensureGeminiKeysNeverLost === 'function') {
                try { window.ensureGeminiKeysNeverLost(); } catch (e3) {}
            }
        }
        try { alignGeminiCallBudgetWithWeb(); } catch (ePf) {}
    }
    try { seedAndroidGeminiKeys(); } catch (e) {}

    function shrinkDataUrl(dataUrl, maxSide, quality) {
        return new Promise(function (resolve) {
            try {
                var img = new Image();
                img.onload = function () {
                    try {
                        var w = img.naturalWidth || img.width;
                        var h = img.naturalHeight || img.height;
                        if (!w || !h) { resolve(dataUrl); return; }
                        if (w > maxSide || h > maxSide) {
                            if (w >= h) { h = Math.round(h * maxSide / w); w = maxSide; }
                            else { w = Math.round(w * maxSide / h); h = maxSide; }
                        }
                        var canvas = document.createElement('canvas');
                        canvas.width = w;
                        canvas.height = h;
                        var ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, w, h);
                        resolve(canvas.toDataURL('image/jpeg', quality || 0.78));
                    } catch (e) { resolve(dataUrl); }
                };
                img.onerror = function () { resolve(dataUrl); };
                img.src = dataUrl;
            } catch (e2) { resolve(dataUrl); }
        });
    }

    function shrinkImageData(imageData) {
        return Promise.resolve().then(function () {
            if (!imageData) return imageData;
            var raw = imageData.data || (typeof imageData === 'string' ? imageData : '');
            if (!raw) return imageData;
            var url = raw.indexOf(',') >= 0 ? raw : ('data:image/jpeg;base64,' + raw);
            return shrinkDataUrl(url, 1280, 0.78).then(function (next) {
                if (typeof imageData === 'string') return next;
                return { data: next, type: 'image/jpeg', name: imageData.name || 'foto.jpg' };
            });
        });
    }

    function pageGeminiFetch(apiKey, modelName, parts, timeoutMs, genConfig) {
        var controller = typeof AbortController === 'function' ? new AbortController() : null;
        var timer = setTimeout(function () {
            try { if (controller) controller.abort(); } catch (e) {}
        }, timeoutMs || 65000);
        var url = 'https://generativelanguage.googleapis.com/v1beta/models/'
            + modelName + ':generateContent?key=' + apiKey;
        var body = {
            contents: [{ parts: parts }],
            generationConfig: genConfig || { temperature: 0.15, maxOutputTokens: 2048 }
        };
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller ? controller.signal : undefined
        }).then(function (response) {
            return response.json().then(function (data) {
                clearTimeout(timer);
                if (data && data.error) {
                    var err = new Error(data.error.message || 'Gemini error');
                    err.geminiApiError = true;
                    throw err;
                }
                if (!response.ok) throw new Error('HTTP ' + response.status + ' su ' + modelName);
                var cand = data.candidates && data.candidates[0];
                var partsOut = cand && cand.content && cand.content.parts;
                var text = '';
                if (partsOut) {
                    for (var i = 0; i < partsOut.length; i++) text += partsOut[i].text || '';
                }
                text = String(text || '').trim();
                if (text) return text;
                throw new Error('Risposta vuota da ' + modelName);
            });
        }).then(function (text) {
            clearTimeout(timer);
            return text;
        }, function (err) {
            clearTimeout(timer);
            throw err;
        });
    }

    function nativeGeminiFetch(apiKey, modelName, parts, timeoutMs, genConfig) {
        return new Promise(function (resolve, reject) {
            try {
                if (!window.ServiceHubAndroidSpen || typeof window.ServiceHubAndroidSpen.geminiPost !== 'function') {
                    reject(new Error('Ponte Gemini Android assente'));
                    return;
                }
                var id = 'g' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
                var url = 'https://generativelanguage.googleapis.com/v1beta/models/'
                    + modelName + ':generateContent?key=' + apiKey;
                var body = JSON.stringify({
                    contents: [{ parts: parts }],
                    generationConfig: genConfig || { temperature: 0.15, maxOutputTokens: 2048 }
                });
                var done = false;
                var timer = setTimeout(function () {
                    if (done) return;
                    done = true;
                    try { delete window.__shSpenNativeCbs[id]; } catch (e) {}
                    reject(new Error('timeout'));
                }, timeoutMs || 65000);
                window.__shSpenNativeCbs[id] = function (raw) {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    try { delete window.__shSpenNativeCbs[id]; } catch (e) {}
                    try {
                        var data = typeof raw === 'string' ? JSON.parse(raw) : raw;
                        if (data && data.error) {
                            var err = new Error((data.error && data.error.message) || 'Gemini error');
                            err.geminiApiError = true;
                            reject(err);
                            return;
                        }
                        var cand = data && data.candidates && data.candidates[0];
                        var partsOut = cand && cand.content && cand.content.parts;
                        var text = '';
                        if (partsOut) {
                            for (var p = 0; p < partsOut.length; p++) text += partsOut[p].text || '';
                        }
                        text = String(text || '').trim();
                        if (text) {
                            resolve(text);
                            return;
                        }
                        reject(new Error('Risposta vuota da ' + modelName));
                    } catch (e4) {
                        reject(e4);
                    }
                };
                window.ServiceHubAndroidSpen.geminiPost(id, url, body);
            } catch (e5) {
                reject(e5);
            }
        });
    }

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

    function layerCoversUi(el) {
        if (!el || !el.isConnected) return false;
        var st = window.getComputedStyle(el);
        if (!st || st.display === 'none' || st.visibility === 'hidden') return false;
        if (parseFloat(st.opacity || '1') < 0.05) return false;
        var r = el.getBoundingClientRect();
        var vw = window.innerWidth || 1;
        var vh = window.innerHeight || 1;
        return r.width >= vw * 0.55 && r.height >= vh * 0.4;
    }

    function overlayFromEl(el) {
        if (!el || !el.closest) return null;
        var node = el.closest(
            '.modal-overlay,#settingsOverlay,#settingsModal,#tank-selection-modal,.tank-detail-overlay'
        );
        if (!node) return null;
        if (node.classList && node.classList.contains('modal-overlay')) {
            if (!node.classList.contains('active')
                && !node.classList.contains('exit-left')
                && !node.classList.contains('exit-right')) return null;
        }
        return node;
    }

    function isForegroundOverlayOpen() {
        if (document.querySelector(
            '.modal-overlay.active,.modal-overlay.exit-left,.modal-overlay.exit-right'
        )) return true;
        if (document.getElementById('settingsModal')) return true;
        var pick = document.getElementById('tank-selection-modal');
        if (pick) {
            var st = window.getComputedStyle(pick);
            if (st && st.display !== 'none' && st.visibility !== 'hidden' && parseFloat(st.opacity || '1') > 0.2) return true;
        }
        var detail = document.querySelector('.tank-detail-overlay');
        if (detail) {
            var ds = window.getComputedStyle(detail);
            if (ds && ds.display !== 'none' && ds.visibility !== 'hidden') return true;
        }
        return false;
    }

    function hideFramesIfOverlay() {
        if (window.__shPenIsDown) return;
        if (isForegroundOverlayOpen()) hideBox();
    }

    function ensureOverlayWatch() {
        if (window.__shSpenOverlayWatch) return;
        window.__shSpenOverlayWatch = true;
        setInterval(hideFramesIfOverlay, 140);
        document.addEventListener('click', function () {
            setTimeout(hideFramesIfOverlay, 0);
        }, true);
    }

    function placeFrame(boxEl, keyId, hoverInput) {
        if (isForegroundOverlayOpen()) {
            hideBox();
            return false;
        }
        if (!boxEl || !boxEl.isConnected) return false;
        var ink = ensureInk();
        var host = ensureHost();
        if (!host) return false;
        var r = boxEl.getBoundingClientRect();
        var pad = 6;
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

    function layoutBoxOn(input) {
        if (!input || !input.isConnected) return false;
        var box = window.__shSpenFieldBox ? window.__shSpenFieldBox(input) : input;
        return placeFrame(box, input.id || 'inp', input);
    }

    function hideFieldUnit(on) {
        var ink = window.__shSpenInk;
        var input = boundInput(ink);
        if (on && input) {
            if (input.getAttribute('data-sh-unit-ph') == null) {
                input.setAttribute('data-sh-unit-ph', input.getAttribute('placeholder') || '');
            }
            if (input.getAttribute('placeholder')) input.setAttribute('placeholder', '');
        } else {
            var nodes = document.querySelectorAll('.main-container input[data-sh-unit-ph], .main-container textarea[data-sh-unit-ph]');
            for (var i = 0; i < nodes.length; i++) {
                nodes[i].setAttribute('placeholder', nodes[i].getAttribute('data-sh-unit-ph') || '');
                nodes[i].removeAttribute('data-sh-unit-ph');
            }
        }
    }

    function syncWriteLock(writing) {
        if (!document.body) return;
        var ink = window.__shSpenInk;
        var busy = !!(writing || (ink && ink.active && ((ink.strokes && ink.strokes.length) || ink.current || window.__shPenIsDown)));
        if (writing) {
            document.body.classList.add('sh-spen-ink-open', 'sh-spen-writing', 'sh-spen-hide-units');
        } else {
            document.body.classList.remove('sh-spen-writing');
            document.body.classList.remove('sh-spen-ink-open');
            if (!busy) document.body.classList.remove('sh-spen-hide-units');
        }
        hideFieldUnit(busy);
    }

    function hideBox() {
        hoverHorizBar = null;
        window.__shSpenWantBox = false;
        var ink = window.__shSpenInk;
        if (ink) {
            ink.layoutKey = '';
            ink.hoverInput = null;
            ink.hostRect = null;
        }
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

    function unlockIfNewSession(input) {
        var ink = ensureInk();
        if (!ink || !input) return;
        var continuing = !!(ink.active && ink.inputId === input.id && !ink.writeLocked && !ink.showResult);
        if (continuing) return;
        beginWrite(ink, input, false);
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
        return !!(el && el.closest && el.closest(AMB_MODAL_SEL + ',.modal-overlay,#settingsOverlay,#settingsModal,#tank-selection-modal,.tank-detail-overlay'));
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

    // Dopo il click sintetico del pennino il WebView consegna anche il proprio click nativo:
    // sui tasti del numpad arrivavano due cifre per ogni tocco.
    // Lo stato vive su window: l'hook viene iniettato piu' volte e il listener registrato dalla
    // prima copia deve vedere la guardia armata da qualunque altra.
    function armNativeClickGuard(el) {
        window.__shPenClickGuard = el ? { el: el, t: Date.now() } : null;
    }
    if (!window.__shPenClickDedup) {
        window.__shPenClickDedup = true;
        document.addEventListener('click', function (ev) {
            var g = window.__shPenClickGuard;
            if (!ev || !ev.isTrusted || !g) return;
            if (Date.now() - g.t > 350) { window.__shPenClickGuard = null; return; }
            var t = ev.target;
            if (!g.el || !(g.el === t || (g.el.contains && g.el.contains(t)))) return;
            window.__shPenClickGuard = null;
            ev.stopPropagation();
            if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
            if (ev.cancelable) ev.preventDefault();
        }, true);
    }

    function clickPenTarget(el) {
        if (!el) return false;
        var status = el.closest ? el.closest('.status-cell-btn') : null;
        if (status && status.id && typeof window.toggleStatus === 'function') {
            try { window.toggleStatus(status.id); return true; } catch (e0) {}
        }
        var header = el.closest ? el.closest('.status-header') : null;
        if (header) {
            var raw = header.getAttribute('onclick') || '';
            var tm = raw.match(/toggleComp\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]/);
            if (tm && typeof window.toggleComp === 'function') {
                try { window.toggleComp(tm[1], tm[2]); return true; } catch (eC) {}
            }
            try { header.click(); return true; } catch (eH) {}
        }
        var hit = el;
        if (el.closest) {
            hit = el.closest('button, [onclick], .status-cell-btn, .status-header, .tank-status-single, .vwt-btn, .osmosi-btn, .analisi-choice-btn, [data-vwt-trigger], [data-osmosi-trigger], [data-analisi-trigger], [data-sf3-run-trigger], [data-vwt-meter-trigger]') || el;
        }
        markPenPopupClick();
        armNativeClickGuard(hit);
        try {
            hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, composed: true }));
            return true;
        } catch (e) {
            try { hit.click(); return true; } catch (e2) { return false; }
        }
    }

    function plantButtonFromEl(el) {
        if (!el || !el.closest) return null;
        if (el.closest('.v-label-container, .cond-tendina-bar, .nott-filtra-tendina-bar, .nott-stocc-tendina-bar, .nott-chem-tendina-bar, .rapportino-custom-tendina-bar')) return null;
        return el.closest('.status-cell-btn, .status-header, .tank-status-single');
    }

    function plantButtonFromPoint(x, y) {
        var direct = plantButtonFromEl(elementFromPen(x, y));
        if (direct) return direct;
        var nodes = document.querySelectorAll('.status-cell-btn, .status-header');
        var best = null;
        var bestD = 22;
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            if (!n.getBoundingClientRect) continue;
            var r = n.getBoundingClientRect();
            if (r.width < 4 || r.height < 4) continue;
            if (x < r.left - 12 || x > r.right + 12 || y < r.top - 12 || y > r.bottom + 12) continue;
            var dx = x - ((r.left + r.right) / 2);
            var dy = y - ((r.top + r.bottom) / 2);
            var d = Math.sqrt(dx * dx + dy * dy);
            if (d < bestD) {
                bestD = d;
                best = n;
            }
        }
        return best;
    }

    function wrapStatusToggleOnce(name) {
        if (typeof window[name] !== 'function' || window[name].__shV69) return;
        var orig = window[name];
        var lastKey = '';
        var lastT = 0;
        window[name] = function (id) {
            var key = String(id == null ? '' : id) + ':' + String(arguments[1] == null ? '' : arguments[1]);
            var now = Date.now();
            // Serve solo a scartare il click doppio del pennino (sintetico + nativo, pochi ms):
            // oltre questa soglia sono pressioni vere e vanno accettate.
            if (key && lastKey === key && (now - lastT) < 120) return;
            lastKey = key;
            lastT = now;
            return orig.apply(this, arguments);
        };
        window[name].__shV69 = true;
    }
    wrapStatusToggleOnce('toggleStatus');
    wrapStatusToggleOnce('toggleComp');

    function activateVertLabel(el) {
        if (!el) return false;
        var box = el.closest ? el.closest('.v-label-container') : el;
        var id = startPressIdFromEl(box || el);
        if (!id && box && box.querySelector) {
            var span = box.querySelector('[id^="lbl-"]');
            if (span && span.id && span.id.indexOf('lbl-') === 0) id = span.id.slice(4);
        }
        if (id && typeof window.handleLabelClick === 'function') {
            try { window.handleLabelClick(id, true); return true; } catch (e) {}
        }
        return false;
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

    function isSiglaOrStatus(el) {
        return !!(el && el.closest && el.closest('.tank-status-single, .status-cell-btn, ' + SIGLA_SEL));
    }

    function notesTendinaOpen() {
        var t = document.getElementById('rapportino-note-tendina');
        if (!t || t.style.display === 'none') return false;
        return !t.classList.contains('rapportino-note-tendina-collapsed');
    }

    function notesFullscreenOn() {
        return !!(document.body && document.body.classList.contains('sh-spen-note-fs'));
    }

    function noteTextareaFromEl(el) {
        if (window.__shNoteInkPass) return null;
        if (!el || !notesTendinaOpen()) return null;
        if (el.id === 'inp-sec-note') return el;
        return null;
    }

    function noteTextareaFromPoint(x, y) {
        if (window.__shNoteInkPass) return null;
        if (!notesTendinaOpen()) return null;
        var ta = document.getElementById('inp-sec-note');
        if (!ta) return null;
        var r = ta.getBoundingClientRect();
        if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
        return ta;
    }

    var noteHwOn = false;
    function setNoteHandwriting(on) {
        noteHwOn = !!on;
        try {
            if (window.ServiceHubAndroidSpen && typeof window.ServiceHubAndroidSpen.setNoteHandwriting === 'function') {
                window.ServiceHubAndroidSpen.setNoteHandwriting(!!on);
            }
        } catch (e) {}
    }

    function setNoteWriting(on) {
        window.__shSpenNoteWriting = !!on;
        if (document.body) {
            if (on) document.body.classList.add('sh-spen-note-writing');
            else document.body.classList.remove('sh-spen-note-writing');
        }
    }

    function noteBarHit(x, y) {
        var bar = document.querySelector('#rapportino-note-tendina .cond-tendina-bar');
        if (!bar || !bar.getBoundingClientRect) return null;
        var tendina = document.getElementById('rapportino-note-tendina');
        if (!tendina || tendina.style.display === 'none') return null;
        var r = bar.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return null;
        var padX = 16;
        var padY = notesTendinaOpen() ? 14 : 12;
        if (x < r.left - padX || x > r.right + padX || y < r.top - padY || y > r.bottom + padY) return null;
        if (noteCmdHit(x, y)) return null;
        var mid = (r.left + r.right) / 2;
        var centerHalf = Math.min(48, Math.max(32, r.width * 0.07));
        return { bar: bar, zone: (Math.abs(x - mid) <= centerHalf) ? 'center' : 'side' };
    }

    function lockNoteBarPen(ms) {
        window.__shNoteBarPenLock = Date.now() + (ms || 700);
    }

    function noteBarPenLocked() {
        return Date.now() < (window.__shNoteBarPenLock || 0);
    }

    function prepareNoteTextField() {
        var ta = document.getElementById('inp-sec-note');
        if (!ta) return ta;
        ta.setAttribute('inputmode', 'text');
        ta.setAttribute('enterkeyhint', 'enter');
        ta.removeAttribute('pattern');
        ta.setAttribute('autocomplete', 'on');
        ta.setAttribute('autocapitalize', 'sentences');
        ta.setAttribute('autocorrect', 'on');
        ta.setAttribute('spellcheck', 'true');
        ta.setAttribute('data-no-numpad', '1');
        return ta;
    }

    function setNoteSoftInput(on) {
        try {
            if (window.ServiceHubAndroidSpen && typeof window.ServiceHubAndroidSpen.setNoteSoftInput === 'function') {
                window.ServiceHubAndroidSpen.setNoteSoftInput(!!on);
            }
        } catch (e) {}
    }

    function keyboardOverlapPx() {
        var vv = window.visualViewport;
        if (!vv) return 0;
        return Math.max(0, (window.innerHeight || 0) - vv.height - (vv.offsetTop || 0));
    }

    var noteKbGen = 0;
    function unpinNoteFromKeyboard() {
        var tendina = document.getElementById('rapportino-note-tendina');
        if (!tendina) return;
        tendina.style.position = '';
        tendina.style.left = '';
        tendina.style.right = '';
        tendina.style.bottom = '';
        tendina.style.top = '';
        tendina.style.width = '';
        tendina.style.zIndex = '';
        tendina.style.maxHeight = '';
    }

    function typingInOtherField() {
        var ae = document.activeElement;
        if (!ae || ae.id === 'inp-sec-note') return false;
        if (ae.tagName !== 'INPUT' && ae.tagName !== 'TEXTAREA') return false;
        return !ae.readOnly && !ae.disabled;
    }

    function dismissNoteKeyboard() {
        noteKbGen += 1;
        window.__shNotePenWrite = false;
        blurNoteField();
        // setNoteSoftInput agisce sull'intera finestra: col dito su un altro campo
        // chiuderebbe la tastiera appena aperta.
        if (!typingInOtherField()) setNoteSoftInput(false);
        unpinNoteFromKeyboard();
        clearNoteInk();
    }

    function pinNoteAboveKeyboard() {
        var tendina = document.getElementById('rapportino-note-tendina');
        var ta = document.getElementById('inp-sec-note');
        if (!tendina || notesFullscreenOn() || !notesTendinaOpen() || !ta || document.activeElement !== ta) {
            unpinNoteFromKeyboard();
            return;
        }
        var vv = window.visualViewport;
        var kb = keyboardOverlapPx();
        var viewH = vv ? vv.height : window.innerHeight;
        if (kb < 120) {
            unpinNoteFromKeyboard();
            return;
        }
        tendina.style.position = 'fixed';
        tendina.style.left = '0';
        tendina.style.right = '0';
        tendina.style.width = '100%';
        tendina.style.bottom = Math.round(kb) + 'px';
        tendina.style.top = 'auto';
        tendina.style.zIndex = '60010';
        tendina.style.maxHeight = Math.max(170, Math.round(viewH - 10)) + 'px';
    }

    function prepareNoteFingerKeyboard() {
        if (notesFullscreenOn()) {
            dismissNoteKeyboard();
            return;
        }
        var ta = prepareNoteTextField();
        if (!ta || !notesTendinaOpen()) return;
        var gen = (noteKbGen += 1);
        setNoteHandwriting(false);
        setNoteSoftInput(true);
        try { ta.focus({ preventScroll: true }); } catch (e) {
            try { ta.focus(); } catch (e2) {}
        }
        revealNoteSmallIntoView();
        var later = function () {
            if (gen !== noteKbGen || !notesTendinaOpen()) return;
            if (document.activeElement !== ta) return;
            pinNoteAboveKeyboard();
            revealNoteSmallIntoView();
        };
        setTimeout(later, 80);
        setTimeout(later, 220);
        setTimeout(later, 480);
    }

    function blurNoteField() {
        var ta = document.getElementById('inp-sec-note');
        if (ta) {
            try { ta.blur(); } catch (e) {}
        }
        setNoteHandwriting(false);
    }

    function syncNoteFullscreen() {
        var tendina = document.getElementById('rapportino-note-tendina');
        var open = notesTendinaOpen();
        var fs = !!(open && tendina && tendina.dataset.shNoteMode === 'fs');
        if (document.body) {
            if (fs) document.body.classList.add('sh-spen-note-fs');
            else document.body.classList.remove('sh-spen-note-fs');
        }
        if (tendina) {
            if (fs) tendina.classList.add('sh-spen-note-fs-card');
            else tendina.classList.remove('sh-spen-note-fs-card');
        }
        var ta = document.getElementById('inp-sec-note');
        if (fs) {
            hideBox();
            if (ta) ta.setAttribute('inputmode', 'text');
            if (ta && document.activeElement === ta && window.__shLastNotePointer !== 'pen' && !window.__shNotePenWrite) {
                blurNoteField();
            }
        } else if (ta) {
            ta.setAttribute('inputmode', 'text');
        }
        if (open) {
            try { ensureNoteCmdPanel(); } catch (eP) {}
        }
        if (!open) {
            setNoteWriting(false);
            setNoteHandwriting(false);
            dismissNoteKeyboard();
        }
    }

    function revealNoteSmallIntoView() {
        if (notesFullscreenOn()) return;
        var tendina = document.getElementById('rapportino-note-tendina');
        if (!tendina || !notesTendinaOpen()) return;
        var run = function () {
            if (notesFullscreenOn() || !notesTendinaOpen()) return;
            if (keyboardOverlapPx() >= 80) {
                pinNoteAboveKeyboard();
                return;
            }
            var mc = document.querySelector('.main-container');
            var mgmt = document.querySelector('.fixed-management-container');
            var mgmtH = 0;
            if (mgmt) {
                var mr = mgmt.getBoundingClientRect();
                if (mr.height > 0 && mr.top < window.innerHeight) mgmtH = Math.max(0, window.innerHeight - mr.top);
            }
            var vv = window.visualViewport;
            var viewTop = vv ? vv.offsetTop : 0;
            var viewH = vv ? vv.height : window.innerHeight;
            var viewBottom = viewTop + viewH - Math.max(16, mgmtH + 8);
            var tr = tendina.getBoundingClientRect();
            var body = document.getElementById('rapportino-note-tendina-body');
            var br = body ? body.getBoundingClientRect() : tr;
            var bottom = Math.max(tr.bottom, br.bottom);
            var delta = 0;
            if (bottom > viewBottom) delta = bottom - viewBottom;
            else if (tr.top < viewTop + 8) delta = tr.top - (viewTop + 8);
            if (Math.abs(delta) < 2) return;
            if (mc && mc.scrollHeight > mc.clientHeight + 4) mc.scrollTop += delta;
            else window.scrollBy(0, delta);
        };
        run();
        requestAnimationFrame(function () {
            run();
            setTimeout(run, 80);
            setTimeout(run, 240);
        });
    }

    function setNoteSchedaOpen(open, mode) {
        var tendina = document.getElementById('rapportino-note-tendina');
        if (!tendina) return;
        try { window.__lastTendinaToggleTs = window.__lastTendinaToggleTs || {}; window.__lastTendinaToggleTs['generale-note'] = 0; } catch (e) {}
        if (open) {
            tendina.classList.remove('rapportino-note-tendina-collapsed');
            tendina.dataset.userExpanded = '1';
            tendina.dataset.shNoteMode = (mode === 'fs') ? 'fs' : 'small';
        } else {
            tendina.classList.add('rapportino-note-tendina-collapsed');
            tendina.removeAttribute('data-user-expanded');
            tendina.removeAttribute('data-sh-note-mode');
            dismissNoteKeyboard();
        }
        var ch = document.getElementById('note-tendina-chevron');
        if (ch) ch.textContent = open ? '▲' : '▼';
        var bar = tendina.querySelector('.cond-tendina-bar');
        if (bar) bar.setAttribute('aria-expanded', open ? 'true' : 'false');
        try { ensureNoteCmdPanel(); } catch (eCmd2) {}
        syncNoteFullscreen();
        if (open && mode !== 'fs') revealNoteSmallIntoView();
        try {
            if (typeof window.__persistUiStateAfterInteraction === 'function') {
                window.__persistUiStateAfterInteraction();
            }
        } catch (e2) {}
    }

    var lastNoteBarAction = 0;
    function handleNoteBarTap(zone) {
        var tendina = document.getElementById('rapportino-note-tendina');
        if (!tendina) return;
        lockNoteBarPen(700);
        var now = Date.now();
        if (now - lastNoteBarAction < 280) return;
        lastNoteBarAction = now;
        dismissNoteKeyboard();
        if (notesTendinaOpen()) {
            // Centro sull'anteprima: va diretto a schermo intero, senza passare dalla chiusura.
            if (zone === 'center' && !notesFullscreenOn()) {
                setNoteSchedaOpen(true, 'fs');
                return;
            }
            setNoteSchedaOpen(false);
            return;
        }
        setNoteSchedaOpen(true, zone === 'center' ? 'fs' : 'small');
    }

    function nativeRecognizeText(strokes) {
        return new Promise(function (resolve) {
            try {
                if (!window.ServiceHubAndroidSpen || typeof window.ServiceHubAndroidSpen.recognizeText !== 'function') {
                    resolve('');
                    return;
                }
                var id = 't' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
                var done = false;
                var finish = function (t) {
                    if (done) return;
                    done = true;
                    try { delete window.__shSpenNativeCbs[id]; } catch (e) {}
                    resolve(String(t || '').trim());
                };
                window.__shSpenNativeCbs[id] = finish;
                setTimeout(function () { finish(''); }, 20000);
                window.ServiceHubAndroidSpen.recognizeText(id, JSON.stringify(strokes || []));
            } catch (e) {
                resolve('');
            }
        });
    }

    var noteInk = { strokes: [], current: null, timer: null, host: null };

    function noteInkHost() {
        var host = document.getElementById('sh-spen-note-ink');
        if (!host) {
            host = document.createElement('div');
            host.id = 'sh-spen-note-ink';
            host.setAttribute('aria-hidden', 'true');
            host.style.cssText = 'position:fixed;pointer-events:none;z-index:60020;display:none;';
            var cvs = document.createElement('canvas');
            cvs.style.cssText = 'display:block;width:100%;height:100%;';
            host.appendChild(cvs);
            (document.body || document.documentElement).appendChild(host);
        }
        noteInk.host = host;
        return host;
    }

    function layoutNoteInk() {
        var ta = document.getElementById('inp-sec-note');
        var host = noteInkHost();
        if (!ta || !notesTendinaOpen()) {
            host.style.display = 'none';
            return;
        }
        var r = ta.getBoundingClientRect();
        host.style.display = 'block';
        host.style.left = r.left + 'px';
        host.style.top = r.top + 'px';
        host.style.width = r.width + 'px';
        host.style.height = r.height + 'px';
        var cvs = host.querySelector('canvas');
        if (!cvs) return;
        var dpr = window.devicePixelRatio || 1;
        cvs.width = Math.max(1, Math.round(r.width * dpr));
        cvs.height = Math.max(1, Math.round(r.height * dpr));
        noteInk.rect = r;
        noteInk.dpr = dpr;
        redrawNoteInk();
    }

    function redrawNoteInk() {
        var host = noteInk.host || noteInkHost();
        var cvs = host.querySelector('canvas');
        if (!cvs) return;
        var ctx = cvs.getContext('2d');
        ctx.clearRect(0, 0, cvs.width, cvs.height);
        var r = noteInk.rect;
        if (!r) return;
        var dpr = noteInk.dpr || 1;
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2.2 * dpr;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        var all = noteInk.strokes.slice();
        if (noteInk.current && noteInk.current.length) all.push(noteInk.current);
        for (var s = 0; s < all.length; s++) {
            var pts = all[s];
            if (!pts || pts.length < 1) continue;
            ctx.beginPath();
            ctx.moveTo((pts[0].x - r.left) * dpr, (pts[0].y - r.top) * dpr);
            for (var i = 1; i < pts.length; i++) {
                ctx.lineTo((pts[i].x - r.left) * dpr, (pts[i].y - r.top) * dpr);
            }
            ctx.stroke();
        }
    }

    function clearNoteInk() {
        noteInk.strokes = [];
        noteInk.current = null;
        if (noteInk.timer) {
            try { clearTimeout(noteInk.timer); } catch (e) {}
            noteInk.timer = null;
        }
        var host = document.getElementById('sh-spen-note-ink');
        if (host) host.style.display = 'none';
    }

    function insertNoteText(text) {
        var ta = document.getElementById('inp-sec-note');
        if (!ta) return;
        text = String(text || '').replace(/\s+/g, ' ').trim();
        if (!text) return;
        applyNoteCaret(noteCaretPos(), !!window.__shNoteCaretPinned);
        var start = noteCaretPos();
        var end = start;
        var v = String(ta.value || '');
        var before = v.slice(0, start);
        var pad = (before && !/\s$/.test(before)) ? ' ' : '';
        ta.value = before + pad + text + v.slice(end);
        var pos = start + pad.length + text.length;
        applyNoteCaret(pos, !!window.__shNoteCaretPinned);
        try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e2) {}
        try {
            if (typeof window.schedulePersistNoteScheda === 'function') window.schedulePersistNoteScheda();
            else if (typeof window.saveData === 'function') window.saveData(true);
        } catch (e3) {}
    }

    function commitNoteInk() {
        var strokes = cloneStrokes(noteInk.strokes);
        noteInk.strokes = [];
        noteInk.current = null;
        redrawNoteInk();
        if (!strokes.length) return;
        nativeRecognizeText(strokes).then(function (text) {
            insertNoteText(text);
            if (!noteInk.current && !noteInk.strokes.length) {
                var host = document.getElementById('sh-spen-note-ink');
                if (host) host.style.display = 'none';
            } else {
                redrawNoteInk();
            }
        });
    }

    function scheduleNoteInkCommit() {
        if (noteInk.timer) try { clearTimeout(noteInk.timer); } catch (e) {}
        noteInk.timer = setTimeout(function () {
            noteInk.timer = null;
            if (window.__shPenIsDown) {
                scheduleNoteInkCommit();
                return;
            }
            commitNoteInk();
        }, window.__SPEN_COMMIT_MS || 500);
    }

    function beginNoteHandwriting(ta) {
        if (!ta) return;
        window.__shLastNotePointer = 'pen';
        window.__shNotePenWrite = true;
        setNoteWriting(true);
        hideBox();
        ta.setAttribute('inputmode', 'text');
        ta.removeAttribute('pattern');
        setNoteHandwriting(true);
        try { ta.focus({ preventScroll: true }); } catch (e) {
            try { ta.focus(); } catch (e2) {}
        }
        if (window.__shNoteCaretPinned) {
            applyNoteCaret(noteCaretPos(), true);
            holdNoteCaret(160);
        }
    }

    function leaveNotesForPlant() {
        setNoteHandwriting(false);
        if (notesFullscreenOn()) return;
        setNoteWriting(false);
    }

    function penLocksChrome() {
        return false;
    }

    function isMgmtChrome(el) {
        return !!(el && el.closest && el.closest('#main-btn-management, .fixed-management-container, #robot-hand-magnet, #robot-hand-magnet-wrap'));
    }

    function persistNoteField() {
        try {
            if (typeof window.schedulePersistNoteScheda === 'function') window.schedulePersistNoteScheda();
            else if (typeof window.saveData === 'function') window.saveData(true);
        } catch (e) {}
    }

    function noteCaretPos() {
        var ta = document.getElementById('inp-sec-note');
        if (window.__shNoteCaretPinned && typeof window.__shNoteCaret === 'number') return window.__shNoteCaret;
        if (ta && typeof ta.selectionStart === 'number') return ta.selectionStart;
        if (typeof window.__shNoteCaret === 'number') return window.__shNoteCaret;
        return ta ? String(ta.value || '').length : 0;
    }

    function keepNoteCaretVisible(ta, pos) {
        if (!ta) return;
        try {
            var cs = window.getComputedStyle(ta);
            var lh = parseFloat(cs.lineHeight);
            if (!(lh > 0)) lh = (parseFloat(cs.fontSize) || 18) * 1.35;
            var lines = String(ta.value || '').slice(0, pos).split('\n').length;
            var y = Math.max(0, (lines - 1) * lh - Math.max(24, ta.clientHeight * 0.35));
            ta.scrollTop = y;
        } catch (e) {}
    }

    function applyNoteCaret(pos, pin) {
        var ta = document.getElementById('inp-sec-note');
        if (!ta || !notesTendinaOpen()) return 0;
        var max = String(ta.value || '').length;
        pos = Math.max(0, Math.min(max, pos | 0));
        window.__shNoteCaret = pos;
        if (pin) window.__shNoteCaretPinned = true;
        try { ta.style.caretColor = '#0284c7'; } catch (eC) {}
        try { ta.focus({ preventScroll: true }); } catch (e) {
            try { ta.focus(); } catch (e3) {}
        }
        try { ta.setSelectionRange(pos, pos); } catch (e2) {}
        keepNoteCaretVisible(ta, pos);
        return pos;
    }

    function holdNoteCaret(ms) {
        var until = Date.now() + (ms || 160);
        var tick = function () {
            var ta = document.getElementById('inp-sec-note');
            if (!ta || !window.__shNoteCaretPinned || typeof window.__shNoteCaret !== 'number') return;
            try { ta.setSelectionRange(window.__shNoteCaret, window.__shNoteCaret); } catch (e) {}
            if (Date.now() < until) setTimeout(tick, 40);
        };
        tick();
    }

    function noteFieldApply(fn) {
        var ta = document.getElementById('inp-sec-note');
        if (!ta || !notesTendinaOpen()) return;
        var start = noteCaretPos();
        if (typeof ta.selectionStart === 'number' && !window.__shNoteCaretPinned) start = ta.selectionStart;
        var end = (typeof ta.selectionEnd === 'number' && !window.__shNoteCaretPinned) ? ta.selectionEnd : start;
        var v = String(ta.value || '');
        start = Math.max(0, Math.min(v.length, start));
        end = Math.max(start, Math.min(v.length, end));
        var next = fn(v, start, end);
        if (!next) return;
        ta.value = next.value;
        applyNoteCaret(next.pos, true);
        holdNoteCaret(240);
        try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e2) {}
        persistNoteField();
        window.__shNotePenWrite = true;
        window.__shLastNotePointer = 'pen';
        setNoteHandwriting(true);
    }

    function lockNoteCmd(ms) {
        window.__shNoteCmdLock = Date.now() + (ms || 700);
    }

    function noteCmdLocked() {
        return Date.now() < (window.__shNoteCmdLock || 0);
    }

    function noteCmdCaretRange() {
        var ta = document.getElementById('inp-sec-note');
        var pos = noteCaretPos();
        var start = pos;
        var end = pos;
        if (ta && !window.__shNoteCaretPinned && typeof ta.selectionStart === 'number' && typeof ta.selectionEnd === 'number') {
            start = ta.selectionStart;
            end = ta.selectionEnd;
        }
        return { start: start, end: end };
    }

    function noteCmdAfterMove() {
        window.__shNotePenWrite = true;
        window.__shLastNotePointer = 'pen';
        setNoteHandwriting(true);
        holdNoteCaret(240);
    }

    function noteCmdMove(delta) {
        var ta = document.getElementById('inp-sec-note');
        if (!ta || !notesTendinaOpen()) return;
        var range = noteCmdCaretRange();
        var pos = (range.end > range.start) ? ((delta < 0) ? range.start : range.end) : (range.start + delta);
        applyNoteCaret(pos, true);
        noteCmdAfterMove();
    }

    function noteCmdMoveLine(dir) {
        var ta = document.getElementById('inp-sec-note');
        if (!ta || !notesTendinaOpen()) return;
        var v = String(ta.value || '');
        var pos = noteCmdCaretRange().start;
        var lineStart = v.lastIndexOf('\n', pos - 1) + 1;
        var col = pos - lineStart;
        var next;
        if (dir < 0) {
            if (lineStart <= 0) next = 0;
            else {
                var prevEnd = lineStart - 1;
                var prevStart = v.lastIndexOf('\n', prevEnd - 1) + 1;
                next = prevStart + Math.min(col, prevEnd - prevStart);
            }
        } else {
            var lineEnd = v.indexOf('\n', pos);
            if (lineEnd < 0) next = v.length;
            else {
                var nextStart = lineEnd + 1;
                var nextEnd = v.indexOf('\n', nextStart);
                if (nextEnd < 0) nextEnd = v.length;
                next = nextStart + Math.min(col, nextEnd - nextStart);
            }
        }
        applyNoteCaret(next, true);
        noteCmdAfterMove();
    }

    function noteCmdSpace() {
        noteFieldApply(function (v, start, end) {
            return { value: v.slice(0, start) + ' ' + v.slice(end), pos: start + 1 };
        });
    }

    function noteCmdDelete() {
        noteFieldApply(function (v, start, end) {
            if (end > start) return { value: v.slice(0, start) + v.slice(end), pos: start };
            if (start <= 0) return { value: v, pos: 0 };
            var lineStart = v.lastIndexOf('\n', start - 1) + 1;
            var lineEnd = v.indexOf('\n', start);
            if (lineEnd < 0) lineEnd = v.length;
            var lineEmpty = !v.slice(lineStart, lineEnd).trim();
            // Rigo vuoto (o solo spazi): togli il capo e vai in fondo al rigo sopra.
            if (lineEmpty && lineStart > 0) {
                return { value: v.slice(0, lineStart - 1) + v.slice(lineEnd), pos: lineStart - 1 };
            }
            // Inizio rigo con testo: unisci al rigo sopra.
            if (start === lineStart && v.charAt(start - 1) === '\n') {
                return { value: v.slice(0, start - 1) + v.slice(end), pos: start - 1 };
            }
            return { value: v.slice(0, start - 1) + v.slice(end), pos: start - 1 };
        });
    }

    function noteCmdNewline() {
        noteFieldApply(function (v, start, end) {
            return { value: v.slice(0, start) + '\n' + v.slice(end), pos: start + 1 };
        });
    }

    function noteCmdBullet() {
        noteFieldApply(function (v, start, end) {
            var lineStart = v.lastIndexOf('\n', start - 1) + 1;
            var beforeOnLine = v.slice(lineStart, start);
            var add = '\u2022 ';
            // Cursore all'inizio riga (anche se la riga ha gia lettere): pallino sulla stessa riga, davanti.
            if (!beforeOnLine.trim()) {
                var rest = v.slice(lineStart);
                var already = rest.match(/^\s*\u2022\s*/);
                if (already) {
                    return { value: v, pos: lineStart + already[0].length };
                }
                return { value: v.slice(0, lineStart) + add + v.slice(end), pos: lineStart + add.length };
            }
            // Cursore dopo la frase: a capo + pallino.
            return { value: v.slice(0, start) + '\n' + add + v.slice(end), pos: start + 1 + add.length };
        });
    }

    var noteCmdLastAt = 0;
    function runNoteCmd(cmd) {
        cmd = String(cmd || '');
        var now = Date.now();
        var gap = (cmd === 'up' || cmd === 'down' || cmd === 'left' || cmd === 'right' || cmd === 'del') ? 70 : 180;
        if (now - noteCmdLastAt < gap) return;
        noteCmdLastAt = now;
        if (cmd === 'up') noteCmdMoveLine(-1);
        else if (cmd === 'down') noteCmdMoveLine(1);
        else if (cmd === 'left') noteCmdMove(-1);
        else if (cmd === 'right') noteCmdMove(1);
        else if (cmd === 'sp') noteCmdSpace();
        else if (cmd === 'del') noteCmdDelete();
        else if (cmd === 'nl') noteCmdNewline();
        else if (cmd === 'dot') noteCmdBullet();
    }
    window.__shRunNoteCmd = runNoteCmd;

    function noteCmdPanelHtml() {
        return ''
            + '<div role="button" tabindex="0" class="sh-note-cmd-btn sh-note-cmd-arrow" data-sh-note-cmd="up" aria-label="Su">▲<span>Su</span></div>'
            + '<div role="button" tabindex="0" class="sh-note-cmd-btn sh-note-cmd-arrow" data-sh-note-cmd="down" aria-label="Giu">▼<span>Giu</span></div>'
            + '<div role="button" tabindex="0" class="sh-note-cmd-btn sh-note-cmd-arrow" data-sh-note-cmd="left" aria-label="Sinistra">◀<span>Sx</span></div>'
            + '<div role="button" tabindex="0" class="sh-note-cmd-btn sh-note-cmd-arrow" data-sh-note-cmd="right" aria-label="Destra">▶<span>Dx</span></div>'
            + '<div role="button" tabindex="0" class="sh-note-cmd-btn" data-sh-note-cmd="sp" aria-label="Spazio">␣<span>Spazio</span></div>'
            + '<div role="button" tabindex="0" class="sh-note-cmd-btn" data-sh-note-cmd="del" aria-label="Cancella">⌫<span>Cancella</span></div>'
            + '<div role="button" tabindex="0" class="sh-note-cmd-btn" data-sh-note-cmd="nl" aria-label="A capo">↵<span>A capo</span></div>'
            + '<div role="button" tabindex="0" class="sh-note-cmd-btn" data-sh-note-cmd="dot" aria-label="Pallino">•<span>Pallino</span></div>';
    }

    function ensureNoteCmdPanel() {
        var tendina = document.getElementById('rapportino-note-tendina');
        var body = document.getElementById('rapportino-note-tendina-body');
        if (!tendina || !body) return null;
        var pan = document.getElementById('sh-note-cmd');
        var ver = '88';
        if (!pan) {
            pan = document.createElement('div');
            pan.id = 'sh-note-cmd';
            pan.setAttribute('aria-label', 'Comandi note');
        }
        if (pan.getAttribute('data-sh-ver') !== ver
            || !pan.querySelector('[data-sh-note-cmd="up"]')
            || !pan.querySelector('[data-sh-note-cmd="down"]')) {
            pan.setAttribute('data-sh-ver', ver);
            pan.innerHTML = noteCmdPanelHtml();
        }
        if (pan.parentElement !== body) {
            if (body.firstChild) body.insertBefore(pan, body.firstChild);
            else body.appendChild(pan);
        }
        if (pan.__shWiredVer !== ver) {
            pan.__shWiredVer = ver;
            pan.__shWired = true;
            var swallow = function (ev) {
                if (ev.cancelable) ev.preventDefault();
                ev.stopPropagation();
                if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
                lockNoteCmd(800);
            };
            var onCmd = function (ev) {
                var btn = ev.target && ev.target.closest ? ev.target.closest('[data-sh-note-cmd]') : null;
                if (!btn || !pan.contains(btn)) {
                    swallow(ev);
                    return;
                }
                swallow(ev);
                var cmd = btn.getAttribute('data-sh-note-cmd');
                runNoteCmd(cmd);
            };
            var fire = { pointerup: 1, touchend: 1, click: 1, mouseup: 1 };
            ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click'].forEach(function (type) {
                pan.addEventListener(type, fire[type] ? onCmd : swallow, true);
            });
        }
        return pan;
    }

    function ensureNoteCss() {
        var st = document.getElementById('sh-spen-note-css');
        if (!st) {
            st = document.createElement('style');
            st.id = 'sh-spen-note-css';
            (document.head || document.documentElement).appendChild(st);
        }
        st.textContent = '#inp-sec-note,#inp-sec-note.note-scheda-textarea{'
            + '-webkit-user-select:text!important;user-select:text!important;'
            + 'caret-color:#0284c7!important;touch-action:auto!important;pointer-events:auto!important;}'
            + 'html.sh-android-tablet-boot #inp-sec-note,html.sh-android-tablet-boot #inp-sec-note:focus,'
            + '#inp-sec-note:focus{caret-color:#0284c7!important;}'
            + '#rapportino-note-tendina-body{display:flex!important;flex-direction:column!important;}'
            + '#rapportino-note-tendina.sh-spen-note-fs-card{'
            + 'position:fixed!important;inset:0!important;width:100%!important;height:100%!important;'
            + 'max-height:none!important;z-index:60000!important;display:flex!important;'
            + 'flex-direction:column!important;background:#f8fafc!important;border-bottom:none!important;}'
            + '.dark #rapportino-note-tendina.sh-spen-note-fs-card{background:#0f172a!important;}'
            + '#rapportino-note-tendina.sh-spen-note-fs-card .cond-tendina-bar{'
            + 'flex:0 0 auto!important;position:relative!important;z-index:100003!important;}'
            + '#rapportino-note-tendina.sh-spen-note-fs-card .cond-tendina-body{'
            + 'flex:1 1 auto!important;max-height:none!important;overflow:hidden!important;'
            + 'padding:12px!important;display:flex!important;flex-direction:column!important;}'
            + '#rapportino-note-tendina.sh-spen-note-fs-card #inp-sec-note{'
            + 'flex:1 1 auto!important;min-height:0!important;height:100%!important;'
            + 'max-height:none!important;font-size:20px!important;width:100%!important;}'
            + 'body.sh-spen-hide-units .main-container input::placeholder,'
            + 'body.sh-spen-hide-units .main-container textarea::placeholder,'
            + 'body.sh-spen-writing .main-container input::placeholder,'
            + 'body.sh-spen-writing .main-container textarea::placeholder'
            + '{color:transparent!important;opacity:0!important;}'
            + '#rapportino-note-tendina:not(.sh-spen-note-fs-card){position:relative!important;}'
            + '#rapportino-note-tendina .cond-tendina-bar{'
            + 'position:relative!important;z-index:100002!important;flex-shrink:0!important;'
            + 'pointer-events:auto!important;}'
            + '#rapportino-note-tendina .cond-tendina-bar::after{'
            + 'content:"";position:absolute;left:50%;top:50%;width:76px;height:6px;'
            + 'margin-left:-38px;margin-top:-3px;border-radius:999px;'
            + 'background:rgba(255,255,255,0.9);box-shadow:0 1px 3px rgba(0,0,0,0.35);'
            + 'pointer-events:none;z-index:3;}'
            + '#sh-note-cmd{display:none;position:relative;right:auto;top:auto;left:auto;transform:none;'
            + 'flex-direction:row;flex-wrap:wrap;justify-content:flex-start;align-items:center;gap:6px;'
            + 'width:100%;max-width:none;margin:0 0 8px;z-index:6;pointer-events:auto;}'
            + '#rapportino-note-tendina:not(.rapportino-note-tendina-collapsed) #sh-note-cmd{display:flex;}'
            + '.sh-note-cmd-btn{display:flex;flex-direction:row;align-items:center;justify-content:center;'
            + 'gap:3px;min-width:48px;height:36px;padding:0 8px;border:0;border-radius:10px;'
            + 'background:#334155;color:#fff;font-size:14px;font-weight:800;line-height:1;'
            + 'box-shadow:none;pointer-events:auto;-webkit-user-select:none;user-select:none;}'
            + '.sh-note-cmd-btn.sh-note-cmd-arrow{min-width:52px;padding:0 8px;font-size:16px;background:#0f766e;}'
            + '.sh-note-cmd-btn span{font-size:9px;font-weight:800;letter-spacing:.02em;text-transform:uppercase;}'
            + '.sh-note-cmd-btn:active{filter:brightness(1.18);}'
            + '.dark .sh-note-cmd-btn{background:#1e293b;}'
            + '.dark .sh-note-cmd-btn.sh-note-cmd-arrow{background:#115e59;}';
    }
    try { ensureNoteCss(); } catch (e) {}
    try { ensureNoteCmdPanel(); } catch (eCmd) {}
    try { setNoteHandwriting(false); } catch (e) {}
    try { ensureOverlayWatch(); } catch (e) {}

    function numericFromEl(el) {
        if (!el) return null;
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return writableOrNull(el);
        if (!el.closest) return null;
        var wrap = el.closest('.amb-input-box, .bd-input-box, .nott-stocc-inp-cell');
        if (!wrap) return null;
        return writableOrNull(wrap.querySelector('input:not([type="hidden"]), textarea'));
    }

    function hoverFrameInput(x, y) {
        var ink = window.__shSpenInk;
        if (!ink || !ink.hoverInput || !ink.hoverInput.isConnected || !ink.hostRect) return null;
        var hr = ink.hostRect;
        if (x < hr.left || x > hr.left + hr.w || y < hr.top || y > hr.top + hr.h) return null;
        return writableOrNull(ink.hoverInput);
    }

    function horizBarNear(x, y) {
        if (noteTextareaFromPoint(x, y)) return null;
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
        var hoverInk = window.__shSpenInk;
        if (hoverInk && hoverInk.active && hoverInk.inputId === 'inp-sec-note') return false;
        if ((notesFullscreenOn() && !(hoverInk && hoverInk.active)) || isForegroundOverlayOpen()) {
            hideBox();
            return false;
        }
        var over = elementFromPen(x, y);
        if (overlayFromEl(over) || isAmbPopupTrigger(over) || isAmbModalEl(over) || vertLabelFromEl(over) || noteTextareaFromEl(over)) {
            hideBox();
            return false;
        }
        var ink = ensureInk();
        var writing = !!(ink.active && ((ink.strokes && ink.strokes.length) || (ink.current && ink.current.length)));
        if (writing) {
            var stay = boundInput(ink);
            if (stay) return layoutBoxOn(stay);
        }
        var bar = horizBarFromEl(over);
        if (bar) {
            hoverHorizBar = bar;
            hideBox();
            return false;
        }
        hoverHorizBar = null;
        if (over && over.closest && over.closest('.tank-status-single, .status-cell-btn, .status-header') && !numericFromEl(over)) {
            hideBox();
            return false;
        }
        var inp = numericFromEl(over) || inputFromSigla(over) || findFieldAt(x, y);
        if (!inp) {
            if (!writing) hideBox();
            return false;
        }
        return layoutBoxOn(inp);
    };

    window.__shSpenPointAt = function (x, y) {
        var over = elementFromPen(x, y);
        var inp = numericFromEl(over) || findFieldAt(x, y);
        if (!inp) return false;
        return retarget(inp);
    };

    window.__shSpenRecognizeStrokes = function (strokeSnap) {
        var ink = window.__shSpenInk;
        if (ink && ink.inputId === 'inp-sec-note') {
            return nativeRecognizeText(strokeSnap || []);
        }
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
        if (prefix.length < 2) return rec;
        var doubled = prefix + prefix;
        if (rec.indexOf(doubled) === 0) rec = rec.slice(prefix.length);
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

    if (typeof window.__shSpenApplyFieldEdit === 'function' && !window.__shSpenApplyFieldEdit.__shV79) {
        var applyPrev79 = window.__shSpenApplyFieldEdit;
        window.__shSpenApplyFieldEdit = function (input, recognized, origin, mode) {
            if (input && input.id === 'inp-sec-note') {
                if (mode === 'clear') {
                    input.value = '';
                    try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
                    return true;
                }
                var rec = String(recognized || '').replace(/\s+/g, ' ').trim();
                if (!rec) return false;
                var inkN = window.__shSpenInk;
                var orig = (inkN && inkN.sessionOrigin != null) ? String(inkN.sessionOrigin) : String(origin || input.value || '');
                var next;
                if (!orig) next = rec;
                else if (orig.indexOf(rec) !== -1) next = orig;
                else next = orig + ((/\s$/).test(orig) ? '' : ' ') + rec;
                input.value = next;
                try { input.setSelectionRange(next.length, next.length); } catch (e2) {}
                try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (e3) {}
                try {
                    if (typeof window.schedulePersistNoteScheda === 'function') window.schedulePersistNoteScheda();
                } catch (e4) {}
                if (inkN) {
                    inkN.sessionOrigin = next;
                    inkN.originValue = next;
                    inkN.imeText = next;
                }
                return true;
            }
            return applyPrev79.apply(this, arguments);
        };
        window.__shSpenApplyFieldEdit.__shV79 = true;
    }
    // Il campo viene svuotato subito dopo la scrittura: registra chi lo fa e riscrive il valore.
    function watchWipe(input, rec) {
        if (!input || input.__shWipeWatch) return;
        try {
            var proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
            if (!proto || !proto.get || !proto.set) return;
            input.__shWipeWatch = true;
            Object.defineProperty(input, 'value', {
                configurable: true,
                get: function () { return proto.get.call(this); },
                set: function (v) {
                    if ((v === '' || v == null) && onlyNumber(proto.get.call(this))) {
                        var st = '';
                        try { st = String(new Error().stack || '').split('\n').slice(1, 5).join(' | '); } catch (e) {}
                        console.log('[SH PEN] WIPE ' + (input.id || '?') + ' <- ' + st);
                    }
                    proto.set.call(this, v);
                }
            });
        } catch (e) {}
    }

    function reassertValue(input, rec) {
        if (!input || !rec) return;
        var again = function () {
            if (onlyNumber(input.value) === rec) return;
            console.log('[SH PEN] riscrivo ' + (input.id || '?') + ' = ' + rec);
            input.value = rec;
        };
        setTimeout(again, 0);
        setTimeout(again, 90);
        setTimeout(again, 300);
        setTimeout(function () {
            again();
            if (onlyNumber(input.value) === rec) {
                try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
            }
        }, 700);
    }

    if (typeof window.__shSpenApplyFieldEdit === 'function' && !window.__shSpenApplyFieldEdit.__shV50) {
        var applyOrig = window.__shSpenApplyFieldEdit;
        window.__shSpenApplyFieldEdit = function (input, recognized, origin, mode) {
            var ink = window.__shSpenInk;
            if (mode === 'clear') {
                var cleared = applyOrig(input, '', origin, 'clear');
                clearInkPixels(ink);
                if (ink) ink.imeText = '';
                return cleared;
            }
            var dbgId = (input && input.id) || '?';
            if (ink && ink.holdClear) { console.log('[SH PEN] skip holdClear ' + dbgId); return true; }
            var rec = onlyNumber(recognized);
            if (!rec) { console.log('[SH PEN] skip norec ' + dbgId + ' in=' + recognized); return false; }
            if (!canCommitTo(input)) { console.log('[SH PEN] skip nopending ' + dbgId + ' rec=' + rec); return true; }
            if (window.__shPenIsDown) { console.log('[SH PEN] skip pendown ' + dbgId + ' rec=' + rec); return true; }
            var live = input ? onlyNumber(input.value) : '';
            var from = onlyNumber(ink && ink.sessionOrigin != null ? ink.sessionOrigin : origin);
            var scamId = input && input.id;
            var isScamParam = scamId === 'ph' || scamId === 'cloro' || scamId === 'reintegro';
            rec = stripDoubledPrefix(from, rec);
            rec = stripDoubledPrefix(live, rec);
            rec = stripDoubledPrefix(onlyNumber(origin), rec);
            if (isScamParam && rec.length === 2 && rec.charAt(0) === rec.charAt(1) && (!from || from === rec.charAt(0))) {
                rec = rec.charAt(0);
            }
            var useMode = mode || 'replace';
            if (isScamParam || (ink && ink.sessionStartedEmpty)) useMode = 'replace';
            else if (ink && ink.strokes && ink.strokes.length && typeof window.__shSpenEditModeFromStrokes === 'function') {
                try {
                    useMode = window.__shSpenEditModeFromStrokes(ink.strokes, input, from, ink.hostRect) || useMode;
                } catch (e) {}
            }
            rec = mergeByPosition(from, rec, useMode);
            rec = stripDoubledPrefix(from, rec);
            rec = stripDoubledPrefix(live, rec);
            if (!rec) return false;
            if (ink) {
                ink.showResult = true;
                ink.writeLocked = true;
                ink.sessionOrigin = rec;
                ink.originValue = rec;
                ink.imePending = '';
                ink.imeText = rec;
            }
            watchWipe(input, rec);
            var ok = (input && onlyNumber(input.value) === rec) ? true : applyOrig(input, rec, from, 'replace');
            console.log('[SH PEN] apply ' + dbgId + ' rec=' + rec + ' ok=' + ok + ' val=' + (input ? input.value : '-'));
            reassertValue(input, rec);
            consumePendingCommit(input);
            clearInkPixels(ink);
            hideBox();
            return ok;
        };
        window.__shSpenApplyFieldEdit.__shV50 = true;
    }

    if (typeof window.__shSpenFindWritableInput === 'function' && !window.__shSpenFindWritableInput.__shV48) {
        var findElOrig = window.__shSpenFindWritableInput;
        window.__shSpenFindWritableInput = function (el) {
            var direct = numericFromEl(el);
            if (direct) return direct;
            if (el && el.closest && el.closest('.tank-status-single, .status-cell-btn')) return null;
            var paired = inputFromSigla(el);
            if (paired) return paired;
            return findElOrig.apply(this, arguments);
        };
        window.__shSpenFindWritableInput.__shV48 = true;
    }

    if (typeof window.__shSpenFindWritableInputAt === 'function' && !window.__shSpenFindWritableInputAt.__shV48) {
        var findAtOrig = window.__shSpenFindWritableInputAt;
        window.__shSpenFindWritableInputAt = function (x, y) {
            var framed = hoverFrameInput(x, y);
            if (framed) return framed;
            var over = elementFromPen(x, y);
            var direct = numericFromEl(over);
            if (direct) return direct;
            if (over && over.closest && over.closest('.tank-status-single, .status-cell-btn')) return null;
            var paired = inputFromSigla(over);
            if (paired) return paired;
            return findAtOrig.apply(this, arguments);
        };
        window.__shSpenFindWritableInputAt.__shV48 = true;
    }

    if (typeof window.__shSpenFindWritableInput === 'function' && !window.__shSpenFindWritableInput.__shV61) {
        var findElPrev61 = window.__shSpenFindWritableInput;
        window.__shSpenFindWritableInput = function (el) {
            if (isForegroundOverlayOpen() && !overlayFromEl(el)) return null;
            return findElPrev61.apply(this, arguments);
        };
        window.__shSpenFindWritableInput.__shV61 = true;
    }

    if (typeof window.__shSpenFindWritableInputAt === 'function' && !window.__shSpenFindWritableInputAt.__shV61) {
        var findAtPrev61 = window.__shSpenFindWritableInputAt;
        window.__shSpenFindWritableInputAt = function (x, y) {
            if (isForegroundOverlayOpen()) return null;
            var overAt = elementFromPen(x, y);
            if (overlayFromEl(overAt)) return null;
            return findAtPrev61.apply(this, arguments);
        };
        window.__shSpenFindWritableInputAt.__shV61 = true;
    }

    if (typeof window.__shSpenOnPenDown === 'function' && !window.__shSpenOnPenDown.__shV58) {
        var downOrig = window.__shSpenOnPenDown;
        window.__shSpenOnPenDown = function (ev) {
            leaveNotesForPlant();
            pinScrollHere();
            var el = ev ? elementFromPen(ev.clientX, ev.clientY) : null;
            if (!el && ev && ev.target) el = ev.target;
            clearPenChrome();
            var noteTa = noteTextareaFromEl(el) || (ev ? noteTextareaFromPoint(ev.clientX, ev.clientY) : null);
            if (noteTa) {
                hideBox();
                penUiTap = null;
                hoverHorizBar = null;
                beginNoteHandwriting(noteTa);
                return;
            }
            if (isAmbPopupTrigger(el) || isAmbModalEl(el)) {
                hideBox();
                penUiTap = {
                    x: ev.clientX,
                    y: ev.clientY,
                    el: el,
                    popup: isAmbPopupTrigger(el),
                    modal: isAmbModalEl(el),
                    t: Date.now()
                };
                return;
            }
            var btn = (ev ? plantButtonFromPoint(ev.clientX, ev.clientY) : null) || plantButtonFromEl(el);
            if (btn) {
                hideBox();
                penUiTap = {
                    x: ev.clientX,
                    y: ev.clientY,
                    el: btn,
                    popup: false,
                    modal: true,
                    t: Date.now()
                };
                return;
            }
            var framed = ev ? hoverFrameInput(ev.clientX, ev.clientY) : null;
            if (framed && !plantButtonFromEl(el)) {
                penUiTap = null;
                unlockIfNewSession(framed);
                return downOrig.apply(this, arguments);
            }
            var vert = vertLabelFromEl(el);
            if (vert) {
                hideBox();
                penUiTap = null;
                penChrome = { kind: 'vert', x: ev.clientX, y: ev.clientY, lastY: ev.clientY, moved: false, el: vert };
                return;
            }
            var bar = horizBarFromEl(el);
            if (bar) {
                hideBox();
                penUiTap = null;
                penChrome = {
                    kind: 'horiz',
                    x: ev.clientX,
                    y: ev.clientY,
                    el: bar,
                    moved: false
                };
                return;
            }
            var fromLab = inputFromSigla(el);
            if (fromLab) {
                penUiTap = null;
                unlockIfNewSession(fromLab);
                return downOrig.apply(this, arguments);
            }
            penUiTap = null;
            var inp = ev
                ? (numericFromEl(el) || findFieldAt(ev.clientX, ev.clientY) || hoverFrameInput(ev.clientX, ev.clientY))
                : numericFromEl(el);
            if (inp) unlockIfNewSession(inp);
            return downOrig.apply(this, arguments);
        };
        window.__shSpenOnPenDown.__shV58 = true;
    }

    if (typeof window.__shSpenOnPenDown === 'function' && !window.__shSpenOnPenDown.__shV61) {
        var downPrev61 = window.__shSpenOnPenDown;
        window.__shSpenOnPenDown = function (ev) {
            var hit = ev ? elementFromPen(ev.clientX, ev.clientY) : null;
            if (!hit && ev && ev.target) hit = ev.target;
            if (isForegroundOverlayOpen() || overlayFromEl(hit)) {
                hideBox();
                try { leaveNotesForPlant(); } catch (e) {}
                penUiTap = {
                    x: ev ? ev.clientX : 0,
                    y: ev ? ev.clientY : 0,
                    el: hit,
                    popup: false,
                    modal: true,
                    t: Date.now()
                };
                return;
            }
            return downPrev61.apply(this, arguments);
        };
        window.__shSpenOnPenDown.__shV61 = true;
    }

    if (typeof window.__shSpenOnPenDown === 'function' && !window.__shSpenOnPenDown.__shV62) {
        var downPrev62 = window.__shSpenOnPenDown;
        window.__shSpenOnPenDown = function (ev) {
            var hit = ev ? elementFromPen(ev.clientX, ev.clientY) : null;
            if (!hit && ev && ev.target) hit = ev.target;
            if (!isForegroundOverlayOpen() && !overlayFromEl(hit) && !noteTextareaFromEl(hit)) {
                var bar = horizBarFromEl(hit);
                if (bar) {
                    hideBox();
                    try { leaveNotesForPlant(); } catch (e) {}
                    penUiTap = null;
                    clearPenChrome();
                    penChrome = {
                        kind: 'horiz',
                        x: ev.clientX,
                        y: ev.clientY,
                        el: bar,
                        moved: false
                    };
                    return;
                }
            }
            return downPrev62.apply(this, arguments);
        };
        window.__shSpenOnPenDown.__shV62 = true;
    }

    if (typeof window.__shSpenOnPenMove === 'function' && !window.__shSpenOnPenMove.__shV58) {
        var moveOrig = window.__shSpenOnPenMove;
        window.__shSpenOnPenMove = function (ev) {
            if (ev && noteTextareaFromPoint(ev.clientX, ev.clientY)) return;
            if (penChrome && ev) {
                var dx = (ev.clientX || 0) - penChrome.x;
                var dy = (ev.clientY || 0) - penChrome.y;
                if ((dx * dx + dy * dy) > 2500) penChrome.moved = true;
                if (penChrome.kind === 'vert') {
                    scrollMainBy(penChrome.lastY - ev.clientY);
                    penChrome.lastY = ev.clientY;
                    return;
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
        window.__shSpenOnPenMove.__shV58 = true;
    }

    if (typeof window.__shSpenOnPenUp === 'function' && !window.__shSpenOnPenUp.__shV58) {
        var upOrig = window.__shSpenOnPenUp;
        window.__shSpenOnPenUp = function (ev, cancelled) {
            if (penChrome) {
                var ch = penChrome;
                clearPenChrome();
                if (ch.kind === 'horiz' && !ch.moved) {
                    if (!openHorizBar(ch.el)) clickPenTarget(ch.el);
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
            if (ev && noteTextareaFromPoint(ev.clientX, ev.clientY)) return;
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
        window.__shSpenOnPenUp.__shV58 = true;
    }

    if (typeof window.__shSpenOnPenUp === 'function' && !window.__shSpenOnPenUp.__shV62) {
        var upPrev62 = window.__shSpenOnPenUp;
        window.__shSpenOnPenUp = function (ev, cancelled) {
            if (penChrome && penChrome.kind === 'horiz') {
                var barCh = penChrome;
                clearPenChrome();
                if (!cancelled && !barCh.moved) {
                    if (!openHorizBar(barCh.el)) clickPenTarget(barCh.el);
                }
                return;
            }
            return upPrev62.apply(this, arguments);
        };
        window.__shSpenOnPenUp.__shV62 = true;
    }

    if (typeof window.__shSpenOnPenDown === 'function' && !window.__shSpenOnPenDown.__shV66) {
        var downPrev66 = window.__shSpenOnPenDown;
        window.__shSpenOnPenDown = function (ev) {
            var hit = ev ? elementFromPen(ev.clientX, ev.clientY) : null;
            if (!hit && ev && ev.target) hit = ev.target;
            var btn = (ev ? plantButtonFromPoint(ev.clientX, ev.clientY) : null) || plantButtonFromEl(hit);
            if (btn && !notesFullscreenOn() && !isForegroundOverlayOpen()) {
                hideBox();
                try { leaveNotesForPlant(); } catch (e) {}
                penUiTap = {
                    x: ev ? ev.clientX : 0,
                    y: ev ? ev.clientY : 0,
                    el: btn,
                    popup: false,
                    modal: true,
                    t: Date.now()
                };
                return;
            }
            return downPrev66.apply(this, arguments);
        };
        window.__shSpenOnPenDown.__shV66 = true;
    }

    if (typeof window.__shSpenOnPenUp === 'function' && !window.__shSpenOnPenUp.__shV66) {
        var upPrev66 = window.__shSpenOnPenUp;
        window.__shSpenOnPenUp = function (ev, cancelled) {
            if (penChrome && penChrome.kind === 'vert') {
                var vertCh = penChrome;
                clearPenChrome();
                if (!cancelled && !vertCh.moved) activateVertLabel(vertCh.el);
                return;
            }
            return upPrev66.apply(this, arguments);
        };
        window.__shSpenOnPenUp.__shV66 = true;
    }

    if (typeof window.__shSpenOnPenUp === 'function' && !window.__shSpenOnPenUp.__shV68) {
        var upPrev68 = window.__shSpenOnPenUp;
        window.__shSpenOnPenUp = function (ev, cancelled) {
            if (penUiTap && penUiTap.el && plantButtonFromEl(penUiTap.el)) {
                var btnTap = penUiTap;
                var bdx = ev ? (ev.clientX || 0) - btnTap.x : 0;
                var bdy = ev ? (ev.clientY || 0) - btnTap.y : 0;
                var btnEl = (ev && plantButtonFromPoint(ev.clientX, ev.clientY)) || plantButtonFromEl(btnTap.el);
                penUiTap = null;
                if (!cancelled && btnEl && (bdx * bdx + bdy * bdy) < 3600) clickPenTarget(btnEl);
                return;
            }
            return upPrev68.apply(this, arguments);
        };
        window.__shSpenOnPenUp.__shV68 = true;
    }

    if (typeof window.__shSpenOnPenDown === 'function' && !window.__shSpenOnPenDown.__shV73) {
        var downPrev73 = window.__shSpenOnPenDown;
        window.__shSpenOnPenDown = function (ev) {
            var hitBar = ev ? noteBarHit(ev.clientX, ev.clientY) : null;
            if (hitBar) {
                lockNoteBarPen(700);
                setNoteHandwriting(false);
                hideBox();
                blurNoteField();
                penUiTap = null;
                clearPenChrome();
                penChrome = {
                    kind: 'noteBar',
                    x: ev.clientX,
                    y: ev.clientY,
                    zone: hitBar.zone,
                    t: Date.now(),
                    moved: false
                };
                return;
            }
            if (ev && notesTendinaOpen() && noteTextareaFromPoint(ev.clientX, ev.clientY)) {
                hideBox();
                penUiTap = null;
                clearPenChrome();
                beginNoteHandwriting(document.getElementById('inp-sec-note'));
                return;
            }
            return downPrev73.apply(this, arguments);
        };
        window.__shSpenOnPenDown.__shV73 = true;
    }

    if (typeof window.__shSpenOnPenUp === 'function' && !window.__shSpenOnPenUp.__shV73) {
        var upPrev73 = window.__shSpenOnPenUp;
        window.__shSpenOnPenUp = function (ev, cancelled) {
            if (penChrome && penChrome.kind === 'noteBar') {
                var noteCh = penChrome;
                var zone = noteCh.zone;
                var held = noteCh.t ? (Date.now() - noteCh.t) : 0;
                if (ev && !noteCh.moved) {
                    var again = noteBarHit(ev.clientX, ev.clientY);
                    if (again && !notesTendinaOpen()) zone = again.zone;
                    else if (again) zone = noteCh.zone;
                }
                clearPenChrome();
                setNoteHandwriting(false);
                if (!cancelled && !noteCh.moved) {
                    if (notesTendinaOpen() && held > 900) return;
                    handleNoteBarTap(zone);
                }
                return;
            }
            if (ev && notesTendinaOpen() && noteTextareaFromPoint(ev.clientX, ev.clientY)) {
                setNoteHandwriting(false);
                clearPenChrome();
                return;
            }
            return upPrev73.apply(this, arguments);
        };
        window.__shSpenOnPenUp.__shV73 = true;
    }

    if (typeof window.__shSpenOnPenMove === 'function' && !window.__shSpenOnPenMove.__shV74) {
        var movePrev74 = window.__shSpenOnPenMove;
        window.__shSpenOnPenMove = function (ev) {
            if (penChrome && penChrome.kind === 'noteBar' && ev) {
                var ndx = (ev.clientX || 0) - penChrome.x;
                var ndy = (ev.clientY || 0) - penChrome.y;
                if ((ndx * ndx + ndy * ndy) > 8100) penChrome.moved = true;
                return;
            }
            return movePrev74.apply(this, arguments);
        };
        window.__shSpenOnPenMove.__shV74 = true;
    }

    if (typeof window.__shSpenOnPenUp === 'function' && !window.__shSpenOnPenUp.__shV77) {
        var upPrev77 = window.__shSpenOnPenUp;
        window.__shSpenOnPenUp = function (ev, cancelled) {
            if (ev && notesTendinaOpen() && noteTextareaFromPoint(ev.clientX, ev.clientY)) {
                window.__shNotePenWrite = true;
                window.__shLastNotePointer = 'pen';
                if (notesFullscreenOn()) {
                    setNoteHandwriting(true);
                    setNoteSoftInput(false);
                    clearPenChrome();
                    return;
                }
            }
            return upPrev77.apply(this, arguments);
        };
        window.__shSpenOnPenUp.__shV77 = true;
    }

    if (typeof window.__shSpenOnPenDown === 'function' && !window.__shSpenOnPenDown.__shV78) {
        var downPrev78 = window.__shSpenOnPenDown;
        window.__shSpenOnPenDown = function (ev) {
            if (ev && notesTendinaOpen() && noteTextareaFromPoint(ev.clientX, ev.clientY) && !noteBarHit(ev.clientX, ev.clientY)) {
                hideBox();
                penUiTap = null;
                clearPenChrome();
                beginNoteHandwriting(document.getElementById('inp-sec-note'));
                if (noteInk.timer) {
                    try { clearTimeout(noteInk.timer); } catch (e) {}
                    noteInk.timer = null;
                }
                noteInk.current = [{ x: ev.clientX, y: ev.clientY, t: Date.now() }];
                layoutNoteInk();
                redrawNoteInk();
                return;
            }
            return downPrev78.apply(this, arguments);
        };
        window.__shSpenOnPenDown.__shV78 = true;
    }

    if (typeof window.__shSpenOnPenMove === 'function' && !window.__shSpenOnPenMove.__shV78) {
        var movePrev78 = window.__shSpenOnPenMove;
        window.__shSpenOnPenMove = function (ev) {
            if (noteInk.current && ev) {
                noteInk.current.push({ x: ev.clientX, y: ev.clientY, t: Date.now() });
                redrawNoteInk();
                return;
            }
            return movePrev78.apply(this, arguments);
        };
        window.__shSpenOnPenMove.__shV78 = true;
    }

    if (typeof window.__shSpenOnPenUp === 'function' && !window.__shSpenOnPenUp.__shV78) {
        var upPrev78 = window.__shSpenOnPenUp;
        window.__shSpenOnPenUp = function (ev, cancelled) {
            if (noteInk.current) {
                if (ev && !cancelled) {
                    noteInk.current.push({ x: ev.clientX, y: ev.clientY, t: Date.now() });
                }
                if (noteInk.current.length) noteInk.strokes.push(noteInk.current);
                noteInk.current = null;
                redrawNoteInk();
                if (!cancelled) scheduleNoteInkCommit();
                return;
            }
            return upPrev78.apply(this, arguments);
        };
        window.__shSpenOnPenUp.__shV78 = true;
    }

    if (typeof window.__shSpenIsWritableInput === 'function' && !window.__shSpenIsWritableInput.__shV79) {
        var writablePrev79 = window.__shSpenIsWritableInput;
        window.__shSpenIsWritableInput = function (inp) {
            if (inp && inp.id === 'inp-sec-note' && notesTendinaOpen()) return true;
            return writablePrev79.apply(this, arguments);
        };
        window.__shSpenIsWritableInput.__shV79 = true;
    }

    if (typeof window.__shSpenFindWritableInput === 'function' && !window.__shSpenFindWritableInput.__shV79) {
        var findElPrev79 = window.__shSpenFindWritableInput;
        window.__shSpenFindWritableInput = function (el) {
            if (el && notesTendinaOpen() && (el.id === 'inp-sec-note' || (el.closest && el.closest('#inp-sec-note, #rapportino-note-tendina-body')))) {
                var ta = document.getElementById('inp-sec-note');
                if (ta) return ta;
            }
            return findElPrev79.apply(this, arguments);
        };
        window.__shSpenFindWritableInput.__shV79 = true;
    }

    if (typeof window.__shSpenFindWritableInputAt === 'function' && !window.__shSpenFindWritableInputAt.__shV79) {
        var findAtPrev79 = window.__shSpenFindWritableInputAt;
        window.__shSpenFindWritableInputAt = function (x, y) {
            var ta = document.getElementById('inp-sec-note');
            if (ta && notesTendinaOpen()) {
                var r = ta.getBoundingClientRect();
                if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return ta;
            }
            return findAtPrev79.apply(this, arguments);
        };
        window.__shSpenFindWritableInputAt.__shV79 = true;
    }

    if (typeof window.__shSpenOnPenDown === 'function' && !window.__shSpenOnPenDown.__shV79) {
        var downPrev79 = window.__shSpenOnPenDown;
        window.__shSpenOnPenDown = function (ev) {
            var onNote = ev && notesTendinaOpen() && document.getElementById('inp-sec-note');
            if (onNote && ev && !noteBarHit(ev.clientX, ev.clientY)) {
                var r = document.getElementById('inp-sec-note').getBoundingClientRect();
                if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
                    window.__shNoteInkPass = true;
                    window.__shNotePenWrite = true;
                    window.__shLastNotePointer = 'pen';
                    noteInk.current = null;
                    try {
                        return downPrev79.apply(this, arguments);
                    } finally {
                        window.__shNoteInkPass = false;
                    }
                }
            }
            return downPrev79.apply(this, arguments);
        };
        window.__shSpenOnPenDown.__shV79 = true;
    }

    if (typeof window.__shSpenOnPenMove === 'function' && !window.__shSpenOnPenMove.__shV79) {
        var movePrev79 = window.__shSpenOnPenMove;
        window.__shSpenOnPenMove = function (ev) {
            var inkM = window.__shSpenInk;
            if (inkM && inkM.active && inkM.inputId === 'inp-sec-note') {
                window.__shNoteInkPass = true;
                try { return movePrev79.apply(this, arguments); }
                finally { window.__shNoteInkPass = false; }
            }
            return movePrev79.apply(this, arguments);
        };
        window.__shSpenOnPenMove.__shV79 = true;
    }

    if (typeof window.__shSpenOnPenUp === 'function' && !window.__shSpenOnPenUp.__shV79) {
        var upPrev79 = window.__shSpenOnPenUp;
        window.__shSpenOnPenUp = function (ev, cancelled) {
            var inkU = window.__shSpenInk;
            if (inkU && inkU.active && inkU.inputId === 'inp-sec-note') {
                window.__shNoteInkPass = true;
                try { return upPrev79.apply(this, arguments); }
                finally { window.__shNoteInkPass = false; }
            }
            return upPrev79.apply(this, arguments);
        };
        window.__shSpenOnPenUp.__shV79 = true;
    }

    if (typeof window.__shSpenIsWritableInput === 'function' && !window.__shSpenIsWritableInput.__shV80) {
        var writablePrev80 = window.__shSpenIsWritableInput;
        window.__shSpenIsWritableInput = function (inp) {
            if (inp && (inp.id === 'inp-sec-note' || (inp.closest && inp.closest('#rapportino-note-tendina')))) return false;
            return writablePrev80.apply(this, arguments);
        };
        window.__shSpenIsWritableInput.__shV80 = true;
    }

    if (typeof window.__shSpenFindWritableInput === 'function' && !window.__shSpenFindWritableInput.__shV80) {
        var findElPrev80 = window.__shSpenFindWritableInput;
        window.__shSpenFindWritableInput = function (el) {
            if (el && (el.id === 'inp-sec-note' || (el.closest && el.closest('#rapportino-note-tendina')))) return null;
            return findElPrev80.apply(this, arguments);
        };
        window.__shSpenFindWritableInput.__shV80 = true;
    }

    if (typeof window.__shSpenFindWritableInputAt === 'function' && !window.__shSpenFindWritableInputAt.__shV80) {
        var findAtPrev80 = window.__shSpenFindWritableInputAt;
        window.__shSpenFindWritableInputAt = function (x, y) {
            var ta = document.getElementById('inp-sec-note');
            if (ta && notesTendinaOpen()) {
                var nr = ta.getBoundingClientRect();
                if (x >= nr.left && x <= nr.right && y >= nr.top && y <= nr.bottom) return null;
            }
            return findAtPrev80.apply(this, arguments);
        };
        window.__shSpenFindWritableInputAt.__shV80 = true;
    }

    function noteCmdHit(x, y) {
        var pan = document.getElementById('sh-note-cmd');
        if (!pan || !notesTendinaOpen()) return null;
        var r = pan.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return null;
        var pad = 16;
        if (x < r.left - pad || x > r.right + pad || y < r.top - pad || y > r.bottom + pad) return null;
        return pan;
    }

    function noteCmdBtnAt(x, y) {
        var pan = noteCmdHit(x, y);
        if (!pan) return '';
        var btns = pan.querySelectorAll('[data-sh-note-cmd]');
        var i;
        var best = '';
        var bestD = 1e9;
        for (i = 0; i < btns.length; i++) {
            var b = btns[i];
            var r = b.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) continue;
            var pad = 12;
            if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) {
                return b.getAttribute('data-sh-note-cmd') || '';
            }
            var cx = (r.left + r.right) / 2;
            var cy = (r.top + r.bottom) / 2;
            var d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
            if (d < bestD) {
                bestD = d;
                best = b.getAttribute('data-sh-note-cmd') || '';
            }
        }
        return best;
    }

    function penOnNoteField(ev) {
        if (!ev || !notesTendinaOpen()) return false;
        if (noteBarHit(ev.clientX, ev.clientY) || noteCmdHit(ev.clientX, ev.clientY)) return false;
        var ta = document.getElementById('inp-sec-note');
        if (!ta) return false;
        var r = ta.getBoundingClientRect();
        return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
    }

    if (typeof window.__shSpenOnPenDown === 'function' && !window.__shSpenOnPenDown.__shV80) {
        var downPrev80 = window.__shSpenOnPenDown;
        window.__shSpenOnPenDown = function (ev) {
            if (ev && noteCmdHit(ev.clientX, ev.clientY)) {
                hideBox();
                lockNoteCmd(800);
                return;
            }
            if (penOnNoteField(ev)) {
                if (window.__shNoteCaretPinned && ev.cancelable) ev.preventDefault();
                hideBox();
                noteInk.current = null;
                noteInk.strokes = [];
                var ink = window.__shSpenInk;
                if (ink && ink.inputId === 'inp-sec-note') {
                    ink.active = false;
                    ink.current = null;
                    ink.strokes = [];
                    ink.input = null;
                    ink.inputId = '';
                }
                beginNoteHandwriting(document.getElementById('inp-sec-note'));
                return;
            }
            return downPrev80.apply(this, arguments);
        };
        window.__shSpenOnPenDown.__shV80 = true;
    }

    if (typeof window.__shSpenOnPenMove === 'function' && !window.__shSpenOnPenMove.__shV80) {
        var movePrev80 = window.__shSpenOnPenMove;
        window.__shSpenOnPenMove = function (ev) {
            if (penChrome && penChrome.kind === 'noteBar') return movePrev80.apply(this, arguments);
            if (window.__shNotePenWrite || penOnNoteField(ev) || noteInk.current) {
                noteInk.current = null;
                return;
            }
            return movePrev80.apply(this, arguments);
        };
        window.__shSpenOnPenMove.__shV80 = true;
    }

    if (typeof window.__shSpenOnPenUp === 'function' && !window.__shSpenOnPenUp.__shV80) {
        var upPrev80 = window.__shSpenOnPenUp;
        window.__shSpenOnPenUp = function (ev, cancelled) {
            // Dopo la scrittura __shNotePenWrite resta attivo: senza questa uscita il tocco
            // sulla barra non arriverebbe mai al toggle della scheda.
            if (penChrome && penChrome.kind === 'noteBar') return upPrev80.apply(this, arguments);
            if (window.__shNotePenWrite || penOnNoteField(ev) || noteInk.current) {
                noteInk.current = null;
                noteInk.strokes = [];
                setNoteHandwriting(true);
                return;
            }
            return upPrev80.apply(this, arguments);
        };
        window.__shSpenOnPenUp.__shV80 = true;
    }

    if (typeof window.__shSpenOnPenDown === 'function' && !window.__shSpenOnPenDown.__shV87) {
        var downPrev86 = window.__shSpenOnPenDown;
        window.__shSpenOnPenDown = function (ev) {
            if (ev && notesTendinaOpen()) {
                var cmdDown = noteCmdBtnAt(ev.clientX, ev.clientY);
                if (cmdDown) {
                    hideBox();
                    lockNoteCmd(800);
                    window.__shNoteCmdPending = cmdDown;
                    return;
                }
            }
            return downPrev86.apply(this, arguments);
        };
        window.__shSpenOnPenDown.__shV87 = true;
    }

    if (typeof window.__shSpenOnPenUp === 'function' && !window.__shSpenOnPenUp.__shV87) {
        var upPrev86 = window.__shSpenOnPenUp;
        window.__shSpenOnPenUp = function (ev, cancelled) {
            var pending = window.__shNoteCmdPending || '';
            window.__shNoteCmdPending = '';
            if (pending) {
                var cmdUp = '';
                if (!cancelled) {
                    cmdUp = (ev ? noteCmdBtnAt(ev.clientX, ev.clientY) : '') || pending;
                }
                if (cmdUp) runNoteCmd(cmdUp);
                return;
            }
            if (ev && !cancelled && notesTendinaOpen()) {
                var hitCmd = noteCmdBtnAt(ev.clientX, ev.clientY);
                if (hitCmd) {
                    runNoteCmd(hitCmd);
                    return;
                }
            }
            return upPrev86.apply(this, arguments);
        };
        window.__shSpenOnPenUp.__shV87 = true;
    }

    if (!window.__shNoteCaretWired85) {
        window.__shNoteCaretWired85 = true;
        var pinNoteFieldEvt = function (ev) {
            if (!ev || !ev.target || ev.target.id !== 'inp-sec-note') return;
            if (ev.pointerType === 'touch') {
                window.__shNoteCaretPinned = false;
                if (typeof ev.target.selectionStart === 'number') window.__shNoteCaret = ev.target.selectionStart;
                return;
            }
            if (!window.__shNoteCaretPinned) return;
            if (ev.cancelable) ev.preventDefault();
            applyNoteCaret(noteCaretPos(), true);
        };
        document.addEventListener('pointerdown', pinNoteFieldEvt, true);
        document.addEventListener('mousedown', pinNoteFieldEvt, true);
        document.addEventListener('click', pinNoteFieldEvt, true);
        document.addEventListener('input', function (ev) {
            if (!ev || !ev.target || ev.target.id !== 'inp-sec-note') return;
            if (window.__shNoteCaretPinned) {
                applyNoteCaret(noteCaretPos(), true);
                return;
            }
            if (typeof ev.target.selectionStart === 'number') window.__shNoteCaret = ev.target.selectionStart;
        }, true);
    }
    if (!window.__shNoteHwKeep80) {
        window.__shNoteHwKeep80 = true;
        document.addEventListener('focusout', function (e) {
            if (!e || !e.target || e.target.id !== 'inp-sec-note') return;
            if (!notesTendinaOpen() || !window.__shNotePenWrite) return;
            setNoteHandwriting(true);
            setTimeout(function () {
                var ta = document.getElementById('inp-sec-note');
                if (!ta || !notesTendinaOpen() || !window.__shNotePenWrite) return;
                if (document.activeElement !== ta) {
                    try { ta.focus({ preventScroll: true }); } catch (err) {}
                }
                if (window.__shNoteCaretPinned) applyNoteCaret(noteCaretPos(), true);
                setNoteHandwriting(true);
            }, 40);
        }, true);
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
            if (window.__shSpenOcrApply) return;
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
            if (window.__shSpenOcrApply) return;
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
    if (!window.__shSpenNoteHwWired53) {
        window.__shSpenNoteHwWired53 = true;
        document.addEventListener('focusin', function (e) {
            var t = e && e.target;
            if (t && t.id !== 'inp-sec-note') leaveNotesForPlant();
        }, true);
        document.addEventListener('focusout', function (e) {
            var t = e && e.target;
            if (!t || t.id !== 'inp-sec-note') return;
            leaveNotesForPlant();
        }, true);
        var blockMgmt = function (ev) {
            if (!ev || ev.pointerType === 'pen') return;
            if (!penLocksChrome()) return;
            if (!isMgmtChrome(ev.target)) return;
            if (ev.cancelable) ev.preventDefault();
            ev.stopPropagation();
        };
        document.addEventListener('pointerdown', blockMgmt, true);
        document.addEventListener('touchstart', blockMgmt, true);
        document.addEventListener('click', blockMgmt, true);
        try { ensureNoteCss(); } catch (e2) {}
    }
    if (!window.__shNoteBarCloseWired73) {
        window.__shNoteBarCloseWired73 = true;
        document.addEventListener('pointerup', function (ev) {
            if (!ev || ev.pointerType !== 'pen') return;
            if (noteBarPenLocked()) return;
            if (!notesTendinaOpen()) return;
            if (penChrome && penChrome.kind === 'noteBar') return;
            if (noteCmdHit(ev.clientX, ev.clientY) || noteCmdLocked()) return;
            if (!noteBarHit(ev.clientX, ev.clientY)) return;
            setNoteHandwriting(false);
            handleNoteBarTap('side');
        }, true);
    }
    window.scrollNoteSchedaIntoView = function () {
        revealNoteSmallIntoView();
    };
    window.scrollNoteSchedaIntoView.__shV73 = true;
    window.revealNoteSchedaOpening = function () {
        revealNoteSmallIntoView();
    };
    window.revealNoteSchedaOpening.__shV73 = true;
    try { prepareNoteTextField(); } catch (ePrep) {}
    if (!window.__shNoteFingerKb74) {
        window.__shNoteFingerKb74 = true;
        window.__shLastNotePointer = '';
        document.addEventListener('pointerdown', function (ev) {
            if (!ev) return;
            if (noteBarHit(ev.clientX, ev.clientY) || (ev.target && ev.target.closest && ev.target.closest('#rapportino-note-tendina'))) {
                window.__shLastNotePointer = ev.pointerType || '';
            }
            if (ev.pointerType === 'pen') return;
            if (!notesTendinaOpen() || notesFullscreenOn()) return;
            if (noteTextareaFromPoint(ev.clientX, ev.clientY) || (ev.target && ev.target.id === 'inp-sec-note')) {
                prepareNoteFingerKeyboard();
            }
        }, true);
        var swallowNativeNoteBar = function (ev) {
            if (!noteBarPenLocked()) return;
            var t = ev && ev.target;
            if (!t || !t.closest || !t.closest('#rapportino-note-tendina .cond-tendina-bar')) return;
            if (ev.cancelable) ev.preventDefault();
            ev.stopPropagation();
        };
        document.addEventListener('mouseup', swallowNativeNoteBar, true);
        document.addEventListener('click', swallowNativeNoteBar, true);
        document.addEventListener('touchend', swallowNativeNoteBar, true);
        if (window.visualViewport) {
            var onNoteVv = function () {
                if (!notesTendinaOpen()) {
                    dismissNoteKeyboard();
                    return;
                }
                if (notesFullscreenOn()) {
                    setNoteSoftInput(false);
                    return;
                }
                if (document.activeElement && document.activeElement.id === 'inp-sec-note' && window.__shLastNotePointer !== 'pen') {
                    pinNoteAboveKeyboard();
                    revealNoteSmallIntoView();
                } else {
                    unpinNoteFromKeyboard();
                    revealNoteSmallIntoView();
                }
            };
            window.visualViewport.addEventListener('resize', onNoteVv);
            window.visualViewport.addEventListener('scroll', onNoteVv);
        }
    }
    if (!window.__shNoteFsPalm76) {
        window.__shNoteFsPalm76 = true;
        var fsPalmEvent = function (ev) {
            if (!notesFullscreenOn() || !ev) return;
            if (ev.pointerType === 'pen') return;
            if (window.__shPenIsDown || window.__shNotePenWrite) return;
            if (ev.pointerType && ev.pointerType !== 'touch') return;
            var x = ev.clientX;
            var y = ev.clientY;
            if ((x == null || y == null) && ev.touches && ev.touches[0]) {
                x = ev.touches[0].clientX;
                y = ev.touches[0].clientY;
            }
            if (noteBarHit(x || 0, y || 0)) return;
            var t = ev.target;
            if (t && t.closest && !t.closest('#rapportino-note-tendina')) return;
            if (ev.cancelable) ev.preventDefault();
            ev.stopPropagation();
            setNoteSoftInput(false);
        };
        document.addEventListener('pointerdown', fsPalmEvent, true);
        document.addEventListener('touchstart', fsPalmEvent, { capture: true, passive: false });
        document.addEventListener('focusin', function (e) {
            if (!notesFullscreenOn()) return;
            if (!e || !e.target || e.target.id !== 'inp-sec-note') return;
            setNoteSoftInput(false);
            if (window.__shNotePenWrite || window.__shLastNotePointer === 'pen' || window.__shPenIsDown) return;
            try { e.target.blur(); } catch (err) {}
        }, true);
    }
    // Col dito la pagina apre la tastiera completa: sui campi impianto serve il tastierino.
    if (!window.__shFingerNumpad) {
        window.__shFingerNumpad = true;
        var numpadTarget = function (el) {
            if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return null;
            if (!isPlantField(el)) return null;
            if (el.readOnly || el.disabled) return null;
            if (el.getAttribute('data-no-numpad') === '1') return null;
            if (String(el.getAttribute('inputmode') || '').toLowerCase() === 'text') return null;
            return el;
        };
        document.addEventListener('pointerdown', function (ev) {
            if (!ev || ev.pointerType === 'pen') return;
            var el = ev.target;
            var inp = numpadTarget(el) || numpadTarget(numericFromEl(el));
            if (!inp) return;
            inp.setAttribute('inputmode', 'decimal');
            if (!inp.getAttribute('pattern')) inp.setAttribute('pattern', '[0-9,]*');
        }, true);
    }
    if (!window.__shNoteCloseKb75) {
        window.__shNoteCloseKb75 = true;
        document.addEventListener('pointerdown', function (ev) {
            if (!ev || ev.pointerType === 'pen') return;
            if (!notesTendinaOpen()) return;
            if (noteCmdHit(ev.clientX, ev.clientY) || noteCmdLocked()) return;
            if (!noteBarHit(ev.clientX, ev.clientY)) return;
            dismissNoteKeyboard();
        }, true);
        if (window.visualViewport) {
            var onNoteCloseVv = function () {
                if (!notesTendinaOpen()) dismissNoteKeyboard();
            };
            window.visualViewport.addEventListener('resize', onNoteCloseVv);
            window.visualViewport.addEventListener('scroll', onNoteCloseVv);
        }
    }
    if (typeof window.toggleNoteSchedaTendina === 'function' && !window.toggleNoteSchedaTendina.__shV83) {
        var toggleNotePrev83 = window.toggleNoteSchedaTendina;
        window.toggleNoteSchedaTendina = function (e) {
            if (noteCmdLocked()) return;
            if (e && e.target && e.target.closest && e.target.closest('#sh-note-cmd, .sh-note-cmd-btn')) return;
            return toggleNotePrev83.apply(this, arguments);
        };
        window.toggleNoteSchedaTendina.__shV83 = true;
    }
    if (typeof window.startPress === 'function' && !window.startPress.__shV83) {
        var startPressPrev83 = window.startPress;
        window.startPress = function (e, id) {
            if (noteCmdLocked()) return;
            if (e && ((e.target && e.target.closest && e.target.closest('#sh-note-cmd, .sh-note-cmd-btn')) || noteCmdHit(e.clientX || 0, e.clientY || 0))) return;
            return startPressPrev83.apply(this, arguments);
        };
        window.startPress.__shV83 = true;
    }
    if (typeof window.endPressNoteSchedaTendina === 'function' && !window.endPressNoteSchedaTendina.__shV83) {
        var endPressPrev83 = window.endPressNoteSchedaTendina;
        window.endPressNoteSchedaTendina = function (e) {
            if (noteCmdLocked()) return;
            if (e && e.target && e.target.closest && e.target.closest('#sh-note-cmd, .sh-note-cmd-btn')) return;
            return endPressPrev83.apply(this, arguments);
        };
        window.endPressNoteSchedaTendina.__shV83 = true;
    }
    if (typeof window.toggleNoteSchedaTendina === 'function' && !window.toggleNoteSchedaTendina.__shV75) {
        var toggleNotePrev75 = window.toggleNoteSchedaTendina;
        window.toggleNoteSchedaTendina = function (e) {
            if (noteBarPenLocked()) return;
            var wasOpen = notesTendinaOpen();
            var r = toggleNotePrev75.apply(this, arguments);
            var nowOpen = notesTendinaOpen();
            if (!nowOpen) {
                dismissNoteKeyboard();
                return r;
            }
            if (window.__shLastNotePointer !== 'pen' && !wasOpen && nowOpen && !notesFullscreenOn()) {
                var tend = document.getElementById('rapportino-note-tendina');
                if (tend && !tend.dataset.shNoteMode) tend.dataset.shNoteMode = 'small';
                syncNoteFullscreen();
                prepareNoteFingerKeyboard();
            }
            return r;
        };
        window.toggleNoteSchedaTendina.__shV75 = true;
    }
    if (typeof window.toggleNoteSchedaTendina === 'function' && !window.toggleNoteSchedaTendina.__shV74) {
        var toggleNotePrev74 = window.toggleNoteSchedaTendina;
        window.toggleNoteSchedaTendina = function (e) {
            if (noteBarPenLocked()) return;
            var r = toggleNotePrev74.apply(this, arguments);
            if (!notesTendinaOpen()) {
                dismissNoteKeyboard();
                return r;
            }
            return r;
        };
        window.toggleNoteSchedaTendina.__shV74 = true;
    }
    if (typeof window.toggleNoteSchedaTendina === 'function' && !window.toggleNoteSchedaTendina.__shV65) {
        var toggleNoteOrig = window.toggleNoteSchedaTendina;
        window.toggleNoteSchedaTendina = function (e) {
            var r = toggleNoteOrig.apply(this, arguments);
            syncNoteFullscreen();
            return r;
        };
        window.toggleNoteSchedaTendina.__shV65 = true;
    }
    wrapStatusToggleOnce('toggleStatus');
    wrapStatusToggleOnce('toggleComp');
    try { seedAndroidGeminiKeys(); } catch (e4) {}
    if (typeof window.normalizeSmartCaptureImageForGemini === 'function' && !window.normalizeSmartCaptureImageForGemini.__shV56) {
        var normOrig = window.normalizeSmartCaptureImageForGemini;
        window.normalizeSmartCaptureImageForGemini = function (imageData) {
            return Promise.resolve(normOrig(imageData)).then(function (out) {
                return shrinkImageData(out || imageData);
            });
        };
        window.normalizeSmartCaptureImageForGemini.__shV56 = true;
    }
    try { alignGeminiCallBudgetWithWeb(); } catch (eAlign) {}
    if (typeof window.setSmartCaptureLoadingMessage === 'function' && !window.setSmartCaptureLoadingMessage.__shNoGemini) {
        var origLoadMsg = window.setSmartCaptureLoadingMessage;
        window.setSmartCaptureLoadingMessage = function (msg) {
            if (typeof window.stripGeminiNameFromOcrUi === 'function') {
                msg = window.stripGeminiNameFromOcrUi(msg);
            } else {
                msg = String(msg || '').replace(/Quota\s+Gemini/gi, 'Quota').replace(/\bGemini\s*[:·]?\s*/gi, '').replace(/\bGemini\b/gi, '').trim();
            }
            return origLoadMsg.call(this, msg);
        };
        window.setSmartCaptureLoadingMessage.__shNoGemini = true;
    }
    if (typeof window.applySmartCaptureResults === 'function' && !window.applySmartCaptureResults.__shV56) {
        var applyOcrOrig = window.applySmartCaptureResults;
        window.applySmartCaptureResults = function () {
            window.__shSpenOcrApply = true;
            try {
                var r = applyOcrOrig.apply(this, arguments);
                if (r && typeof r.then === 'function') {
                    return r.then(function (v) {
                        window.__shSpenOcrApply = false;
                        return v;
                    }, function (err) {
                        window.__shSpenOcrApply = false;
                        throw err;
                    });
                }
                window.__shSpenOcrApply = false;
                return r;
            } catch (e) {
                window.__shSpenOcrApply = false;
                throw e;
            }
        };
        window.applySmartCaptureResults.__shV56 = true;
    }
    window.__shNativeOcrPhoto = function (dataUrl) {
        if (!dataUrl || window.__shOcrStarted) return;
        window.__shOcrStarted = true;
        window._smartCaptureAbort = false;
        try { seedAndroidGeminiKeys(); } catch (e) {}
        var imageData = { data: dataUrl, type: 'image/jpeg', name: 'camera.jpg' };
        window._smartCapturePhotoData = imageData;
        var run = function () {
            if (typeof window.setSmartCaptureLoading === 'function') {
                window.setSmartCaptureLoading(true, 'Analisi foto…');
            }
            return Promise.resolve()
                .then(function () { return window.runSmartCaptureAnalysis(imageData); })
                .then(function (parsed) {
                    if (window._smartCaptureAbort) return;
                    window.finishSmartCapture(parsed);
                })
                .catch(function (err) {
                    if (!window._smartCaptureAbort && typeof window.buildSmartCaptureFailureResult === 'function') {
                        window.finishSmartCapture(window.buildSmartCaptureFailureResult(err));
                    }
                })
                .then(function () {
                    window.__shOcrStarted = false;
                    if (typeof window.setSmartCaptureLoading === 'function') window.setSmartCaptureLoading(false);
                });
        };
        try { run(); } catch (e2) { window.__shOcrStarted = false; }
    };
    window.__shNativeOcrError = function (msg) {
        window.__shOcrStarted = false;
        if (typeof window.setSmartCaptureLoading === 'function') window.setSmartCaptureLoading(false);
        if (typeof window.buildSmartCaptureFailureResult === 'function' && typeof window.finishSmartCapture === 'function') {
            window.finishSmartCapture(window.buildSmartCaptureFailureResult(new Error(msg || 'Fotocamera OCR non disponibile')));
        } else {
            try { alert(msg || 'Fotocamera OCR non disponibile'); } catch (e) {}
        }
    };
    if (typeof window.smartCaptureFromCamera === 'function' && !window.smartCaptureFromCamera.__shV57) {
        window.smartCaptureFromCamera = function () {
            try { seedAndroidGeminiKeys(); } catch (e) {}
            var menu = document.getElementById('smart-capture-menu');
            if (menu) menu.classList.remove('open');
            if (!window._smartCaptureLetturaMode && !window._smartCaptureNotturnoGiornalieroMode) {
                window._smartCaptureTankMode = true;
            }
            window._smartCaptureAbort = false;
            window.__shOcrStarted = false;
            if (typeof window.ensureGeminiApiKeySaved === 'function') window.ensureGeminiApiKeySaved();
            if (window.ServiceHubAndroidSpen && typeof window.ServiceHubAndroidSpen.startOcrCamera === 'function') {
                if (typeof window.setSmartCaptureLoading === 'function') {
                    window.setSmartCaptureLoading(true, 'Fotocamera…');
                }
                try { window.ServiceHubAndroidSpen.startOcrCamera(); } catch (e2) {}
                return;
            }
            if (typeof window.openNativeCameraCapture === 'function') window.openNativeCameraCapture();
        };
        window.smartCaptureFromCamera.__shV57 = true;
    }

    // ---- Scrittura a penna sul display del numpad ----
    var numInk = { strokes: [], current: null, timer: null, rect: null, dpr: 1 };

    function numpadInkArea() {
        var modal = document.getElementById('numpad-modal');
        if (!modal || !modal.classList.contains('active')) return null;
        var disp = document.getElementById('numpad-display');
        if (!disp || disp.hidden) return null;
        var box = (disp.closest && disp.closest('.numpad-display-bezel')) || disp;
        var r = box.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return null;
        return r;
    }

    function numpadInkHit(x, y) {
        if (x == null || y == null) return null;
        var r = numpadInkArea();
        if (!r) return null;
        if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
        return r;
    }

    function numpadInkHost() {
        var host = document.getElementById('sh-spen-numpad-ink');
        if (!host) {
            host = document.createElement('div');
            host.id = 'sh-spen-numpad-ink';
            host.setAttribute('aria-hidden', 'true');
            // Il numpad sta a z-index 10000002: sotto quel valore l'inchiostro resta nascosto dal pannello.
            host.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;display:none;';
            var cvs = document.createElement('canvas');
            cvs.style.cssText = 'display:block;width:100%;height:100%;';
            host.appendChild(cvs);
            (document.body || document.documentElement).appendChild(host);
        }
        return host;
    }

    function layoutNumpadInk() {
        var r = numpadInkArea();
        var host = numpadInkHost();
        if (!r) {
            host.style.display = 'none';
            return;
        }
        host.style.display = 'block';
        host.style.left = r.left + 'px';
        host.style.top = r.top + 'px';
        host.style.width = r.width + 'px';
        host.style.height = r.height + 'px';
        var cvs = host.querySelector('canvas');
        if (!cvs) return;
        var dpr = window.devicePixelRatio || 1;
        cvs.width = Math.max(1, Math.round(r.width * dpr));
        cvs.height = Math.max(1, Math.round(r.height * dpr));
        numInk.rect = r;
        numInk.dpr = dpr;
        redrawNumpadInk();
    }

    function redrawNumpadInk() {
        var host = document.getElementById('sh-spen-numpad-ink');
        var cvs = host && host.querySelector('canvas');
        if (!cvs) return;
        var ctx = cvs.getContext('2d');
        ctx.clearRect(0, 0, cvs.width, cvs.height);
        var r = numInk.rect;
        if (!r) return;
        var dpr = numInk.dpr || 1;
        ctx.strokeStyle = '#1e3a8a';
        ctx.lineWidth = 2.6 * dpr;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        var all = numInk.strokes.slice();
        if (numInk.current && numInk.current.length) all.push(numInk.current);
        for (var s = 0; s < all.length; s++) {
            var pts = all[s];
            if (!pts || !pts.length) continue;
            ctx.beginPath();
            ctx.moveTo((pts[0].x - r.left) * dpr, (pts[0].y - r.top) * dpr);
            for (var i = 1; i < pts.length; i++) {
                ctx.lineTo((pts[i].x - r.left) * dpr, (pts[i].y - r.top) * dpr);
            }
            ctx.stroke();
        }
    }

    function clearNumpadInk() {
        window.__shNumpadInkWriting = false;
        numpadHidePlaceholder(false);
        numInk.strokes = [];
        numInk.current = null;
        if (numInk.timer) {
            try { clearTimeout(numInk.timer); } catch (e) {}
            numInk.timer = null;
        }
        var host = document.getElementById('sh-spen-numpad-ink');
        if (!host) return;
        var cvs = host.querySelector('canvas');
        if (cvs) {
            try { cvs.getContext('2d').clearRect(0, 0, cvs.width, cvs.height); } catch (e2) {}
        }
        host.style.display = 'none';
    }

    function numpadKey(v) {
        try {
            if (typeof window.numpadAction === 'function') window.numpadAction(v);
        } catch (e) {}
    }

    // Come le unita' di misura sui campi: mentre il pennino scrive, lo "0.00" del display sparisce.
    function numpadHidePlaceholder(on) {
        var d = document.getElementById('numpad-display');
        if (!d) return;
        if (on) {
            if (d.getAttribute('data-sh-np-ph') == null) {
                d.setAttribute('data-sh-np-ph', d.getAttribute('placeholder') || '');
            }
            d.setAttribute('placeholder', '');
        } else if (d.getAttribute('data-sh-np-ph') != null) {
            d.setAttribute('placeholder', d.getAttribute('data-sh-np-ph') || '');
            d.removeAttribute('data-sh-np-ph');
        }
    }

    function strokesCenterX(strokes) {
        var minx = null, maxx = null;
        for (var s = 0; s < (strokes || []).length; s++) {
            var pts = strokes[s] || [];
            for (var i = 0; i < pts.length; i++) {
                if (minx == null || pts[i].x < minx) minx = pts[i].x;
                if (maxx == null || pts[i].x > maxx) maxx = pts[i].x;
            }
        }
        return minx == null ? null : (minx + maxx) / 2;
    }

    function numpadDisplayValue() {
        var d = document.getElementById('numpad-display');
        return d ? String(d.value || '') : '';
    }

    // Posizione sullo schermo di ogni cifra del display: serve sia per capire se la cifra
    // nuova va prima o dopo, sia per sapere quali cifre attraversa un taglio.
    function numpadCharBoxes() {
        var d = document.getElementById('numpad-display');
        var txt = numpadDisplayValue();
        if (!d || !txt) return null;
        var r = d.getBoundingClientRect();
        if (!r.width) return null;
        var cs = window.getComputedStyle(d);
        var ctx;
        try {
            var cv = numpadCharBoxes.__cv || (numpadCharBoxes.__cv = document.createElement('canvas'));
            ctx = cv.getContext('2d');
            ctx.font = cs.font || ((cs.fontStyle || '') + ' ' + (cs.fontWeight || '') + ' ' + cs.fontSize + ' ' + cs.fontFamily);
        } catch (e) { return null; }
        // Il pannello del numpad puo' essere scalato: le misure del font vanno riportate
        // alla dimensione effettiva sullo schermo.
        var k = d.offsetWidth ? (r.width / d.offsetWidth) : 1;
        var widths = [];
        var total = 0;
        for (var i = 0; i < txt.length; i++) {
            var w = ctx.measureText(txt.charAt(i)).width * k;
            widths.push(w);
            total += w;
        }
        if (!total) return null;
        var align = cs.textAlign;
        var padL = (parseFloat(cs.paddingLeft) || 0) * k;
        var padR = (parseFloat(cs.paddingRight) || 0) * k;
        var x;
        if (align === 'right' || align === 'end') x = r.right - padR - total;
        else if (align === 'left' || align === 'start') x = r.left + padL;
        else x = r.left + (r.width - total) / 2;
        var boxes = [];
        for (var j = 0; j < txt.length; j++) {
            boxes.push({ ch: txt.charAt(j), x0: x, x1: x + widths[j] });
            x += widths[j];
        }
        return boxes;
    }

    function numpadTextCenterX() {
        var boxes = numpadCharBoxes();
        if (!boxes || !boxes.length) return null;
        return (boxes[0].x0 + boxes[boxes.length - 1].x1) / 2;
    }

    // Un tratto cancella se e' una riga netta (orizzontale o diagonale) oppure uno
    // scarabocchio: spariscono solo le cifre che attraversa davvero.
    function numpadEraseResult(strokes, rect) {
        if (!strokes || strokes.length !== 1) return null;
        var pts = strokes[0] || [];
        if (pts.length < 3) return null;
        var dx = pts[pts.length - 1].x - pts[0].x;
        var dy = pts[pts.length - 1].y - pts[0].y;
        var chord = Math.sqrt(dx * dx + dy * dy);
        var path = 0;
        for (var i = 1; i < pts.length; i++) {
            var px = pts[i].x - pts[i - 1].x;
            var py = pts[i].y - pts[i - 1].y;
            path += Math.sqrt(px * px + py * py);
        }
        var scarabocchio = numpadScribble(strokes, rect);
        // Quasi verticale e' un "1", non un taglio.
        var riga = chord >= 25 && path <= chord * 1.35 && Math.abs(dx) >= Math.abs(dy) * 0.6;
        if (!riga && !scarabocchio) return null;
        var boxes = numpadCharBoxes();
        if (!boxes || !boxes.length) return null;
        var b = strokeBoxX(pts);
        var out = '';
        var colpite = 0;
        for (var c = 0; c < boxes.length; c++) {
            var bx = boxes[c];
            var over = Math.min(b.x1, bx.x1) - Math.max(b.x0, bx.x0);
            var largh = bx.x1 - bx.x0;
            if (over > 0 && largh > 0 && over >= largh * 0.45) colpite++;
            else out += bx.ch;
        }
        if (!colpite) return null;
        return out;
    }

    function strokeBoxX(pts) {
        var x0 = pts[0].x, x1 = pts[0].x;
        for (var i = 1; i < pts.length; i++) {
            if (pts[i].x < x0) x0 = pts[i].x;
            if (pts[i].x > x1) x1 = pts[i].x;
        }
        return { x0: x0, x1: x1 };
    }

    function numpadSetValue(str) {
        numpadKey('CLR');
        for (var i = 0; i < str.length; i++) {
            var ch = str.charAt(i);
            numpadKey(ch === '.' ? ',' : ch);
        }
    }

    // Scarabocchio: avanti e indietro sopra il numero, come gesto di cancellazione.
    function numpadScribble(strokes, rect) {
        if (!strokes || !strokes.length || !rect) return false;
        var pts = [];
        for (var s = 0; s < strokes.length; s++) pts = pts.concat(strokes[s] || []);
        if (pts.length < 8) return false;
        var box = strokeBox(pts);
        // Basta che copra una cifra: lo scarabocchio puo' essere mirato all'ultima.
        if (!box || box.w < 30) return false;
        var dir = 0;
        var flips = 0;
        var lastX = pts[0].x;
        for (var i = 1; i < pts.length; i++) {
            var dx = pts[i].x - lastX;
            if (Math.abs(dx) < 4) continue;
            var nd = dx > 0 ? 1 : -1;
            if (dir && nd !== dir) flips++;
            dir = nd;
            lastX = pts[i].x;
        }
        return flips >= 3;
    }

    function commitNumpadInk() {
        var strokes = cloneStrokes(numInk.strokes);
        var rect = numInk.rect;
        numInk.strokes = [];
        numInk.current = null;
        if (!strokes.length) {
            clearNumpadInk();
            return;
        }
        var resto = numpadEraseResult(strokes, rect);
        if (resto !== null) {
            clearNumpadInk();
            numpadSetValue(resto);
            return;
        }
        var inkCx = strokesCenterX(strokes);
        var textCx = numpadTextCenterX();
        nativeRecognize(strokes).then(function (num) {
            clearNumpadInk();
            num = String(num || '').trim();
            if (!num) return;
            var prev = numpadDisplayValue();
            if (!prev) {
                numpadSetValue(num);
                return;
            }
            var prima = inkCx != null && textCx != null && inkCx < textCx;
            numpadSetValue(prima ? (num + prev) : (prev + num));
        });
    }

    function scheduleNumpadInkCommit() {
        if (numInk.timer) {
            try { clearTimeout(numInk.timer); } catch (e) {}
        }
        numInk.timer = setTimeout(function () {
            numInk.timer = null;
            if (window.__shPenIsDown) {
                scheduleNumpadInkCommit();
                return;
            }
            commitNumpadInk();
        }, window.__SPEN_COMMIT_MS || 600);
    }

    if (typeof window.__shSpenOnPenDown === 'function' && !window.__shSpenOnPenDown.__shV122) {
        var downPrev122 = window.__shSpenOnPenDown;
        window.__shSpenOnPenDown = function (ev) {
            if (!ev || !numpadInkHit(ev.clientX, ev.clientY)) return downPrev122.apply(this, arguments);
            if (ev.cancelable) ev.preventDefault();
            hideBox();
            penUiTap = null;
            clearPenChrome();
            if (numInk.timer) {
                try { clearTimeout(numInk.timer); } catch (e) {}
                numInk.timer = null;
            }
            window.__shNumpadInkWriting = true;
            numpadHidePlaceholder(true);
            layoutNumpadInk();
            numInk.current = [{ x: ev.clientX, y: ev.clientY, t: Date.now() }];
            redrawNumpadInk();
        };
        window.__shSpenOnPenDown.__shV122 = true;
    }

    if (typeof window.__shSpenOnPenMove === 'function' && !window.__shSpenOnPenMove.__shV122) {
        var movePrev122 = window.__shSpenOnPenMove;
        window.__shSpenOnPenMove = function (ev) {
            if (!numInk.current || !ev) return movePrev122.apply(this, arguments);
            if (ev.cancelable) ev.preventDefault();
            numInk.current.push({ x: ev.clientX, y: ev.clientY, t: Date.now() });
            redrawNumpadInk();
        };
        window.__shSpenOnPenMove.__shV122 = true;
    }

    if (typeof window.__shSpenOnPenUp === 'function' && !window.__shSpenOnPenUp.__shV122) {
        var upPrev122 = window.__shSpenOnPenUp;
        window.__shSpenOnPenUp = function (ev, cancelled) {
            if (!numInk.current) return upPrev122.apply(this, arguments);
            var pts = numInk.current;
            numInk.current = null;
            if (!cancelled && pts && pts.length > 1) numInk.strokes.push(pts);
            redrawNumpadInk();
            // Il taglio non ha bisogno dell'attesa del riconoscimento: si vede subito dalla forma.
            var resto = numpadEraseResult(numInk.strokes, numInk.rect);
            if (resto !== null) {
                if (numInk.timer) {
                    try { clearTimeout(numInk.timer); } catch (eT) {}
                    numInk.timer = null;
                }
                clearNumpadInk();
                numpadSetValue(resto);
                return;
            }
            scheduleNumpadInkCommit();
        };
        window.__shSpenOnPenUp.__shV122 = true;
    }

    // Mentre il pennino scrive sul display, il dito o il palmo non devono muovere nulla sotto.
    if (!window.__shNumpadInkTouchLock) {
        window.__shNumpadInkTouchLock = true;
        var blockWhileNumInk = function (ev) {
            if (!window.__shNumpadInkWriting) return;
            var modal = document.getElementById('numpad-modal');
            if (!modal || !modal.classList.contains('active')) {
                window.__shNumpadInkWriting = false;
                return;
            }
            if (ev && ev.pointerType === 'pen') return;
            var t = ev && ev.target;
            if (t && t.closest && t.closest('#smart-capture-menu, [id*="smart-capture"], #splash-screen')) return;
            if (ev && ev.cancelable) ev.preventDefault();
            if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
        };
        ['touchstart', 'touchmove', 'pointerdown', 'pointermove'].forEach(function (name) {
            document.addEventListener(name, blockWhileNumInk, { capture: true, passive: false });
        });
    }

    if (!window.__shNumpadInkWatch) {
        window.__shNumpadInkWatch = true;
        var numModal = document.getElementById('numpad-modal');
        if (numModal) {
            new MutationObserver(function () {
                if (!numModal.classList.contains('active')) clearNumpadInk();
            }).observe(numModal, { attributes: true, attributeFilter: ['class'] });
        }
    }

    // Sempre, anche se il primo inject e' arrivato prima della pagina:
    // l'OCR in-app deve aprire la fotocamera nativa, non quella web.
    window.smartCaptureFromCamera = function () {
        try { seedAndroidGeminiKeys(); } catch (eCam0) {}
        var menu = document.getElementById('smart-capture-menu');
        if (menu) menu.classList.remove('open');
        if (!window._smartCaptureLetturaMode && !window._smartCaptureNotturnoGiornalieroMode) {
            window._smartCaptureTankMode = true;
        }
        window._smartCaptureAbort = false;
        window.__shOcrStarted = false;
        if (typeof window.ensureGeminiApiKeySaved === 'function') window.ensureGeminiApiKeySaved();
        if (window.ServiceHubAndroidSpen && typeof window.ServiceHubAndroidSpen.startOcrCamera === 'function') {
            if (typeof window.setSmartCaptureLoading === 'function') {
                window.setSmartCaptureLoading(true, 'Fotocamera…');
            }
            try { window.ServiceHubAndroidSpen.startOcrCamera(); } catch (eCam1) {}
            return;
        }
        if (typeof window.openNativeCameraCapture === 'function') window.openNativeCameraCapture();
    };
})();
