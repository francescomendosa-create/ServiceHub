package it.servicehub.tablet;

import android.annotation.SuppressLint;
import android.os.Build;
import android.view.MotionEvent;
import android.webkit.WebView;

/**
 * Solo focus sul campo. Non avvia la tastiera Samsung: inserisce lettere e blocca il taglio.
 */
final class SpenSamsungIme {
    private final WebView webView;
    private boolean focusing;
    private long lastHoverMs;

    SpenSamsungIme(WebView webView) {
        this.webView = webView;
    }

    @SuppressLint("ClickableViewAccessibility")
    void attach() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            webView.setAutoHandwritingEnabled(false);
        }
        webView.setOnTouchListener((v, ev) -> {
            if (!isPen(ev)) return false;
            if (ev.getActionMasked() == MotionEvent.ACTION_DOWN) {
                focusField(ev.getX(), ev.getY());
            }
            return false;
        });
        webView.setOnHoverListener((v, ev) -> {
            if (!isPen(ev)) return false;
            int action = ev.getActionMasked();
            if (action == MotionEvent.ACTION_HOVER_ENTER || action == MotionEvent.ACTION_HOVER_MOVE) {
                long now = android.os.SystemClock.uptimeMillis();
                if (now - lastHoverMs < 220) return false;
                lastHoverMs = now;
                focusField(ev.getX(), ev.getY());
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

    private void focusField(float viewX, float viewY) {
        if (focusing || webView.getWidth() < 8 || webView.getHeight() < 8) return;
        focusing = true;
        webView.postDelayed(() -> focusing = false, 600);
        int vw = webView.getWidth();
        int vh = webView.getHeight();
        String js = "(function(ax,ay,vw,vh){try{"
                + "var x=ax*(window.innerWidth||1)/vw;"
                + "var y=ay*(window.innerHeight||1)/vh;"
                + "var inp=null;"
                + "if(window.__shSpenFindWritableInputAt)inp=window.__shSpenFindWritableInputAt(x,y);"
                + "if(!inp){var el=document.elementFromPoint(x,y);"
                + "if(window.__shSpenFindWritableInput)inp=window.__shSpenFindWritableInput(el);}"
                + "if(!inp)return false;"
                + "try{inp.focus({preventScroll:true});}catch(e){try{inp.focus();}catch(e2){}}"
                + "return true;}catch(e){return false;}})("
                + viewX + "," + viewY + "," + vw + "," + vh + ")";
        webView.evaluateJavascript(js, r -> focusing = false);
    }
}
