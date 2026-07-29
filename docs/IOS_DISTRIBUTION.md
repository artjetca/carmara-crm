# Casmara CRM iOS distribution

## Project identity

- App name: `Casmara CRM`
- Bundle ID: `com.casmara.crm`
- Minimum iOS version: iOS 15
- Apple Team: `U8TWFHY6S5`

## Sync web changes into Xcode

Use the x64 Node toolchain required by this repository:

```bash
PATH="/usr/local/bin:$PATH" npm run ios:sync
```

Open the native project:

```bash
PATH="/usr/local/bin:$PATH" npm run ios:open
```

## TestFlight release

1. Increment `CURRENT_PROJECT_VERSION` in `ios/App/App.xcodeproj/project.pbxproj`.
2. Run `npm run ios:sync`.
3. In Xcode, select **Any iOS Device (arm64)** and choose **Product > Archive**.
4. In Organizer, choose **Distribute App > App Store Connect > Upload**.
5. Select the uploaded build in App Store Connect under TestFlight and add testers.

TestFlight export requires an active Apple Developer Program membership, an App Store
Connect provider, an Apple Distribution certificate, and permission to create App
Store provisioning profiles.

## Development IPA

The development export uses `ios/App/ExportOptionsDevelopment.plist`. It can only run
on devices included in its provisioning profile and a free provisioning profile expires
after seven days.
