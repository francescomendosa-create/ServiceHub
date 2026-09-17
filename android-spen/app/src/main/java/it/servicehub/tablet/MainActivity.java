package it.servicehub.tablet;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.appcompat.app.AppCompatActivity;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private InkRecognizer ink;
    private String nativeHookJs;
    private String nativeOcrBootJs;
    private HubWebChrome hubChrome;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        setContentView(R.layout.activity_main);
        nativeHookJs = readAssetUtf8("native_spen_hook.js");
        nativeOcrBootJs = readAssetUtf8("native_ocr_boot.js");
        webView = findViewById(R.id.hub_webview);
        ink = new InkRecognizer();
        ink.ensureReady();
        ink.ensureTextReady();
        setupWebView();
        new SpenSamsungIme(webView).attach();
        webView.loadUrl(getString(R.string.hub_url));
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);
        hubChrome = new HubWebChrome(this, webView);
        webView.setWebChromeClient(hubChrome);
        WebView.setWebContentsDebuggingEnabled(true);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                injectHook(view);
                view.postDelayed(() -> injectOcrBoot(view), 200);
                view.postDelayed(() -> injectHook(view), 800);
                view.postDelayed(() -> injectOcrBoot(view), 900);
                view.postDelayed(() -> injectHook(view), 2200);
                view.postDelayed(() -> injectOcrBoot(view), 2400);
            }
        });
        webView.addJavascriptInterface(new SpenBridge(this, webView, ink, () -> hubChrome.startDirectOcr()), "ServiceHubAndroidSpen");
    }

    private void injectHook(WebView view) {
        if (view == null) return;
        if (nativeHookJs != null && !nativeHookJs.isEmpty()) {
            view.evaluateJavascript(nativeHookJs, null);
        }
        injectOcrBoot(view);
    }

    private void injectOcrBoot(WebView view) {
        if (view == null || nativeOcrBootJs == null || nativeOcrBootJs.isEmpty()) return;
        view.evaluateJavascript(nativeOcrBootJs, null);
    }

    private String readAssetUtf8(String name) {
        try (InputStream in = getAssets().open(name);
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) >= 0) {
                out.write(buf, 0, n);
            }
            return out.toString(StandardCharsets.UTF_8.name());
        } catch (Exception e) {
            return "window.__SH_NATIVE_ANDROID=true;";
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (hubChrome != null) hubChrome.onPermissionResult(requestCode, grantResults);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (hubChrome != null) hubChrome.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (hubChrome != null && hubChrome.hideInAppCamera()) {
            return;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
