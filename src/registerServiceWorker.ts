export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then(
        (registration) => {
          console.log('ServiceWorker registered: ', registration);
          
          // Check for updates periodically
          setInterval(() => {
            registration.update();
          }, 60000); // Check every minute
        },
        (err) => {
          console.log('ServiceWorker registration failed: ', err);
        },
      );
    });
  }
}
