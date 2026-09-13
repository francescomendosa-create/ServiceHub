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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Ponte JS ↔ Android. Visibile solo dentro l'APK tablet.
 * Riconosce solo a penna alzata; se non è un numero restituisce vuoto.
 */
public final class SpenBridge {
    private static final String TAG = "ShSpenInk";
    private static final String GEMINI_HOST = "https://generativelanguage.googleapis.com/";
    private final WebView webView;
    private final InkRecognizer ink;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService net = Executors.newSingleThreadExecutor();
    private final Runnable startOcrCamera;

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
        if (startOcrCamera != null) main.post(startOcrCamera);
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
                deliverRaw(requestId, httpPostJson(target, body));
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
        c.setConnectTimeout(20000);
        c.setReadTimeout(65000);
        c.setDoOutput(true);
        byte[] raw = body.getBytes(StandardCharsets.UTF_8);
        c.setFixedLengthStreamingMode(raw.length);
        try (OutputStream os = c.getOutputStream()) {
            os.write(raw);
        }
        int code = c.getResponseCode();
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
        String safeId = requestId.replace("\\", "\\\\").replace("'", "\\'");
        String b64 = Base64.encodeToString(
                (text == null ? "" : text).getBytes(StandardCharsets.UTF_8),
                Base64.NO_WRAP);
        String js = "window.__shSpenNativeResult&&window.__shSpenNativeResult('"
                + safeId + "',(function(b){try{return decodeURIComponent(escape(atob(b)))}catch(e){try{return atob(b)}catch(e2){return ''}}})('"
                + b64 + "'))";
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
