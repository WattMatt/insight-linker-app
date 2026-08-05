"use client";
import { Card, CardContent } from "@/components/ui/card";

export default function QrRetiredPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center">
          <h1 className="text-lg font-semibold mb-2">This QR code has been retired</h1>
          <p className="text-muted-foreground text-sm">
            Please contact Watson Mattheus for the current compliance status of this item.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
