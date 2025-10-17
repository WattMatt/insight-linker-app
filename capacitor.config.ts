import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.7b7a829f65664e31a58f428ee0cc1c75',
  appName: 'wm-compliance',
  webDir: 'dist',
  server: {
    url: 'https://7b7a829f-6566-4e31-a58f-428ee0cc1c75.lovableproject.com?forceHideBadge=true',
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
