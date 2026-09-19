/**
 * ServiceHub — Rapportini Word (.docx) caricati dall'utente.
 * Template identico al file originale; i segnaposto {{chiave}} si riempiono dai dati impianto.
 */
(function (window) {
    'use strict';

    var META_KEY = 'servicehub_word_rapportini_meta_v1';
    var IDB_NAME = 'servicehub_word_rapportini_v1';
    var IDB_STORE = 'templates';
    var DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    function toast(msg, isErr) {
        if (typeof window.__serviceHubFlashToast === 'function') {
            window.__serviceHubFlashToast(msg, !!isErr, isErr ? 'err' : 'ok');
        } else {
            alert(msg);
        }
    }

    function uid() {
        return 'wr-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }

    function loadMeta() {
        try {
            var raw = localStorage.getItem(META_KEY);
            var arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (_) {
            return [];
        }
    }

    function saveMeta(list) {
        try {
            localStorage.setItem(META_KEY, JSON.stringify(list || []));
        } catch (err) {
            console.warn('[ServiceHub] word meta save:', err && err.message);
            toast('Spazio insufficiente per salvare l\'elenco rapportini.', true);
        }
    }

    function openIdb() {
        return new Promise(function (resolve, reject) {
            if (!window.indexedDB) {
                reject(new Error('IndexedDB non disponibile'));
                return;
            }
            var req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = function () {
                var db = req.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error || new Error('IDB open fail')); };
        });
    }

    function idbPut(record) {
        return openIdb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).put(record);
                tx.oncomplete = function () { resolve(true); };
                tx.onerror = function () { reject(tx.error); };
            });
        });
    }

    function idbGet(id) {
        return openIdb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(IDB_STORE, 'readonly');
                var req = tx.objectStore(IDB_STORE).get(id);
                req.onsuccess = function () { resolve(req.result || null); };
                req.onerror = function () { reject(req.error); };
            });
        });
    }

    function idbDelete(id) {
        return openIdb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).delete(id);
                tx.oncomplete = function () { resolve(true); };
                tx.onerror = function () { reject(tx.error); };
            });
        });
    }

    function fileToArrayBuffer(file) {
        return new Promise(function (resolve, reject) {
            if (!file) {
                reject(new Error('Nessun file'));
                return;
            }
            if (file.arrayBuffer) {
                file.arrayBuffer().then(resolve, reject);
                return;
            }
            var fr = new FileReader();
            fr.onload = function () { resolve(fr.result); };
            fr.onerror = function () { reject(fr.error || new Error('Lettura file fallita')); };
            fr.readAsArrayBuffer(file);
        });
    }

    function ensureDocxLibs() {
        return new Promise(function (resolve, reject) {
            if (window.PizZip && (window.docxtemplater || window.Docxtemplater)) {
                resolve(true);
                return;
            }
            var pending = 2;
            var failed = false;
            function done() {
                pending -= 1;
                if (pending > 0) return;
                if (failed || !window.PizZip || !(window.docxtemplater || window.Docxtemplater)) {
                    reject(new Error('Librerie Word non caricate'));
                } else {
                    resolve(true);
                }
            }
            function load(src, check) {
                if (check()) {
                    done();
                    return;
                }
                var s = document.createElement('script');
                s.src = src;
                s.async = true;
                s.onload = done;
                s.onerror = function () { failed = true; done(); };
                document.head.appendChild(s);
            }
            load('https://cdn.jsdelivr.net/npm/pizzip@3.2.0/dist/pizzip.js', function () { return !!window.PizZip; });
            load('https://cdn.jsdelivr.net/npm/docxtemplater@3.55.9/build/docxtemplater.js', function () {
                return !!(window.docxtemplater || window.Docxtemplater);
            });
        });
    }

    function getDocxtemplaterCtor() {
        return window.docxtemplater || window.Docxtemplater;
    }

    function putVal(map, key, val) {
        if (!key) return;
        var s = val == null ? '' : String(val).trim();
        var k = String(key).trim();
        if (!k) return;
        if (map[k] == null || map[k] === '') map[k] = s;
        var compact = k.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
        if (compact && (map[compact] == null || map[compact] === '')) map[compact] = s;
        var upper = k.toUpperCase();
        if (upper !== k && (map[upper] == null || map[upper] === '')) map[upper] = s;
    }

    /** Mappa piatta per {{segnaposto}} — dati Situazione giornaliera + campi impianto collegati. */
    window.buildWordRapportinoDataMap = function () {
        var map = {};
        var dateStr = typeof window.formatLetturaDateIt === 'function'
            ? window.formatLetturaDateIt(new Date())
            : new Date().toLocaleDateString('it-IT');
        var now = new Date();
        var ora = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        putVal(map, 'DATA', dateStr);
        putVal(map, 'DATA_IT', dateStr);
        putVal(map, 'DATE', dateStr);
        putVal(map, 'ORA', ora);
        putVal(map, 'TIME', ora);

        if (typeof window.syncSituazioneGiornalieraFromPlant === 'function') {
            try { window.syncSituazioneGiornalieraFromPlant({ force: true }); } catch (_) {}
        }
        if (typeof window.flushSituazioneGiornalieraPreviewToSnapshot === 'function') {
            try { window.flushSituazioneGiornalieraPreviewToSnapshot(); } catch (_) {}
        }

        function addRowValue(row, opts) {
            opts = opts || {};
            if (!row) return;
            var val = '';
            if (typeof window.readSituazioneGiornalieraCellValue === 'function') {
                val = window.readSituazioneGiornalieraCellValue(row, opts) || '';
            }
            putVal(map, row.key, val);
            if (row.fieldId) putVal(map, row.fieldId, val);
            if (row.label) putVal(map, row.label, val);
            if (row.statusId) putVal(map, row.statusId, val);
            if (row.headerId) putVal(map, row.headerId, val);
        }

        (window.LETTURE_SITUAZIONE_GIORNALIERA_TOP || []).forEach(function (row) {
            if (!row) return;
            if (row.type === 'pair') {
                addRowValue(row);
                var condVal = '';
                if (row.condFieldId && typeof window.readSituazioneGiornalieraCondValue === 'function') {
                    condVal = window.readSituazioneGiornalieraCondValue(row.condFieldId) || '';
                } else if (typeof window.readSituazioneGiornalieraCellValue === 'function') {
                    condVal = window.readSituazioneGiornalieraCellValue(row, {
                        subKey: row.key + '-cond',
                        fieldId: row.condOverlap ? null : row.condFieldId
                    }) || '';
                }
                putVal(map, row.key + '-cond', condVal);
                putVal(map, row.key + '_cond', condVal);
                if (row.condFieldId) {
                    putVal(map, row.condFieldId + '__cond', condVal);
                    putVal(map, row.condFieldId + '-cond', condVal);
                }
            } else if (row.type === 'dual') {
                var v1 = typeof window.readSituazioneGiornalieraCellValue === 'function'
                    ? window.readSituazioneGiornalieraCellValue(row, { subKey: row.key1 }) : '';
                var v2 = typeof window.readSituazioneGiornalieraCellValue === 'function'
                    ? window.readSituazioneGiornalieraCellValue(row, { subKey: row.key2 }) : '';
                putVal(map, row.key1, v1);
                putVal(map, row.key2, v2);
                putVal(map, row.key, v1);
                if (row.label) putVal(map, row.label, v1);
            } else if (row.type === 'torcia' && row.rows) {
                row.rows.forEach(function (tr) {
                    addRowValue({ key: tr.key, label: tr.subLabel || tr.key });
                });
            } else if (row.type === 'n2block' && row.items) {
                row.items.forEach(function (it) {
                    addRowValue({ key: it.key, fieldId: it.fieldId, label: it.subLabel || it.key });
                });
            } else {
                addRowValue(row);
            }
        });

        (window.LETTURE_SITUAZIONE_GIORNALIERA_BOTTOM || []).forEach(function (row) {
            addRowValue(row);
        });
        (window.LETTURE_SITUAZIONE_GIORNALIERA_SIDE || []).forEach(function (row) {
            addRowValue(row);
        });
        (window.LETTURE_SITUAZIONE_GIORNALIERA_FOOTER || []).forEach(function (row) {
            addRowValue(row);
        });

        var sources = window.SITUAZIONE_GIORNALIERA_FIELD_SOURCES || {};
        Object.keys(sources).forEach(function (fieldId) {
            if (map[fieldId] != null && map[fieldId] !== '') return;
            var v = '';
            if (typeof window.readRapportinoPlantFieldValue === 'function') {
                v = window.readRapportinoPlantFieldValue(fieldId) || '';
            }
            putVal(map, fieldId, v);
        });

        return map;
    };

    window.listWordRapportiniPlaceholdersHelp = function () {
        var map = window.buildWordRapportinoDataMap() || {};
        return Object.keys(map).sort().map(function (k) {
            return '{{' + k + '}}';
        });
    };

    window.listWordRapportini = function () {
        return loadMeta().slice().sort(function (a, b) {
            return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
        });
    };

    window.getWordRapportinoMeta = function (id) {
        return loadMeta().find(function (x) { return x && x.id === id; }) || null;
    };

    window.getWordRapportinoForRole = function (role) {
        if (!role) return null;
        return loadMeta().find(function (x) { return x && x.role === role; }) || null;
    };

    window.saveWordRapportinoFromFile = async function (opts) {
        opts = opts || {};
        var name = String(opts.name || '').trim();
        var file = opts.file;
        if (!name) throw new Error('Inserisci un nome');
        if (!file) throw new Error('Seleziona un file Word (.docx)');
        var lower = String(file.name || '').toLowerCase();
        if (lower && !/\.docx$/i.test(lower) && file.type && file.type.indexOf('wordprocessingml') < 0) {
            throw new Error('Serve un file .docx (Word)');
        }
        var buf = await fileToArrayBuffer(file);
        if (!buf || !buf.byteLength) throw new Error('File vuoto');
        if (buf.byteLength > 12 * 1024 * 1024) throw new Error('File troppo grande (max 12 MB)');

        var role = opts.role || '';
        var list = loadMeta();
        if (role) {
            list.forEach(function (m) {
                if (m && m.role === role) m.role = '';
            });
        }
        var id = opts.id || uid();
        var existing = list.find(function (x) { return x.id === id; });
        var now = Date.now();
        var meta = {
            id: id,
            name: name,
            fileName: file.name || (name + '.docx'),
            size: buf.byteLength,
            role: role || (existing && existing.role) || '',
            createdAt: (existing && existing.createdAt) || now,
            updatedAt: now
        };
        await idbPut({ id: id, buffer: buf, fileName: meta.fileName, mime: DOCX_MIME });
        if (existing) {
            list = list.map(function (x) { return x.id === id ? meta : x; });
        } else {
            list.push(meta);
        }
        saveMeta(list);
        return meta;
    };

    window.deleteWordRapportino = async function (id) {
        if (!id) return;
        await idbDelete(id);
        saveMeta(loadMeta().filter(function (x) { return x && x.id !== id; }));
    };

    window.fillWordRapportinoTemplate = async function (id, dataOverride) {
        await ensureDocxLibs();
        var rec = await idbGet(id);
        if (!rec || !rec.buffer) throw new Error('Template Word non trovato');
        var data = dataOverride || window.buildWordRapportinoDataMap() || {};
        var zip = new window.PizZip(rec.buffer);
        var Docx = getDocxtemplaterCtor();
        var doc = new Docx(zip, {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: '{{', end: '}}' },
            nullGetter: function () { return ''; }
        });
        try {
            doc.render(data);
        } catch (err) {
            // Tag spezzati in Word: riprova dopo merge run, altrimenti esporta comunque il file
            console.warn('[ServiceHub] docxtemplater:', err && err.message);
            try {
                doc = new Docx(zip, {
                    paragraphLoop: true,
                    linebreaks: true,
                    delimiters: { start: '{{', end: '}}' },
                    nullGetter: function () { return ''; }
                });
                doc.render(data);
            } catch (err2) {
                throw new Error('Controlla i segnaposto nel Word (es. {{DATA}}, {{SG9400A}}). ' +
                    (err2 && err2.message ? err2.message : ''));
            }
        }
        var out = doc.getZip().generate({
            type: 'blob',
            mimeType: DOCX_MIME,
            compression: 'DEFLATE'
        });
        var meta = window.getWordRapportinoMeta(id) || {};
        var dateStr = (typeof window.formatLetturaDateIt === 'function'
            ? window.formatLetturaDateIt(new Date())
            : new Date().toLocaleDateString('it-IT')).replace(/\//g, '-');
        var safeName = String(meta.name || 'Rapportino').replace(/[\\/:*?"<>|]+/g, ' ').trim();
        return new File([out], safeName + ' ' + dateStr + '.docx', { type: DOCX_MIME });
    };

    window.buildSituazioneGiornalieraWordFileFromTemplate = async function () {
        var meta = window.getWordRapportinoForRole('situazione-giornaliera');
        if (!meta) return null;
        return window.fillWordRapportinoTemplate(meta.id);
    };

    window.renderWordRapportiniList = function () {
        var host = document.getElementById('word-rapportini-list');
        if (!host) return;
        var list = window.listWordRapportini();
        if (!list.length) {
            host.innerHTML = '<p class="word-rapp-empty">Nessun rapportino Word caricato. Usa «Aggiungi rapportino» e carica il file .docx ufficiale.</p>';
            return;
        }
        host.innerHTML = list.map(function (m) {
            var roleBadge = m.role === 'situazione-giornaliera'
                ? '<span class="word-rapp-badge">Situazione giornaliera</span>'
                : '';
            var sizeKb = m.size ? Math.max(1, Math.round(m.size / 1024)) + ' KB' : '';
            return '<div class="word-rapp-item" data-id="' + m.id + '">' +
                '<button type="button" class="word-rapp-open" data-action="open" data-id="' + m.id + '">' +
                '<span class="word-rapp-name">' + escapeHtml(m.name) + '</span>' +
                roleBadge +
                '<span class="word-rapp-meta">' + escapeHtml(m.fileName || '') + (sizeKb ? ' · ' + sizeKb : '') + '</span>' +
                '</button>' +
                '<button type="button" class="word-rapp-del" data-action="delete" data-id="' + m.id + '" aria-label="Elimina">✕</button>' +
                '</div>';
        }).join('');
        host.querySelectorAll('[data-action="open"]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                window.openWordRapportinoPanel(btn.getAttribute('data-id'));
            });
        });
        host.querySelectorAll('[data-action="delete"]').forEach(function (btn) {
            btn.addEventListener('click', function (ev) {
                ev.stopPropagation();
                var id = btn.getAttribute('data-id');
                var meta = window.getWordRapportinoMeta(id);
                if (!meta) return;
                if (!confirm('Eliminare il rapportino «' + meta.name + '»?')) return;
                window.deleteWordRapportino(id).then(function () {
                    window.renderWordRapportiniList();
                    toast('Rapportino eliminato.');
                }).catch(function (err) {
                    toast((err && err.message) || 'Eliminazione fallita', true);
                });
            });
        });
    };

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    window.openAggiungiWordRapportinoModal = function (editId) {
        var modal = document.getElementById('word-rapportino-add-modal');
        if (!modal) return;
        var nameInp = document.getElementById('word-rapp-name');
        var fileInp = document.getElementById('word-rapp-file');
        var roleChk = document.getElementById('word-rapp-role-sg');
        var title = document.getElementById('word-rapp-add-title');
        var err = document.getElementById('word-rapp-add-error');
        if (err) { err.style.display = 'none'; err.textContent = ''; }
        if (fileInp) fileInp.value = '';
        modal.dataset.editId = editId || '';
        var existing = editId ? window.getWordRapportinoMeta(editId) : null;
        if (nameInp) nameInp.value = existing ? existing.name : '';
        if (roleChk) roleChk.checked = !!(existing && existing.role === 'situazione-giornaliera');
        if (title) title.textContent = existing ? 'Sostituisci / rinomina rapportino' : 'Aggiungi rapportino Word';
        var fileHint = document.getElementById('word-rapp-file-hint');
        if (fileHint) {
            fileHint.textContent = existing
                ? 'Lascia vuoto per tenere il file attuale, oppure carica un nuovo .docx.'
                : 'Carica il file Word ufficiale (.docx). Il layout resta identico all’originale.';
        }
        modal.classList.add('active');
        setTimeout(function () { if (nameInp) nameInp.focus(); }, 50);
    };

    window.closeAggiungiWordRapportinoModal = function () {
        var modal = document.getElementById('word-rapportino-add-modal');
        if (modal) modal.classList.remove('active');
    };

    window.confirmAggiungiWordRapportino = async function () {
        var modal = document.getElementById('word-rapportino-add-modal');
        var nameInp = document.getElementById('word-rapp-name');
        var fileInp = document.getElementById('word-rapp-file');
        var roleChk = document.getElementById('word-rapp-role-sg');
        var err = document.getElementById('word-rapp-add-error');
        var editId = modal && modal.dataset.editId;
        var name = nameInp ? String(nameInp.value || '').trim() : '';
        var file = fileInp && fileInp.files && fileInp.files[0];
        function showErr(msg) {
            if (err) { err.textContent = msg; err.style.display = 'block'; }
            else toast(msg, true);
        }
        if (!name) { showErr('Inserisci il nome del rapportino.'); return; }
        if (!editId && !file) { showErr('Seleziona il file Word (.docx).'); return; }
        try {
            if (editId && !file) {
                var list = loadMeta();
                var role = roleChk && roleChk.checked ? 'situazione-giornaliera' : '';
                if (role) {
                    list.forEach(function (m) {
                        if (m && m.role === role && m.id !== editId) m.role = '';
                    });
                }
                list = list.map(function (m) {
                    if (!m || m.id !== editId) return m;
                    return Object.assign({}, m, { name: name, role: role, updatedAt: Date.now() });
                });
                saveMeta(list);
            } else {
                await window.saveWordRapportinoFromFile({
                    id: editId || undefined,
                    name: name,
                    file: file,
                    role: roleChk && roleChk.checked ? 'situazione-giornaliera' : ''
                });
            }
            window.closeAggiungiWordRapportinoModal();
            window.renderWordRapportiniList();
            toast('Rapportino Word salvato.');
        } catch (e) {
            showErr((e && e.message) || 'Salvataggio fallito');
        }
    };

    window.openWordRapportinoPanel = function (id) {
        var meta = window.getWordRapportinoMeta(id);
        if (!meta) return;
        window.__activeWordRapportinoId = id;
        window.closeLettureRapportiniModal && window.closeLettureRapportiniModal();
        var modal = document.getElementById('letture-doc-modal');
        if (!modal) return;
        window.setLetturaDocKind && window.setLetturaDocKind('word-template');
        var ocrWrap = document.getElementById('letture-doc-ocr-wrap');
        if (ocrWrap) ocrWrap.style.display = 'none';
        var titleEl = document.getElementById('letture-doc-toolbar-title');
        if (titleEl) titleEl.textContent = meta.name;
        var shareBtn = document.querySelector('#letture-doc-modal .letture-share-btn--main');
        if (shareBtn) shareBtn.textContent = 'Genera Word compilato';
        var body = document.getElementById('letture-doc-body');
        if (body) {
            var helpKeys = (window.listWordRapportiniPlaceholdersHelp() || []).slice(0, 40);
            body.innerHTML =
                '<div class="word-rapp-panel">' +
                '<p class="word-rapp-panel-lead">Questo rapportino usa il <b>file Word originale</b> che hai caricato. Layout e grafica restano identici.</p>' +
                '<p class="word-rapp-panel-file">' + escapeHtml(meta.fileName || '') +
                (meta.role === 'situazione-giornaliera' ? ' · collegato a Situazione giornaliera' : '') +
                '</p>' +
                '<p class="word-rapp-panel-hint">Nel documento Word metti i segnaposto dove servono i valori, ad esempio <code>{{DATA}}</code>, <code>{{SG9400A}}</code>, <code>{{inp-a-prod}}</code>, <code>{{TK9201}}</code>. Poi premi «Genera Word compilato».</p>' +
                '<div class="word-rapp-actions">' +
                '<button type="button" class="letture-share-btn" id="word-rapp-replace-btn">Sostituisci file / rinomina</button>' +
                '<button type="button" class="letture-share-btn" id="word-rapp-placeholders-btn">Mostra segnaposto</button>' +
                '</div>' +
                '<pre class="word-rapp-placeholders" id="word-rapp-placeholders-box" style="display:none">' +
                escapeHtml(helpKeys.join('\n')) +
                (helpKeys.length >= 40 ? '\n…' : '') +
                '</pre>' +
                '</div>';
            var rep = document.getElementById('word-rapp-replace-btn');
            if (rep) rep.onclick = function () { window.openAggiungiWordRapportinoModal(id); };
            var ph = document.getElementById('word-rapp-placeholders-btn');
            var box = document.getElementById('word-rapp-placeholders-box');
            if (ph && box) {
                ph.onclick = function () {
                    box.style.display = box.style.display === 'none' ? 'block' : 'none';
                };
            }
        }
        modal.classList.add('active');
    };

    window.shareWordRapportinoDoc = async function (id) {
        id = id || window.__activeWordRapportinoId;
        if (!id) return false;
        try {
            var file = await window.fillWordRapportinoTemplate(id);
            if (!file) return false;
            if (typeof window.canShareLetturaFile === 'function' && window.canShareLetturaFile(file) && navigator.share) {
                try {
                    await navigator.share({ files: [file], title: file.name });
                    return true;
                } catch (err) {
                    if (err && err.name === 'AbortError') return true;
                }
            }
            if (typeof window.downloadLetturaShareFile === 'function') {
                window.downloadLetturaShareFile(file);
            } else {
                var url = URL.createObjectURL(file);
                var a = document.createElement('a');
                a.href = url;
                a.download = file.name;
                a.click();
                setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
            }
            toast('Word compilato scaricato (.docx). Apri con Word: layout identico all’originale.');
            return true;
        } catch (err) {
            console.warn('[ServiceHub] share word:', err);
            toast((err && err.message) || 'Generazione Word fallita', true);
            return false;
        }
    };

    var _origOpenLetture = null;
    window.__hookWordRapportiniIntoLettureModal = function () {
        if (!_origOpenLetture && typeof window.openLettureRapportiniModal === 'function') {
            _origOpenLetture = window.openLettureRapportiniModal;
            window.openLettureRapportiniModal = function () {
                _origOpenLetture();
                window.renderWordRapportiniList();
            };
        }
        window.renderWordRapportiniList();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            window.__hookWordRapportiniIntoLettureModal();
        });
    } else {
        setTimeout(function () { window.__hookWordRapportiniIntoLettureModal(); }, 0);
    }
})(window);
