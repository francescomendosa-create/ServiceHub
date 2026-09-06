package it.servicehub.tablet;

import android.annotation.SuppressLint;
import android.os.Build;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.webkit.WebView;

/**
 * Come Samsung Notes: la penna resta sull'inchiostro del campo.
 * Non si avvia l'IME handwriting: quello converte in diretta e inserisce simboli.
 */
final class SpenSamsungIme {
    private final WebView webView;
    private long lastHoverMs;
    private String lastHoverKey = "";

    SpenSamsungIme(WebView webView) {
        this.webView = webView;
    }

    @SuppressLint("ClickableViewAccessibility")
    void attach() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            webView.setAutoHandwritingEnabled(false);
        }
        webView.setOnHoverListener((v, ev) -> {
            if (!isPen(ev)) return false;
            int action = ev.getActionMasked();
            if (action == MotionEvent.ACTION_HOVER_ENTER || action == MotionEvent.ACTION_HOVER_MOVE) {
                long now = SystemClock.uptimeMillis();
                if (now - lastHoverMs < 28) return false;
                lastHoverMs = now;
                hoverAt(ev.getX(), ev.getY());
            } else if (action == MotionEvent.ACTION_HOVER_EXIT) {
                lastHoverKey = "";
                webView.evaluateJavascript(
                        "(function(){try{if(window.__shSpenHideBox)window.__shSpenHideBox();return true;}catch(e){return false;}})()",
                        null);
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

    private void hoverAt(float viewX, float viewY) {
        if (webView.getWidth() < 8 || webView.getHeight() < 8) return;
        int vw = webView.getWidth();
        int vh = webView.getHeight();
        String key = Math.round(viewX / 8f) + ":" + Math.round(viewY / 8f);
        if (key.equals(lastHoverKey)) return;
        lastHoverKey = key;
        String js = "(function(ax,ay,vw,vh){try{"
                + "var x=ax*(window.innerWidth||1)/vw;"
                + "var y=ay*(window.innerHeight||1)/vh;"
                + "if(window.__shSpenHoverAt)return!!window.__shSpenHoverAt(x,y);"
                + "return false;}catch(e){return false;}})("
                + viewX + "," + viewY + "," + vw + "," + vh + ")";
        webView.evaluateJavascript(js, null);
    }
}
