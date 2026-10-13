package com.rapidbodegon.app;

import android.content.ComponentName;
import android.content.Intent;
import android.provider.Settings;
import android.text.TextUtils;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "MercantilTpago")
public class MercantilTpagoPlugin extends Plugin {

    @PluginMethod
    public void hasNotificationAccess(PluginCall call) {
        String enabledListeners = Settings.Secure.getString(
            getContext().getContentResolver(),
            "enabled_notification_listeners"
        );
        ComponentName component = new ComponentName(
            getContext(),
            MercantilTpagoNotificationListener.class
        );
        boolean enabled = !TextUtils.isEmpty(enabledListeners)
            && enabledListeners.contains(component.flattenToString());

        JSObject result = new JSObject();
        result.put("enabled", enabled);
        call.resolve(result);
    }

    @PluginMethod
    public void openNotificationAccessSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("No se pudieron abrir los ajustes de acceso a notificaciones.");
        }
    }

    @PluginMethod
    public void getPendingEvents(PluginCall call) {
        try {
            JSONArray events = MercantilTpagoNotificationListener.getPendingQueue(getContext());
            JSObject result = new JSObject();
            result.put("events", events);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No se pudo leer la cola local de notificaciones.");
        }
    }

    @PluginMethod
    public void acknowledgeEvents(PluginCall call) {
        try {
            JSArray eventIds = call.getArray("eventIds");
            List<String> ids = new ArrayList<>();
            if (eventIds != null) {
                for (int i = 0; i < eventIds.length(); i++) {
                    String id = eventIds.optString(i, "");
                    if (!id.isEmpty()) ids.add(id);
                }
            }
            MercantilTpagoNotificationListener.acknowledge(getContext(), ids);
            call.resolve();
        } catch (Exception error) {
            call.reject("No se pudieron confirmar las notificaciones procesadas.");
        }
    }
}
