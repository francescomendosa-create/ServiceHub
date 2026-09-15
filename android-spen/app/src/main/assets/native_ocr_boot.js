(function () {
    window.__SH_NATIVE_ANDROID = true;
    try {
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
            navigator.serviceWorker.getRegistrations().then(function (regs) {
                (regs || []).forEach(function (r) { try { r.unregister(); } catch (e) {} });
            });
        }
    } catch (eSw) {}

    window.__shSpenNativeCbs = window.__shSpenNativeCbs || {};
    window.__shSpenNativeResult = function (id, text) {
        var cb = window.__shSpenNativeCbs && window.__shSpenNativeCbs[id];
        if (cb) cb(text);
    };
    window.__shPullGeminiResp = function () {
        var br = window.ServiceHubAndroidSpen;
        if (!br || typeof br.geminiRespLen !== 'function') return '';
        var n = br.geminiRespLen() | 0;
        var out = '';
        var i = 0;
        while (i < n) {
            out += br.geminiRespSlice(i, 160000) || '';
            i += 160000;
        }
        return out;
    };

    function nativeGeminiFetch(apiKey, modelName, parts, timeoutMs, genConfig) {
        return new Promise(function (resolve, reject) {
            try {
                var br = window.ServiceHubAndroidSpen;
                if (!br || typeof br.geminiEnd !== 'function') {
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
                }, timeoutMs || 70000);
                window.__shSpenNativeCbs[id] = function (raw) {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    try { delete window.__shSpenNativeCbs[id]; } catch (e) {}
                    try {
                        console.log('[SH OCR] gemini cb', (raw || '').slice(0, 180));
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
                            var p;
                            for (p = 0; p < partsOut.length; p++) text += partsOut[p].text || '';
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
                br.geminiBegin(id, url);
                var step = 160000;
                var i;
                for (i = 0; i < body.length; i += step) br.geminiChunk(id, body.slice(i, i + step));
                br.geminiEnd(id);
            } catch (e5) {
                reject(e5);
            }
        });
    }

    function dataUrlToFile(dataUrl) {
        var comma = String(dataUrl || '').indexOf(',');
        var b64 = comma >= 0 ? dataUrl.slice(comma + 1) : String(dataUrl || '');
        var bin = atob(b64);
        var u8 = new Uint8Array(bin.length);
        var i;
        for (i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        try {
            return new File([u8], 'camera.jpg', { type: 'image/jpeg' });
        } catch (e) {
            var blob = new Blob([u8], { type: 'image/jpeg' });
            try { blob.name = 'camera.jpg'; } catch (e2) {}
            return blob;
        }
    }

    function shLog(msg) {
        try { console.log('[SH OCR]', msg); } catch (e0) {}
        try {
            if (window.ServiceHubAndroidSpen && typeof window.ServiceHubAndroidSpen.ocrDebug === 'function') {
                window.ServiceHubAndroidSpen.ocrDebug(String(msg || ''));
            }
        } catch (e1) {}
    }

    function remapOcrFieldId(id) {
        if (id === 'inp-tk8093') return 'inp-bacino-tk8093';
        return id;
    }

    function expandPlantOcrFields(fields) {
        var out = [];
        var seen = {};
        function add(id, label, section) {
            id = remapOcrFieldId(id);
            if (!id || seen[id] || id === 'inp-s121' || id === 'inp-s133' || id === 'tk101') return;
            seen[id] = true;
            out.push({ id: id, label: label || id, section: section || 'Serbatoi' });
        }
        (fields || []).forEach(function (f) {
            if (f) add(f.id, f.label, f.section);
        });
        try {
            document.querySelectorAll('#sec-amb input[id], #sec-ambiente2 input[id], #sec-acqua input[id]').forEach(function (el) {
                if (!el.id || el.readOnly) return;
                var row = el.closest('.amb-row');
                var lab = row && row.querySelector('.amb-label');
                add(el.id, lab ? String(lab.innerText || '').replace(/\s+/g, ' ').trim() : el.id, 'Ambiente');
            });
        } catch (eDom) {}
        if (typeof window.mapDcsSiglaToFieldId === 'function') {
            ['TK-8092', 'TK-8093', 'TK8066', 'TK8063', 'A-10605', 'S-817', 'S-818', 'S-813', 'S-819', 'S-864', 'S-148', 'S-854', 'S-846', 'LURGI'].forEach(function (s) {
                var id = window.mapDcsSiglaToFieldId(s);
                if (id) add(id, s, 'HOLD-UP');
            });
        }
        return out;
    }

    function remapReadings(list) {
        return (list || []).map(function (r) {
            if (!r || !r.id) return r;
            var id = remapOcrFieldId(r.id);
            if (id === r.id) return r;
            return Object.assign({}, r, { id: id });
        });
    }

    function patchOnce() {
        if (typeof window.clearAllGeminiKeyCooldowns === 'function' && !window.__shClearedCooldownsV100) {
            try { window.clearAllGeminiKeyCooldowns(); } catch (eC) {}
            window.__shClearedCooldownsV100 = true;
        }
        if (typeof window.geminiFetchModelOnce === 'function' && !window.geminiFetchModelOnce.__shV100) {
            window.geminiFetchModelOnce = function (apiKey, modelName, parts, timeoutMs, genConfig) {
                return nativeGeminiFetch(apiKey, modelName, parts, timeoutMs, genConfig);
            };
            window.geminiFetchModelOnce.__shV100 = true;
        }
        if (typeof window.runGeminiWithKeyRotation === 'function' && !window.runGeminiWithKeyRotation.__shV100) {
            window.runGeminiWithKeyRotation = function (parts, opts) {
                opts = Object.assign({}, opts || {});
                var key = window.getGeminiApiKey && window.getGeminiApiKey();
                if (!key) return Promise.reject(new Error('Nessuna chiave Gemini'));
                var model = (opts.models && opts.models[0]) || 'gemini-2.5-flash';
                return window.geminiFetchModelOnce(key, model, parts, opts.timeoutMs || 68000, opts.generationConfig)
                    .then(function (text) {
                        return { text: text, model: model, keyLabel: 'chiave attiva' };
                    });
            };
            window.runGeminiWithKeyRotation.__shV100 = true;
        }
        if (typeof window.mergeCaptureFieldsForGemini === 'function' && !window.mergeCaptureFieldsForGemini.__shV106) {
            var origMerge = window.mergeCaptureFieldsForGemini;
            window.mergeCaptureFieldsForGemini = function () {
                return expandPlantOcrFields(origMerge.apply(this, arguments));
            };
            window.mergeCaptureFieldsForGemini.__shV106 = true;
        }
        if (typeof window.extractGeminiCaptureReadings === 'function' && !window.extractGeminiCaptureReadings.__shV106) {
            var origExtract = window.extractGeminiCaptureReadings;
            window.extractGeminiCaptureReadings = function (raw, fields) {
                var exp = expandPlantOcrFields(fields);
                var got = remapReadings(origExtract.call(this, raw, exp));
                if (got && got.length) {
                    shLog('extract ' + got.length + ' ' + got.map(function (r) { return r.id + '=' + r.value; }).join(','));
                    return got;
                }
                var json = window.parseSmartCaptureJson ? window.parseSmartCaptureJson(raw) : null;
                if (json && typeof window.parseGeminiTankPairsJson === 'function') {
                    got = remapReadings(window.parseGeminiTankPairsJson(json, exp));
                    if (typeof window.filterGeminiCaptureReadings === 'function') {
                        got = window.filterGeminiCaptureReadings(got);
                    }
                }
                shLog('extract fallback ' + ((got && got.length) || 0) + ' campi=' + exp.length);
                return got || [];
            };
            window.extractGeminiCaptureReadings.__shV106 = true;
        }
        if (typeof window.showSmartCaptureConfirm === 'function' && !window.showSmartCaptureConfirm.__shV107) {
            var origShow = window.showSmartCaptureConfirm;
            window.showSmartCaptureConfirm = function (parsed) {
                parsed = parsed || { readings: [] };
                parsed.readings = remapReadings(parsed.readings || []).filter(function (r) {
                    return r && r.id && r.id !== 'inp-s133' && r.id !== 'tk101' && r.value != null && String(r.value).trim() !== '';
                });
                var exp = [];
                var seen = {};
                (parsed.readings || []).forEach(function (r) {
                    if (!r || !r.id || seen[r.id]) return;
                    seen[r.id] = true;
                    var label = r.source || r.id;
                    try {
                        var el = document.getElementById(r.id);
                        var row = el && el.closest('.amb-row');
                        var lab = row && row.querySelector('.amb-label');
                        if (lab) label = String(lab.innerText || '').replace(/\s+/g, ' ').trim() || label;
                    } catch (eLab) {}
                    exp.push({ id: r.id, label: label, section: parsed.profile === 'dcs-hold-up' ? 'HOLD-UP' : 'Serbatoi' });
                });
                shLog('confirm ' + exp.length);
                var origMerge2 = window.mergeCaptureFieldsForGemini;
                if (exp.length) {
                    window.mergeCaptureFieldsForGemini = function () { return exp; };
                    window.mergeCaptureFieldsForGemini.__shV106 = true;
                }
                try {
                    return origShow.call(this, parsed);
                } finally {
                    window.mergeCaptureFieldsForGemini = origMerge2;
                }
            };
            window.showSmartCaptureConfirm.__shV107 = true;
        }
        return !!(window.extractGeminiCaptureReadings && window.extractGeminiCaptureReadings.__shV106
            && window.showSmartCaptureConfirm && window.showSmartCaptureConfirm.__shV107
            && window.mergeCaptureFieldsForGemini && window.mergeCaptureFieldsForGemini.__shV106);
    }

    if (!window.__shOcrPatchTimerV107) {
        var tries = 0;
        window.__shOcrPatchTimerV107 = setInterval(function () {
            tries += 1;
            if (patchOnce() || tries > 50) {
                clearInterval(window.__shOcrPatchTimerV107);
                window.__shOcrPatchTimerV107 = null;
            }
        }, 400);
        patchOnce();
    } else {
        patchOnce();
    }

    function runWebOcrFromDataUrl(dataUrl) {
        if (!dataUrl) return;
        window._smartCaptureAbort = false;
        if (!window._smartCaptureLetturaMode && !window._smartCaptureNotturnoGiornalieroMode) {
            window._smartCaptureTankMode = true;
        }
        if (typeof window.ensureGeminiApiKeySaved === 'function') window.ensureGeminiApiKeySaved();
        if (typeof window.ensureGeminiKeysNeverLost === 'function') {
            try { window.ensureGeminiKeysNeverLost(); } catch (eK) {}
        }
        shLog('foto ' + (dataUrl ? dataUrl.length : 0));
        if (typeof window.runSmartCaptureOnFiles === 'function') {
            var file = dataUrlToFile(dataUrl);
            shLog('onFiles ' + (file && file.size ? file.size : 0));
            Promise.resolve(window.runSmartCaptureOnFiles([file])).then(function () {
                try { console.log('[SH OCR] onFiles ok'); } catch (e1) {}
            }, function (err) {
                try { console.log('[SH OCR] onFiles fail', err && err.message); } catch (e2) {}
                if (!window._smartCaptureAbort && window.buildSmartCaptureFailureResult) {
                    window.finishSmartCapture(window.buildSmartCaptureFailureResult(err));
                }
            });
            return;
        }
        if (typeof window.runSmartCaptureAnalysis === 'function') {
            var imageData = { data: dataUrl, type: 'image/jpeg', name: 'camera.jpg' };
            window._smartCapturePhotoData = imageData;
            Promise.resolve(window.runSmartCaptureAnalysis(imageData)).then(function (parsed) {
                if (!window._smartCaptureAbort) window.finishSmartCapture(parsed);
            }, function (err) {
                if (!window._smartCaptureAbort && window.buildSmartCaptureFailureResult) {
                    window.finishSmartCapture(window.buildSmartCaptureFailureResult(err));
                }
            });
        }
    }

    window.__shOcrPull = function () {
        try {
            var br = window.ServiceHubAndroidSpen;
            var n = br && br.ocrJpegLen ? (br.ocrJpegLen() | 0) : 0;
            shLog('pull ' + n);
            if (n < 80) {
                if (window.__shNativeOcrError) window.__shNativeOcrError('Foto vuota');
                return;
            }
            var parts = [];
            var i = 0;
            while (i < n) {
                parts.push(br.ocrJpegSlice(i, 160000) || '');
                i += 160000;
            }
            runWebOcrFromDataUrl('data:image/jpeg;base64,' + parts.join(''));
        } catch (e) {
            if (window.__shNativeOcrError) window.__shNativeOcrError(e.message || 'Foto');
        }
    };
    window.__shNativeOcrPhoto = function (dataUrl) { runWebOcrFromDataUrl(dataUrl); };
    window.__shNativeOcrError = function (msg) {
        if (typeof window.setSmartCaptureLoading === 'function') window.setSmartCaptureLoading(false);
        if (window.finishSmartCapture && window.buildSmartCaptureFailureResult) {
            window.finishSmartCapture(window.buildSmartCaptureFailureResult(new Error(msg || 'OCR')));
        }
    };

    window.smartCaptureFromCamera = function () {
        var menu = document.getElementById('smart-capture-menu');
        if (menu) menu.classList.remove('open');
        if (!window._smartCaptureLetturaMode && !window._smartCaptureNotturnoGiornalieroMode) {
            window._smartCaptureTankMode = true;
        }
        window._smartCaptureAbort = false;
        if (typeof window.ensureGeminiApiKeySaved === 'function') window.ensureGeminiApiKeySaved();
        if (window.ServiceHubAndroidSpen && typeof window.ServiceHubAndroidSpen.startOcrCamera === 'function') {
            if (typeof window.setSmartCaptureLoading === 'function') {
                window.setSmartCaptureLoading(true, 'Fotocamera…');
            }
            try { window.ServiceHubAndroidSpen.startOcrCamera(); } catch (eCam) {}
            return;
        }
        if (typeof window.smartCaptureFromGallery === 'function') window.smartCaptureFromGallery();
    };

    window.__shOcrBootV100 = true;
})();
