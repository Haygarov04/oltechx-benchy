package com.oltechx.check;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.graphics.Rect;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.os.StatFs;
import android.provider.Settings;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.Locale;
import java.util.Random;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * What the interface cannot read on its own: the phone's model, chip, memory, storage and battery,
 * a storage speed test, the encrypted account token, keeping the screen on and the QR scanner.
 * Nothing personal is read: no accounts, contacts, files, location or phone numbers.
 */
@CapacitorPlugin(name = "OlxDevice")
public class OlxDevicePlugin extends Plugin {

    private static final String KEY_ALIAS = "oltechx-check-token";
    private static final String PREFS = "oltechx-check";

    // ── Hardware ────────────────────────────────────────────────────────────

    @PluginMethod
    public void info(PluginCall call) {
        Context context = getContext();
        JSObject out = new JSObject();
        out.put("manufacturer", capitalize(Build.MANUFACTURER));
        out.put("brand", capitalize(Build.BRAND));
        out.put("model", Build.MODEL);
        if (Build.VERSION.SDK_INT >= 25) {
            String name = Settings.Global.getString(context.getContentResolver(), Settings.Global.DEVICE_NAME);
            if (name != null) out.put("deviceName", name);
        }
        out.put("android", Build.VERSION.RELEASE);
        out.put("sdk", Build.VERSION.SDK_INT);
        if (Build.VERSION.SDK_INT >= 31) {
            out.put("socManufacturer", Build.SOC_MANUFACTURER);
            out.put("socModel", Build.SOC_MODEL);
        }
        out.put("hardware", Build.HARDWARE);
        out.put("board", Build.BOARD);
        out.put("cores", Runtime.getRuntime().availableProcessors());
        int mhz = maxCpuMhz();
        if (mhz > 0) out.put("maxMhz", mhz);

        ActivityManager activity = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        ActivityManager.MemoryInfo memory = new ActivityManager.MemoryInfo();
        activity.getMemoryInfo(memory);
        out.put("ramBytes", memory.totalMem);

        StatFs data = new StatFs(Environment.getDataDirectory().getPath());
        out.put("storageBytes", data.getTotalBytes());
        out.put("freeBytes", data.getAvailableBytes());

        out.put("battery", battery(context));
        out.put("screen", screen(context));
        // A per-app device id: lets the site notice the same phone listed from two accounts.
        String id = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ANDROID_ID);
        if (id != null) out.put("deviceId", id);
        call.resolve(out);
    }

    private JSObject battery(Context context) {
        JSObject battery = new JSObject();
        Intent state = context.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (state != null) {
            int level = state.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = state.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
            if (level >= 0 && scale > 0) battery.put("level", level * 100 / scale);
            battery.put("health", state.getIntExtra(BatteryManager.EXTRA_HEALTH, 0));
            battery.put("temperature", state.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) / 10.0);
            battery.put("plugged", state.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0);
            // Android 14 and newer report the charge cycles.
            int cycles = state.getIntExtra("android.os.extra.CYCLE_COUNT", -1);
            if (cycles >= 0) battery.put("cycles", cycles);
            String technology = state.getStringExtra(BatteryManager.EXTRA_TECHNOLOGY);
            if (technology != null) battery.put("technology", technology);
        }
        BatteryManager manager = (BatteryManager) context.getSystemService(Context.BATTERY_SERVICE);
        int counter = manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER);
        if (counter > 0) battery.put("chargeCounterUah", counter);
        double design = designCapacityMah(context);
        if (design > 0) battery.put("designMah", design);
        return battery;
    }

    /** The battery's capacity when new. Not every phone allows reading it; then the health stays unknown. */
    private double designCapacityMah(Context context) {
        try {
            Class<?> profile = Class.forName("com.android.internal.os.PowerProfile");
            Object instance = profile.getConstructor(Context.class).newInstance(context);
            Object value = profile.getMethod("getBatteryCapacity").invoke(instance);
            return value instanceof Double ? (Double) value : 0;
        } catch (Throwable ignored) {
            return 0;
        }
    }

    private String screen(Context context) {
        WindowManager windows = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
        int width;
        int height;
        if (Build.VERSION.SDK_INT >= 30) {
            Rect bounds = windows.getMaximumWindowMetrics().getBounds();
            width = bounds.width();
            height = bounds.height();
        } else {
            DisplayMetrics metrics = new DisplayMetrics();
            windows.getDefaultDisplay().getRealMetrics(metrics);
            width = metrics.widthPixels;
            height = metrics.heightPixels;
        }
        return Math.min(width, height) + "×" + Math.max(width, height);
    }

    private int maxCpuMhz() {
        int best = 0;
        for (int i = 0; i < Runtime.getRuntime().availableProcessors(); i++) {
            try (BufferedReader reader = new BufferedReader(new FileReader("/sys/devices/system/cpu/cpu" + i + "/cpufreq/cpuinfo_max_freq"))) {
                best = Math.max(best, Integer.parseInt(reader.readLine().trim()) / 1000);
            } catch (Throwable ignored) {
                // Some phones hide the frequencies.
            }
        }
        return best;
    }

    private static String capitalize(String value) {
        if (value == null || value.isEmpty()) return "";
        return value.substring(0, 1).toUpperCase(Locale.ROOT) + value.substring(1);
    }

    @PluginMethod
    public void temps(PluginCall call) {
        JSObject out = new JSObject();
        Intent state = getContext().registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (state != null) out.put("battery", state.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) / 10.0);
        if (Build.VERSION.SDK_INT >= 29) {
            PowerManager power = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            out.put("thermalStatus", power.getCurrentThermalStatus());
        }
        call.resolve(out);
    }

    // ── Storage speed ───────────────────────────────────────────────────────

    /** Writes up to 512 MB of random data and flushes it to the storage, then small 4 KB writes. The file is deleted. */
    @PluginMethod
    public void diskTest(PluginCall call) {
        new Thread(() -> {
            File file = new File(getContext().getCacheDir(), "oltechx-storage-test.bin");
            try {
                StatFs space = new StatFs(getContext().getCacheDir().getPath());
                if (space.getAvailableBytes() < (2L << 30)) {
                    call.resolve(failed("Няма достатъчно свободно място за теста."));
                    return;
                }
                SecureRandom random = new SecureRandom();
                byte[] block = new byte[8 << 20];
                random.nextBytes(block);
                long written = 0;
                long start = System.nanoTime();
                try (FileOutputStream out = new FileOutputStream(file)) {
                    while (written < (512L << 20) && System.nanoTime() - start < 6_000_000_000L) {
                        out.write(block);
                        written += block.length;
                    }
                    out.getFD().sync();
                }
                double write = written / ((System.nanoTime() - start) / 1e9);

                byte[] page = new byte[4096];
                random.nextBytes(page);
                ByteBuffer buffer = ByteBuffer.wrap(page);
                long pages = written / 4096;
                int ops = 0;
                Random place = new Random();
                long randomStart = System.nanoTime();
                try (RandomAccessFile raf = new RandomAccessFile(file, "rw"); FileChannel channel = raf.getChannel()) {
                    while (System.nanoTime() - randomStart < 2_500_000_000L) {
                        for (int i = 0; i < 16; i++) {
                            buffer.rewind();
                            channel.write(buffer, (long) (place.nextDouble() * pages) * 4096);
                            ops++;
                        }
                        channel.force(false);
                    }
                }
                double iops = ops / ((System.nanoTime() - randomStart) / 1e9);
                JSObject out = new JSObject();
                out.put("tested", true);
                out.put("write", write);
                out.put("iops", iops);
                out.put("testedMb", written >> 20);
                call.resolve(out);
            } catch (Throwable error) {
                call.resolve(failed("Тестът на паметта не успя."));
            } finally {
                //noinspection ResultOfMethodCallIgnored
                file.delete();
            }
        }).start();
    }

    private static JSObject failed(String reason) {
        JSObject out = new JSObject();
        out.put("tested", false);
        out.put("reason", reason);
        out.put("write", 0);
        out.put("iops", 0);
        out.put("testedMb", 0);
        return out;
    }

    // ── Screen ──────────────────────────────────────────────────────────────

    @PluginMethod
    public void keepAwake(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
        call.resolve();
    }

    // ── QR code ─────────────────────────────────────────────────────────────

    /** Google's code scanner: it opens its own camera screen, so the app needs no camera permission. */
    @PluginMethod
    public void scanQr(PluginCall call) {
        GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).enableAutoZoom().build();
        GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(getActivity(), options);
        scanner
            .startScan()
            .addOnSuccessListener(barcode -> {
                JSObject out = new JSObject();
                out.put("value", barcode.getRawValue());
                call.resolve(out);
            })
            .addOnCanceledListener(() -> call.resolve(new JSObject()))
            .addOnFailureListener(error -> call.reject("scanner", error));
    }

    // ── Account token ───────────────────────────────────────────────────────

    /** The token is encrypted with a key that never leaves the Android Keystore. */
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) store.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(
            new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build()
        );
        return generator.generateKey();
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void saveToken(PluginCall call) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            byte[] encrypted = cipher.doFinal(call.getString("token", "").getBytes(StandardCharsets.UTF_8));
            String value = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(encrypted, Base64.NO_WRAP);
            prefs().edit().putString("token", value).apply();
            call.resolve();
        } catch (Throwable error) {
            call.reject("token", error.getMessage());
        }
    }

    @PluginMethod
    public void loadToken(PluginCall call) {
        JSObject out = new JSObject();
        String value = prefs().getString("token", null);
        if (value != null) {
            try {
                String[] pieces = value.split(":");
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(pieces[0], Base64.NO_WRAP)));
                out.put("token", new String(cipher.doFinal(Base64.decode(pieces[1], Base64.NO_WRAP)), StandardCharsets.UTF_8));
            } catch (Throwable error) {
                prefs().edit().remove("token").apply();
            }
        }
        call.resolve(out);
    }

    @PluginMethod
    public void clearToken(PluginCall call) {
        prefs().edit().remove("token").apply();
        call.resolve();
    }
}
