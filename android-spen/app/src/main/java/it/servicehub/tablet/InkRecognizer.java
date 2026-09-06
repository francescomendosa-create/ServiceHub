package it.servicehub.tablet;

import android.util.Log;

import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.common.model.RemoteModelManager;
import com.google.mlkit.vision.digitalink.common.RecognitionResult;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognition;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognitionModel;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognitionModelIdentifier;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognizer;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognizerOptions;
import com.google.mlkit.vision.digitalink.recognition.Ink;
import com.google.mlkit.vision.digitalink.recognition.RecognitionContext;
import com.google.mlkit.vision.digitalink.recognition.WritingArea;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

/**
 * Motore nativo on-device (ML Kit Digital Ink). Solo APK tablet.
 */
final class InkRecognizer {
    private static final String TAG = "ShSpenInk";
    private final Executor io = Executors.newSingleThreadExecutor();
    private DigitalInkRecognizer recognizer;
    private DigitalInkRecognitionModel model;
    private volatile boolean ready;

    Task<Void> ensureReady() {
        if (ready && recognizer != null) {
            return Tasks.forResult(null);
        }
        return Tasks.call(io, () -> {
            prepareLocked();
            return null;
        });
    }

    private void prepareLocked() throws Exception {
        DigitalInkRecognitionModelIdentifier id = pickModelId();
        model = DigitalInkRecognitionModel.builder(id).build();
        RemoteModelManager mgr = RemoteModelManager.getInstance();
        Boolean downloaded = Tasks.await(mgr.isModelDownloaded(model));
        if (downloaded == null || !downloaded) {
            Log.i(TAG, "download modello ink");
            Tasks.await(mgr.download(model, new DownloadConditions.Builder().build()));
        }
        if (recognizer != null) {
            try {
                recognizer.close();
            } catch (Exception ignored) {
            }
        }
        DigitalInkRecognizerOptions.Builder opt = DigitalInkRecognizerOptions.builder(model);
        try {
            opt.setMaxResultCount(16);
        } catch (Throwable ignored) {
        }
        recognizer = DigitalInkRecognition.getClient(opt.build());
        ready = true;
        Log.i(TAG, "ink pronto");
    }

    private static DigitalInkRecognitionModelIdentifier pickModelId() throws Exception {
        Exception last = null;
        String[] tags = {"en-US", "en", "it-IT"};
        for (String tag : tags) {
            try {
                DigitalInkRecognitionModelIdentifier id =
                        DigitalInkRecognitionModelIdentifier.fromLanguageTag(tag);
                if (id != null) return id;
            } catch (Exception e) {
                last = e;
            }
        }
        if (last != null) throw last;
        throw new IllegalStateException("modello ink non disponibile");
    }

    Task<String> recognizeJson(String strokesJson) {
        return ensureReady().continueWithTask(task -> {
            if (!task.isSuccessful()) {
                Log.e(TAG, "ink non pronto", task.getException());
                ready = false;
                return Tasks.forException(task.getException() != null
                        ? task.getException()
                        : new IllegalStateException("ink non pronto"));
            }
            return Tasks.call(io, () -> recognizeBlocking(strokesJson));
        });
    }

    private String recognizeBlocking(String strokesJson) throws Exception {
        JSONArray strokes = new JSONArray(strokesJson);
        float minx = Float.MAX_VALUE, miny = Float.MAX_VALUE, maxx = -Float.MAX_VALUE, maxy = -Float.MAX_VALUE;
        int added = 0;
        for (int s = 0; s < strokes.length(); s++) {
            JSONArray pts = strokes.getJSONArray(s);
            for (int i = 0; i < pts.length(); i++) {
                JSONObject p = pts.getJSONObject(i);
                float x = (float) p.optDouble("x", 0);
                float y = (float) p.optDouble("y", 0);
                if (x < minx) minx = x;
                if (y < miny) miny = y;
                if (x > maxx) maxx = x;
                if (y > maxy) maxy = y;
                added++;
            }
        }
        if (added == 0) return "";
        float rawH = Math.max(8f, maxy - miny);
        float rawW = Math.max(8f, maxx - minx);
        float scale = Math.min(8f, Math.max(1f, 280f / rawH));
        if (rawW * scale < 80f) scale = Math.max(scale, 80f / rawW);
        Ink.Builder ink = Ink.builder();
        long lastT = -1;
        for (int s = 0; s < strokes.length(); s++) {
            JSONArray pts = strokes.getJSONArray(s);
            if (pts.length() < 1) continue;
            Ink.Stroke.Builder stroke = Ink.Stroke.builder();
            for (int i = 0; i < pts.length(); i++) {
                JSONObject p = pts.getJSONObject(i);
                float x = ((float) p.optDouble("x", 0) - minx) * scale + 24f;
                float y = ((float) p.optDouble("y", 0) - miny) * scale + 24f;
                long t = p.has("t") ? (long) p.optDouble("t", i * 16L) : i * 16L;
                if (t <= lastT) t = lastT + 8;
                lastT = t;
                stroke.addPoint(Ink.Point.create(x, y, t));
            }
            ink.addStroke(stroke.build());
        }
        float w = rawW * scale + 48f;
        float h = rawH * scale + 48f;
        RecognitionContext ctx = RecognitionContext.builder()
                .setPreContext("0123456789,")
                .setWritingArea(new WritingArea(w, h))
                .build();
        RecognitionResult result;
        try {
            result = Tasks.await(recognizer.recognize(ink.build(), ctx));
        } catch (Exception first) {
            Log.w(TAG, "recognize fallito, ritento download", first);
            ready = false;
            try {
                Tasks.await(RemoteModelManager.getInstance().deleteDownloadedModel(model));
            } catch (Exception ignored) {
            }
            prepareLocked();
            result = Tasks.await(recognizer.recognize(ink.build(), ctx));
        }
        if (result.getCandidates() == null || result.getCandidates().isEmpty()) {
            Log.i(TAG, "nessun candidato");
            return "";
        }
        String picked = pickBestNumber(result);
        Log.i(TAG, "riconosciuto=" + picked + " raw0=" + result.getCandidates().get(0).getText());
        return picked;
    }

    private static String pickBestNumber(RecognitionResult result) {
        String best = "";
        int bestDigits = 0;
        for (int i = 0; i < result.getCandidates().size(); i++) {
            String raw = result.getCandidates().get(i).getText();
            String n = normalizeNumber(raw);
            if (n.isEmpty()) continue;
            int d = 0;
            for (int c = 0; c < n.length(); c++) {
                if (n.charAt(c) >= '0' && n.charAt(c) <= '9') d++;
            }
            if (d > bestDigits || (d == bestDigits && n.length() > best.length())) {
                best = n;
                bestDigits = d;
            }
            if (bestDigits >= 1 && i >= 8) break;
        }
        if (!best.isEmpty()) return best;
        String first = result.getCandidates().get(0).getText();
        return first == null ? "" : first.trim();
    }

    static String normalizeNumber(String text) {
        if (text == null) return "";
        String s = text.trim()
                .replace('o', '0').replace('O', '0')
                .replace('l', '1').replace('I', '1').replace('|', '1')
                .replace('s', '5').replace('S', '5')
                .replace('b', '8').replace('B', '8')
                .replaceAll("\\s+", "")
                .replace('.', ',')
                .replaceAll("[^0-9,\\-]", "");
        int i = s.indexOf(',');
        if (i >= 0) {
            s = s.substring(0, i + 1) + s.substring(i + 1).replace(",", "");
        }
        return s;
    }
}
