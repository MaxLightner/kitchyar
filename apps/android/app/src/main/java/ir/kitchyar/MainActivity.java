package ir.kitchyar;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;

/** UI host for phases A-C. Native ARCore scene integration belongs to phase D. */
public class MainActivity extends Activity {
    private WebView workspace;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        workspace = new WebView(this);
        workspace.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !"file".equals(request.getUrl().getScheme()) ||
                    request.getUrl().getPath() == null ||
                    !request.getUrl().getPath().startsWith("/android_asset/");
            }
        });
        workspace.getSettings().setJavaScriptEnabled(true);
        workspace.getSettings().setDomStorageEnabled(true);
        workspace.getSettings().setAllowFileAccess(true);
        workspace.getSettings().setAllowFileAccessFromFileURLs(false);
        workspace.getSettings().setAllowUniversalAccessFromFileURLs(false);
        workspace.loadUrl("file:///android_asset/index.html#/welcome");
        setContentView(workspace);
    }

    @Override public void onBackPressed() {
        if (workspace != null && workspace.canGoBack()) workspace.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (workspace != null) { workspace.destroy(); workspace = null; }
        super.onDestroy();
    }
}
