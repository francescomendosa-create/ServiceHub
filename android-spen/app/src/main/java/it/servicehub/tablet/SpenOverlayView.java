package it.servicehub.tablet;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.os.Handler;
import android.os.Looper;
import android.util.AttributeSet;
import android.util.Log;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Cattura la S Pen sopra i campi numero. Il sito web non viene modificato.
 */
public final class SpenOverlayView extends View {
    private static final String TAG = "ShSpenInk";
    private static final float FIELD_PAD = 18f;
    private static final long COMMIT_MS = 750;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final List<List<float[]>> strokes = new ArrayList<>();
    private final List<FieldHit> fields = new ArrayList<>();
    private List<float[]> current;
    private WebView webView;
    private InkRecognizer ink;
    private FieldHit target;
    private String originValue = "";
    private boolean writing;
    private long sessionStart;
    private final Runnable refreshFields = this::requestFieldCache;
    private final Runnable commitRun = this::commitNow;

    public SpenOverlayView(Context context) {
        super(context);
        init();
    }

    public SpenOverlayView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        setWillNotDraw(false);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeJoin(Paint.Join.ROUND);
        paint.setStrokeWidth(3.2f);
        paint.setColor(0xFF1D4ED8);
    }

    static boolean isPenTool(int tool) {
        return tool == MotionEvent.TOOL_TYPE_STYLUS
                || tool == MotionEvent.TOOL_TYPE_ERASER
                || tool == MotionEvent.TOOL_TYPE_MOUSE;
    }

    void attach(WebView webView, InkRecognizer ink) {
        this.webView = webView;
        this.ink = ink;
        main.post(refreshFields);
    }

    void onPageReady() {
        main.removeCallbacks(refreshFields);
        main.post(refreshFields);
        main.postDelayed(refreshFields, 400);
        main.postDelayed(refreshFields, 1200);
    }

    private void requestFieldCache() {
        if (webView == null || writing) return;
        int vw = Math.max(1, webView.getWidth());
        int vh = Math.max(1, webView.getHeight());
        webView.evaluateJavascript(
                "(function(){try{var o=[];"
                        + "var list=document.querySelectorAll('.main-container input,.main-container textarea');"
                        + "for(var i=0;i<list.length;i++){var el=list[i];"
                        + "if(!el||el.readOnly||el.disabled||el.type==='hidden'||el.type==='checkbox'||el.type==='radio')continue;"
                        + "if(el.id==='inp-sec-note')continue;"
                        + "var r=el.getBoundingClientRect();"
                        + "if(r.width<8||r.height<8)continue;"
                        + "o.push({i:i,id:el.id||'',v:String(el.value||''),l:r.left,t:r.top,w:r.width,h:r.height});"
                        + "}"
                        + "return JSON.stringify({iw:window.innerWidth||1,ih:window.innerHeight||1,"
                        + "dpr:window.devicePixelRatio||1,f:o});}catch(e){return '{}';}})()",
                json -> {
                    List<FieldHit> next = parseFields(unwrapJs(json), vw, vh);
                    fields.clear();
                    fields.addAll(next);
                    if (!writing) main.postDelayed(refreshFields, 600);
                }
        );
    }

    private static String unwrapJs(String raw) {
        if (raw == null || raw.equals("null")) return "{}";
        String s = raw.trim();
        if (s.length() >= 2 && s.charAt(0) == '"') {
            s = s.substring(1, s.length() - 1)
                    .replace("\\\"", "\"")
                    .replace("\\\\", "\\");
        }
        return s;
    }

    private static List<FieldHit> parseFields(String json, int viewW, int viewH) {
        List<FieldHit> out = new ArrayList<>();
        try {
            JSONObject root = new JSONObject(json);
            JSONArray arr = root.optJSONArray("f");
            if (arr == null) {
                arr = new JSONArray(json.startsWith("[") ? json : "[]");
            }
            float iw = (float) root.optDouble("iw", viewW);
            float ih = (float) root.optDouble("ih", viewH);
            if (iw < 1f) iw = viewW;
            if (ih < 1f) ih = viewH;
            float sx = viewW / iw;
            float sy = viewH / ih;
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                FieldHit f = new FieldHit();
                f.index = o.optInt("i", i);
                f.id = o.optString("id", "");
                f.value = o.optString("v", "");
                f.left = (float) o.optDouble("l", 0) * sx;
                f.top = (float) o.optDouble("t", 0) * sy;
                f.w = (float) o.optDouble("w", 0) * sx;
                f.h = (float) o.optDouble("h", 0) * sy;
                if ((f.id.isEmpty() && f.index < 0) || f.w <= 0 || f.h <= 0) continue;
                out.add(f);
            }
            Log.i(TAG, "campi=" + out.size() + " scale=" + sx + "x" + sy + " view=" + viewW + "x" + viewH);
        } catch (Exception e) {
            Log.w(TAG, "cache campi", e);
        }
        return out;
    }

    private FieldHit hit(float x, float y) {
        for (int i = 0; i < fields.size(); i++) {
            if (fields.get(i).contains(x, y, FIELD_PAD)) return fields.get(i);
        }
        return null;
    }

    @SuppressLint("ClickableViewAccessibility")
    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (!isPenTool(event.getToolType(0))) {
            return false;
        }
        float x = event.getX();
        float y = event.getY();
        int action = event.getActionMasked();
        if (action == MotionEvent.ACTION_DOWN) {
            FieldHit f = hit(x, y);
            if (f == null) return false;
            main.removeCallbacks(commitRun);
            if (writing && target != null && !sameField(target, f)) {
                commitNow();
            }
            target = f;
            originValue = f.value;
            writing = true;
            sessionStart = event.getEventTime();
            current = new ArrayList<>();
            addPoint(event, -1);
            if (webView != null) webView.requestDisallowInterceptTouchEvent(true);
            invalidate();
            return true;
        }
        if (!writing) return false;
        if (action == MotionEvent.ACTION_MOVE) {
            int hist = event.getHistorySize();
            for (int i = 0; i < hist; i++) addPoint(event, i);
            addPoint(event, -1);
            invalidate();
            return true;
        }
        if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
            if (current != null && !current.isEmpty()) strokes.add(current);
            current = null;
            if (webView != null) webView.requestDisallowInterceptTouchEvent(false);
            invalidate();
            main.removeCallbacks(commitRun);
            main.postDelayed(commitRun, COMMIT_MS);
            return true;
        }
        return true;
    }

    private void addPoint(MotionEvent event, int hist) {
        if (current == null) current = new ArrayList<>();
        float x = hist >= 0 ? event.getHistoricalX(hist) : event.getX();
        float y = hist >= 0 ? event.getHistoricalY(hist) : event.getY();
        long t = (hist >= 0 ? event.getHistoricalEventTime(hist) : event.getEventTime()) - sessionStart;
        current.add(new float[]{x, y, t});
    }

    private void commitNow() {
        if (!writing) return;
        List<List<float[]>> snap = new ArrayList<>(strokes);
        if (current != null && !current.isEmpty()) snap.add(new ArrayList<>(current));
        FieldHit field = target;
        String origin = originValue;
        strokes.clear();
        current = null;
        writing = false;
        target = null;
        invalidate();
        main.postDelayed(refreshFields, 200);
        if (field == null || snap.isEmpty() || ink == null) return;
        String json = strokesToJson(snap);
        Log.i(TAG, "commit campi=" + field.id + " tratti=" + snap.size());
        ink.recognizeJson(json).addOnSuccessListener(text -> applyValue(field, text, origin))
                .addOnFailureListener(err -> Log.e(TAG, "recognize", err));
    }

    private static String strokesToJson(List<List<float[]>> src) {
        JSONArray all = new JSONArray();
        try {
            for (int s = 0; s < src.size(); s++) {
                JSONArray pts = new JSONArray();
                List<float[]> stroke = src.get(s);
                for (int i = 0; i < stroke.size(); i++) {
                    float[] p = stroke.get(i);
                    JSONObject o = new JSONObject();
                    o.put("x", p[0]);
                    o.put("y", p[1]);
                    o.put("t", p[2]);
                    pts.put(o);
                }
                if (pts.length() > 0) all.put(pts);
            }
        } catch (Exception e) {
            Log.w(TAG, "json tratti", e);
        }
        return all.toString();
    }

    private static boolean sameField(FieldHit a, FieldHit b) {
        if (a == null || b == null) return false;
        if (!a.id.isEmpty() && a.id.equals(b.id)) return true;
        return a.index == b.index;
    }

    private void applyValue(FieldHit field, String raw, String origin) {
        if (webView == null || field == null) return;
        String val = InkRecognizer.normalizeNumber(raw);
        if (val.isEmpty()) {
            Log.i(TAG, "vuoto, non scrivo");
            return;
        }
        String safeId = field.id.replace("\\", "\\\\").replace("'", "\\'");
        String safeVal = val.replace("\\", "\\\\").replace("'", "\\'");
        String safeOrg = (origin == null ? "" : origin).replace("\\", "\\\\").replace("'", "\\'");
        String js = "(function(){var el=null;"
                + (safeId.isEmpty() ? "" : "el=document.getElementById('" + safeId + "');")
                + "if(!el){var list=document.querySelectorAll('.main-container input,.main-container textarea');"
                + "el=list[" + field.index + "]||null;}"
                + "if(!el)return false;"
                + "if(window.__shSpenApplyFieldEdit){"
                + "return!!window.__shSpenApplyFieldEdit(el,'" + safeVal + "','" + safeOrg + "','replace');"
                + "}"
                + "el.value='" + safeVal + "';"
                + "try{el.dispatchEvent(new Event('input',{bubbles:true}));}catch(e){}"
                + "try{el.dispatchEvent(new Event('change',{bubbles:true}));}catch(e){}"
                + "if(window.saveData)window.saveData(true);"
                + "return true;})()";
        main.post(() -> webView.evaluateJavascript(js, r -> Log.i(TAG, "scritto " + val + " -> " + r)));
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (!writing && strokes.isEmpty()) return;
        Path path = new Path();
        drawStrokes(path, strokes);
        if (current != null) {
            List<List<float[]>> one = new ArrayList<>();
            one.add(current);
            drawStrokes(path, one);
        }
        canvas.drawPath(path, paint);
    }

    private static void drawStrokes(Path path, List<List<float[]>> src) {
        for (int s = 0; s < src.size(); s++) {
            List<float[]> pts = src.get(s);
            if (pts.isEmpty()) continue;
            path.moveTo(pts.get(0)[0], pts.get(0)[1]);
            for (int i = 1; i < pts.size(); i++) path.lineTo(pts.get(i)[0], pts.get(i)[1]);
        }
    }

    static final class FieldHit {
        int index;
        String id;
        String value;
        float left, top, w, h;

        boolean contains(float x, float y, float pad) {
            return x >= left - pad && x <= left + w + pad && y >= top - pad && y <= top + h + pad;
        }
    }
}
