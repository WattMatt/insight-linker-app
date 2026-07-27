import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QrCode, Layers, MapPin } from "lucide-react";

interface QRScanEntry {
  subsection_id: string;
  scanned_at: string;
  source: string;
  subsections: {
    name: string;
    site_id: string;
    sites: {
      name: string;
    } | null;
  } | null;
}

// Tiny relative-time helper — no dependency, just enough granularity for a scan-activity table.
// Mirrors src/components/site/QRScanActivity.tsx so both views read scan recency the same way.
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

const QRActivity = () => {
  const [scans, setScans] = useState<QRScanEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchScanActivity();
  }, []);

  const fetchScanActivity = async () => {
    try {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();

      const { data, error } = await supabase
        .from('qr_scans')
        .select('subsection_id, scanned_at, source, subsections(name, site_id, sites(name))')
        .gte('scanned_at', since)
        .order('scanned_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setScans((data || []) as any as QRScanEntry[]);
    } catch (error) {
      console.error("Error fetching QR scan activity:", error);
      setScans([]);
    } finally {
      setLoading(false);
    }
  };

  const totalScansCapped = scans.length === 500;
  const totalScansLabel = totalScansCapped ? "500+" : String(scans.length);
  const distinctSubsections = new Set(scans.map((s) => s.subsection_id)).size;
  const distinctSites = new Set(
    scans.map((s) => s.subsections?.site_id).filter((id): id is string => Boolean(id))
  ).size;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading QR activity...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">QR Activity</h1>
        <p className="text-muted-foreground mt-2">
          Scans across all sites — last 30 days
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total scans (30d)</CardTitle>
            <QrCode className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalScansLabel}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Subsections scanned</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{distinctSubsections}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sites scanned</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{distinctSites}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent scans</CardTitle>
          <CardDescription>
            Most recent QR code scans recorded across the platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <QrCode className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No scans recorded yet</p>
              <p className="text-sm text-muted-foreground">
                Scan any printed QR code once the platform update is live.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Site</th>
                    <th className="py-2 pr-4 font-medium">Subsection</th>
                    <th className="py-2 pr-4 font-medium">When</th>
                    <th className="py-2 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.map((scan, index) => (
                    <tr key={`${scan.subsection_id}-${scan.scanned_at}-${index}`} className="border-b last:border-0">
                      <td className="py-2 pr-4">{scan.subsections?.sites?.name || "—"}</td>
                      <td className="py-2 pr-4">{scan.subsections?.name || "—"}</td>
                      <td className="py-2 pr-4">{formatRelativeTime(scan.scanned_at)}</td>
                      <td className="py-2">
                        {scan.source === "redirect" ? (
                          <Badge variant="secondary">Scan</Badge>
                        ) : scan.source === "landing" ? (
                          <Badge variant="outline">Signed-in</Badge>
                        ) : (
                          <Badge variant="outline">{scan.source}</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default QRActivity;
