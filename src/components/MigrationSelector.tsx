import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Building2, MapPin, Layers, Loader2, CheckCircle, XCircle } from "lucide-react";
import { readFirebaseData } from "@/lib/firebase";
import { supabase } from "@/integrations/supabase/client";

interface Client {
  id: string;
  name: string;
  sites: Site[];
  status: 'pending' | 'migrating' | 'completed' | 'failed';
}

interface Site {
  id: string;
  name: string;
  subsections: Subsection[];
  status: 'pending' | 'migrating' | 'completed' | 'failed';
}

interface Subsection {
  id: string;
  name: string;
  status: 'pending' | 'migrating' | 'completed' | 'failed';
}

interface MigrationSelectorProps {
  onMigrate: (selections: {
    clientIds: string[];
    siteIds: string[];
    subsectionIds: string[];
  }) => Promise<void>;
}

export const MigrationSelector = ({ onMigrate }: MigrationSelectorProps) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [selectedSites, setSelectedSites] = useState<Set<string>>(new Set());
  const [selectedSubsections, setSelectedSubsections] = useState<Set<string>>(new Set());
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set());
  const [migrating, setMigrating] = useState(false);

  useEffect(() => {
    loadStructure();
  }, []);

  const loadStructure = async () => {
    setLoading(true);
    try {
      // Load Firebase data
      const firebaseData = await readFirebaseData("/clients");
      if (!firebaseData) {
        setClients([]);
        return;
      }

      // Check what's already migrated in Supabase
      const { data: supabaseClients } = await supabase
        .from('clients')
        .select('firebase_id');
      
      const { data: supabaseSites } = await supabase
        .from('sites')
        .select('firebase_id');
      
      const { data: supabaseSubsections } = await supabase
        .from('subsections')
        .select('firebase_id');

      const migratedClientIds = new Set(supabaseClients?.map(c => c.firebase_id) || []);
      const migratedSiteIds = new Set(supabaseSites?.map(s => s.firebase_id) || []);
      const migratedSubsectionIds = new Set(supabaseSubsections?.map(s => s.firebase_id) || []);

      // Build structure
      const clientStructure: Client[] = [];
      
      for (const [clientId, clientData] of Object.entries(firebaseData)) {
        const clientStatus = migratedClientIds.has(clientId) ? 'completed' : 'pending';
        
        // Extract sites
        const sites: Site[] = [];
        const sitesData = (clientData as any).sites || (clientData as any).Sites || {};
        
        // Check if sites are direct children
        if (Object.keys(sitesData).length === 0) {
          const clientLevelProps = ['name', 'clientName', 'Name', 'email', 'Email', 'phone', 'Phone', 
            'logo', 'logoUrl', 'logo_url', 'LogoUrl', 'created', 'createdAt', 'created_at'];
          
          for (const [key, value] of Object.entries(clientData as any)) {
            if (!clientLevelProps.some(prop => key.toLowerCase() === prop.toLowerCase()) && 
                typeof value === 'object' && value !== null) {
              sitesData[key] = value;
            }
          }
        }

        for (const [siteId, siteData] of Object.entries(sitesData)) {
          const siteStatus = migratedSiteIds.has(siteId) ? 'completed' : 'pending';
          
          // Extract subsections
          const subsections: Subsection[] = [];
          const subsectionsData = (siteData as any).subsections || (siteData as any).Subsections || {};
          
          for (const [subsectionId, subsectionData] of Object.entries(subsectionsData)) {
            const subsectionStatus = migratedSubsectionIds.has(subsectionId) ? 'completed' : 'pending';
            subsections.push({
              id: subsectionId,
              name: (subsectionData as any).name || (subsectionData as any).Name || subsectionId,
              status: subsectionStatus
            });
          }
          
          sites.push({
            id: siteId,
            name: (siteData as any).name || (siteData as any).siteName || (siteData as any).Name || siteId,
            subsections,
            status: siteStatus
          });
        }
        
        clientStructure.push({
          id: clientId,
          name: (clientData as any).name || (clientData as any).clientName || (clientData as any).Name || clientId,
          sites,
          status: clientStatus
        });
      }
      
      setClients(clientStructure);
    } catch (error) {
      console.error('Error loading structure:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleClient = (clientId: string) => {
    const newSelected = new Set(selectedClients);
    if (newSelected.has(clientId)) {
      newSelected.delete(clientId);
    } else {
      newSelected.add(clientId);
    }
    setSelectedClients(newSelected);
  };

  const toggleSite = (siteId: string) => {
    const newSelected = new Set(selectedSites);
    if (newSelected.has(siteId)) {
      newSelected.delete(siteId);
    } else {
      newSelected.add(siteId);
    }
    setSelectedSites(newSelected);
  };

  const toggleSubsection = (subsectionId: string) => {
    const newSelected = new Set(selectedSubsections);
    if (newSelected.has(subsectionId)) {
      newSelected.delete(subsectionId);
    } else {
      newSelected.add(subsectionId);
    }
    setSelectedSubsections(newSelected);
  };

  const selectAll = () => {
    const allClientIds = clients.filter(c => c.status !== 'completed').map(c => c.id);
    setSelectedClients(new Set(allClientIds));
  };

  const clearSelection = () => {
    setSelectedClients(new Set());
    setSelectedSites(new Set());
    setSelectedSubsections(new Set());
  };

  const handleMigrate = async () => {
    setMigrating(true);
    try {
      await onMigrate({
        clientIds: Array.from(selectedClients),
        siteIds: Array.from(selectedSites),
        subsectionIds: Array.from(selectedSubsections)
      });
      await loadStructure(); // Refresh to show updated statuses
      clearSelection();
    } finally {
      setMigrating(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'migrating':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      pending: 'outline',
      migrating: 'default',
      completed: 'secondary',
      failed: 'destructive'
    };
    return <Badge variant={variants[status]}>{status}</Badge>;
  };

  const selectionCount = selectedClients.size + selectedSites.size + selectedSubsections.size;
  const pendingCount = clients.filter(c => c.status === 'pending').length;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Migration Selector</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={selectAll}
              disabled={pendingCount === 0 || migrating}
            >
              Select All Pending
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={clearSelection}
              disabled={selectionCount === 0 || migrating}
            >
              Clear
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={loadStructure}
              disabled={migrating}
            >
              Refresh
            </Button>
          </div>
        </CardTitle>
        <CardDescription>
          Select clients, sites, or subsections to migrate individually or in bulk
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">
            {selectionCount} item(s) selected
          </span>
          <Button
            onClick={handleMigrate}
            disabled={selectionCount === 0 || migrating}
          >
            {migrating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Migrating...
              </>
            ) : (
              `Migrate Selected (${selectionCount})`
            )}
          </Button>
        </div>

        <div className="space-y-2">
          {clients.map((client) => (
            <Collapsible
              key={client.id}
              open={expandedClients.has(client.id)}
              onOpenChange={() => {
                const newExpanded = new Set(expandedClients);
                if (newExpanded.has(client.id)) {
                  newExpanded.delete(client.id);
                } else {
                  newExpanded.add(client.id);
                }
                setExpandedClients(newExpanded);
              }}
            >
              <div className="flex items-center gap-2 p-3 border rounded-lg hover:bg-accent/50">
                <Checkbox
                  checked={selectedClients.has(client.id)}
                  onCheckedChange={() => toggleClient(client.id)}
                  disabled={client.status === 'completed' || migrating}
                />
                <CollapsibleTrigger className="flex items-center gap-2 flex-1">
                  {expandedClients.has(client.id) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <Building2 className="h-4 w-4" />
                  <span className="font-medium">{client.name}</span>
                  <Badge variant="outline" className="ml-auto">
                    {client.sites.length} sites
                  </Badge>
                  {getStatusIcon(client.status)}
                  {getStatusBadge(client.status)}
                </CollapsibleTrigger>
              </div>
              
              <CollapsibleContent className="ml-6 mt-2 space-y-2">
                {client.sites.map((site) => (
                  <Collapsible
                    key={site.id}
                    open={expandedSites.has(site.id)}
                    onOpenChange={() => {
                      const newExpanded = new Set(expandedSites);
                      if (newExpanded.has(site.id)) {
                        newExpanded.delete(site.id);
                      } else {
                        newExpanded.add(site.id);
                      }
                      setExpandedSites(newExpanded);
                    }}
                  >
                    <div className="flex items-center gap-2 p-2 border rounded hover:bg-accent/50">
                      <Checkbox
                        checked={selectedSites.has(site.id)}
                        onCheckedChange={() => toggleSite(site.id)}
                        disabled={site.status === 'completed' || migrating}
                      />
                      <CollapsibleTrigger className="flex items-center gap-2 flex-1">
                        {expandedSites.has(site.id) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <MapPin className="h-4 w-4" />
                        <span className="text-sm">{site.name}</span>
                        <Badge variant="outline" className="ml-auto text-xs">
                          {site.subsections.length} subsections
                        </Badge>
                        {getStatusIcon(site.status)}
                        {getStatusBadge(site.status)}
                      </CollapsibleTrigger>
                    </div>
                    
                    <CollapsibleContent className="ml-6 mt-2 space-y-1">
                      {site.subsections.map((subsection) => (
                        <div key={subsection.id} className="flex items-center gap-2 p-2 border rounded hover:bg-accent/50">
                          <Checkbox
                            checked={selectedSubsections.has(subsection.id)}
                            onCheckedChange={() => toggleSubsection(subsection.id)}
                            disabled={subsection.status === 'completed' || migrating}
                          />
                          <Layers className="h-4 w-4" />
                          <span className="text-sm flex-1">{subsection.name}</span>
                          {getStatusIcon(subsection.status)}
                          {getStatusBadge(subsection.status)}
                        </div>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
