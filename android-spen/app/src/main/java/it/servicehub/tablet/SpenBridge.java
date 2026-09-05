package it.servicehub.tablet;

import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

/**
 * Ponte JS ↔ Android. Visibile solo dentro l'APK tablet.
 */
public final class SpenBridge {
    private final WebView webView;
    private final InkRecognizer ink;
    private final Handler main = new Handler(Looper.getMainLooper());

    SpenBridge(WebView webView, InkRecognizer ink) {
        this.webView = webView;
        this.ink = ink;
    }

    @JavascriptInterface
    public boolean isNative() {
        return true;
    }

    @JavascriptInterface
    public void recognize(String requestId, String strokesJson) {
        if (requestId == null) return;
        String json = strokesJson == null ? "[]" : strokesJson;
        ink.recognizeJson(json)
                .addOnSuccessListener(text -> deliver(requestId, text == null ? "" : text))
                .addOnFailureListener(err -> deliver(requestId, ""));
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
