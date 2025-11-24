import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar as CalendarIcon, MapPin, Clock, Info } from "lucide-react";
import { useClientInfo } from "@/hooks/useUserRole";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useSearchParams } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";

const ClientPortalCalendar = () => {
  const [searchParams] = useSearchParams();
  const previewClientId = searchParams.get("preview");
  const { data: clientInfo } = useClientInfo(previewClientId || undefined);
  
  const { data: inspections, isLoading } = useQuery({
    queryKey: ["client-inspections", clientInfo?.client_id],
    enabled: !!clientInfo?.client_id,
    queryFn: async () => {
      // Get all site IDs for this client
      const { data: sites } = await supabase
        .from("sites")
        .select("id, name")
        .eq("client_id", clientInfo!.client_id);
      
      if (!sites || sites.length === 0) return [];

      const siteIds = sites.map(s => s.id);
      const siteMap = new Map(sites.map(s => [s.id, s.name]));

      // Get inspections for these sites
      const { data, error } = await supabase
        .from("inspections")
        .select("*")
        .in("site_id", siteIds)
        .order("inspection_date", { ascending: false });

      if (error) throw error;
      
      // Add site name to each inspection
      return data.map(inspection => ({
        ...inspection,
        siteName: siteMap.get(inspection.site_id),
      }));
    },
  });

  const { data: calendarEvents, isLoading: eventsLoading } = useQuery({
    queryKey: ["client-calendar-events", clientInfo?.client_id],
    enabled: !!clientInfo?.client_id,
    queryFn: async () => {
      // First verify client ownership of sites by querying with client_id filter
      const { data: sites } = await supabase
        .from("sites")
        .select("id, name")
        .eq("client_id", clientInfo!.client_id);
      
      if (!sites || sites.length === 0) return [];

      const siteNames = sites.map(s => s.name);

      // Get calendar events for these sites (filtered by site names from client's sites only)
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .in("site_name", siteNames)
        .order("start_date", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "completed": return "bg-green-500";
      case "in progress": return "bg-blue-500";
      case "scheduled": return "bg-orange-500";
      case "pending": return "bg-yellow-500";
      default: return "bg-gray-500";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case "high": return "bg-red-500";
      case "medium": return "bg-orange-500";
      case "low": return "bg-green-500";
      default: return "bg-gray-500";
    }
  };

  if (isLoading || eventsLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  const allEvents = [
    ...(inspections || []).map(i => ({ 
      ...i, 
      type: 'inspection' as const,
      displayDate: i.inspection_date,
      displaySiteName: i.siteName,
    })),
    ...(calendarEvents || []).map(e => ({ 
      ...e, 
      type: 'event' as const,
      displayDate: e.start_date,
      displaySiteName: e.site_name,
    })),
  ].sort((a, b) => {
    const dateA = new Date(a.displayDate);
    const dateB = new Date(b.displayDate);
    return dateB.getTime() - dateA.getTime();
  });

  return (
    <div className="space-y-6">
      {previewClientId && (
        <Alert className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Admin Preview Mode:</strong> Viewing calendar for{" "}
            {clientInfo?.clients?.company_name || clientInfo?.clients?.name}
          </AlertDescription>
        </Alert>
      )}
      
      <div>
        <h1 className="text-3xl font-bold">Inspection Calendar</h1>
        <p className="text-muted-foreground mt-2">
          View all scheduled and completed inspections
        </p>
      </div>

      {allEvents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CalendarIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No inspections found</p>
            <p className="text-sm text-muted-foreground">
              There are no inspections scheduled for your sites yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {allEvents.map((event, index) => {
            const date = event.displayDate;
            const endDate = event.end_date;
            const description = event.type === 'inspection' ? event.description : null;
            const eventType = event.type === 'event' ? event.event_type : null;

            return (
              <Card key={`${event.type}-${event.id}-${index}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">
                        {event.title || `Inspection at ${event.displaySiteName}`}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        <span>{event.displaySiteName}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {event.status && (
                        <Badge 
                          className={`${getStatusColor(event.status)} text-white`}
                        >
                          {event.status}
                        </Badge>
                      )}
                      {event.priority && (
                        <Badge 
                          variant="outline"
                          className={`${getPriorityColor(event.priority)} text-white border-0`}
                        >
                          {event.priority} Priority
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {date ? format(new Date(date), "PPP") : "No date"}
                        {endDate && ` - ${format(new Date(endDate), "PPP")}`}
                      </span>
                    </div>
                    {eventType && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{eventType}</span>
                      </div>
                    )}
                  </div>
                  {description && (
                    <p className="text-sm text-muted-foreground mt-3">
                      {description}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ClientPortalCalendar;
