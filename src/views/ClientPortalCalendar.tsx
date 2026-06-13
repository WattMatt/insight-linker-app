import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar as CalendarIcon, MapPin, Info } from "lucide-react";
import { useClientInfo } from "@/hooks/useUserRole";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, isValid } from "date-fns";
import { useSearchParams } from "@/lib/navigation";
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

      const siteIds = sites.map(s => s.id);

      // Scope by site_id (identity-based), not the free-text site_name. Name-matching
      // could leak events from another client's identically-named site or silently drop
      // events after a site rename. RLS also enforces this scoping at the DB layer.
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .in("site_id", siteIds)
        .order("start_date", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Project the internal status onto a clean, client-facing vocabulary.
  // Internal states (in progress / scheduled / pending / null / ...) are all
  // "Scheduled" to the client; only a finished item reads as "Completed".
  const getClientStatus = (status?: string | null) =>
    status?.toLowerCase() === "completed" ? "Completed" : "Scheduled";

  const getStatusColor = (clientStatus: string) => {
    switch (clientStatus) {
      case "Completed": return "bg-green-500";
      case "Scheduled": return "bg-orange-500";
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
  ];

  type CalendarItem = (typeof allEvents)[number];

  // parseISO keeps date-only strings at LOCAL midnight (new Date() parses them as UTC,
  // shifting the day across timezones). Guard invalid/missing dates so they don't NaN-sort.
  const eventTime = (e: CalendarItem) => {
    const d = e.displayDate ? parseISO(e.displayDate) : null;
    return d && isValid(d) ? d.getTime() : null;
  };

  // Date-only comparison: an item dated today still counts as Upcoming.
  const today = format(new Date(), "yyyy-MM-dd");
  const isUpcoming = (e: CalendarItem) =>
    !e.displayDate || e.displayDate.slice(0, 10) >= today;

  const upcomingEvents = allEvents
    .filter(isUpcoming)
    .sort((a, b) => (eventTime(a) ?? Infinity) - (eventTime(b) ?? Infinity)); // soonest first; undated last

  const pastEvents = allEvents
    .filter((e) => !isUpcoming(e))
    .sort((a, b) => (eventTime(b) ?? 0) - (eventTime(a) ?? 0)); // most recent first

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
        <h1 className="text-3xl font-bold">Schedule</h1>
        <p className="text-muted-foreground mt-2">
          Your inspections and scheduled visits
        </p>
      </div>

      {allEvents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CalendarIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nothing scheduled</p>
            <p className="text-sm text-muted-foreground">
              Nothing scheduled for your sites yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {renderGroup("Upcoming", upcomingEvents)}
          {renderGroup("Past", pastEvents)}
        </div>
      )}
    </div>
  );

  function renderGroup(heading: string, items: CalendarItem[]) {
    return (
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">{heading}</h2>
          <Badge variant="secondary">{items.length}</Badge>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {heading === "Upcoming"
              ? "Nothing coming up."
              : "Nothing in the past."}
          </p>
        ) : (
          <div className="space-y-4">
            {items.map((event, index) => {
              const date = event.displayDate;
              const endDate = event.end_date;
              const description =
                event.type === "inspection" ? event.description : null;
              const typeLabel =
                event.type === "inspection" ? "Inspection" : "Visit";
              const clientStatus = getClientStatus(event.status);

              return (
                <Card key={`${event.type}-${event.id}-${index}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate">
                          {event.title ||
                            `Inspection at ${event.displaySiteName}`}
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4 shrink-0" />
                          <span className="truncate">
                            {event.displaySiteName}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <Badge
                          className={`${getStatusColor(clientStatus)} text-white`}
                        >
                          {clientStatus}
                        </Badge>
                        <Badge variant="outline">{typeLabel}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {date && isValid(parseISO(date))
                            ? format(parseISO(date), "PPP")
                            : "No date"}
                          {endDate &&
                            isValid(parseISO(endDate)) &&
                            ` - ${format(parseISO(endDate), "PPP")}`}
                        </span>
                      </div>
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
      </section>
    );
  }
};

export default ClientPortalCalendar;
