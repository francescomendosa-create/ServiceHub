package it.servicehub.tablet;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.content.FileProvider;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Ponte JS ↔ Android. Visibile solo dentro l'APK tablet.
 * Riconosce solo a penna alzata; se non è un numero restituisce vuoto.
 */
public final class SpenBridge {
    private static final String TAG = "ShSpenInk";
    private static final String GEMINI_HOST = "https://generativelanguage.googleapis.com/";
    private static final String HUB_REFERER = "https://francescomendosa-create.github.io/ServiceHub/";
    private static final String HUB_ORIGIN = "https://francescomendosa-create.github.io";
    private static final String HUB_UA =
            "Mozilla/5.0 (Linux; Android 14; SM-X730) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
    private final Activity activity;
    private final WebView webView;
    private final InkRecognizer ink;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService net = Executors.newSingleThreadExecutor();
    private final Runnable startOcrCamera;
    private final Map<String, StringBuilder> geminiBuf = new ConcurrentHashMap<>();
    private final Map<String, String> geminiUrl = new ConcurrentHashMap<>();
    private final StringBuilder shareB64 = new StringBuilder();
    private String shareFileName = "Report_Stabile.jpg";
    volatile String lastGeminiRaw = "";

    SpenBridge(Activity activity, WebView webView, InkRecognizer ink, Runnable startOcrCamera) {
        this.activity = activity;
        this.webView = webView;
        this.ink = ink;
        this.startOcrCamera = startOcrCamera;
    }

    private Activity hostActivity() {
        if (activity != null && !activity.isFinishing()) return activity;
        Context ctx = webView != null ? webView.getContext() : null;
        int guard = 0;
        while (ctx != null && guard++ < 8) {
            if (ctx instanceof Activity) return (Activity) ctx;
            if (ctx instanceof android.content.ContextWrapper) {
                ctx = ((android.content.ContextWrapper) ctx).getBaseContext();
                continue;
            }
            break;
        }
        return null;
    }

    @JavascriptInterface
    public boolean isNative() {
        return true;
    }

    /** Condivisione report: WebView non ha navigator.share con file. */
    @JavascriptInterface
    public synchronized void shareBegin(String fileName) {
        shareB64.setLength(0);
        if (fileName != null && !fileName.trim().isEmpty()) {
            shareFileName = fileName.trim().replaceAll("[\\\\/:*?\"<>|]", "_");
        } else {
            shareFileName = "Report_Stabile.jpg";
        }
        Log.i(TAG, "shareBegin name=" + shareFileName);
    }

    @JavascriptInterface
    public synchronized void shareChunk(String chunk) {
        if (chunk == null || chunk.isEmpty()) return;
        shareB64.append(chunk);
    }

    @JavascriptInterface
    public synchronized void shareEnd(String mimeType, String title) {
        final String b64 = shareB64.toString();
        shareB64.setLength(0);
        final String name = shareFileName;
        final String mime = (mimeType == null || mimeType.trim().isEmpty())
                ? "image/jpeg" : mimeType.trim();
        final String shareTitle = (title == null || title.trim().isEmpty())
                ? "Report Stabile" : title.trim();
        Log.i(TAG, "shareEnd chars=" + b64.length() + " mime=" + mime);
        main.post(() -> openShareChooser(b64, name, mime, shareTitle));
    }

    private void openShareChooser(String b64, String fileName, String mime, String title) {
        try {
            Activity act = hostActivity();
            if (act == null) {
                Log.w(TAG, "share: Activity non trovata ctx=" + (webView != null ? webView.getContext() : null));
                return;
            }
            String raw = b64 == null ? "" : b64.trim();
            int comma = raw.indexOf(',');
            if (raw.startsWith("data:") && comma > 0) raw = raw.substring(comma + 1);
            if (raw.isEmpty()) {
                Log.w(TAG, "shareEnd vuoto");
                return;
            }
            byte[] bytes = Base64.decode(raw, Base64.DEFAULT);
            File dir = new File(act.getCacheDir(), "share");
            if (!dir.exists() && !dir.mkdirs()) {
                Log.w(TAG, "share mkdir fail");
                return;
            }
            File out = new File(dir, fileName);
            try (FileOutputStream fos = new FileOutputStream(out, false)) {
                fos.write(bytes);
                fos.flush();
            }
            Uri uri = FileProvider.getUriForFile(act, act.getPackageName() + ".fileprovider", out);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, title);
            send.putExtra(Intent.EXTRA_TITLE, title);
            send.setClipData(android.content.ClipData.newUri(act.getContentResolver(), title, uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, title);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            act.startActivity(chooser);
            Log.i(TAG, "share chooser aperto bytes=" + bytes.length);
        } catch (Exception e) {
            Log.w(TAG, "shareEnd", e);
        }
    }

    @JavascriptInterface
    public void startOcrCamera() {
        Log.i(TAG, "startOcrCamera");
        if (startOcrCamera != null) main.post(startOcrCamera);
    }

    @JavascriptInterface
    public void ocrDebug(String msg) {
        Log.i(TAG, "ocr " + (msg == null ? "" : msg));
    }

    @JavascriptInterface
    public int ocrJpegLen() {
        String s = HubWebChrome.lastOcrB64;
        return s == null ? 0 : s.length();
    }

    @JavascriptInterface
    public int geminiRespLen() {
        String s = lastGeminiRaw;
        return s == null ? 0 : s.length();
    }

    @JavascriptInterface
    public String geminiRespSlice(int start, int len) {
        String s = lastGeminiRaw;
        if (s == null || s.isEmpty()) return "";
        int a = Math.max(0, start);
        int b = Math.min(s.length(), a + Math.max(0, len));
        if (a >= b) return "";
        return s.substring(a, b);
    }

    @JavascriptInterface
    public String ocrJpegSlice(int start, int len) {
        String s = HubWebChrome.lastOcrB64;
        if (s == null || s.isEmpty()) return "";
        int a = Math.max(0, start);
        int b = Math.min(s.length(), a + Math.max(0, len));
        if (a >= b) return "";
        return s.substring(a, b);
    }

    @JavascriptInterface
    public void setNoteHandwriting(boolean enabled) {
        main.post(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                webView.setAutoHandwritingEnabled(enabled);
            }
        });
    }

    @JavascriptInterface
    public void setNoteSoftInput(boolean enabled) {
        main.post(() -> {
            Context ctx = webView.getContext();
            if (!(ctx instanceof Activity)) return;
            Activity act = (Activity) ctx;
            InputMethodManager imm = (InputMethodManager) act.getSystemService(Context.INPUT_METHOD_SERVICE);
            if (enabled) {
                act.getWindow().setSoftInputMode(
                        WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
                                | WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE);
                webView.requestFocus();
                if (imm != null) imm.showSoftInput(webView, InputMethodManager.SHOW_IMPLICIT);
            } else {
                act.getWindow().setSoftInputMode(
                        WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING
                                | WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN);
                if (imm != null) imm.hideSoftInputFromWindow(webView.getWindowToken(), 0);
            }
        });
    }

    @JavascriptInterface
    public synchronized void geminiBegin(String requestId, String url) {
        if (requestId == null) return;
        geminiBuf.put(requestId, new StringBuilder());
        geminiUrl.put(requestId, url == null ? "" : url);
    }

    @JavascriptInterface
    public synchronized void geminiChunk(String requestId, String chunk) {
        if (requestId == null || chunk == null) return;
        StringBuilder buf = geminiBuf.get(requestId);
        if (buf != null) buf.append(chunk);
    }

    @JavascriptInterface
    public synchronized void geminiEnd(String requestId) {
        if (requestId == null) return;
        String url = geminiUrl.remove(requestId);
        StringBuilder buf = geminiBuf.remove(requestId);
        geminiPost(requestId, url, buf == null ? "{}" : buf.toString());
    }

    @JavascriptInterface
    public void geminiPost(String requestId, String url, String bodyJson) {
        if (requestId == null) return;
        String target = url == null ? "" : url.trim();
        if (!target.startsWith(GEMINI_HOST)) {
            deliverRaw(requestId, "{\"error\":{\"message\":\"URL Gemini non valido\"}}");
            return;
        }
        String body = bodyJson == null ? "{}" : bodyJson;
        Log.i(TAG, "geminiPost bytes=" + body.length());
        net.execute(() -> {
            try {
                String resp = httpPostJson(target, body);
                Log.i(TAG, "geminiResp chars=" + (resp == null ? 0 : resp.length())
                        + " head=" + (resp == null ? "" : resp.substring(0, Math.min(180, resp.length()))));
                deliverRaw(requestId, resp);
            } catch (Exception e) {
                String msg = e.getMessage() == null ? "rete" : e.getMessage();
                deliverRaw(requestId, "{\"error\":{\"message\":\"" + msg.replace("\\", " ").replace("\"", "'") + "\"}}");
            }
        });
    }

    @JavascriptInterface
    public void recognizeText(String requestId, String strokesJson) {
        if (requestId == null) return;
        String json = strokesJson == null ? "[]" : strokesJson;
        ink.recognizeTextJson(json).addOnSuccessListener(text -> {
            String out = text == null ? "" : text.trim();
            Log.i(TAG, "commit testo=" + out);
            deliverRaw(requestId, out);
        }).addOnFailureListener(e -> {
            Log.w(TAG, "recognizeText", e);
            deliverRaw(requestId, "");
        });
    }

    @JavascriptInterface
    public void recognize(String requestId, String strokesJson) {
        if (requestId == null) return;
        String json = strokesJson == null ? "[]" : strokesJson;
        ink.recognizeJson(json).addOnSuccessListener(text -> {
            String n = InkRecognizer.normalizeNumber(text);
            Log.i(TAG, "commit numero=" + n);
            deliver(requestId, n);
        }).addOnFailureListener(e -> {
            Log.w(TAG, "recognize", e);
            deliver(requestId, "");
        });
    }

    private static String httpPostJson(String url, String body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod("POST");
        c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        c.setRequestProperty("Referer", HUB_REFERER);
        c.setRequestProperty("Origin", HUB_ORIGIN);
        c.setRequestProperty("User-Agent", HUB_UA);
        c.setConnectTimeout(20000);
        c.setReadTimeout(80000);
        c.setDoOutput(true);
        byte[] raw = body.getBytes(StandardCharsets.UTF_8);
        c.setFixedLengthStreamingMode(raw.length);
        try (OutputStream os = c.getOutputStream()) {
            os.write(raw);
        }
        int code = c.getResponseCode();
        Log.i(TAG, "gemini HTTP " + code);
        InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
        if (in == null) return "{\"error\":{\"message\":\"HTTP " + code + "\"}}";
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) >= 0) out.write(buf, 0, n);
        in.close();
        c.disconnect();
        return out.toString(StandardCharsets.UTF_8.name());
    }

    private void deliverRaw(String requestId, String text) {
        lastGeminiRaw = text == null ? "" : text;
        try {
            java.io.File dir = new java.io.File(webView.getContext().getCacheDir(), "ocr");
            if (dir.exists() || dir.mkdirs()) {
                java.io.FileWriter w = new java.io.FileWriter(new java.io.File(dir, "last_gemini.txt"));
                w.write(lastGeminiRaw);
                w.close();
            }
        } catch (Exception ignored) {}
        String safeId = requestId.replace("\\", "\\\\").replace("'", "\\'");
        String js = "window.__shSpenNativeResult&&window.__shSpenNativeResult('"
                + safeId + "',(window.__shPullGeminiResp?window.__shPullGeminiResp():''))";
        main.post(() -> webView.evaluateJavascript(js, null));
    }

    private void deliver(String requestId, String text) {
        String safeId = requestId.replace("\\", "\\\\").replace("'", "\\'");
        String safeText = (text == null ? "" : text)
                .replace("\\", "\\\\")
                .replace("'", "\\'")
                .replace("\n", " ")
                .replace("\r", "");
        String js = "window.__shSpenNativeResult&&window.__shSpenNativeResult('"
                + safeId + "','" + safeText + "')";
        main.post(() -> webView.evaluateJavascript(js, null));
    }
}
