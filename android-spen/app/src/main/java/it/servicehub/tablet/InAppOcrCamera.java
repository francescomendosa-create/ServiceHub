package it.servicehub.tablet;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.ImageFormat;
import android.graphics.Matrix;
import android.graphics.RectF;
import android.graphics.SurfaceTexture;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.TotalCaptureResult;
import android.media.Image;
import android.media.ImageReader;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;
import android.util.Size;
import android.view.Gravity;
import android.view.Surface;
import android.view.TextureView;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.util.Arrays;

/**
 * Foto OCR senza lasciare l'Activity: su Samsung la camera di sistema
 * mette l'app in background e il firewall blocca il DNS (Gemini non parte).
 */
final class InAppOcrCamera {
    private static final String TAG = "ShSpenInk";

    interface Listener {
        void onPhoto(File jpeg);
        void onCancel();
        void onError(String msg);
    }

    private final Activity activity;
    private Listener listener;
    private FrameLayout overlay;
    private TextureView texture;
    private HandlerThread camThread;
    private Handler camHandler;
    private CameraDevice camera;
    private CameraCaptureSession session;
    private ImageReader reader;
    private CaptureRequest.Builder previewReq;
    private Size previewSize;
    private int sensorOrientation = 90;
    private int jpegOrientation = 0;
    private boolean capturing;
    private boolean opening;
    private boolean stillSent;

    InAppOcrCamera(Activity activity) {
        this.activity = activity;
    }

    boolean isOpen() {
        return overlay != null && overlay.getParent() != null;
    }

    void close() {
        capturing = false;
        opening = false;
        try { if (session != null) session.close(); } catch (Exception ignored) {}
        session = null;
        try { if (camera != null) camera.close(); } catch (Exception ignored) {}
        camera = null;
        try { if (reader != null) reader.close(); } catch (Exception ignored) {}
        reader = null;
        if (camThread != null) {
            camThread.quitSafely();
            camThread = null;
            camHandler = null;
        }
        if (overlay != null) {
            ViewGroup parent = (ViewGroup) overlay.getParent();
            if (parent != null) parent.removeView(overlay);
            overlay = null;
        }
        texture = null;
    }

    void open(Listener listener) {
        this.listener = listener;
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            if (listener != null) listener.onError("Permesso fotocamera negato.");
            return;
        }
        close();
        ViewGroup root = (ViewGroup) activity.findViewById(R.id.hub_webview).getParent();
        overlay = new FrameLayout(activity);
        overlay.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        overlay.setBackgroundColor(0xFF0F172A);
        overlay.setClickable(true);
        texture = new TextureView(activity);
        overlay.addView(texture, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        LinearLayout bar = new LinearLayout(activity);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER);
        bar.setPadding(24, 24, 24, 48);
        FrameLayout.LayoutParams barLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        barLp.gravity = Gravity.BOTTOM;
        overlay.addView(bar, barLp);
        Button cancel = new Button(activity);
        cancel.setText("Annulla");
        cancel.setOnClickListener(v -> {
            Listener cb = this.listener;
            close();
            if (cb != null) cb.onCancel();
        });
        Button shot = new Button(activity);
        shot.setText("Scatta");
        shot.setOnClickListener(v -> takePicture());
        bar.addView(cancel);
        bar.addView(shot);
        root.addView(overlay);
        texture.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {
            @Override
            public void onSurfaceTextureAvailable(@NonNull SurfaceTexture surface, int w, int h) {
                startCamera(w, h);
            }
            @Override
            public void onSurfaceTextureSizeChanged(@NonNull SurfaceTexture surface, int w, int h) {
                applyPreviewTransform(w, h);
            }
            @Override
            public boolean onSurfaceTextureDestroyed(@NonNull SurfaceTexture surface) {
                return true;
            }
            @Override
            public void onSurfaceTextureUpdated(@NonNull SurfaceTexture surface) {}
        });
        if (texture.isAvailable()) startCamera(texture.getWidth(), texture.getHeight());
    }

    private void startCamera(int viewW, int viewH) {
        if (opening || camera != null) return;
        opening = true;
        CameraManager mgr = (CameraManager) activity.getSystemService(Context.CAMERA_SERVICE);
        if (mgr == null) {
            fail("Fotocamera assente");
            return;
        }
        try {
            String id = pickBackCamera(mgr);
            if (id == null) {
                fail("Nessuna fotocamera");
                return;
            }
            CameraCharacteristics ch = mgr.getCameraCharacteristics(id);
            Integer so = ch.get(CameraCharacteristics.SENSOR_ORIENTATION);
            sensorOrientation = so == null ? 90 : so;
            jpegOrientation = computeJpegOrientation(ch);
            Size jpeg = pickJpegSize(ch);
            previewSize = pickPreviewSize(ch, viewW, viewH);
            camThread = new HandlerThread("ocr-cam");
            camThread.start();
            camHandler = new Handler(camThread.getLooper());
            reader = ImageReader.newInstance(jpeg.getWidth(), jpeg.getHeight(), ImageFormat.JPEG, 2);
            reader.setOnImageAvailableListener(r -> {
                if (!capturing) {
                    Image skip = r.acquireLatestImage();
                    if (skip != null) skip.close();
                    return;
                }
                Image img = r.acquireLatestImage();
                if (img == null) return;
                File out = writeJpeg(img);
                img.close();
                capturing = false;
                activity.runOnUiThread(() -> {
                    Listener cb = listener;
                    close();
                    if (out != null && cb != null) cb.onPhoto(out);
                    else if (cb != null) cb.onError("Salvataggio foto fallito.");
                });
            }, camHandler);
            if (ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA)
                    != PackageManager.PERMISSION_GRANTED) {
                fail("Permesso fotocamera negato.");
                return;
            }
            mgr.openCamera(id, new CameraDevice.StateCallback() {
                @Override
                public void onOpened(@NonNull CameraDevice device) {
                    camera = device;
                    beginSession(viewW, viewH);
                }
                @Override
                public void onDisconnected(@NonNull CameraDevice device) {
                    fail("Fotocamera disconnessa");
                }
                @Override
                public void onError(@NonNull CameraDevice device, int error) {
                    fail("Fotocamera errore " + error);
                }
            }, camHandler);
        } catch (SecurityException e) {
            fail("Permesso fotocamera negato.");
        } catch (Exception e) {
            fail(e.getMessage() == null ? "Fotocamera" : e.getMessage());
        }
    }

    private void beginSession(int viewW, int viewH) {
        if (camera == null || texture == null || reader == null) return;
        try {
            SurfaceTexture st = texture.getSurfaceTexture();
            if (st == null) return;
            Size prev = previewSize != null ? previewSize : new Size(1920, 1080);
            st.setDefaultBufferSize(prev.getWidth(), prev.getHeight());
            activity.runOnUiThread(() -> applyPreviewTransform(viewW, viewH));
            Surface preview = new Surface(st);
            Surface jpeg = reader.getSurface();
            previewReq = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
            previewReq.addTarget(preview);
            previewReq.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
            previewReq.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON);
            camera.createCaptureSession(Arrays.asList(preview, jpeg), new CameraCaptureSession.StateCallback() {
                @Override
                public void onConfigured(@NonNull CameraCaptureSession s) {
                    session = s;
                    try {
                        s.setRepeatingRequest(previewReq.build(), null, camHandler);
                    } catch (CameraAccessException e) {
                        fail(e.getMessage());
                    }
                }
                @Override
                public void onConfigureFailed(@NonNull CameraCaptureSession s) {
                    fail("Anteprima fotocamera non avviata");
                }
            }, camHandler);
        } catch (Exception e) {
            fail(e.getMessage() == null ? "Sessione fotocamera" : e.getMessage());
        }
    }

    private void takePicture() {
        if (capturing || camera == null || session == null || reader == null) return;
        capturing = true;
        stillSent = false;
        if (previewReq == null || camHandler == null) {
            captureStill();
            return;
        }
        try {
            previewReq.set(CaptureRequest.CONTROL_AF_TRIGGER, CaptureRequest.CONTROL_AF_TRIGGER_START);
            session.capture(previewReq.build(), focusWatch, camHandler);
            previewReq.set(CaptureRequest.CONTROL_AF_TRIGGER, CaptureRequest.CONTROL_AF_TRIGGER_IDLE);
            session.setRepeatingRequest(previewReq.build(), focusWatch, camHandler);
            // Il quadro DCS ha cifre piccole: se l'AF non aggancia entro 1,5 s scatta comunque.
            camHandler.postDelayed(this::captureStill, 1500);
        } catch (Exception e) {
            captureStill();
        }
    }

    private final CameraCaptureSession.CaptureCallback focusWatch = new CameraCaptureSession.CaptureCallback() {
        @Override
        public void onCaptureCompleted(@NonNull CameraCaptureSession s,
                                       @NonNull CaptureRequest request,
                                       @NonNull TotalCaptureResult result) {
            if (!capturing || stillSent) return;
            Integer af = result.get(TotalCaptureResult.CONTROL_AF_STATE);
            if (af == null
                    || af == CaptureRequest.CONTROL_AF_STATE_FOCUSED_LOCKED
                    || af == CaptureRequest.CONTROL_AF_STATE_NOT_FOCUSED_LOCKED
                    || af == CaptureRequest.CONTROL_AF_STATE_PASSIVE_FOCUSED) {
                captureStill();
            }
        }
    };

    private void captureStill() {
        if (stillSent || camera == null || session == null || reader == null) return;
        stillSent = true;
        try {
            CaptureRequest.Builder still = camera.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);
            still.addTarget(reader.getSurface());
            still.set(CaptureRequest.JPEG_QUALITY, (byte) 93);
            still.set(CaptureRequest.JPEG_ORIENTATION, jpegOrientation);
            still.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
            session.capture(still.build(), new CameraCaptureSession.CaptureCallback() {
                @Override
                public void onCaptureCompleted(@NonNull CameraCaptureSession s,
                                               @NonNull CaptureRequest request,
                                               @NonNull TotalCaptureResult result) {
                    Log.i(TAG, "inApp still ok");
                }
            }, camHandler);
        } catch (Exception e) {
            capturing = false;
            fail(e.getMessage() == null ? "Scatto fallito" : e.getMessage());
        }
    }

    private File writeJpeg(Image img) {
        ByteBuffer buf = img.getPlanes()[0].getBuffer();
        byte[] bytes = new byte[buf.remaining()];
        buf.get(bytes);
        File dir = new File(activity.getCacheDir(), "ocr");
        if (!dir.exists() && !dir.mkdirs()) return null;
        File out = new File(dir, "ocr_inapp.jpg");
        try (FileOutputStream fos = new FileOutputStream(out)) {
            fos.write(bytes);
            Log.i(TAG, "inApp jpeg bytes=" + bytes.length);
            return out;
        } catch (Exception e) {
            Log.w(TAG, "writeJpeg", e);
            return null;
        }
    }

    private static String pickBackCamera(CameraManager mgr) throws CameraAccessException {
        String fallback = null;
        for (String id : mgr.getCameraIdList()) {
            CameraCharacteristics ch = mgr.getCameraCharacteristics(id);
            Integer face = ch.get(CameraCharacteristics.LENS_FACING);
            if (face != null && face == CameraCharacteristics.LENS_FACING_BACK) return id;
            if (fallback == null) fallback = id;
        }
        return fallback;
    }

    private static Size pickJpegSize(CameraCharacteristics ch) {
        android.hardware.camera2.params.StreamConfigurationMap map =
                ch.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
        Size[] sizes = map == null ? null : map.getOutputSizes(ImageFormat.JPEG);
        Size best = new Size(1920, 1080);
        if (sizes == null) return best;
        int bestArea = 0;
        for (Size s : sizes) {
            int a = s.getWidth() * s.getHeight();
            if (a > 2048 * 2048) continue;
            if (a > bestArea) {
                bestArea = a;
                best = s;
            }
        }
        return best;
    }

    private Size pickPreviewSize(CameraCharacteristics ch, int viewW, int viewH) {
        android.hardware.camera2.params.StreamConfigurationMap map =
                ch.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
        Size[] sizes = map == null ? null : map.getOutputSizes(SurfaceTexture.class);
        if (sizes == null || sizes.length == 0) return new Size(1920, 1080);
        int rot = displayRotationDegrees();
        boolean swap = ((sensorOrientation - rot + 360) % 360 == 90)
                || ((sensorOrientation - rot + 360) % 360 == 270);
        float viewRatio = (viewH <= 0) ? 16f / 9f
                : (swap ? (float) viewH / viewW : (float) viewW / viewH);
        Size best = sizes[0];
        int bestScore = Integer.MAX_VALUE;
        for (Size s : sizes) {
            int longSide = Math.max(s.getWidth(), s.getHeight());
            if (longSide > 1920) continue;
            float r = (float) s.getWidth() / Math.max(1, s.getHeight());
            int score = Math.round(Math.abs(r - viewRatio) * 1000) + (1920 - longSide);
            if (score < bestScore) {
                bestScore = score;
                best = s;
            }
        }
        return best;
    }

    private void applyPreviewTransform(int viewW, int viewH) {
        if (texture == null || previewSize == null || viewW < 8 || viewH < 8) return;
        int rotation = activity.getWindowManager().getDefaultDisplay().getRotation();
        Matrix matrix = new Matrix();
        RectF viewRect = new RectF(0, 0, viewW, viewH);
        float cx = viewRect.centerX();
        float cy = viewRect.centerY();
        if (rotation == Surface.ROTATION_90 || rotation == Surface.ROTATION_270) {
            RectF bufferRect = new RectF(0, 0, previewSize.getHeight(), previewSize.getWidth());
            bufferRect.offset(cx - bufferRect.centerX(), cy - bufferRect.centerY());
            matrix.setRectToRect(viewRect, bufferRect, Matrix.ScaleToFit.FILL);
            float scale = Math.max(
                    (float) viewH / previewSize.getHeight(),
                    (float) viewW / previewSize.getWidth());
            matrix.postScale(scale, scale, cx, cy);
            matrix.postRotate(90f * (rotation - 2), cx, cy);
        } else if (rotation == Surface.ROTATION_180) {
            matrix.postRotate(180, cx, cy);
        }
        texture.setTransform(matrix);
    }

    private int displayRotationDegrees() {
        int r = activity.getWindowManager().getDefaultDisplay().getRotation();
        if (r == Surface.ROTATION_90) return 90;
        if (r == Surface.ROTATION_180) return 180;
        if (r == Surface.ROTATION_270) return 270;
        return 0;
    }

    private int computeJpegOrientation(CameraCharacteristics ch) {
        int device = displayRotationDegrees();
        Integer facing = ch.get(CameraCharacteristics.LENS_FACING);
        boolean front = facing != null && facing == CameraCharacteristics.LENS_FACING_FRONT;
        if (front) return (sensorOrientation + device) % 360;
        return (sensorOrientation - device + 360) % 360;
    }

    private void fail(String msg) {
        Log.w(TAG, "inApp camera: " + msg);
        activity.runOnUiThread(() -> {
            Listener cb = listener;
            close();
            if (cb != null) cb.onError(msg);
        });
    }
}
