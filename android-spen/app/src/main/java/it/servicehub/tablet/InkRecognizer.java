package it.servicehub.tablet;

import android.content.Context;

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
 * Motore nativo on-device (ML Kit Digital Ink). Non tocca il sito web.
 */
final class InkRecognizer {
    private final Executor io = Executors.newSingleThreadExecutor();
    private DigitalInkRecognizer recognizer;
    private DigitalInkRecognitionModel model;
    private volatile boolean ready;

    InkRecognizer(Context ignored) {
    }

    Task<Void> ensureReady() {
        if (ready && recognizer != null) {
            return Tasks.forResult(null);
        }
        return Tasks.call(io, () -> {
            DigitalInkRecognitionModelIdentifier id =
                    DigitalInkRecognitionModelIdentifier.fromLanguageTag("en");
            if (id == null) {
                throw new IllegalStateException("modello ink non disponibile");
            }
            model = DigitalInkRecognitionModel.builder(id).build();
            RemoteModelManager mgr = RemoteModelManager.getInstance();
            Boolean downloaded = Tasks.await(mgr.isModelDownloaded(model));
            if (downloaded == null || !downloaded) {
                Tasks.await(mgr.download(model, new DownloadConditions.Builder().build()));
            }
            recognizer = DigitalInkRecognition.getClient(
                    DigitalInkRecognizerOptions.builder(model).build()
            );
            ready = true;
            return null;
        });
    }

    Task<String> recognizeJson(String strokesJson) {
        return ensureReady().continueWithTask(task -> {
            if (!task.isSuccessful()) {
                return Tasks.forException(task.getException() != null
                        ? task.getException()
                        : new IllegalStateException("ink non pronto"));
            }
            return Tasks.call(io, () -> recognizeBlocking(strokesJson));
        });
    }

    private String recognizeBlocking(String strokesJson) throws Exception {
        Ink.Builder ink = Ink.builder();
        JSONArray strokes = new JSONArray(strokesJson);
        float minx = Float.MAX_VALUE, miny = Float.MAX_VALUE, maxx = -Float.MAX_VALUE, maxy = -Float.MAX_VALUE;
        for (int s = 0; s < strokes.length(); s++) {
            JSONArray pts = strokes.getJSONArray(s);
            if (pts.length() < 1) continue;
            Ink.Stroke.Builder stroke = Ink.Stroke.builder();
            for (int i = 0; i < pts.length(); i++) {
                JSONObject p = pts.getJSONObject(i);
                float x = (float) p.optDouble("x", 0);
                float y = (float) p.optDouble("y", 0);
                long t = p.has("t") ? (long) p.optDouble("t", i * 12L) : i * 12L;
                stroke.addPoint(Ink.Point.create(x, y, t));
                if (x < minx) minx = x;
                if (y < miny) miny = y;
                if (x > maxx) maxx = x;
                if (y > maxy) maxy = y;
            }
            ink.addStroke(stroke.build());
        }
        float w = Math.max(32f, maxx - minx);
        float h = Math.max(32f, maxy - miny);
        RecognitionContext ctx = RecognitionContext.builder()
                .setPreContext("")
                .setWritingArea(new WritingArea(w, h))
                .build();
        RecognitionResult result = Tasks.await(recognizer.recognize(ink.build(), ctx));
        if (result.getCandidates() == null || result.getCandidates().isEmpty()) {
            return "";
        }
        return pickBestNumber(result);
    }

    private static String pickBestNumber(RecognitionResult result) {
        for (int i = 0; i < result.getCandidates().size(); i++) {
            String n = normalizeNumber(result.getCandidates().get(i).getText());
            if (!n.isEmpty()) return n;
        }
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
