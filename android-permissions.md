# Android Camera Permissions Setup

After running `npx cap add android`, you need to add camera permissions to your Android app.

## Step 1: Add Permissions to AndroidManifest.xml

Open `android/app/src/main/AndroidManifest.xml` and add these permissions inside the `<manifest>` tag (before `<application>`):

```xml
<!-- Camera Permissions -->
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />

<!-- Camera Feature -->
<uses-feature android:name="android.hardware.camera" android:required="false" />
<uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
```

## Step 2: Update FileProvider Configuration

Make sure your `android/app/src/main/res/xml/file_paths.xml` exists with:

```xml
<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-files-path name="my_images" path="." />
    <external-path name="external_files" path="." />
</paths>
```

## Step 3: Sync and Build

After making these changes:

1. Run `npx cap sync android`
2. Run `npm run build` 
3. Run `npx cap open android` to open in Android Studio
4. Build and run the app from Android Studio

## Testing Camera

The camera should now work on Android devices for:
- Taking photos with the camera
- Selecting photos from the gallery
- Uploading inspection images

If you still encounter issues, make sure you've granted camera permissions in your device's app settings.
