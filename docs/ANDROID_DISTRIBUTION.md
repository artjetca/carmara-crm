# Casmara CRM Android distribution

## Project identity

- App name: `Casmara CRM`
- Application ID: `com.casmara.crm`
- Minimum Android version: Android 7.0 (API 24)
- Target Android version: API 36
- Launcher icon master: `resources/ios/AppIcon-logo.png`
- Build JDK: OpenJDK 21

## Build the installable APK

```bash
PATH="/usr/local/bin:$PATH" npm run android:apk
```

The debug-signed APK is created at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Build the Google Play bundle

```bash
PATH="/usr/local/bin:$PATH" npm run android:bundle
```

The release AAB must be signed with a private upload key before Google Play accepts it.
Keep that key and its password outside Git and backed up securely.

## Install on a connected phone

Enable Developer options and USB debugging, connect the phone, then run:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```
