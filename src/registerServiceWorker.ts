// VitePWA handles service worker registration automatically via virtual:pwa-register
// This file provides a fallback and update checking for the PWA

export function registerServiceWorker() {
  // VitePWA auto-registers the service worker in production
  // We just need to handle update prompts and periodic checks
  
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    // Listen for SW updates
    navigator.serviceWorker.ready.then((registration) => {
      console.log('ServiceWorker ready:', registration);
      
      // Check for updates periodically
      setInterval(() => {
        registration.update().catch((err) => {
          console.log('ServiceWorker update check failed:', err);
        });
      }, 60000); // Check every minute
    });

    // Handle controller change (new SW activated)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('New ServiceWorker activated, reloading for fresh content');
      // Optionally auto-reload, but typically handled by VitePWA's prompt
    });
  } else if (!import.meta.env.PROD) {
    console.log('ServiceWorker disabled in development mode');
  }
}
