package it.servicehub.tablet;

import android.annotation.SuppressLint;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;
import android.view.MotionEvent;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;

/**
 * Hover S Pen → seleziona subito il campo. IME Samsung solo al tocco.
 */
final class SpenSamsungIme {
    private static final String TAG = "ShSpenInk";
    private final WebView webView;
    private final InputMethodManager imm;
    private long lastHoverMs;
    private long lastStartMs;
    private String lastHoverKey = "";

    SpenSamsungIme(WebView webView) {
        this.webView = webView;
        this.imm = (InputMethodManager) webView.getContext()
                .getSystemService(android.content.Context.INPUT_METHOD_SERVICE);
    }

    @SuppressLint("ClickableViewAccessibility")
    void attach() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            webView.setAutoHandwritingEnabled(false);
        }
        webView.setOnTouchListener((v, ev) -> {
            if (!isPen(ev)) return false;
            if (ev.getActionMasked() == MotionEvent.ACTION_DOWN) {
                pointAt(ev.getX(), ev.getY(), true);
            }
            return false;
        });
        webView.setOnHoverListener((v, ev) -> {
            if (!isPen(ev)) return false;
            int action = ev.getActionMasked();
            if (action == MotionEvent.ACTION_HOVER_ENTER || action == MotionEvent.ACTION_HOVER_MOVE) {
                long now = SystemClock.uptimeMillis();
                if (now - lastHoverMs < 28) return false;
                lastHoverMs = now;
                pointAt(ev.getX(), ev.getY(), false);
            }
            return false;
        });
    }

    private static boolean isPen(MotionEvent ev) {
        if (ev == null || ev.getPointerCount() < 1) return false;
        int tool = ev.getToolType(0);
        return tool == MotionEvent.TOOL_TYPE_STYLUS
                || tool == MotionEvent.TOOL_TYPE_ERASER
                || tool == MotionEvent.TOOL_TYPE_MOUSE;
    }

    private void pointAt(float viewX, float viewY, boolean startIme) {
        if (webView.getWidth() < 8 || webView.getHeight() < 8) return;
        int vw = webView.getWidth();
        int vh = webView.getHeight();
        String key = Math.round(viewX / 8f) + ":" + Math.round(viewY / 8f);
        if (!startIme && key.equals(lastHoverKey)) return;
        lastHoverKey = key;
        String js = "(function(ax,ay,vw,vh){try{"
                + "var x=ax*(window.innerWidth||1)/vw;"
                + "var y=ay*(window.innerHeight||1)/vh;"
                + "if(window.__shSpenPointAt)return!!window.__shSpenPointAt(x,y);"
                + "return false;}catch(e){return false;}})("
                + viewX + "," + viewY + "," + vw + "," + vh + ")";
        webView.evaluateJavascript(js, result -> {
            boolean hit = result != null && result.contains("true");
            if (hit && startIme) {
                webView.postDelayed(this::startSamsungIfNotCut, 120);
            }
        });
    }

    private void startSamsungIfNotCut() {
        webView.evaluateJavascript(
                "(function(){return !!(window.__shSpenSkipIme || (window.__shSpenInk&&window.__shSpenInk.imeCleared));})()",
                result -> {
                    if (result != null && result.contains("true")) {
                        Log.i(TAG, "samsung ime saltato (taglio)");
                        return;
                    }
                    startSamsung();
                }
        );
    }

    private void startSamsung() {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return;
            if (imm == null || !imm.isStylusHandwritingAvailable()) {
                Log.w(TAG, "samsung ime non disponibile");
                return;
            }
            long now = SystemClock.uptimeMillis();
            if (now - lastStartMs < 200) return;
            lastStartMs = now;
            imm.startStylusHandwriting(webView);
            Log.i(TAG, "samsung ime avviato");
        } catch (Exception e) {
            Log.w(TAG, "samsung ime", e);
        }
    }
}
