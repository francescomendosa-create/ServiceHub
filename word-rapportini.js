/**
 * ServiceHub — Rapportini da file di lavoro (Word, Excel, PDF, …).
 * Il file resta identico all'originale; dove possibile i {{segnaposto}} si riempiono dai dati impianto.
 */
(function (window) {
    'use strict';

    var META_KEY = 'servicehub_word_rapportini_meta_v1';
    var DELETED_KEY = 'servicehub_word_rapportini_deleted_v1';
    var IDB_NAME = 'servicehub_word_rapportini_v1';
    var IDB_STORE = 'templates';
    var DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    var XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    var PDF_MIME = 'application/pdf';
    var MAX_BYTES = 20 * 1024 * 1024;
    var DELETE_TOMBSTONE_MS = 30 * 24 * 60 * 60 * 1000; // 30 giorni: non ripristinare da cloud

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

    function loadDeletedMap() {
        try {
            var raw = localStorage.getItem(DELETED_KEY);
            var obj = raw ? JSON.parse(raw) : {};
            if (!obj || typeof obj !== 'object') return {};
            var now = Date.now();
            var cleaned = {};
            Object.keys(obj).forEach(function (id) {
                var ts = Number(obj[id]) || 0;
                if (ts && (now - ts) < DELETE_TOMBSTONE_MS) cleaned[id] = ts;
            });
            return cleaned;
        } catch (_) {
            return {};
        }
    }

    function saveDeletedMap(map) {
        try {
            localStorage.setItem(DELETED_KEY, JSON.stringify(map || {}));
        } catch (_) {}
    }

    function markWordRapportinoDeleted(id) {
        if (!id) return;
        var map = loadDeletedMap();
        map[id] = Date.now();
        saveDeletedMap(map);
    }

    function unmarkWordRapportinoDeleted(id) {
        if (!id) return;
        var map = loadDeletedMap();
        if (map[id]) {
            delete map[id];
            saveDeletedMap(map);
        }
    }

    function isWordRapportinoDeleted(id) {
        if (!id) return false;
        return !!loadDeletedMap()[id];
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

    /** Impronta FNV-1a dei byte: serve a dimostrare che il file resta quello caricato. */
    function bufferChecksum(buffer) {
        var bytes = new Uint8Array(buffer);
        var h = 0x811c9dc5;
        for (var i = 0; i < bytes.length; i++) {
            h ^= bytes[i];
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return h.toString(16);
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
            function ok() {
                try { return typeof check === 'function' ? !!check() : true; } catch (_) { return false; }
            }
            if (ok()) {
                resolve(true);
                return;
            }
            var existing = document.querySelector('script[data-sh-lib="' + src + '"]');
            if (existing) {
                if (existing.getAttribute('data-sh-lib-error') === '1') {
                    reject(new Error('Caricamento libreria fallito: ' + src));
                    return;
                }
                // Se il tag c'è già ma load è già passato, senza poll si resta appesi per sempre
                var tries = 0;
                var timer = setInterval(function () {
                    tries += 1;
                    if (ok() || existing.getAttribute('data-sh-lib-ready') === '1') {
                        clearInterval(timer);
                        if (ok()) resolve(true);
                        else reject(new Error('Libreria non disponibile dopo il caricamento'));
                    } else if (existing.getAttribute('data-sh-lib-error') === '1' || tries > 120) {
                        clearInterval(timer);
                        reject(new Error(tries > 120 ? 'Timeout libreria' : 'Caricamento libreria fallito'));
                    }
                }, 50);
                return;
            }
            var s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.setAttribute('data-sh-lib', src);
            s.onload = function () {
                s.setAttribute('data-sh-lib-ready', '1');
                if (ok()) resolve(true);
                else reject(new Error('Libreria non disponibile dopo il caricamento'));
            };
            s.onerror = function () {
                s.setAttribute('data-sh-lib-error', '1');
                reject(new Error('Caricamento libreria fallito: ' + src));
            };
            document.head.appendChild(s);
        });
    }

    function loadScriptFromCdns(urls, check) {
        var i = 0;
        function next() {
            if (i >= urls.length) {
                return Promise.reject(new Error('Nessun CDN ha caricato la libreria'));
            }
            var url = urls[i++];
            return loadScriptOnce(url, check).catch(function () {
                return next();
            });
        }
        return next();
    }

    function toArrayBuffer(buffer) {
        if (!buffer) throw new Error('File vuoto');
        if (buffer instanceof ArrayBuffer) return buffer;
        if (ArrayBuffer.isView(buffer)) {
            return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        }
        if (typeof Blob !== 'undefined' && buffer instanceof Blob) {
            return buffer.arrayBuffer();
        }
        if (typeof buffer.arrayBuffer === 'function') return buffer.arrayBuffer();
        throw new Error('Formato buffer non supportato');
    }

    /** Rileva il formato reale dal contenuto (molte app salvano HTML/ODT come .doc). */
    function sniffFileKind(buffer, extHint) {
        var ab;
        try {
            if (buffer instanceof ArrayBuffer) ab = buffer;
            else if (ArrayBuffer.isView(buffer)) ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            else return (extHint || '').toLowerCase() || 'bin';
        } catch (_) {
            return (extHint || '').toLowerCase() || 'bin';
        }
        var u8 = new Uint8Array(ab);
        if (u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b) {
            // ZIP: docx / xlsx / odt / …
            try {
                var head = '';
                for (var i = 0; i < Math.min(u8.length, 2000); i++) head += String.fromCharCode(u8[i]);
                if (/word\/document\.xml/i.test(head) || /\[Content_Types\]\.xml/i.test(head) && /wordprocessingml/i.test(head)) return 'docx';
                if (/xl\/workbook\.xml/i.test(head) || /spreadsheetml/i.test(head)) return 'xlsx';
                if (/mimetypeapplication\/vnd\.oasis\.opendocument\.text/i.test(head) || /content\.xml/i.test(head) && /opendocument/i.test(head)) return 'odt';
            } catch (_) {}
            var extZ = (extHint || '').toLowerCase();
            if (extZ === 'docx' || extZ === 'docm' || extZ === 'xlsx' || extZ === 'xlsm' || extZ === 'odt' || extZ === 'ods') return extZ;
            return 'docx';
        }
        if (u8.length >= 5 && u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46) return 'pdf'; // %PDF
        if (u8.length >= 4 && u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0) {
            // OLE Compound: vero .doc / .xls binario
            var extOle = (extHint || '').toLowerCase();
            return extOle === 'xls' || extOle === 'ppt' ? extOle : 'doc-ole';
        }
        // Testo / HTML mascherato da .doc (Word HTML, export ServiceHub, app terze)
        try {
            var probe = '';
            var n = Math.min(u8.length, 512);
            for (var j = 0; j < n; j++) {
                var c = u8[j];
                if (c === 0) break;
                probe += String.fromCharCode(c);
            }
            var p = probe.replace(/^\uFEFF/, '').trim().toLowerCase();
            if (p.indexOf('<!doctype html') === 0 || p.indexOf('<html') === 0 ||
                p.indexOf('<head') === 0 || p.indexOf('xmlns:w="urn:schemas-microsoft-com:office:word"') >= 0 ||
                p.indexOf('content="word.Document"'.toLowerCase()) >= 0) {
                return 'html';
            }
            if (p.charAt(0) === '{' || p.charAt(0) === '[') return 'json';
            if (p.charAt(0) === '<') return 'xml';
        } catch (_) {}
        return (extHint || '').toLowerCase() || 'bin';
    }

    function libUrl(name) {
        try {
            var scripts = document.getElementsByTagName('script');
            for (var i = scripts.length - 1; i >= 0; i--) {
                var src = scripts[i].src || '';
                if (/word-rapportini\.js(\?|$)/i.test(src)) {
                    return src.replace(/[^/]*$/, 'libs/' + name);
                }
            }
        } catch (_) {}
        return 'libs/' + name;
    }

    function ensureDocxLibs() {
        return loadScriptFromCdns([
            libUrl('pizzip.js'),
            'https://cdn.jsdelivr.net/npm/pizzip@3.2.0/dist/pizzip.js'
        ], function () { return !!window.PizZip; }).then(function () {
            return loadScriptFromCdns([
                libUrl('docxtemplater.js'),
                'https://cdn.jsdelivr.net/npm/docxtemplater@3.55.9/build/docxtemplater.js'
            ], function () {
                return !!(window.docxtemplater || window.Docxtemplater);
            });
        }).then(function () {
            if (!window.PizZip || !(window.docxtemplater || window.Docxtemplater)) {
                throw new Error('Librerie Word non caricate');
            }
            return true;
        });
    }

    function ensureXlsxLib() {
        return loadScriptFromCdns([
            libUrl('xlsx.full.min.js'),
            'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
        ], function () {
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
        var zipProbe = new window.PizZip(buffer);
        var hasPlaceholder = false;
        Object.keys(zipProbe.files || {}).forEach(function (path) {
            if (hasPlaceholder) return;
            if (!/\.xml$/i.test(path) || !/^word\//i.test(path)) return;
            try {
                var txt = zipProbe.file(path).asText();
                if (txt && txt.indexOf('{{') >= 0) hasPlaceholder = true;
            } catch (_) {}
        });
        /* Nessun {{segnaposto}}: restituisci i byte ORIGINALI senza ri-zippare. */
        if (!hasPlaceholder) return buffer;

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

    /* XLSX: SheetJS serve SOLO a capire dove vanno i numeri. Riscrivere il workbook
       con XLSX.write perde bordi, larghezze colonne e impostazioni di stampa, quindi
       le celle vengono modificate dentro l'XML originale dello ZIP. */
    async function fillXlsxBuffer(buffer, data) {
        await ensureXlsxLib();
        var wb = window.XLSX.read(buffer, { type: 'array' });
        var editsBySheet = {};
        (wb.SheetNames || []).forEach(function (sheetName) {
            var sheet = wb.Sheets[sheetName];
            if (!sheet) return;
            var edits = {};
            // 1) Segnaposto {{…}}
            Object.keys(sheet).forEach(function (addr) {
                if (!addr || addr.charAt(0) === '!') return;
                var cell = sheet[addr];
                if (!cell || cell.v == null) return;
                if (typeof cell.v === 'string' && cell.v.indexOf('{{') >= 0) {
                    edits[addr] = replacePlaceholdersInText(cell.v, data);
                }
            });
            // 2) Riempimento per etichetta (TK9201 | mm | ___ | cond | ___)
            fillXlsxSheetByLabels(sheet, data, edits);
            if (Object.keys(edits).length) editsBySheet[sheetName] = edits;
        });
        if (!Object.keys(editsBySheet).length) return buffer;
        try {
            return await patchXlsxZipCells(buffer, editsBySheet);
        } catch (err) {
            /* Meglio l'originale senza numeri che un file con layout rifatto. */
            console.warn('[ServiceHub] patch xlsx:', err && err.message);
            return buffer;
        }
    }

    function xmlEscape(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    function xmlUnescape(value) {
        return String(value == null ? '' : value)
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&amp;/g, '&');
    }

    function colLettersToNum(letters) {
        var s = String(letters || '').toUpperCase();
        var n = 0;
        for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
        return n;
    }

    function splitCellRef(addr) {
        var m = /^([A-Za-z]+)(\d+)$/.exec(String(addr || ''));
        if (!m) return null;
        return { colNum: colLettersToNum(m[1]), row: parseInt(m[2], 10) };
    }

    function isNumericValue(value) {
        var s = String(value == null ? '' : value).trim();
        return s !== '' && /^-?\d+([.,]\d+)?$/.test(s);
    }

    function buildCellXml(addr, styleAttr, value) {
        if (isNumericValue(value)) {
            return '<c r="' + addr + '"' + styleAttr + '><v>' +
                String(value).trim().replace(',', '.') + '</v></c>';
        }
        return '<c r="' + addr + '"' + styleAttr + ' t="inlineStr"><is><t xml:space="preserve">' +
            xmlEscape(value) + '</t></is></c>';
    }

    function insertCellXml(xml, ref, cellXml) {
        var rowRe = new RegExp('<row\\b[^>]*\\br="' + ref.row + '"[^>]*(?:/>|>[\\s\\S]*?<\\/row>)');
        var rowMatch = rowRe.exec(xml);
        if (rowMatch) {
            var rowXml = rowMatch[0];
            var updated;
            if (rowXml.indexOf('</row>') < 0) {
                updated = rowXml.replace(/\/>$/, '>') + cellXml + '</row>';
            } else {
                var insertAt = -1;
                var cellRe = /<c\b[^>]*\br="([A-Za-z]+)\d+"/g;
                var cm;
                while ((cm = cellRe.exec(rowXml))) {
                    if (colLettersToNum(cm[1]) > ref.colNum) { insertAt = cm.index; break; }
                }
                if (insertAt < 0) insertAt = rowXml.lastIndexOf('</row>');
                updated = rowXml.slice(0, insertAt) + cellXml + rowXml.slice(insertAt);
            }
            return xml.slice(0, rowMatch.index) + updated + xml.slice(rowMatch.index + rowXml.length);
        }
        var newRow = '<row r="' + ref.row + '">' + cellXml + '</row>';
        var rowsRe = /<row\b[^>]*\br="(\d+)"/g;
        var at = -1;
        var rm;
        while ((rm = rowsRe.exec(xml))) {
            if (parseInt(rm[1], 10) > ref.row) { at = rm.index; break; }
        }
        if (at < 0) {
            var close = xml.indexOf('</sheetData>');
            if (close >= 0) {
                at = close;
            } else {
                var empty = /<sheetData\s*\/>/.exec(xml);
                if (!empty) return xml;
                return xml.slice(0, empty.index) + '<sheetData>' + newRow + '</sheetData>' +
                    xml.slice(empty.index + empty[0].length);
            }
        }
        return xml.slice(0, at) + newRow + xml.slice(at);
    }

    function patchSheetXml(xml, edits) {
        Object.keys(edits).forEach(function (addr) {
            var ref = splitCellRef(addr);
            if (!ref) return;
            var cellRe = new RegExp('<c\\b[^>]*\\br="' + addr + '"[^>]*(?:/>|>[\\s\\S]*?<\\/c>)');
            var found = cellRe.exec(xml);
            if (!found) {
                xml = insertCellXml(xml, ref, buildCellXml(addr, '', edits[addr]));
                return;
            }
            var tag = found[0];
            if (/<f[\s>\/]/.test(tag)) return; // celle con formula: non toccarle
            var styleMatch = /\bs="(\d+)"/.exec(tag);
            xml = xml.slice(0, found.index) +
                buildCellXml(addr, styleMatch ? ' s="' + styleMatch[1] + '"' : '', edits[addr]) +
                xml.slice(found.index + tag.length);
        });
        return xml;
    }

    function xlsxSheetPaths(zip) {
        var map = {};
        var wbFile = zip.file('xl/workbook.xml');
        var relFile = zip.file('xl/_rels/workbook.xml.rels');
        if (!wbFile || !relFile) return map;
        var rels = {};
        var relRe = /<Relationship\b[^>]*>/g;
        var relXml = relFile.asText();
        var rm;
        while ((rm = relRe.exec(relXml))) {
            var id = /\bId="([^"]+)"/.exec(rm[0]);
            var target = /\bTarget="([^"]+)"/.exec(rm[0]);
            if (!id || !target) continue;
            var path = target[1];
            rels[id[1]] = path.charAt(0) === '/' ? path.slice(1) : 'xl/' + path.replace(/^\.\//, '');
        }
        var sheetRe = /<sheet\b[^>]*>/g;
        var wbXml = wbFile.asText();
        var sm;
        while ((sm = sheetRe.exec(wbXml))) {
            var name = /\bname="([^"]*)"/.exec(sm[0]);
            var rid = /\br:id="([^"]+)"/.exec(sm[0]) || /\bid="([^"]+)"/.exec(sm[0]);
            if (name && rid && rels[rid[1]]) map[xmlUnescape(name[1])] = rels[rid[1]];
        }
        return map;
    }

    async function patchXlsxZipCells(buffer, editsBySheet) {
        await ensureDocxLibs();
        var zip = new window.PizZip(buffer);
        var paths = xlsxSheetPaths(zip);
        var changed = false;
        Object.keys(editsBySheet).forEach(function (sheetName) {
            var path = paths[sheetName];
            var file = path ? zip.file(path) : null;
            if (!file) return;
            var xml = file.asText();
            var out = patchSheetXml(xml, editsBySheet[sheetName]);
            if (out && out !== xml) {
                zip.file(path, out);
                changed = true;
            }
        });
        if (!changed) return buffer;
        return zip.generate({ type: 'arraybuffer', mimeType: XLSX_MIME, compression: 'DEFLATE' });
    }

    function normLabelKey(s) {
        return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]+/g, '');
    }

    function isUnitLikeCell(s) {
        var t = String(s == null ? '' : s).trim();
        if (!t) return false;
        return /^(mm|t\/h|mc|mc\/h|ksmc\/h|nmc\/h|%|bar|ap\s*\(bar\)|bp\s*\(bar\)|µs\/cm|us\/cm|cond\.?\s*µs\/cm|val\.?\s*tal\s*quale|%\s*giorn\.?\s*prec\.?|giorn\.?|si\s*\/\s*no)$/i.test(t);
    }

    function lookupDataValue(data, label) {
        if (!data || label == null || label === '') return '';
        var raw = String(label).trim();
        if (!raw) return '';
        if (data[raw] != null && String(data[raw]).trim() !== '') return String(data[raw]).trim();
        var up = raw.toUpperCase();
        if (data[up] != null && String(data[up]).trim() !== '') return String(data[up]).trim();
        var n = normLabelKey(raw);
        if (!n) return '';
        var keys = Object.keys(data);
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (normLabelKey(k) === n && data[k] != null && String(data[k]).trim() !== '') {
                return String(data[k]).trim();
            }
        }
        // TK 9201 ↔ TK9201 ↔ inp-tk9201
        if (/^INP/.test(n) || /^VAL/.test(n)) {
            var short = n.replace(/^(INP|VAL)/, '');
            for (var j = 0; j < keys.length; j++) {
                if (normLabelKey(keys[j]) === short && data[keys[j]] != null && String(data[keys[j]]).trim() !== '') {
                    return String(data[keys[j]]).trim();
                }
            }
        }
        return '';
    }

    function setSheetCellValue(sheet, rowIdx, colIdx, value, edits) {
        if (value == null || value === '') return;
        var addr = window.XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
        if (edits) edits[addr] = String(value);
        var existing = sheet[addr];
        var num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
        if (!isNaN(num) && String(value).trim() !== '' && /^-?\d+([.,]\d+)?$/.test(String(value).trim())) {
            sheet[addr] = Object.assign({}, existing || {}, { t: 'n', v: num });
        } else {
            sheet[addr] = Object.assign({}, existing || {}, { t: 's', v: String(value) });
        }
        if (sheet[addr].w != null) delete sheet[addr].w;
        // Espandi range
        if (!sheet['!ref']) {
            sheet['!ref'] = addr;
        } else {
            var range = window.XLSX.utils.decode_range(sheet['!ref']);
            if (rowIdx > range.e.r) range.e.r = rowIdx;
            if (colIdx > range.e.c) range.e.c = colIdx;
            if (rowIdx < range.s.r) range.s.r = rowIdx;
            if (colIdx < range.s.c) range.s.c = colIdx;
            sheet['!ref'] = window.XLSX.utils.encode_range(range);
        }
    }

    function fillXlsxSheetByLabels(sheet, data, edits) {
        if (!sheet || !window.XLSX) return;
        var range = window.XLSX.utils.decode_range(sheet['!ref'] || 'A1');
        var rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
        rows.forEach(function (row, rIdx) {
            if (!row || !row.length) return;
            var absR = range.s.r + rIdx;
            var label = String(row[0] == null ? '' : row[0]).trim();
            if (!label) return;
            // Evita intestazioni generiche
            if (/^(sasol|situazione|giorno|eventi|composizione|cono|criticita)/i.test(label)) return;

            var mainVal = lookupDataValue(data, label);
            var condVal = lookupDataValue(data, label + '-cond') ||
                lookupDataValue(data, label + '_cond') ||
                lookupDataValue(data, label + ' COND');

            var mainFilled = false;
            var maxC = Math.max(row.length, 6);
            for (var c = 1; c < maxC; c++) {
                var absC = range.s.c + c;
                var cellStr = String(row[c] == null ? '' : row[c]).trim();
                if (/^cond/i.test(cellStr)) {
                    if (condVal) setSheetCellValue(sheet, absR, absC + 1, condVal, edits);
                    continue;
                }
                if (mainFilled) continue;
                if (isUnitLikeCell(cellStr)) {
                    // valore nella cella successiva se vuota
                    var next = String(row[c + 1] == null ? '' : row[c + 1]).trim();
                    if (!next && mainVal) {
                        setSheetCellValue(sheet, absR, absC + 1, mainVal, edits);
                        mainFilled = true;
                    }
                    continue;
                }
                if (cellStr === '' && mainVal) {
                    setSheetCellValue(sheet, absR, absC, mainVal, edits);
                    mainFilled = true;
                }
            }
        });
    }

    function fillTextBuffer(buffer, data) {
        var decoder = new TextDecoder('utf-8');
        var text = decoder.decode(buffer);
        if (text.indexOf('{{') < 0) return buffer; /* byte-identici all’upload */
        var out = replacePlaceholdersInText(text, data);
        if (out === text) return buffer;
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
            sum: bufferChecksum(buf),
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
        unmarkWordRapportinoDeleted(meta.id);
        if (typeof window.__pushWordRapportinoToCloud === 'function') {
            void window.__pushWordRapportinoToCloud(meta.id).then(function (status) {
                if (status === 'ok') {
                    toast('Caricato e inviato agli altri dispositivi.');
                } else if (status === 'offline') {
                    toast('Salvato solo qui: cloud non connesso. Riprova con «Aggiorna dal cloud» quando c’è rete.', true);
                } else if (status === 'quota') {
                    toast('Salvato solo qui: quota Firestore superata.', true);
                }
            }).catch(function (err) {
                console.warn('[ServiceHub] sync rapportino cloud:', err && err.message);
                toast('Salvato qui, invio agli altri dispositivi fallito: ' + ((err && err.message) || ''), true);
            });
        }
        return meta;
    };

    window.deleteWordRapportino = async function (id) {
        if (!id) return;
        // Tombstone: il sync cloud non deve ripristinare questo id
        markWordRapportinoDeleted(id);
        try { await idbDelete(id); } catch (_) {}
        saveMeta(loadMeta().filter(function (x) { return x && x.id !== id; }));
        window.renderWordRapportiniList();
        if (typeof window.__deleteWordRapportinoFromCloud === 'function') {
            try {
                await window.__deleteWordRapportinoFromCloud(id);
            } catch (err) {
                console.warn('[ServiceHub] delete rapportino cloud:', err && err.message);
                toast('Eliminato qui. Su cloud potrebbe restare: ' + ((err && err.message) || 'errore'), true);
                return;
            }
        }
        toast('Documento eliminato (anche dal sync).');
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

        /* Estensione e MIME restano quelli caricati: nessuna conversione di formato. */
        if (ext === 'docx' || ext === 'docm') {
            outBuf = await fillDocxBuffer(rec.buffer, data);
            outMime = mime || DOCX_MIME;
            filled = outBuf !== rec.buffer;
        } else if (ext === 'xlsx' || ext === 'xlsm') {
            outBuf = await fillXlsxBuffer(rec.buffer, data);
            outMime = mime || XLSX_MIME;
            filled = outBuf !== rec.buffer;
        } else if (ext === 'csv' || ext === 'tsv' || ext === 'txt' || ext === 'rtf' || ext === 'json' || ext === 'xml') {
            outBuf = fillTextBuffer(rec.buffer, data);
            filled = outBuf !== rec.buffer;
        } else if (ext === 'pdf') {
            outBuf = fillPdfBuffer(rec.buffer, data);
            outMime = PDF_MIME;
            filled = outBuf !== rec.buffer;
        } else if (ext === 'doc') {
            /* .doc binario OLE: byte identici. .doc che è HTML/testo: solo {{tag}}, stesso markup. */
            var kind = sniffFileKind(rec.buffer, ext);
            if (kind === 'html' || kind === 'text' || kind === 'rtf') {
                outBuf = fillTextBuffer(rec.buffer, data);
                filled = outBuf !== rec.buffer;
            } else {
                filled = false;
            }
        } else {
            // .xls / .ppt / odt / … : file IDENTICO all’upload (nessuna riscrittura)
            filled = false;
        }

        var fileName = datedOutName(meta.name || 'Rapportino', outExt);
        var file = new File([outBuf], fileName, { type: outMime });
        file.__shFilled = filled;
        file.__shExt = outExt;
        return file;
    };

    window.buildSituazioneGiornalieraWordFileFromTemplate = async function () {
        var list = typeof window.listWordRapportini === 'function' ? window.listWordRapportini() : [];
        if (!list || !list.length) return null;
        var preferId = '';
        try {
            preferId = localStorage.getItem('servicehub_situazione_word_id') || '';
        } catch (_) {}
        var meta = null;
        if (preferId) {
            meta = list.find(function (m) { return m && m.id === preferId; }) || null;
        }
        if (!meta) {
            meta = list.find(function (m) {
                return m && (/situaz/i.test(m.name || '') || /situaz/i.test(m.fileName || ''));
            }) || null;
        }
        if (!meta) {
            meta = list.find(function (m) { return m && m.fillable; }) || list[0] || null;
        }
        if (!meta || !meta.id) return null;
        if (typeof window.fillWordRapportinoTemplate !== 'function') return null;
        var file = await window.fillWordRapportinoTemplate(meta.id);
        if (file) {
            file.__shFromOfficialTemplate = true;
            file.__shTemplateId = meta.id;
            file.__shTemplateName = meta.name || meta.fileName || '';
        }
        return file;
    };

    /** Verifica che i byte in IndexedDB siano ancora quelli caricati (nessuna mutazione silenziosa). */
    window.verifyWordRapportinoBufferIntegrity = async function (id) {
        var meta = window.getWordRapportinoMeta(id);
        var rec = await idbGet(id);
        if (!meta || !rec || !rec.buffer) return { ok: false, reason: 'missing' };
        var ab = await toArrayBuffer(rec.buffer);
        var size = ab.byteLength || 0;
        var info = { size: size, ext: meta.ext || '', fileName: meta.fileName || '', sum: bufferChecksum(ab) };
        if (meta.size && size !== meta.size) {
            return Object.assign({ ok: false, reason: 'size-mismatch', expected: meta.size }, info);
        }
        if (meta.sum && meta.sum !== info.sum) {
            return Object.assign({ ok: false, reason: 'checksum-mismatch', expected: meta.sum }, info);
        }
        return Object.assign({ ok: true }, info);
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
        if (typeof window.__syncBodyModalOpenClass === 'function') window.__syncBodyModalOpenClass();
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
                if (typeof window.__pushWordRapportinoToCloud === 'function') {
                    void window.__pushWordRapportinoToCloud(editId);
                }
            } else {
                await window.saveWordRapportinoFromFile({
                    id: editId || undefined,
                    name: name,
                    file: file
                });
            }
            window.closeAggiungiWordRapportinoModal();
            window.renderWordRapportiniList();
            toast('Documento ufficiale salvato. Comparirà anche sugli altri dispositivi (LED verde).');
        } catch (e) {
            showErr((e && e.message) || 'Salvataggio fallito');
        }
    };

    function ensureMammothLib() {
        if (window.mammoth && window.mammoth.convertToHtml) return Promise.resolve(true);
        return loadScriptFromCdns([
            libUrl('mammoth.browser.min.js'),
            'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
            'https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js'
        ], function () {
            return !!(window.mammoth && window.mammoth.convertToHtml);
        }).then(function () {
            if (!(window.mammoth && window.mammoth.convertToHtml)) throw new Error('Lettura testo Word non disponibile');
            return true;
        });
    }

    function ensureDocxPreviewLibs() {
        function ensureCss(href) {
            if (document.querySelector('link[data-sh-lib="' + href + '"]')) return;
            var l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = href;
            l.setAttribute('data-sh-lib', href);
            document.head.appendChild(l);
        }
        ensureCss(libUrl('docx-preview.css'));
        if (window.docx && typeof window.docx.renderAsync === 'function' && window.JSZip) {
            return Promise.resolve(true);
        }
        // JSZip PRIMA di docx-preview
        return loadScriptFromCdns([
            libUrl('jszip.min.js'),
            'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
            'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js'
        ], function () {
            return !!window.JSZip;
        }).then(function () {
            return loadScriptFromCdns([
                libUrl('docx-preview.min.js'),
                'https://cdn.jsdelivr.net/npm/docx-preview@0.3.5/dist/docx-preview.min.js',
                'https://unpkg.com/docx-preview@0.3.5/dist/docx-preview.min.js'
            ], function () {
                return !!(window.docx && typeof window.docx.renderAsync === 'function');
            });
        }).then(function () {
            if (!(window.docx && window.docx.renderAsync)) throw new Error('Anteprima Word non disponibile');
            return true;
        });
    }

    /** Ultima spiaggia: estrai testo da word/document.xml senza mammoth/docx-preview */
    async function renderDocxEmergencyText(host, buffer) {
        await ensureDocxLibs();
        var ab = await toArrayBuffer(buffer);
        var zip = new window.PizZip(ab);
        var entry = zip.file('word/document.xml');
        if (!entry) throw new Error('ZIP Word senza document.xml');
        var xml = entry.asText();
        var text = String(xml || '')
            .replace(/<\/w:p>/g, '\n')
            .replace(/<w:tab\b[^>]*\/>/g, '\t')
            .replace(/<w:br\b[^>]*\/>/g, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); })
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        var box = document.createElement('div');
        box.className = 'word-rapp-mammoth-host';
        var pre = document.createElement('pre');
        pre.className = 'word-rapp-text-preview';
        pre.textContent = text || '(Nessun testo trovato nel file Word)';
        box.appendChild(pre);
        host.appendChild(box);
    }

    function revokeWordPreviewUrl() {
        if (window.__wordRappPreviewUrl) {
            try { URL.revokeObjectURL(window.__wordRappPreviewUrl); } catch (_) {}
            window.__wordRappPreviewUrl = null;
        }
    }

    window.__releaseWordRapportinoPreview = function () {
        try {
            revokeWordPreviewUrl();
            var host = document.getElementById('word-rapp-preview-host');
            if (host) host.innerHTML = '';
            document.querySelectorAll('style[data-docx-preview], style.docx-preview-style').forEach(function (el) {
                try { el.remove(); } catch (_) {}
            });
            if (window.__wordRappPreviewResizeObs) {
                try { window.__wordRappPreviewResizeObs.disconnect(); } catch (_) {}
                window.__wordRappPreviewResizeObs = null;
            }
        } catch (_) {}
    };

    function fitDocxPagesToHost(host, wrap) {
        if (!host || !wrap) return;
        var avail = Math.max(200, (host.clientWidth || 0) - 20);
        var pages = wrap.querySelectorAll('section.docx');
        pages.forEach(function (page) {
            page.style.transform = 'none';
            page.style.marginLeft = 'auto';
            page.style.marginRight = 'auto';
            var natural = page.scrollWidth || page.offsetWidth || 0;
            if (!natural || natural <= avail + 8) {
                page.style.transform = '';
                page.style.width = '';
                return;
            }
            var scale = Math.min(1, Math.max(0.35, avail / natural));
            page.style.transformOrigin = 'top center';
            page.style.transform = 'scale(' + scale.toFixed(4) + ')';
            // Compensa lo spazio vuoto sotto dopo lo scale
            var h = page.offsetHeight || 0;
            if (h > 0) {
                page.style.marginBottom = Math.round(h * (scale - 1)) + 'px';
            }
        });
    }

    async function renderDocxLayoutPreview(host, buffer) {
        await ensureDocxPreviewLibs();
        var ab = await toArrayBuffer(buffer);
        var wrap = document.createElement('div');
        wrap.className = 'word-rapp-docx-host';
        host.appendChild(wrap);
        var blob = new Blob([ab], { type: DOCX_MIME });
        await window.docx.renderAsync(blob, wrap, null, {
            className: 'docx',
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            breakPages: true,
            renderHeaders: true,
            renderFooters: true,
            renderFootnotes: true,
            useBase64URL: true,
            experimental: true
        });
        if (!wrap.querySelector('section.docx, .docx-wrapper')) {
            throw new Error('Layout Word vuoto');
        }
        var runFit = function () { fitDocxPagesToHost(host, wrap); };
        requestAnimationFrame(function () {
            runFit();
            setTimeout(runFit, 80);
            setTimeout(runFit, 300);
        });
        if (window.ResizeObserver) {
            try {
                if (window.__wordRappPreviewResizeObs) window.__wordRappPreviewResizeObs.disconnect();
                window.__wordRappPreviewResizeObs = new ResizeObserver(function () { runFit(); });
                window.__wordRappPreviewResizeObs.observe(host);
            } catch (_) {}
        }
    }

    async function renderDocxTextPreview(host, buffer) {
        try {
            await ensureMammothLib();
            var ab = await toArrayBuffer(buffer);
            var result = await window.mammoth.convertToHtml({ arrayBuffer: ab });
            var box = document.createElement('div');
            box.className = 'word-rapp-mammoth-host';
            box.innerHTML = result.value || '<p><em>Nessun testo estratto dal file.</em></p>';
            host.appendChild(box);
            if (result.messages && result.messages.length) {
                console.info('[ServiceHub] mammoth:', result.messages);
            }
        } catch (err) {
            console.warn('[ServiceHub] mammoth fallito, testo di emergenza:', err);
            await renderDocxEmergencyText(host, buffer);
        }
    }

    async function renderPreviewIntoHost(host, meta, buffer, mode) {
        var extHint = (meta.ext || fileExt(meta.fileName) || '').toLowerCase();
        var mime = meta.mime || mimeFor(meta.fileName);
        mode = mode || 'text';
        host.innerHTML = '';
        revokeWordPreviewUrl();

        var ab = await toArrayBuffer(buffer);
        var ext = sniffFileKind(ab, extHint);
        var openBar = document.createElement('div');
        openBar.className = 'word-rapp-preview-toolbar';
        // Per HTML-in-.doc usa text/html così iframe/browser lo mostrano
        var previewMime = (ext === 'html') ? 'text/html;charset=utf-8' : (mime || 'application/octet-stream');
        var blob = new Blob([ab], { type: previewMime });
        var url = URL.createObjectURL(blob);
        window.__wordRappPreviewUrl = url;

        function setDownloadBar(label) {
            openBar.innerHTML =
                '<a class="word-rapp-preview-open" href="' + url + '" download="' +
                escapeHtml(meta.fileName || ('file.' + (extHint || 'bin'))) + '">' + (label || 'Scarica originale') + '</a>';
        }

        // HTML salvato come .doc (ServiceHub / app terze) → anteprima iframe
        if (ext === 'html') {
            host.appendChild(openBar);
            setDownloadBar('Scarica file originale');
            var tip = document.createElement('p');
            tip.className = 'word-rapp-preview-fallback';
            tip.innerHTML = 'File riconosciuto come documento HTML (anche se si chiama .doc). Anteprima qui sotto — <b>non serve Word</b>.';
            host.appendChild(tip);
            var frame = document.createElement('iframe');
            frame.className = 'word-rapp-preview-frame word-rapp-preview-frame--html';
            frame.title = 'Anteprima documento';
            frame.setAttribute('sandbox', 'allow-same-origin');
            frame.src = url;
            host.appendChild(frame);
            return;
        }

        if (ext === 'pdf') {
            host.appendChild(openBar);
            openBar.innerHTML =
                '<a class="word-rapp-preview-open" href="' + url + '" target="_blank" rel="noopener">Apri PDF a schermo intero</a>';
            var framePdf = document.createElement('iframe');
            framePdf.className = 'word-rapp-preview-frame';
            framePdf.title = 'Anteprima PDF';
            framePdf.src = url + '#view=FitH';
            host.appendChild(framePdf);
            return;
        }

        if (ext === 'docx' || ext === 'docm') {
            openBar.innerHTML =
                '<button type="button" class="word-rapp-preview-tab' + (mode === 'layout' ? ' active' : '') + '" data-mode="layout">Layout originale</button>' +
                '<button type="button" class="word-rapp-preview-tab' + (mode === 'text' ? ' active' : '') + '" data-mode="text">Testo leggibile</button>' +
                '<a class="word-rapp-preview-open" href="' + url + '" download="' + escapeHtml(meta.fileName || 'documento.docx') + '">Scarica originale</a>';
            host.appendChild(openBar);
            openBar.querySelectorAll('[data-mode]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var m = btn.getAttribute('data-mode');
                    void window.renderWordRapportinoPreview(meta.id, m);
                });
            });
            var body = document.createElement('div');
            body.className = 'word-rapp-preview-body';
            host.appendChild(body);
            if (mode === 'layout') {
                try {
                    await renderDocxLayoutPreview(body, ab);
                } catch (err) {
                    console.warn('[ServiceHub] layout docx fallito, uso testo:', err);
                    body.innerHTML = '<p class="word-rapp-preview-err">Layout non disponibile (' +
                        escapeHtml((err && err.message) || 'errore') + '). Mostro il testo leggibile.</p>';
                    await renderDocxTextPreview(body, ab);
                }
            } else {
                await renderDocxTextPreview(body, ab);
            }
            return;
        }

        if (ext === 'doc-ole' || ext === 'doc') {
            host.appendChild(openBar);
            setDownloadBar('Scarica file .doc');
            var note = document.createElement('div');
            note.className = 'word-rapp-preview-unsupported';
            note.innerHTML =
                '<p>Questo è un <b>.doc binario</b> vecchio: nel browser non si apre.</p>' +
                '<p>Dalla tua app (WPS, LibreOffice, Google Documenti…), senza Microsoft Word: <b>Esporta come PDF</b> oppure <b>Salva come .docx / .odt</b>, poi usa «Sostituisci file».</p>' +
                '<p>Il file che hai già caricato resta salvato; non lo perdi.</p>';
            host.appendChild(note);
            return;
        }

        if (ext === 'odt') {
            host.appendChild(openBar);
            setDownloadBar('Scarica originale');
            try {
                await ensureDocxLibs();
                var zip = new window.PizZip(ab);
                var entry = zip.file('content.xml');
                if (!entry) throw new Error('ODT senza content.xml');
                var xml = entry.asText();
                var text = String(xml || '')
                    .replace(/<\/text:p>/g, '\n')
                    .replace(/<text:line-break\b[^>]*\/>/g, '\n')
                    .replace(/<text:tab\b[^>]*\/>/g, '\t')
                    .replace(/<[^>]+>/g, '')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
                var pre = document.createElement('pre');
                pre.className = 'word-rapp-text-preview';
                pre.textContent = text || '(Nessun testo nel file OpenDocument)';
                host.appendChild(pre);
            } catch (errOd) {
                var fail = document.createElement('div');
                fail.className = 'word-rapp-preview-unsupported';
                fail.innerHTML = '<p>Anteprima ODT non riuscita. Usa «Scarica originale».</p>';
                host.appendChild(fail);
            }
            return;
        }

        if (ext === 'xlsx' || ext === 'xlsm' || ext === 'xls') {
            openBar.innerHTML =
                '<a class="word-rapp-preview-open" href="' + url + '" download="' + escapeHtml(meta.fileName || 'foglio.xlsx') + '">Scarica originale</a>';
            host.appendChild(openBar);
            var xlsTip = document.createElement('p');
            xlsTip.className = 'word-rapp-preview-fallback';
            xlsTip.innerHTML = 'Anteprima solo per leggere i valori: bordi e larghezze qui sono approssimativi. ' +
                'Il file condiviso resta il tuo Excel originale, con i soli numeri aggiornati.';
            host.appendChild(xlsTip);
            await ensureXlsxLib();
            var wb = window.XLSX.read(ab, { type: 'array' });
            var sheetBar = document.createElement('div');
            sheetBar.className = 'word-rapp-xlsx-tabs';
            var tableHost = document.createElement('div');
            tableHost.className = 'word-rapp-xlsx-table-host';
            host.appendChild(sheetBar);
            host.appendChild(tableHost);
            function showSheet(name) {
                Array.prototype.forEach.call(sheetBar.querySelectorAll('button'), function (b) {
                    b.classList.toggle('active', b.getAttribute('data-sheet') === name);
                });
                var sheet = wb.Sheets[name];
                tableHost.innerHTML = window.XLSX.utils.sheet_to_html(sheet, { editable: false });
                var table = tableHost.querySelector('table');
                if (table) table.className = 'word-rapp-xlsx-table';
            }
            (wb.SheetNames || []).forEach(function (name, idx) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'word-rapp-xlsx-tab' + (idx === 0 ? ' active' : '');
                btn.setAttribute('data-sheet', name);
                btn.textContent = name;
                btn.onclick = function () { showSheet(name); };
                sheetBar.appendChild(btn);
            });
            if (wb.SheetNames && wb.SheetNames[0]) showSheet(wb.SheetNames[0]);
            return;
        }

        if (ext === 'csv' || ext === 'tsv' || ext === 'txt' || ext === 'rtf' || ext === 'json' || ext === 'xml') {
            openBar.innerHTML =
                '<a class="word-rapp-preview-open" href="' + url + '" download="' + escapeHtml(meta.fileName || ('file.' + ext)) + '">Scarica originale</a>';
            host.appendChild(openBar);
            var textPlain = new TextDecoder('utf-8').decode(ab);
            var prePlain = document.createElement('pre');
            prePlain.className = 'word-rapp-text-preview';
            prePlain.textContent = textPlain;
            host.appendChild(prePlain);
            return;
        }

        if (/^(png|jpe?g|gif|webp|bmp)$/i.test(ext)) {
            openBar.innerHTML =
                '<a class="word-rapp-preview-open" href="' + url + '" target="_blank" rel="noopener">Apri immagine</a>';
            host.appendChild(openBar);
            var img = document.createElement('img');
            img.className = 'word-rapp-img-preview';
            img.src = url;
            img.alt = meta.fileName || 'Anteprima';
            host.appendChild(img);
            return;
        }

        host.innerHTML =
            '<div class="word-rapp-preview-unsupported">' +
            '<p>Anteprima diretta non disponibile per <b>.' + escapeHtml(extHint || ext || '?') + '</b>.</p>' +
            '<p>Puoi scaricare e aprire il file con la tua app.</p>' +
            '<a class="letture-share-btn" href="' + url + '" download="' + escapeHtml(meta.fileName || ('file.' + (extHint || 'bin'))) + '">Scarica file originale</a>' +
            '</div>';
    }

    window.renderWordRapportinoPreview = async function (id, mode, opts) {
        opts = opts || {};
        var useFilled = opts.filled !== false;
        var host = document.getElementById('word-rapp-preview-host');
        var status = document.getElementById('word-rapp-preview-status');
        if (!host) return;
        var meta = window.getWordRapportinoMeta(id);
        if (!meta) {
            host.innerHTML = '<p class="word-rapp-preview-status">Documento non trovato.</p>';
            return;
        }
        mode = mode || 'text';
        if (status) status.textContent = useFilled ? 'Aggiornamento dati dall’interfaccia…' : 'Apertura file…';
        host.innerHTML = '<p class="word-rapp-preview-status">Caricamento anteprima…</p>';
        var done = false;
        var watchdog = setTimeout(function () {
            if (done) return;
            if (status) status.textContent = 'Caricamento lento…';
        }, 8000);
        try {
            var rec = await idbGet(id);
            if (!rec || !rec.buffer) {
                throw new Error('File non in memoria su questo dispositivo. Attendi il sync (LED verde) o ricarica il file.');
            }
            var buffer = rec.buffer;
            var usedFilled = false;
            if (useFilled) {
                try {
                    var filledFile = await window.fillWordRapportinoTemplate(id);
                    if (filledFile) {
                        buffer = await fileToArrayBuffer(filledFile);
                        usedFilled = true;
                    }
                } catch (fillErr) {
                    console.warn('[ServiceHub] fill preview:', fillErr);
                }
            }
            await renderPreviewIntoHost(host, meta, buffer, mode);
            done = true;
            clearTimeout(watchdog);
            if (status) {
                if (usedFilled) {
                    status.textContent = 'Anteprima con dati aggiornati dall’interfaccia';
                } else {
                    var kind = sniffFileKind(rec.buffer, meta.ext || meta.fileName);
                    if (kind === 'html') status.textContent = 'Anteprima del file originale (documento HTML)';
                    else if (mode === 'layout') status.textContent = 'Anteprima layout (file originale)';
                    else status.textContent = 'Anteprima dal file originale';
                }
            }
        } catch (err) {
            done = true;
            clearTimeout(watchdog);
            console.warn('[ServiceHub] preview:', err);
            var msg = (err && err.message) || 'Anteprima non riuscita';
            var extFail = (meta.ext || fileExt(meta.fileName) || '').toLowerCase();
            try {
                var rec2 = await idbGet(id);
                if (rec2 && rec2.buffer && (extFail === 'docx' || extFail === 'docm')) {
                    host.innerHTML = '';
                    var note = document.createElement('p');
                    note.className = 'word-rapp-preview-err';
                    note.textContent = 'Anteprima avanzata fallita (' + msg + '). Mostro il testo grezzo dal file:';
                    host.appendChild(note);
                    await renderDocxEmergencyText(host, rec2.buffer);
                    if (status) status.textContent = 'Anteprima di emergenza (testo dal Word)';
                    return;
                }
            } catch (err2) {
                console.warn('[ServiceHub] preview emergency:', err2);
            }
            host.innerHTML = '<p class="word-rapp-preview-status word-rapp-preview-err">' +
                escapeHtml(msg) + '</p>' +
                '<p class="word-rapp-preview-fallback">File: <b>' + escapeHtml(meta.fileName || '') +
                '</b> (.' + escapeHtml(extFail || '?') + '). Se è un .doc vecchio, salvalo come .docx e ricaricalo con «Sostituisci file».</p>';
            if (status) status.textContent = 'Anteprima non disponibile';
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
            var canFill = !!FILLABLE_EXT[ext] || ext === 'xlsx' || ext === 'xlsm' || ext === 'xls';
            var fillHint = canFill
                ? 'Premi <b>Aggiorna dati</b> per riempire il foglio con i livelli letti dall’interfaccia (senza modificare il file salvato).'
                : 'Qui sotto l’anteprima del file (se il formato lo permette).';
            body.innerHTML =
                '<div class="word-rapp-panel word-rapp-panel--viewer">' +
                '<p class="word-rapp-panel-file">File: <b>' + escapeHtml(meta.fileName || '') + '</b> · ' +
                escapeHtml((ext || '?').toUpperCase()) + ' · ' +
                (meta.size ? (Math.max(1, Math.round(meta.size / 1024)) + ' KB') : '?') + '</p>' +
                '<div class="word-rapp-actions word-rapp-actions--top">' +
                '<button type="button" class="letture-share-btn letture-share-btn--main" id="word-rapp-refresh-data-btn">Aggiorna dati</button>' +
                '<button type="button" class="letture-share-btn" id="word-rapp-reload-preview-btn">File grezzo</button>' +
                '</div>' +
                '<p id="word-rapp-preview-status" class="word-rapp-preview-status">Apertura anteprima…</p>' +
                '<div id="word-rapp-preview-host" class="word-rapp-preview-host" aria-live="polite"></div>' +
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
            var refresh = document.getElementById('word-rapp-refresh-data-btn');
            if (refresh) {
                refresh.onclick = function () {
                    toast('Aggiorno i dati dall’interfaccia…');
                    void window.renderWordRapportinoPreview(id, 'text', { filled: true });
                };
            }
            var reload = document.getElementById('word-rapp-reload-preview-btn');
            if (reload) reload.onclick = function () { void window.renderWordRapportinoPreview(id, 'text', { filled: false }); };
            void window.renderWordRapportinoPreview(id, 'text', { filled: true });
        }
        modal.classList.add('active');
        if (typeof window.__syncBodyModalOpenClass === 'function') window.__syncBodyModalOpenClass();
    };

    window.shareWordRapportinoDoc = async function (id) {
        id = id || window.__activeWordRapportinoId;
        if (!id) return false;
        try {
            var integrity = typeof window.verifyWordRapportinoBufferIntegrity === 'function'
                ? await window.verifyWordRapportinoBufferIntegrity(id)
                : { ok: true };
            if (integrity && integrity.ok === false
                && (integrity.reason === 'size-mismatch' || integrity.reason === 'checksum-mismatch')) {
                toast('Attenzione: il file salvato non coincide con l’upload. Ricarica il documento ufficiale.', true);
            }
            var file = await window.fillWordRapportinoTemplate(id);
            if (!file) return false;
            /* Su iPhone/PC: solo condivisione/download del file binario ufficiale — mai stampa HTML. */
            if (typeof window.canShareLetturaFile === 'function' && window.canShareLetturaFile(file) && navigator.share) {
                try {
                    await navigator.share({ files: [file], title: file.name });
                    return true;
                } catch (err) {
                    if (err && err.name === 'AbortError') return true;
                }
            }
            if (typeof window.isLetturaShareDesktopPc === 'function' && window.isLetturaShareDesktopPc()
                && typeof window.openLetturaDesktopShareSheet === 'function') {
                window.openLetturaDesktopShareSheet(file, file.name, {});
                return true;
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
                toast('File ufficiale: stesso layout dell’originale, solo numeri aggiornati. Aprilo e stampa.');
            } else {
                toast('File ufficiale originale esportato (byte identici all’upload).');
            }
            return true;
        } catch (err) {
            console.warn('[ServiceHub] share word:', err);
            toast((err && err.message) || 'Generazione file fallita', true);
            return false;
        }
    };

    /* ——— Sync multi-dispositivo (Firestore) ——— */
    var CLOUD_CHUNK_CHARS = 600000; // ~450KB binari → sotto il limite 1MB Firestore
    var __wrCloud = null;
    var __wrCloudUnsub = null;
    var __wrApplyingCloud = false;
    var __wrPushBusy = {};

    function arrayBufferToBase64(buffer) {
        var bytes = new Uint8Array(buffer);
        var chunk = 0x8000;
        var binary = '';
        for (var i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
        }
        return btoa(binary);
    }

    function base64ToArrayBuffer(b64) {
        var binary = atob(String(b64 || ''));
        var len = binary.length;
        var bytes = new Uint8Array(len);
        for (var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
    }

    function splitBase64(b64) {
        var out = [];
        for (var i = 0; i < b64.length; i += CLOUD_CHUNK_CHARS) {
            out.push(b64.slice(i, i + CLOUD_CHUNK_CHARS));
        }
        return out.length ? out : [''];
    }

    function indexMetaSlim(list) {
        return (list || []).map(function (m) {
            return {
                id: m.id,
                name: m.name,
                fileName: m.fileName,
                ext: m.ext,
                mime: m.mime,
                size: m.size,
                sum: m.sum || '',
                fillable: !!m.fillable,
                createdAt: m.createdAt || 0,
                updatedAt: m.updatedAt || 0,
                chunkCount: m.chunkCount || 0
            };
        });
    }

    async function writeCloudIndex(api, list) {
        var indexRef = api.doc(api.db, 'artifacts', api.appId, 'sharedDial', 'wordRapportini');
        await api.setDoc(indexRef, {
            items: indexMetaSlim(list),
            updatedAt: new Date().toISOString(),
            syncRevision: Date.now()
        });
    }

    window.__pushWordRapportinoToCloud = async function (id) {
        var api = __wrCloud;
        if (!api || !api.db || !api.userUid || !id) return 'offline';
        if (isWordRapportinoDeleted(id)) return 'deleted';
        if (window.__firestoreQuotaBlocked) return 'quota';
        if (__wrPushBusy[id]) return 'busy';
        __wrPushBusy[id] = true;
        try {
            var meta = window.getWordRapportinoMeta(id);
            var rec = await idbGet(id);
            if (!meta || !rec || !rec.buffer) return 'missing';
            if (isWordRapportinoDeleted(id)) return 'deleted';
            var b64 = arrayBufferToBase64(rec.buffer);
            var chunks = splitBase64(b64);
            var fileRef = api.doc(api.db, 'artifacts', api.appId, 'sharedDial', 'wordRapportini', 'files', id);
            await api.setDoc(fileRef, {
                id: id,
                name: meta.name,
                fileName: meta.fileName,
                ext: meta.ext,
                mime: meta.mime,
                size: meta.size,
                sum: meta.sum || '',
                fillable: !!meta.fillable,
                createdAt: meta.createdAt || Date.now(),
                updatedAt: meta.updatedAt || Date.now(),
                chunkCount: chunks.length
            });
            for (var i = 0; i < chunks.length; i++) {
                var chunkRef = api.doc(api.db, 'artifacts', api.appId, 'sharedDial', 'wordRapportini', 'files', id, 'chunks', String(i));
                await api.setDoc(chunkRef, { i: i, d: chunks[i] });
            }
            // Rimuovi chunk orfani se il file è diventato più piccolo
            var oldCount = Number(meta.chunkCount) || 0;
            if (oldCount > chunks.length && api.getDocs && api.collection) {
                for (var j = chunks.length; j < oldCount; j++) {
                    try {
                        await api.deleteDoc(api.doc(api.db, 'artifacts', api.appId, 'sharedDial', 'wordRapportini', 'files', id, 'chunks', String(j)));
                    } catch (_) {}
                }
            }
            meta.chunkCount = chunks.length;
            var list = loadMeta().map(function (m) {
                return m && m.id === id ? Object.assign({}, m, { chunkCount: chunks.length, updatedAt: meta.updatedAt }) : m;
            });
            saveMeta(list);
            await writeCloudIndex(api, list);
            console.info('[ServiceHub] rapportino sync OK:', meta.name, chunks.length + ' chunk');
            return 'ok';
        } finally {
            delete __wrPushBusy[id];
        }
    };

    window.__deleteWordRapportinoFromCloud = async function (id, opts) {
        var api = __wrCloud;
        if (!api || !api.db || !api.userUid || !id) return;
        opts = opts || {};
        markWordRapportinoDeleted(id);
        var fileRef = api.doc(api.db, 'artifacts', api.appId, 'sharedDial', 'wordRapportini', 'files', id);
        var chunksCol = api.collection(api.db, 'artifacts', api.appId, 'sharedDial', 'wordRapportini', 'files', id, 'chunks');
        try {
            var snap = await api.getDocs(chunksCol);
            var dels = [];
            snap.forEach(function (d) { dels.push(api.deleteDoc(d.ref)); });
            if (dels.length) await Promise.all(dels);
        } catch (errChunks) {
            console.warn('[ServiceHub] delete chunks:', errChunks && errChunks.message);
        }
        try {
            await api.deleteDoc(fileRef);
        } catch (errFile) {
            console.warn('[ServiceHub] delete file doc:', errFile && errFile.message);
        }
        if (opts.skipIndex) return;
        var list = loadMeta().filter(function (x) { return x && x.id !== id; });
        saveMeta(list);
        await writeCloudIndex(api, list);
    };

    async function pullCloudFileToLocal(api, item, force) {
        if (!item || !item.id) return false;
        if (isWordRapportinoDeleted(item.id)) return false;
        var local = window.getWordRapportinoMeta(item.id);
        if (!force && local && Number(local.updatedAt || 0) >= Number(item.updatedAt || 0)) {
            var rec = await idbGet(item.id);
            if (rec && rec.buffer) return false;
        }
        var chunkCount = Number(item.chunkCount) || 0;
        if (!chunkCount) {
            var fileSnap = await api.getDoc(api.doc(api.db, 'artifacts', api.appId, 'sharedDial', 'wordRapportini', 'files', item.id));
            if (!fileSnap.exists()) return false;
            var fd = fileSnap.data() || {};
            chunkCount = Number(fd.chunkCount) || 0;
            item = Object.assign({}, item, fd);
        }
        if (!chunkCount) return false;
        var parts = [];
        for (var i = 0; i < chunkCount; i++) {
            var cs = await api.getDoc(api.doc(api.db, 'artifacts', api.appId, 'sharedDial', 'wordRapportini', 'files', item.id, 'chunks', String(i)));
            if (!cs.exists()) throw new Error('Chunk mancante ' + i);
            parts.push(String((cs.data() || {}).d || ''));
        }
        var buffer = base64ToArrayBuffer(parts.join(''));
        var pulledSum = bufferChecksum(buffer);
        if (item.sum && item.sum !== pulledSum) {
            throw new Error('File alterato durante il sync (checksum diverso)');
        }
        await idbPut({
            id: item.id,
            buffer: buffer,
            fileName: item.fileName,
            mime: item.mime,
            ext: item.ext
        });
        var list = loadMeta().filter(function (m) { return m && m.id !== item.id; });
        list.push({
            id: item.id,
            name: item.name,
            fileName: item.fileName,
            ext: item.ext,
            mime: item.mime,
            size: item.size || buffer.byteLength,
            sum: item.sum || pulledSum,
            fillable: !!item.fillable,
            createdAt: item.createdAt || Date.now(),
            updatedAt: item.updatedAt || Date.now(),
            chunkCount: chunkCount
        });
        saveMeta(list);
        return true;
    }

    async function applyWordRapportiniCloudIndex(data) {
        if (__wrApplyingCloud || !data) return;
        var api = __wrCloud;
        if (!api) return;
        __wrApplyingCloud = true;
        try {
            var remoteItems = Array.isArray(data.items) ? data.items : [];
            var remoteIds = {};
            var changed = false;
            var remoteHadDeleted = false;
            var remoteClean = [];

            for (var i = 0; i < remoteItems.length; i++) {
                var it = remoteItems[i];
                if (!it || !it.id) continue;
                if (isWordRapportinoDeleted(it.id)) {
                    /* Caricato di nuovo dopo l'eliminazione: vince l'upload più recente,
                       altrimenti questo dispositivo lo ricancellerebbe anche dal cloud. */
                    if (Number(it.updatedAt || 0) > Number(loadDeletedMap()[it.id] || 0)) {
                        unmarkWordRapportinoDeleted(it.id);
                    } else {
                        remoteHadDeleted = true;
                        continue;
                    }
                }
                remoteIds[it.id] = true;
                remoteClean.push(it);
                try {
                    if (await pullCloudFileToLocal(api, it)) changed = true;
                } catch (err) {
                    console.warn('[ServiceHub] pull rapportino', it.id, err && err.message);
                }
            }

            var local = loadMeta();
            var kept = [];
            for (var j = 0; j < local.length; j++) {
                var m = local[j];
                if (!m || !m.id) continue;
                if (isWordRapportinoDeleted(m.id)) {
                    try { await idbDelete(m.id); } catch (_) {}
                    changed = true;
                    continue;
                }
                if (remoteClean.length === 0) {
                    // Cloud vuoto / solo tombstone: tieni i locali
                    kept.push(m);
                    continue;
                }
                if (remoteIds[m.id]) {
                    kept.push(m);
                } else {
                    // Solo su questo dispositivo → pubblica
                    kept.push(m);
                    changed = true;
                    void window.__pushWordRapportinoToCloud(m.id);
                }
            }

            kept = kept.map(function (m) {
                var rem = remoteClean.find(function (r) { return r && r.id === m.id; });
                if (!rem) return m;
                if (Number(rem.updatedAt || 0) >= Number(m.updatedAt || 0)) {
                    return Object.assign({}, m, {
                        name: rem.name || m.name,
                        fileName: rem.fileName || m.fileName,
                        updatedAt: rem.updatedAt || m.updatedAt,
                        chunkCount: rem.chunkCount || m.chunkCount
                    });
                }
                return m;
            }).filter(function (m) { return m && m.id && !isWordRapportinoDeleted(m.id); });

            saveMeta(kept);

            if (remoteHadDeleted) {
                try {
                    await writeCloudIndex(api, kept);
                    for (var k = 0; k < remoteItems.length; k++) {
                        var dead = remoteItems[k];
                        if (dead && dead.id && isWordRapportinoDeleted(dead.id)) {
                            void window.__deleteWordRapportinoFromCloud(dead.id, { skipIndex: true });
                        }
                    }
                } catch (_) {}
                changed = true;
            }

            if (changed) window.renderWordRapportiniList();
        } finally {
            __wrApplyingCloud = false;
        }
    }

    /** Il sync può non essere ancora agganciato se il login Firebase sta partendo. */
    function waitForCloudApi(maxMs) {
        var deadline = Date.now() + (maxMs || 8000);
        return new Promise(function (resolve) {
            (function attempt() {
                if (__wrCloud && __wrCloud.db && __wrCloud.userUid) return resolve(__wrCloud);
                if (Date.now() > deadline) return resolve(null);
                setTimeout(attempt, 400);
            })();
        });
    }

    /** Forza il recupero dell'elenco dal server, ignorando la cache dell'SDK. */
    window.refreshWordRapportiniFromCloud = async function () {
        var btn = document.querySelector('.word-rapp-sync-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Controllo cloud…'; }
        var lines = [];
        try {
            var api = await waitForCloudApi(8000);
            if (!api) {
                alert('Cloud non collegato su questo dispositivo.\n\n' +
                    'Serve rete e login Firebase (LED verde in alto). ' +
                    'Aspetta che il LED diventi verde e riprova.');
                return false;
            }
            var indexRef = api.doc(api.db, 'artifacts', api.appId, 'sharedDial', 'wordRapportini');
            var snap = api.getDocFromServer
                ? await api.getDocFromServer(indexRef)
                : await api.getDoc(indexRef);
            if (!snap.exists()) {
                alert('Sul cloud non c’è ancora nessun documento ufficiale.\n' +
                    'Ricarica il file dal PC e controlla il messaggio di conferma.');
                return false;
            }
            var items = (snap.data() || {}).items || [];
            var pulled = 0;
            var errors = 0;
            for (var i = 0; i < items.length; i++) {
                var it = items[i];
                if (!it || !it.id) continue;
                var label = it.name || it.fileName || it.id;
                if (isWordRapportinoDeleted(it.id)) {
                    /* Ricaricato dal PC dopo l'eliminazione: la vecchia cancellazione non deve vincere. */
                    if (Number(it.updatedAt || 0) > Number(loadDeletedMap()[it.id] || 0)) {
                        unmarkWordRapportinoDeleted(it.id);
                    } else {
                        lines.push('· ' + label + ': eliminato su questo dispositivo');
                        continue;
                    }
                }
                try {
                    var got = await pullCloudFileToLocal(api, it, true);
                    var rec = await idbGet(it.id);
                    var hasBytes = !!(rec && rec.buffer);
                    if (!hasBytes) {
                        errors++;
                        lines.push('· ' + label + ': scaricato ma non salvato (spazio del telefono?)');
                    } else {
                        if (got) pulled++;
                        lines.push('· ' + label + ': OK');
                    }
                } catch (err) {
                    errors++;
                    lines.push('· ' + label + ': ERRORE ' + ((err && err.message) || 'sconosciuto'));
                    console.warn('[ServiceHub] refresh rapportino', it.id, err);
                }
            }
            window.renderWordRapportiniList();
            var localList = window.listWordRapportini();
            if (errors || !localList.length) {
                alert('Sul cloud: ' + items.length + ' documento/i\n' +
                    (lines.length ? lines.join('\n') : '(nessuno)') +
                    '\n\nIn elenco qui: ' + localList.length +
                    (localList.length ? '\n' + localList.map(function (m) { return '· ' + m.name; }).join('\n') : ''));
            } else if (pulled) {
                toast('Aggiornato: ' + pulled + ' file scaricati dal cloud.');
            } else {
                toast('Già allineato: ' + localList.length + ' documento/i in elenco.');
            }
            return true;
        } catch (err) {
            console.warn('[ServiceHub] refresh rapportini:', err);
            alert('Aggiornamento fallito: ' + ((err && err.message) || 'errore rete') +
                (lines.length ? '\n\n' + lines.join('\n') : ''));
            return false;
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Aggiorna dal cloud'; }
        }
    };

    /** Chiamato da index.html dopo login Firebase. */
    window.wireWordRapportiniCloudSync = function (api) {
        if (!api || !api.db || !api.appId || !api.doc || !api.setDoc) {
            console.warn('[ServiceHub] wireWordRapportiniCloudSync: api incompleta');
            return;
        }
        __wrCloud = {
            db: api.db,
            appId: api.appId,
            userUid: api.userUid || '',
            doc: api.doc,
            setDoc: api.setDoc,
            getDoc: api.getDoc,
            getDocFromServer: api.getDocFromServer,
            deleteDoc: api.deleteDoc,
            onSnapshot: api.onSnapshot,
            collection: api.collection,
            getDocs: api.getDocs
        };
        if (__wrCloudUnsub) {
            try { __wrCloudUnsub(); } catch (_) {}
            __wrCloudUnsub = null;
        }
        var indexRef = api.doc(api.db, 'artifacts', api.appId, 'sharedDial', 'wordRapportini');
        // Prima lettura + push di eventuali file solo-locali
        api.getDoc(indexRef).then(function (snap) {
            if (snap.exists()) {
                return applyWordRapportiniCloudIndex(snap.data());
            }
            // Cloud vuoto: pubblica i file già presenti su questo dispositivo
            var local = loadMeta();
            if (!local.length) return null;
            return Promise.all(local.map(function (m) {
                return window.__pushWordRapportinoToCloud(m.id);
            }));
        }).catch(function (err) {
            console.warn('[ServiceHub] wordRapportini getDoc:', err && err.message);
        });

        if (api.onSnapshot) {
            __wrCloudUnsub = api.onSnapshot(indexRef, function (snapshot) {
                var md = snapshot.metadata;
                if (md && md.hasPendingWrites) return;
                if (!snapshot.exists()) return;
                void applyWordRapportiniCloudIndex(snapshot.data());
            }, function (error) {
                console.warn('[ServiceHub] wordRapportini snapshot:', error && error.message);
            });
        }
        console.info('[ServiceHub] sync rapportini ufficiali attivo (multi-dispositivo)');
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
