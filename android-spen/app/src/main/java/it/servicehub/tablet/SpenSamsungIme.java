package it.servicehub.tablet;

import android.annotation.SuppressLint;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;
import android.view.MotionEvent;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;

/**
 * Motore S Pen Samsung (S Pen to Text). Timeout così non resta bloccato.
 */
final class SpenSamsungIme {
    private static final String TAG = "ShSpenInk";
    private final WebView webView;
    private final InputMethodManager imm;
    private boolean busy;
    private long lastHoverMs;
    private long lastStartMs;

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
                focusAndStart(ev.getX(), ev.getY(), true);
            }
            return false;
        });
        webView.setOnHoverListener((v, ev) -> {
            if (!isPen(ev)) return false;
            int action = ev.getActionMasked();
            if (action == MotionEvent.ACTION_HOVER_ENTER || action == MotionEvent.ACTION_HOVER_MOVE) {
                long now = SystemClock.uptimeMillis();
                if (now - lastHoverMs < 220) return false;
                lastHoverMs = now;
                focusAndStart(ev.getX(), ev.getY(), false);
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

    private void focusAndStart(float viewX, float viewY, boolean startIme) {
        if (busy || webView.getWidth() < 8 || webView.getHeight() < 8) return;
        busy = true;
        webView.postDelayed(() -> busy = false, 900);
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
        webView.evaluateJavascript(js, result -> {
            boolean hit = result != null && result.contains("true");
            if (hit && startIme) {
                webView.post(this::startSamsung);
            } else {
                busy = false;
            }
        });
    }

    private void startSamsung() {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return;
            if (imm == null || !imm.isStylusHandwritingAvailable()) {
                Log.w(TAG, "samsung ime non disponibile");
                return;
            }
            long now = SystemClock.uptimeMillis();
            if (now - lastStartMs < 350) return;
            lastStartMs = now;
            imm.startStylusHandwriting(webView);
            Log.i(TAG, "samsung ime avviato");
        } catch (Exception e) {
            Log.w(TAG, "samsung ime", e);
        } finally {
            busy = false;
        }
    }
}
