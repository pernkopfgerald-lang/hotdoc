package at.ffeberstalzell.hotdoc;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin-Registrierung VOR super.onCreate() — sonst kommt der
        // Bridge bei Capacitor 5+ nicht mehr an die Klasse ran.
        registerPlugin(ApkInstallerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
