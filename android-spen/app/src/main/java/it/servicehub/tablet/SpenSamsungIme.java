package it.servicehub.tablet;

import android.annotation.SuppressLint;
import android.os.Build;
import android.util.Log;
import android.view.MotionEvent;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;

/**
 * Avvia il motore S Pen Samsung (tastiera / S Pen to Text) sulla WebView.
 * Non ruba i tratti: il sito può di nuovo mostrare il rettangolo e cancellare.
 */
final class SpenSamsungIme {
    private static final String TAG = "ShSpenInk";
    private final WebView webView;
    private final InputMethodManager imm;
    private boolean starting;
    private long lastHoverMs;

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
                tryStart(ev.getX(), ev.getY(), true);
            }
            return false;
        });
        webView.setOnHoverListener((v, ev) -> {
            if (!isPen(ev)) return false;
            int action = ev.getActionMasked();
            if (action == MotionEvent.ACTION_HOVER_ENTER || action == MotionEvent.ACTION_HOVER_MOVE) {
                long now = android.os.SystemClock.uptimeMillis();
                if (now - lastHoverMs < 180) return false;
                lastHoverMs = now;
                tryStart(ev.getX(), ev.getY(), false);
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

    private void tryStart(float viewX, float viewY, boolean startIme) {
        if (starting || webView.getWidth() < 8 || webView.getHeight() < 8) return;
        starting = true;
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
                webView.post(() -> {
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
                                && imm != null && imm.isStylusHandwritingAvailable()) {
                            imm.startStylusHandwriting(webView);
                            Log.i(TAG, "samsung ime avviato");
                        }
                    } catch (Exception e) {
                        Log.w(TAG, "samsung ime", e);
                    } finally {
                        starting = false;
                    }
                });
            } else {
                starting = false;
            }
        });
    }
}
