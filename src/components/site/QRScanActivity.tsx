import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Subsection } from "@/types/site";

interface QRScanActivityProps {
    subsections: Subsection[];
}

interface SubsectionScanRow {
    subsectionId: string;
    name: string;
    count30d: number;
    lastScannedAt: string | null;
}

// Tiny relative-time helper — no dependency, just enough granularity for a scan-activity table.
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

export const QRScanActivity: React.FC<QRScanActivityProps> = ({ subsections }) => {
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<SubsectionScanRow[]>([]);

    useEffect(() => {
        const ids = subsections.map((s) => s.id);

        if (ids.length === 0) {
            setRows([]);
            setLoading(false);
            return;
        }

        let cancelled = false;

        const fetchScanActivity = async () => {
            setLoading(true);
            try {
                const since = new Date(Date.now() - 30 * 86400000).toISOString();

                const { data: recent } = await supabase
                    .from('qr_scans')
                    .select('subsection_id, scanned_at')
                    .in('subsection_id', ids)
                    .gte('scanned_at', since)
                    .order('scanned_at', { ascending: false });

                const { data: lastScans } = await supabase
                    .from('qr_scans')
                    .select('subsection_id, scanned_at')
                    .in('subsection_id', ids)
                    .order('scanned_at', { ascending: false })
                    .limit(1000);

                if (cancelled) return;

                // 30d count per subsection
                const count30dBySubsection = new Map<string, number>();
                for (const scan of recent || []) {
                    count30dBySubsection.set(
                        scan.subsection_id,
                        (count30dBySubsection.get(scan.subsection_id) || 0) + 1
                    );
                }

                // Last scan per subsection — lastScans is ordered desc, so the first
                // occurrence per subsection_id is the most recent scan.
                const lastScanBySubsection = new Map<string, string>();
                for (const scan of lastScans || []) {
                    if (!lastScanBySubsection.has(scan.subsection_id)) {
                        lastScanBySubsection.set(scan.subsection_id, scan.scanned_at);
                    }
                }

                const nextRows: SubsectionScanRow[] = subsections.map((s) => ({
                    subsectionId: s.id,
                    name: s.name,
                    count30d: count30dBySubsection.get(s.id) || 0,
                    lastScannedAt: lastScanBySubsection.get(s.id) || null,
                }));

                // Never-scanned rows sort last; otherwise most-recently-scanned first.
                nextRows.sort((a, b) => {
                    if (!a.lastScannedAt && !b.lastScannedAt) return a.name.localeCompare(b.name);
                    if (!a.lastScannedAt) return 1;
                    if (!b.lastScannedAt) return -1;
                    return new Date(b.lastScannedAt).getTime() - new Date(a.lastScannedAt).getTime();
                });

                setRows(nextRows);
            } catch (error) {
                console.error("Error fetching QR scan activity:", error);
                if (!cancelled) setRows([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchScanActivity();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subsections.map((s) => s.id).join(",")]);

    const totalScans30d = rows.reduce((sum, r) => sum + r.count30d, 0);
    const subsectionsScanned30d = rows.filter((r) => r.count30d > 0).length;
    const neverScanned = rows.filter((r) => !r.lastScannedAt).length;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Scan activity — last 30 days</CardTitle>
                <CardDescription>
                    QR code scans recorded for this site&apos;s subsections
                </CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
                ) : (
                    <>
                        <div className="flex flex-wrap gap-6 mb-6">
                            <div>
                                <div className="text-2xl font-bold">{totalScans30d}</div>
                                <div className="text-xs text-muted-foreground">Total scans 30d</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold">{subsectionsScanned30d}</div>
                                <div className="text-xs text-muted-foreground">Subsections scanned 30d</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold">{neverScanned}</div>
                                <div className="text-xs text-muted-foreground">Never scanned</div>
                            </div>
                        </div>

                        {rows.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-6">
                                No subsections found for this site.
                            </p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-xs text-muted-foreground">
                                            <th className="py-2 pr-4 font-medium">Subsection</th>
                                            <th className="py-2 pr-4 font-medium">Scans (30d)</th>
                                            <th className="py-2 font-medium">Last scanned</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row) => (
                                            <tr key={row.subsectionId} className="border-b last:border-0">
                                                <td className="py-2 pr-4">{row.name}</td>
                                                <td className="py-2 pr-4">{row.count30d}</td>
                                                <td className="py-2">
                                                    {row.lastScannedAt ? (
                                                        formatRelativeTime(row.lastScannedAt)
                                                    ) : (
                                                        <Badge variant="destructive" className="opacity-70">
                                                            Never scanned
                                                        </Badge>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
};
