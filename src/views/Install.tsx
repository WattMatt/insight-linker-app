import { useState, useEffect } from 'react';
import { Download, Check, Smartphone, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function Install() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Detect iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    // Listen for the install prompt event
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setIsInstalled(true);
    }

    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-24 h-24 bg-primary rounded-3xl flex items-center justify-center shadow-lg">
            <img src="/icon-192.png" alt="App Icon" className="w-20 h-20 rounded-2xl" />
          </div>
          <div>
            <CardTitle className="text-3xl mb-2">WM Compliance Inspector</CardTitle>
            <CardDescription className="text-base">
              Install our app for the best experience - work offline, access quickly, and get instant notifications.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {isInstalled ? (
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
              <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                App is already installed! You can close this page and access the app from your home screen.
              </AlertDescription>
            </Alert>
          ) : isInstallable ? (
            <div className="space-y-4">
              <Button
                onClick={handleInstall}
                size="lg"
                className="w-full text-lg h-14"
              >
                <Download className="mr-2 h-5 w-5" />
                Install App Now
              </Button>
              <p className="text-sm text-muted-foreground text-center">
                Click the button above to install the app on your device
              </p>
            </div>
          ) : isIOS ? (
            <div className="space-y-4">
              <Alert>
                <Smartphone className="h-5 w-5" />
                <AlertDescription>
                  <strong className="block mb-2">Install on iPhone/iPad:</strong>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Tap the Share button <span className="inline-block">📤</span> in Safari</li>
                    <li>Scroll down and tap "Add to Home Screen"</li>
                    <li>Tap "Add" in the top right corner</li>
                  </ol>
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <Alert>
              <Monitor className="h-5 w-5" />
              <AlertDescription>
                <strong className="block mb-2">Install on Desktop:</strong>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Look for the install icon in your browser's address bar</li>
                  <li>Click it and follow the prompts to install</li>
                  <li>Or check your browser menu for "Install" or "Add to Home Screen"</li>
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="pt-6 border-t">
            <h3 className="font-semibold mb-3">Benefits of Installing:</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Works offline - Continue working without internet connection</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Faster loading - Cached resources load instantly</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Home screen access - Launch like any other app</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Full screen experience - No browser UI distractions</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Automatic updates - Always have the latest version</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
