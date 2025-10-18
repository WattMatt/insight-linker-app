# Android Camera Setup Guide

## Web Browser Access (Current Implementation)
The app now uses HTML5 file input with camera capture for web browsers:
- ✅ Works on Chrome, Firefox, and modern Android browsers
- ✅ Requires HTTPS (or localhost for testing)
- ✅ Automatically requests camera permissions when user clicks "Add Image"
- ✅ Falls back to file picker if camera not available

### Testing in Browser
1. Visit your app via HTTPS URL
2. Click any "Add Image" or camera button
3. Browser will prompt for camera permission
4. Grant permission to access camera
5. Take photo or select from gallery

## Native Android App Setup
For the native Capacitor Android app, you need to configure permissions in `AndroidManifest.xml`.

### Required Permissions
Add these to `android/app/src/main/AndroidManifest.xml`:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    
    <!-- Camera permissions -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
    
    <!-- Storage permissions for photo gallery -->
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
        android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
        android:maxSdkVersion="29" />
    
    <application>
        <!-- Your app configuration -->
    </application>
</manifest>
```

### WebView Configuration (if needed)
If using WebView, add to your Activity:

```java
// Enable camera in WebView
webView.getSettings().setJavaScriptEnabled(true);
webView.getSettings().setMediaPlaybackRequiresUserGesture(false);

// Handle file upload
webView.setWebChromeClient(new WebChromeClient() {
    // Override file chooser methods
});
```

### Build Steps
1. Transfer project to GitHub
2. Clone locally: `git clone <your-repo>`
3. Install dependencies: `npm install`
4. Add Android platform: `npx cap add android`
5. Update permissions in `android/app/src/main/AndroidManifest.xml`
6. Build the app: `npm run build`
7. Sync with Android: `npx cap sync android`
8. Open in Android Studio: `npx cap open android`
9. Run on device or emulator

### Runtime Permission Handling
The app automatically:
- Checks camera permissions before use
- Requests permissions if not granted
- Shows user-friendly error messages
- Provides fallback to gallery selection

### Troubleshooting

**Camera button does nothing:**
- Check browser console for errors
- Verify HTTPS connection (required for camera)
- Check if permissions were denied in browser settings

**Permission denied on Android:**
1. Go to device Settings > Apps > Your App > Permissions
2. Enable Camera and Storage permissions
3. Restart the app

**WebView not showing camera:**
- Verify AndroidManifest.xml has camera permissions
- Check WebView is configured to allow media capture
- Update Android System WebView in Play Store

**File picker instead of camera:**
- This is normal behavior on desktop browsers
- On mobile, browser should offer camera option
- Native app gives choice between camera/gallery

### Testing Checklist
- [ ] Web browser (HTTPS) - file input opens
- [ ] Android browser - camera option available
- [ ] Native Android app - camera opens directly
- [ ] Permissions properly requested
- [ ] Photo upload works after capture
- [ ] Multiple photo selection works
- [ ] Gallery access works

## Support
For camera issues, check:
1. Browser/OS compatibility
2. HTTPS enabled (for web)
3. Permissions granted (for native)
4. Console errors for specific issues
