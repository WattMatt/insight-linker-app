import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wattmatt.compliance',
  appName: 'wm-compliance',
  webDir: 'out',
  server: {
    url: 'https://insight-linker-app.vercel.app',
    cleartext: true
  },
  plugins: {
    Camera: {
      // Request permissions on first use
      permissions: {
        photos: 'limited'
      }
    }
  }
};

export default config;
