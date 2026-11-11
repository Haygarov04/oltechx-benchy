package com.oltechx.check;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own native code: hardware, storage test, token, QR scanner.
        registerPlugin(OlxDevicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
