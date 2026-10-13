package com.rapidbodegon.app;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

import java.math.BigDecimal;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Listens only for payment-received TPago notices from Mercantil Móvil Personas.
 * Keeps only the fields needed for reconciliation; sender phone and raw text
 * are intentionally not persisted.
 */
public class MercantilTpagoNotificationListener extends NotificationListenerService {
    private static final String MERCANTIL_PACKAGE = "com.mercantilbanco.mercantilmovil";
    private static final String PREFS_NAME = "rapidbodegon_mercantil_tpago";
    private static final String QUEUE_KEY = "pending_events";
    private static final int MAX_PENDING_EVENTS = 50;

    public static final Object QUEUE_LOCK = new Object();

    private static final Pattern TPAGO_PATTERN = Pattern.compile(
        "TPAGO\\s+RECIBIDO\\s+Bs\\.?\\s*([0-9][0-9.,]*)\\s+del\\s+\\d{7,15}" +
        "\\s+ref\\s+(\\d{4,12})\\s*,\\s*(\\d{2}/\\d{2}/\\d{4})" +
        "\\s*,\\s*(\\d{1,2}:\\d{2}\\s*[AP]M)",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE | Pattern.DOTALL
    );

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || !MERCANTIL_PACKAGE.equals(sbn.getPackageName())) return;

        Notification notification = sbn.getNotification();
        if (notification == null || notification.extras == null) return;

        CharSequence title = notification.extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence text = notification.extras.getCharSequence(Notification.EXTRA_TEXT);
        CharSequence bigText = notification.extras.getCharSequence(Notification.EXTRA_BIG_TEXT);

        StringBuilder source = new StringBuilder();
        if (title != null) source.append(title).append(' ');
        if (text != null) source.append(text).append(' ');
        if (bigText != null) source.append(bigText);

        Matcher matcher = TPAGO_PATTERN.matcher(source.toString());
        if (!matcher.find()) return;

        try {
            double amountBs = parseAmount(matcher.group(1));
            String reference = matcher.group(2);
            String notificationDate = matcher.group(3);
            String notificationTime = matcher.group(4)
                .replaceAll("\\s+", " ").trim().toUpperCase(Locale.ROOT);

            if (!Double.isFinite(amountBs) || amountBs <= 0 || !reference.matches("\\d{4,12}")) return;

            long amountCents = Math.round(amountBs * 100.0);
            String eventId = sha256(reference + "|" + amountCents + "|" + notificationDate + "|" + notificationTime);

            JSONObject event = new JSONObject();
            event.put("eventId", eventId);
            event.put("reference", reference);
            event.put("amountBs", Math.round(amountBs * 100.0) / 100.0);
            event.put("notificationDate", notificationDate);
            event.put("notificationTime", notificationTime);
            event.put("postedAtMs", sbn.getPostTime());

            enqueue(getApplicationContext(), event);
        } catch (Exception ignored) {
            // Ignore unrecognized/malformed notices without disrupting the bank app.
        }
    }

    private static double parseAmount(String raw) {
        String value = raw.trim().replace(" ", "");
        int comma = value.lastIndexOf(',');
        int dot = value.lastIndexOf('.');

        if (comma >= 0 && dot >= 0) {
            if (comma > dot) {
                value = value.replace(".", "").replace(",", ".");
            } else {
                value = value.replace(",", "");
            }
        } else if (comma >= 0) {
            int decimals = value.length() - comma - 1;
            value = decimals >= 1 && decimals <= 2
                ? value.replace(".", "").replace(",", ".")
                : value.replace(",", "");
        } else if (dot >= 0) {
            int decimals = value.length() - dot - 1;
            if (decimals > 2) value = value.replace(".", "");
        }

        return new BigDecimal(value).doubleValue();
    }

    private static String sha256(String input) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] bytes = digest.digest(input.getBytes(StandardCharsets.UTF_8));
        StringBuilder output = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) output.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        return output.toString();
    }

    private static void enqueue(Context context, JSONObject event) throws Exception {
        synchronized (QUEUE_LOCK) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            JSONArray oldQueue = new JSONArray(prefs.getString(QUEUE_KEY, "[]"));
            List<JSONObject> events = new ArrayList<>();
            boolean alreadyExists = false;

            for (int i = 0; i < oldQueue.length(); i++) {
                JSONObject existing = oldQueue.optJSONObject(i);
                if (existing == null) continue;
                if (event.optString("eventId").equals(existing.optString("eventId"))) {
                    alreadyExists = true;
                }
                events.add(existing);
            }

            if (alreadyExists) return;
            events.add(event);
            while (events.size() > MAX_PENDING_EVENTS) events.remove(0);

            JSONArray nextQueue = new JSONArray();
            for (JSONObject item : events) nextQueue.put(item);
            prefs.edit().putString(QUEUE_KEY, nextQueue.toString()).commit();
        }
    }

    static JSONArray getPendingQueue(Context context) throws Exception {
        synchronized (QUEUE_LOCK) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            return new JSONArray(prefs.getString(QUEUE_KEY, "[]"));
        }
    }

    static void acknowledge(Context context, List<String> acknowledgedIds) throws Exception {
        synchronized (QUEUE_LOCK) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            JSONArray queue = new JSONArray(prefs.getString(QUEUE_KEY, "[]"));
            JSONArray retained = new JSONArray();

            for (int i = 0; i < queue.length(); i++) {
                JSONObject event = queue.optJSONObject(i);
                if (event == null) continue;
                if (!acknowledgedIds.contains(event.optString("eventId"))) retained.put(event);
            }
            prefs.edit().putString(QUEUE_KEY, retained.toString()).commit();
        }
    }
}
