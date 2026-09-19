/**
 * ServiceHub — Rapportini da file di lavoro (Word, Excel, PDF, …).
 * Il file resta identico all'originale; dove possibile i {{segnaposto}} si riempiono dai dati impianto.
 */
(function (window) {
    'use strict';

    var META_KEY = 'servicehub_word_rapportini_meta_v1';
    var IDB_NAME = 'servicehub_word_rapportini_v1';
    var IDB_STORE = 'templates';
    var DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    var XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    var PDF_MIME = 'application/pdf';
    var MAX_BYTES = 20 * 1024 * 1024;

    /** Estensioni ammesse (file di lavoro). */
    var WORK_EXT_RE = /\.(docx?|docm|xlsx?|xlsm|xlsb|pdf|odt|ods|odp|csv|txt|rtf|pptx?|pptm|ppsx?|pages|numbers|key|tsv|xml|json)$/i;
    var BLOCKED_EXT_RE = /\.(exe|msi|bat|cmd|ps1|scr|js|mjs|html?|htm|php|sh|dll|com|vbs|wsf|apk|dmg)$/i;
    var FILLABLE_EXT = { docx: 1, docm: 1, xlsx: 1, xlsm: 1, csv: 1, tsv: 1, txt: 1, rtf: 1, pdf: 1, json: 1, xml: 1 };

    var MIME_BY_EXT = {
        docx: DOCX_MIME,
        docm: 'application/vnd.ms-word.document.macroEnabled.12',
        doc: 'application/msword',
        xlsx: XLSX_MIME,
        xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
        xls: 'application/vnd.ms-excel',
        xlsb: 'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
        pdf: PDF_MIME,
        csv: 'text/csv',
        tsv: 'text/tab-separated-values',
        txt: 'text/plain',
        rtf: 'application/rtf',
        odt: 'application/vnd.oasis.opendocument.text',
        ods: 'application/vnd.oasis.opendocument.spreadsheet',
        odp: 'application/vnd.oasis.opendocument.presentation',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ppt: 'application/vnd.ms-powerpoint',
        json: 'application/json',
        xml: 'application/xml'
    };

    function fileExt(name) {
        var m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
        return m ? m[1] : '';
    }

    function mimeFor(name, fallback) {
        var ext = fileExt(name);
        return MIME_BY_EXT[ext] || fallback || 'application/octet-stream';
    }

    function isAllowedWorkFile(file) {
        var name = String((file && file.name) || '');
        var lower = name.toLowerCase();
        if (BLOCKED_EXT_RE.test(lower)) return false;
        if (WORK_EXT_RE.test(lower)) return true;
        var t = String((file && file.type) || '').toLowerCase();
        if (!t) return !!lower; // nome senza estensione: accetta, classificato come generico
        if (/^(application|text)\//.test(t) && t.indexOf('javascript') < 0 && t.indexOf('html') < 0) return true;
        if (t.indexOf('pdf') >= 0 || t.indexOf('sheet') >= 0 || t.indexOf('excel') >= 0 ||
            t.indexOf('word') >= 0 || t.indexOf('officedocument') >= 0 || t.indexOf('opendocument') >= 0) {
            return true;
        }
        return false;
    }

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

    function loadScriptOnce(src, check) {
        return new Promise(function (resolve, reject) {
            if (check()) {
                resolve(true);
                return;
            }
            var existing = document.querySelector('script[data-sh-lib="' + src + '"]');
            if (existing) {
                existing.addEventListener('load', function () { resolve(true); });
                existing.addEventListener('error', function () { reject(new Error('Caricamento libreria fallito')); });
                return;
            }
            var s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.setAttribute('data-sh-lib', src);
            s.onload = function () { resolve(true); };
            s.onerror = function () { reject(new Error('Caricamento libreria fallito')); };
            document.head.appendChild(s);
        });
    }

    function ensureDocxLibs() {
        return Promise.all([
            loadScriptOnce('https://cdn.jsdelivr.net/npm/pizzip@3.2.0/dist/pizzip.js', function () { return !!window.PizZip; }),
            loadScriptOnce('https://cdn.jsdelivr.net/npm/docxtemplater@3.55.9/build/docxtemplater.js', function () {
                return !!(window.docxtemplater || window.Docxtemplater);
            })
        ]).then(function () {
            if (!window.PizZip || !(window.docxtemplater || window.Docxtemplater)) {
                throw new Error('Librerie Word non caricate');
            }
            return true;
        });
    }

    function ensureXlsxLib() {
        return loadScriptOnce('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', function () {
            return !!(window.XLSX && window.XLSX.read);
        }).then(function () {
            if (!(window.XLSX && window.XLSX.read)) throw new Error('Libreria Excel non caricata');
            return true;
        });
    }

    function getDocxtemplaterCtor() {
        return window.docxtemplater || window.Docxtemplater;
    }

    function replacePlaceholdersInText(text, data) {
        if (text == null) return text;
        var s = String(text);
        if (s.indexOf('{{') < 0) return s;
        return s.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, function (_, rawKey) {
            var key = String(rawKey || '').trim();
            if (!key) return '';
            if (data[key] != null) return String(data[key]);
            var compact = key.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
            if (compact && data[compact] != null) return String(data[compact]);
            var up = key.toUpperCase();
            if (data[up] != null) return String(data[up]);
            return '';
        });
    }

    function datedOutName(baseName, ext) {
        var dateStr = (typeof window.formatLetturaDateIt === 'function'
            ? window.formatLetturaDateIt(new Date())
            : new Date().toLocaleDateString('it-IT')).replace(/\//g, '-');
        var safeName = String(baseName || 'Rapportino').replace(/[\\/:*?"<>|]+/g, ' ').trim();
        return safeName + ' ' + dateStr + '.' + ext;
    }

    async function fillDocxBuffer(buffer, data) {
        await ensureDocxLibs();
        var zip = new window.PizZip(buffer);
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
            console.warn('[ServiceHub] docxtemplater:', err && err.message);
            throw new Error('Controlla i segnaposto nel Word (es. {{DATA}}, {{SG9400A}}).');
        }
        return doc.getZip().generate({
            type: 'arraybuffer',
            mimeType: DOCX_MIME,
            compression: 'DEFLATE'
        });
    }

    async function fillXlsxBuffer(buffer, data) {
        await ensureXlsxLib();
        var wb = window.XLSX.read(buffer, { type: 'array', cellStyles: true, bookVBA: true });
        (wb.SheetNames || []).forEach(function (sheetName) {
            var sheet = wb.Sheets[sheetName];
            if (!sheet) return;
            Object.keys(sheet).forEach(function (addr) {
                if (!addr || addr.charAt(0) === '!') return;
                var cell = sheet[addr];
                if (!cell || cell.v == null) return;
                if (typeof cell.v === 'string' && cell.v.indexOf('{{') >= 0) {
                    cell.v = replacePlaceholdersInText(cell.v, data);
                    cell.t = 's';
                    delete cell.w;
                }
            });
        });
        return window.XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true });
    }

    function fillTextBuffer(buffer, data) {
        var decoder = new TextDecoder('utf-8');
        var text = decoder.decode(buffer);
        var out = replacePlaceholdersInText(text, data);
        return new TextEncoder().encode(out).buffer;
    }

    /** PDF: sostituzione testuale dei {{tag}} se presenti come testo semplice nel file. */
    function fillPdfBuffer(buffer, data) {
        var bytes = new Uint8Array(buffer);
        var bin = '';
        for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        if (bin.indexOf('{{') < 0) return buffer;
        var keys = Object.keys(data || {}).sort(function (a, b) { return b.length - a.length; });
        keys.forEach(function (key) {
            var token = '{{' + key + '}}';
            if (bin.indexOf(token) < 0) return;
            var val = String(data[key] == null ? '' : data[key]).replace(/[^\x20-\x7E]/g, '?');
            bin = bin.split(token).join(val);
        });
        var out = new Uint8Array(bin.length);
        for (var j = 0; j < bin.length; j++) out[j] = bin.charCodeAt(j) & 0xff;
        return out.buffer;
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

        // Tutti i serbatoi / livelli dall'interfaccia (stoccaggio + liste note)
        function addPlantField(fieldId, label) {
            if (!fieldId) return;
            var v = '';
            if (typeof window.readRapportinoPlantFieldValue === 'function') {
                v = window.readRapportinoPlantFieldValue(fieldId) || '';
            }
            if (!v) {
                var el = document.getElementById(fieldId);
                if (el) v = String(el.value != null ? el.value : (el.textContent || '')).trim();
            }
            if (!v && typeof window.__readPlantBackupLocal === 'function') {
                var bk = window.__readPlantBackupLocal();
                if (bk && bk[fieldId] != null) v = String(bk[fieldId]).trim();
            }
            putVal(map, fieldId, v);
            if (label) {
                putVal(map, label, v);
                putVal(map, String(label).replace(/\s+/g, ''), v);
                putVal(map, String(label).replace(/\s+/g, '_'), v);
            }
            // es. inp-tk9201 → TK9201, tk9201
            var short = String(fieldId).replace(/^inp-/i, '').replace(/^val-/i, '');
            if (short) {
                putVal(map, short, v);
                putVal(map, short.toUpperCase(), v);
            }
        }

        (window.LETTURE_STOCCAGGIO_CALDAIA_D_SERBATOI || []).forEach(function (row) {
            if (row) addPlantField(row.fieldId, row.label);
        });
        (window.LETTURE_STOCCAGGIO_CALDAIA_D_CALDAIA || []).forEach(function (row) {
            if (row) addPlantField(row.fieldId, row.label);
        });
        (window.STOCCAGGIO_INTERNO_TANKS || []).forEach(function (t) {
            if (t) addPlantField(t.fieldId, t.label || t.name);
        });
        [
            'inp-tk9000', 'inp-tk9201', 'inp-tk9204', 'inp-tk9205', 'inp-tk10000',
            'inp-tk10601a', 'inp-tk10601b', 'inp-tk10602', 'inp-tk10602a', 'inp-tk10604',
            'inp-tk10605', 'inp-tk10606a', 'inp-tk10606b', 'inp-tk10607', 'inp-tk10608',
            'inp-s133', 'inp-s121', 'inp-s864', 'inp-s818', 'inp-s817', 'inp-s813', 'inp-s819',
            'inp-a10605', 'inp-tk8066', 'inp-tk8063', 'inp-tk8092', 'inp-bacino-tk8092', 'inp-bacino-tk8093',
            'inp-tk11039', 'inp-tk11038', 'inp-tk11037', 'inp-tk11019',
            'inp-a-prod', 'inp-d-prod', 'cfil-produzione'
        ].forEach(function (fid) { addPlantField(fid); });

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

    window.getWordRapportinoForRole = function () {
        return null;
    };

    window.saveWordRapportinoFromFile = async function (opts) {
        opts = opts || {};
        var name = String(opts.name || '').trim();
        var file = opts.file;
        if (!name) throw new Error('Inserisci un nome');
        if (!file) throw new Error('Seleziona un file ufficiale');
        if (!isAllowedWorkFile(file)) {
            throw new Error('Formato non ammesso. Usa Word, Excel, PDF, OpenDocument, CSV, testo, PowerPoint, …');
        }
        var buf = await fileToArrayBuffer(file);
        if (!buf || !buf.byteLength) throw new Error('File vuoto');
        if (buf.byteLength > MAX_BYTES) throw new Error('File troppo grande (max 20 MB)');

        var ext = fileExt(file.name) || 'bin';
        var mime = mimeFor(file.name, file.type || 'application/octet-stream');
        var list = loadMeta();
        var id = opts.id || uid();
        var existing = list.find(function (x) { return x.id === id; });
        var now = Date.now();
        var meta = {
            id: id,
            name: name,
            fileName: file.name || (name + '.' + ext),
            ext: ext,
            mime: mime,
            size: buf.byteLength,
            fillable: !!FILLABLE_EXT[ext],
            createdAt: (existing && existing.createdAt) || now,
            updatedAt: now
        };
        await idbPut({ id: id, buffer: buf, fileName: meta.fileName, mime: mime, ext: ext });
        if (existing) {
            list = list.map(function (x) { return x.id === id ? meta : x; });
        } else {
            list.push(meta);
        }
        // Pulisci eventuali vecchi flag "role" (non più usati)
        list = list.map(function (m) {
            if (!m) return m;
            var copy = Object.assign({}, m);
            delete copy.role;
            return copy;
        });
        saveMeta(list);
        return meta;
    };

    window.deleteWordRapportino = async function (id) {
        if (!id) return;
        await idbDelete(id);
        saveMeta(loadMeta().filter(function (x) { return x && x.id !== id; }));
    };

    window.fillWordRapportinoTemplate = async function (id, dataOverride) {
        var rec = await idbGet(id);
        if (!rec || !rec.buffer) throw new Error('File rapportino non trovato');
        var meta = window.getWordRapportinoMeta(id) || {};
        var ext = (meta.ext || rec.ext || fileExt(meta.fileName || rec.fileName) || 'bin').toLowerCase();
        var mime = meta.mime || rec.mime || mimeFor(meta.fileName || rec.fileName);
        var data = dataOverride || window.buildWordRapportinoDataMap() || {};
        var outBuf = rec.buffer;
        var outExt = ext;
        var outMime = mime;
        var filled = false;

        if (ext === 'docx' || ext === 'docm') {
            outBuf = await fillDocxBuffer(rec.buffer, data);
            outExt = 'docx';
            outMime = DOCX_MIME;
            filled = true;
        } else if (ext === 'xlsx' || ext === 'xlsm') {
            outBuf = await fillXlsxBuffer(rec.buffer, data);
            outExt = 'xlsx';
            outMime = XLSX_MIME;
            filled = true;
        } else if (ext === 'csv' || ext === 'tsv' || ext === 'txt' || ext === 'rtf' || ext === 'json' || ext === 'xml') {
            outBuf = fillTextBuffer(rec.buffer, data);
            filled = true;
        } else if (ext === 'pdf') {
            outBuf = fillPdfBuffer(rec.buffer, data);
            outMime = PDF_MIME;
            filled = true;
        } else {
            // .doc / .xls / .ppt / odt / … : file identico, senza merge automatico
            filled = false;
        }

        var fileName = datedOutName(meta.name || 'Rapportino', outExt);
        var file = new File([outBuf], fileName, { type: outMime });
        file.__shFilled = filled;
        file.__shExt = outExt;
        return file;
    };

    window.buildSituazioneGiornalieraWordFileFromTemplate = async function () {
        return null;
    };

    window.renderWordRapportiniList = function () {
        var host = document.getElementById('word-rapportini-list');
        if (!host) return;
        var list = window.listWordRapportini();
        if (!list.length) {
            host.innerHTML = '<p class="word-rapp-empty">Nessun file ufficiale. Premi «Aggiungi rapportino», dagli un nome e carica il documento (Word/Excel/PDF…). Quello è il modello di stampa.</p>';
            return;
        }
        host.innerHTML = list.map(function (m) {
            var sizeKb = m.size ? Math.max(1, Math.round(m.size / 1024)) + ' KB' : '';
            var extLabel = (m.ext || fileExt(m.fileName) || '').toUpperCase();
            return '<div class="word-rapp-item" data-id="' + m.id + '">' +
                '<button type="button" class="word-rapp-open" data-action="open" data-id="' + m.id + '">' +
                '<span class="word-rapp-name">' + escapeHtml(m.name) +
                (extLabel ? ' <span class="word-rapp-ext">' + escapeHtml(extLabel) + '</span>' : '') +
                '</span>' +
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
        var title = document.getElementById('word-rapp-add-title');
        var err = document.getElementById('word-rapp-add-error');
        if (err) { err.style.display = 'none'; err.textContent = ''; }
        if (fileInp) fileInp.value = '';
        modal.dataset.editId = editId || '';
        var existing = editId ? window.getWordRapportinoMeta(editId) : null;
        if (nameInp) nameInp.value = existing ? existing.name : '';
        if (title) title.textContent = existing ? 'Sostituisci / rinomina rapportino' : 'Aggiungi rapportino';
        var fileHint = document.getElementById('word-rapp-file-hint');
        if (fileHint) {
            fileHint.textContent = existing
                ? 'Lascia vuoto per tenere il file attuale, oppure carica il nuovo file ufficiale.'
                : 'Il file che carichi è il documento ufficiale. In stampa resta uguale: ci mettiamo solo i valori dall’interfaccia.';
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
        var err = document.getElementById('word-rapp-add-error');
        var editId = modal && modal.dataset.editId;
        var name = nameInp ? String(nameInp.value || '').trim() : '';
        var file = fileInp && fileInp.files && fileInp.files[0];
        function showErr(msg) {
            if (err) { err.textContent = msg; err.style.display = 'block'; }
            else toast(msg, true);
        }
        if (!name) { showErr('Inserisci il nome del rapportino.'); return; }
        if (!editId && !file) { showErr('Seleziona il file ufficiale.'); return; }
        try {
            if (editId && !file) {
                var list = loadMeta().map(function (m) {
                    if (!m || m.id !== editId) return m;
                    var copy = Object.assign({}, m, { name: name, updatedAt: Date.now() });
                    delete copy.role;
                    return copy;
                });
                saveMeta(list);
            } else {
                await window.saveWordRapportinoFromFile({
                    id: editId || undefined,
                    name: name,
                    file: file
                });
            }
            window.closeAggiungiWordRapportinoModal();
            window.renderWordRapportiniList();
            toast('Documento ufficiale salvato.');
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
        if (shareBtn) shareBtn.textContent = 'Stampa / Esporta compilato';
        var body = document.getElementById('letture-doc-body');
        if (body) {
            var helpKeys = (window.listWordRapportiniPlaceholdersHelp() || []).slice(0, 48);
            var ext = (meta.ext || fileExt(meta.fileName) || '').toLowerCase();
            var canFill = !!FILLABLE_EXT[ext];
            var fillHint = canFill
                ? 'Una sola volta nel file ufficiale, dove devono comparire i livelli, metti la sigla tra doppie graffe — es. <code>{{TK9201}}</code>, <code>{{TK9000}}</code>, <code>{{DATA}}</code>. Poi ogni stampa prende in automatico i valori attuali dall’interfaccia: layout uguale all’originale, solo i numeri cambiano.'
                : 'Questo formato viene esportato identico all’originale. Per riempire i livelli in automatico usa preferibilmente .docx o .xlsx con segnaposto tipo <code>{{TK9201}}</code>.';
            body.innerHTML =
                '<div class="word-rapp-panel">' +
                '<p class="word-rapp-panel-lead">Questo <b>è</b> il documento ufficiale che hai caricato. La stampa finale è lo stesso file, con i livelli/serbatoi presi dall’interfaccia.</p>' +
                '<p class="word-rapp-panel-file">' + escapeHtml(meta.fileName || '') + '</p>' +
                '<p class="word-rapp-panel-hint">' + fillHint + '</p>' +
                '<div class="word-rapp-actions">' +
                '<button type="button" class="letture-share-btn" id="word-rapp-replace-btn">Sostituisci file / rinomina</button>' +
                '<button type="button" class="letture-share-btn" id="word-rapp-placeholders-btn">Sigle disponibili</button>' +
                '</div>' +
                '<pre class="word-rapp-placeholders" id="word-rapp-placeholders-box" style="display:none">' +
                escapeHtml(helpKeys.join('\n')) +
                (helpKeys.length >= 48 ? '\n…' : '') +
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
            if (file.__shFilled) {
                toast('File ufficiale compilato: stesso layout, valori presi dall’interfaccia. Aprilo e stampa.');
            } else {
                toast('File ufficiale esportato (formato senza riempimento automatico dei livelli).');
            }
            return true;
        } catch (err) {
            console.warn('[ServiceHub] share word:', err);
            toast((err && err.message) || 'Generazione file fallita', true);
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
