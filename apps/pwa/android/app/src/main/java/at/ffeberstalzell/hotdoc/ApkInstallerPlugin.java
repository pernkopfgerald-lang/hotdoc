package at.ffeberstalzell.hotdoc;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * ApkInstaller — Custom Capacitor-Plugin für In-App-APK-Updates.
 *
 * Drei Methoden:
 *
 *  - canInstallApks() — prüft ob die "Aus unbekannten Quellen
 *    installieren"-Permission gewährt ist. Ab Android 8 (API 26) ist
 *    diese per-App, vorher war es ein globaler Toggle.
 *
 *  - openInstallPermissionSettings() — öffnet den System-Settings-
 *    Screen wo der User die Permission setzen kann. Nach Rückkehr
 *    muss die App canInstallApks() erneut aufrufen.
 *
 *  - downloadAndInstall({ url }) — lädt die APK von der angegebenen
 *    HTTPS-URL in den App-internen Cache (cacheDir/update.apk),
 *    erzeugt einen FileProvider-content-URI dafür, und startet einen
 *    ACTION_VIEW-Intent mit MIME-Typ application/vnd.android.package-
 *    archive. Android-PackageInstaller übernimmt die "App aktualisieren?"-
 *    UI. Wenn die installierte App mit demselben Signing-Key gebaut
 *    wurde, klickt der User nur einmal Bestätigen — kein Deinstall.
 *
 * Voraussetzung im AndroidManifest:
 *   - REQUEST_INSTALL_PACKAGES Permission
 *   - FileProvider mit Authorities ${applicationId}.fileprovider
 *   - file_paths.xml definiert cache-path "." als writeable
 *
 * Voraussetzung beim Build:
 *   - Alle Release-APKs müssen mit demselben Keystore signiert sein,
 *     sonst sieht Android beim Update einen Signing-Mismatch und
 *     erzwingt Deinstall.
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    @PluginMethod
    public void canInstallApks(PluginCall call) {
        JSObject result = new JSObject();
        boolean allowed;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            allowed = getContext().getPackageManager().canRequestPackageInstalls();
        } else {
            // Vor Android 8 reichte die Manifest-Permission alleine
            allowed = true;
        }
        result.put("allowed", allowed);
        call.resolve(result);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Keine Activity verfügbar");
            return;
        }
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(Uri.parse("package:" + activity.getPackageName()));
        } else {
            intent = new Intent(Settings.ACTION_SECURITY_SETTINGS);
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void downloadAndInstall(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url-Parameter fehlt");
            return;
        }

        // Permission-Check vor dem Download — sonst lädt die App eine
        // 9 MB APK runter und kann sie am Ende eh nicht installieren.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!getContext().getPackageManager().canRequestPackageInstalls()) {
                call.reject("INSTALL_PERMISSION_REQUIRED");
                return;
            }
        }

        // Background-Thread für den HTTP-Download — Plugin-Methoden
        // werden auf dem Main-Thread aufgerufen, wir dürfen dort nicht
        // blockieren.
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    File cacheDir = getContext().getCacheDir();
                    File apkFile = new File(cacheDir, "update.apk");
                    if (apkFile.exists() && !apkFile.delete()) {
                        call.reject("Alter Update-File konnte nicht ueberschrieben werden");
                        return;
                    }

                    HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                    conn.setConnectTimeout(15_000);
                    conn.setReadTimeout(60_000);
                    conn.setInstanceFollowRedirects(true);
                    int code = conn.getResponseCode();
                    if (code != 200) {
                        call.reject("HTTP " + code + " beim Download");
                        conn.disconnect();
                        return;
                    }

                    long total = conn.getContentLengthLong();
                    long got = 0;
                    int lastReportedPct = -1;

                    InputStream in = conn.getInputStream();
                    FileOutputStream out = new FileOutputStream(apkFile);
                    byte[] buf = new byte[16 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        got += n;
                        if (total > 0) {
                            int pct = (int) ((got * 100) / total);
                            if (pct != lastReportedPct && pct % 5 == 0) {
                                lastReportedPct = pct;
                                JSObject progress = new JSObject();
                                progress.put("downloadedBytes", got);
                                progress.put("totalBytes", total);
                                progress.put("percent", pct);
                                notifyListeners("downloadProgress", progress);
                            }
                        }
                    }
                    out.close();
                    in.close();
                    conn.disconnect();

                    // FileProvider-content-URI generieren — Android 7+
                    // erlaubt keine direkten file:// URIs in Intents.
                    String authority = getContext().getPackageName() + ".fileprovider";
                    Uri apkUri = FileProvider.getUriForFile(getContext(), authority, apkFile);

                    Intent installIntent = new Intent(Intent.ACTION_VIEW);
                    installIntent.setDataAndType(apkUri,
                            "application/vnd.android.package-archive");
                    installIntent.setFlags(
                            Intent.FLAG_ACTIVITY_NEW_TASK
                                    | Intent.FLAG_GRANT_READ_URI_PERMISSION);

                    Activity activity = getActivity();
                    if (activity != null) {
                        activity.startActivity(installIntent);
                    } else {
                        getContext().startActivity(installIntent);
                    }

                    JSObject ok = new JSObject();
                    ok.put("installerLaunched", true);
                    ok.put("downloadedBytes", got);
                    call.resolve(ok);
                } catch (Exception e) {
                    call.reject("Download/Install fehlgeschlagen: " + e.getMessage(), e);
                }
            }
        }).start();
    }
}
