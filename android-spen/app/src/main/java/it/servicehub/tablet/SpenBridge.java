package it.servicehub.tablet;

import android.app.Activity;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import java.io.ByteArrayOutputStream;
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
    private final WebView webView;
    private final InkRecognizer ink;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService net = Executors.newSingleThreadExecutor();
    private final Runnable startOcrCamera;
    private final Map<String, StringBuilder> geminiBuf = new ConcurrentHashMap<>();
    private final Map<String, String> geminiUrl = new ConcurrentHashMap<>();
    volatile String lastGeminiRaw = "";

    SpenBridge(WebView webView, InkRecognizer ink, Runnable startOcrCamera) {
        this.webView = webView;
        this.ink = ink;
        this.startOcrCamera = startOcrCamera;
    }

    @JavascriptInterface
    public boolean isNative() {
        return true;
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
