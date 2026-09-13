package it.servicehub.tablet;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Fotocamera nativa + compressione foto per OCR.
 */
final class HubWebChrome extends WebChromeClient {
    static final int REQ_CAMERA_PERM = 7101;
    static final int REQ_CAPTURE = 7102;
    static final int REQ_FILE = 7103;
    private static final String TAG = "ShSpenInk";

    private final Activity activity;
    private final WebView webView;
    private PermissionRequest pendingWebPerm;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraImageUri;
    private boolean pendingCaptureAfterPerm;
    private boolean directOcr;

    HubWebChrome(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    void startDirectOcr() {
        directOcr = true;
        if (!hasCameraPerm()) {
            pendingCaptureAfterPerm = true;
            ActivityCompat.requestPermissions(activity, new String[]{Manifest.permission.CAMERA}, REQ_CAMERA_PERM);
            return;
        }
        if (!launchCamera()) {
            directOcr = false;
            injectOcrError("Fotocamera non disponibile.");
        }
    }

    @Override
    public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
        if (consoleMessage != null) {
            Log.i(TAG, "js " + consoleMessage.messageLevel() + ": " + consoleMessage.message());
        }
        return super.onConsoleMessage(consoleMessage);
    }

    @Override
    public void onPermissionRequest(PermissionRequest request) {
        activity.runOnUiThread(() -> {
            boolean video = false;
            if (request != null && request.getResources() != null) {
                for (String res : request.getResources()) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)) video = true;
                }
            }
            if (!video) {
                if (request != null) request.deny();
                return;
            }
            if (hasCameraPerm()) {
                request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                return;
            }
            pendingWebPerm = request;
            ActivityCompat.requestPermissions(activity, new String[]{Manifest.permission.CAMERA}, REQ_CAMERA_PERM);
        });
    }

    @Override
    public void onPermissionRequestCanceled(PermissionRequest request) {
        if (pendingWebPerm == request) pendingWebPerm = null;
    }

    @Override
    public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> filePathCallback,
                                     FileChooserParams fileChooserParams) {
        clearFileCallback(null);
        this.filePathCallback = filePathCallback;
        boolean capture = fileChooserParams != null && fileChooserParams.isCaptureEnabled();
        if (capture) {
            if (!hasCameraPerm()) {
                pendingCaptureAfterPerm = true;
                ActivityCompat.requestPermissions(activity, new String[]{Manifest.permission.CAMERA}, REQ_CAMERA_PERM);
                return true;
            }
            if (launchCamera()) return true;
        }
        return launchFiles(fileChooserParams);
    }

    void onPermissionResult(int requestCode, int[] grantResults) {
        if (requestCode != REQ_CAMERA_PERM) return;
        boolean ok = grantResults != null && grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (pendingWebPerm != null) {
            PermissionRequest req = pendingWebPerm;
            pendingWebPerm = null;
            if (ok) req.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            else req.deny();
        }
        if (pendingCaptureAfterPerm) {
            pendingCaptureAfterPerm = false;
            if (ok && launchCamera()) return;
            directOcr = false;
            if (!ok) {
                clearFileCallback(null);
                injectOcrError("Permesso fotocamera negato.");
            } else if (!launchFiles(null)) {
                clearFileCallback(null);
            }
        }
    }

    void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQ_CAPTURE && requestCode != REQ_FILE) return;
        Uri[] result = null;
        File compact = null;
        if (resultCode == Activity.RESULT_OK) {
            if (requestCode == REQ_CAPTURE && cameraImageUri != null) {
                compact = compressJpeg(cameraImageUri);
                if (compact != null) {
                    result = new Uri[]{FileProvider.getUriForFile(
                            activity, activity.getPackageName() + ".fileprovider", compact)};
                } else {
                    result = new Uri[]{cameraImageUri};
                }
            } else {
                result = urisFromIntent(data);
                if (result != null && result.length == 1) compact = compressJpeg(result[0]);
            }
        }
        boolean ocr = directOcr;
        directOcr = false;
        clearFileCallback(result);
        if (ocr) {
            if (compact != null || (result != null && result.length > 0)) {
                injectOcrPhoto(compact != null ? compact : null, compact == null && result != null ? result[0] : null);
            } else {
                injectOcrError("Foto non acquisita.");
            }
        } else if (compact != null) {
            injectOcrPhoto(compact, null);
        }
        cameraImageUri = null;
    }

    private void injectOcrPhoto(File file, Uri fallback) {
        try {
            byte[] raw = file != null ? readAll(file) : readAll(fallback);
            if (raw == null || raw.length < 80) {
                injectOcrError("Foto vuota.");
                return;
            }
            String b64 = Base64.encodeToString(raw, Base64.NO_WRAP);
            Log.i(TAG, "ocr photo bytes=" + raw.length);
            String js = "window.__shNativeOcrPhoto&&window.__shNativeOcrPhoto('data:image/jpeg;base64," + b64 + "')";
            webView.post(() -> webView.evaluateJavascript(js, null));
        } catch (Exception e) {
            Log.w(TAG, "injectOcrPhoto", e);
            injectOcrError("Lettura foto fallita.");
        }
    }

    private void injectOcrError(String msg) {
        String safe = (msg == null ? "errore" : msg).replace("\\", " ").replace("'", " ");
        String js = "window.__shNativeOcrError&&window.__shNativeOcrError('" + safe + "')";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private File compressJpeg(Uri uri) {
        if (uri == null) return null;
        InputStream in = null;
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            in = activity.getContentResolver().openInputStream(uri);
            BitmapFactory.decodeStream(in, null, bounds);
            if (in != null) in.close();
            int max = 1280;
            int sample = 1;
            int w = Math.max(1, bounds.outWidth);
            int h = Math.max(1, bounds.outHeight);
            while (w / sample > max * 2 || h / sample > max * 2) sample *= 2;
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = Math.max(1, sample);
            in = activity.getContentResolver().openInputStream(uri);
            Bitmap bmp = BitmapFactory.decodeStream(in, null, opts);
            if (in != null) in.close();
            if (bmp == null) return null;
            int bw = bmp.getWidth();
            int bh = bmp.getHeight();
            if (bw > max || bh > max) {
                float s = Math.min(max / (float) bw, max / (float) bh);
                Bitmap scaled = Bitmap.createScaledBitmap(bmp, Math.max(1, Math.round(bw * s)), Math.max(1, Math.round(bh * s)), true);
                if (scaled != bmp) bmp.recycle();
                bmp = scaled;
            }
            File dir = new File(activity.getCacheDir(), "ocr");
            if (!dir.exists() && !dir.mkdirs()) {
                bmp.recycle();
                return null;
            }
            File out = new File(dir, "ocr_send.jpg");
            try (FileOutputStream fos = new FileOutputStream(out)) {
                bmp.compress(Bitmap.CompressFormat.JPEG, 78, fos);
            }
            bmp.recycle();
            return out;
        } catch (Exception e) {
            Log.w(TAG, "compressJpeg", e);
            return null;
        } finally {
            try { if (in != null) in.close(); } catch (Exception ignored) {}
        }
    }

    private byte[] readAll(File file) throws Exception {
        try (InputStream in = new java.io.FileInputStream(file);
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) >= 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    private byte[] readAll(Uri uri) throws Exception {
        if (uri == null) return null;
        try (InputStream in = activity.getContentResolver().openInputStream(uri);
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            if (in == null) return null;
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) >= 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    private boolean launchCamera() {
        try {
            File dir = new File(activity.getCacheDir(), "ocr");
            if (!dir.exists() && !dir.mkdirs()) return false;
            File photo = new File(dir, "ocr_" + System.currentTimeMillis() + ".jpg");
            cameraImageUri = FileProvider.getUriForFile(
                    activity, activity.getPackageName() + ".fileprovider", photo);
            Intent take = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            take.putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri);
            take.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            List<ResolveInfo> apps = activity.getPackageManager()
                    .queryIntentActivities(take, PackageManager.MATCH_DEFAULT_ONLY);
            for (ResolveInfo info : apps) {
                activity.grantUriPermission(
                        info.activityInfo.packageName,
                        cameraImageUri,
                        Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }
            try {
                activity.startActivityForResult(take, REQ_CAPTURE);
                return true;
            } catch (ActivityNotFoundException e) {
                cameraImageUri = null;
                return false;
            }
        } catch (Exception e) {
            cameraImageUri = null;
            return false;
        }
    }

    private boolean launchFiles(FileChooserParams params) {
        try {
            Intent intent = params != null ? params.createIntent() : null;
            if (intent == null) {
                intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            }
            activity.startActivityForResult(Intent.createChooser(intent, "Foto OCR"), REQ_FILE);
            return true;
        } catch (Exception e) {
            clearFileCallback(null);
            return false;
        }
    }

    private static Uri[] urisFromIntent(Intent data) {
        if (data == null) return null;
        ClipData clip = data.getClipData();
        if (clip != null && clip.getItemCount() > 0) {
            List<Uri> list = new ArrayList<>();
            for (int i = 0; i < clip.getItemCount(); i++) {
                Uri u = clip.getItemAt(i).getUri();
                if (u != null) list.add(u);
            }
            return list.isEmpty() ? null : list.toArray(new Uri[0]);
        }
        if (data.getData() != null) return new Uri[]{data.getData()};
        return null;
    }

    private boolean hasCameraPerm() {
        return ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED;
    }

    private void clearFileCallback(Uri[] value) {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(value);
            filePathCallback = null;
        }
    }
}
