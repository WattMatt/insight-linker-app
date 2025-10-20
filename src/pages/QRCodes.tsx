import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QrCode, Search, ExternalLink, Building2, MapPin, Layers } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface QRCodeEntry {
  id: string;
  qr_code_url: string;
  label: string | null;
  created_at: string;
  client_id: string | null;
  site_id: string | null;
  subsection_id: string | null;
  clients: {
    name: string;
    company_name: string | null;
  } | null;
  sites: {
    name: string;
  } | null;
  subsections: {
    name: string;
  } | null;
}

const QRCodes = () => {
  const [qrCodes, setQrCodes] = useState<QRCodeEntry[]>([]);
  const [filteredCodes, setFilteredCodes] = useState<QRCodeEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchQRCodes();
  }, []);

  useEffect(() => {
    filterQRCodes();
  }, [searchTerm, qrCodes]);

  const fetchQRCodes = async () => {
    try {
      const { data, error } = await supabase
        .from("qr_codes")
        .select(`
          *,
          clients (
            name,
            company_name
          ),
          sites (
            name
          ),
          subsections (
            name
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setQrCodes(data || []);
      setFilteredCodes(data || []);
    } catch (error: any) {
      console.error("Error fetching QR codes:", error);
      toast({
        title: "Error",
        description: "Failed to load QR codes",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filterQRCodes = () => {
    if (!searchTerm.trim()) {
      setFilteredCodes(qrCodes);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = qrCodes.filter((qr) => {
      const clientName = qr.clients?.name?.toLowerCase() || "";
      const companyName = qr.clients?.company_name?.toLowerCase() || "";
      const siteName = qr.sites?.name?.toLowerCase() || "";
      const subsectionName = qr.subsections?.name?.toLowerCase() || "";
      const label = qr.label?.toLowerCase() || "";

      return (
        clientName.includes(term) ||
        companyName.includes(term) ||
        siteName.includes(term) ||
        subsectionName.includes(term) ||
        label.includes(term)
      );
    });

    setFilteredCodes(filtered);
  };

  const handleViewDetails = (qr: QRCodeEntry) => {
    if (qr.client_id && qr.site_id && qr.subsection_id) {
      navigate(`/clients/${qr.client_id}/sites/${qr.site_id}/subsections/${qr.subsection_id}`);
    } else if (qr.client_id && qr.site_id) {
      navigate(`/clients/${qr.client_id}/sites/${qr.site_id}`);
    } else if (qr.client_id) {
      navigate(`/clients/${qr.client_id}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading QR codes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">QR Code Database</h1>
        <p className="text-muted-foreground mt-2">
          Manage and search all QR codes across clients, sites, and subsections
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search QR Codes
          </CardTitle>
          <CardDescription>
            Search by client, site, subsection, or label
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search QR codes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {filteredCodes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <QrCode className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No QR codes found</p>
              <p className="text-sm text-muted-foreground">
                {searchTerm ? "Try adjusting your search" : "QR codes will appear here once created"}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredCodes.map((qr) => (
            <Card key={qr.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="bg-primary/10 rounded-lg p-2 mt-1">
                        <QrCode className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        {qr.label && (
                          <h3 className="font-semibold text-lg mb-2">{qr.label}</h3>
                        )}
                        
                        <div className="space-y-2">
                          {qr.clients && (
                            <div className="flex items-center gap-2 text-sm">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">
                                {qr.clients.company_name || qr.clients.name}
                              </span>
                            </div>
                          )}
                          
                          {qr.sites && (
                            <div className="flex items-center gap-2 text-sm">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              <span>{qr.sites.name}</span>
                            </div>
                          )}
                          
                          {qr.subsections && (
                            <div className="flex items-center gap-2 text-sm">
                              <Layers className="h-4 w-4 text-muted-foreground" />
                              <span>{qr.subsections.name}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-3">
                          <Badge variant="outline" className="text-xs">
                            Created {new Date(qr.created_at).toLocaleDateString()}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {qr.qr_code_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(qr.qr_code_url, "_blank")}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View QR
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleViewDetails(qr)}
                      disabled={!qr.client_id}
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {filteredCodes.length > 0 && (
        <div className="text-center text-sm text-muted-foreground">
          Showing {filteredCodes.length} of {qrCodes.length} QR codes
        </div>
      )}
    </div>
  );
};

export default QRCodes;