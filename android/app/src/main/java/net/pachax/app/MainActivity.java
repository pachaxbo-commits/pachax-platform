package net.pachax.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import net.pachax.app.plugins.PachaxBluetoothPermissionsPlugin;
import net.pachax.app.plugins.PachaxTcpSocketPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PachaxBluetoothPermissionsPlugin.class);
        registerPlugin(PachaxTcpSocketPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
