package it.servicehub.tablet;

import android.content.Context;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.webkit.WebView;
import android.widget.FrameLayout;

/**
 * Dito → WebView. S Pen → overlay nativo. Non passa dal sito.
 */
public final class TouchSplitLayout extends FrameLayout {
    public TouchSplitLayout(Context context) {
        super(context);
    }

    public TouchSplitLayout(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        WebView web = findViewById(R.id.hub_webview);
        SpenOverlayView overlay = findViewById(R.id.spen_overlay);
        int tool = ev.getPointerCount() > 0 ? ev.getToolType(0) : MotionEvent.TOOL_TYPE_UNKNOWN;
        if (SpenOverlayView.isPenTool(tool) && overlay != null) {
            if (overlay.dispatchTouchEvent(ev)) return true;
        }
        if (web != null) return web.dispatchTouchEvent(ev);
        return super.dispatchTouchEvent(ev);
    }
}
