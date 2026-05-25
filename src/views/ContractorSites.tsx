import { useState } from "react";
import { useNavigate, useSearchParams } from "@/lib/navigation";
import { useContractorSites } from "@/hooks/useContractorSites";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import ContractorPortalLayout from "@/components/ContractorPortalLayout";

const ContractorSites = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const previewSiteId = searchParams.get("preview");
  const { data: sites, isLoading } = useContractorSites(previewSiteId || undefined);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredSites = sites?.filter((site: any) =>
    site.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    site.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    site.site_type?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <ContractorPortalLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-full max-w-md" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        </div>
      </ContractorPortalLayout>
    );
  }

  return (
    <ContractorPortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Sites</h1>
          <p className="text-muted-foreground">
            Sites assigned to you for inspection work
          </p>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search sites by name, address, or type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {filteredSites && filteredSites.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredSites.map((site: any) => (
              <Card
                key={site.id}
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => navigate(`/contractor/sites/${site.id}${previewSiteId ? `?preview=${previewSiteId}` : ''}`)}
              >
                {site.site_image_url && (
                  <div className="h-48 overflow-hidden rounded-t-lg">
                    <img
                      src={site.site_image_url}
                      alt={site.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <CardHeader>
                  <CardTitle>{site.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {site.address && (
                      <p className="text-muted-foreground">{site.address}</p>
                    )}
                    {site.site_type && (
                      <p className="text-muted-foreground">Type: {site.site_type}</p>
                    )}
                    {site.clients && (
                      <p className="text-xs text-muted-foreground">
                        Client: {site.clients.company_name || site.clients.name}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {searchTerm
                ? "No sites found matching your search"
                : "No sites assigned yet. Please contact your administrator."}
            </CardContent>
          </Card>
        )}
      </div>
    </ContractorPortalLayout>
  );
};

export default ContractorSites;
