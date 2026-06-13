import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, parseISO, isWithinInterval, eachMonthOfInterval } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Download, Pencil, Trash2, Loader2, AlertCircle, CalendarDays, Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useUnifiedPdfGeneration, CalendarReportData } from "@/hooks/useUnifiedPdfGeneration";

interface CalendarEvent {
  id: string;
  title: string;
  site_id: string | null;
  site_name: string;
  start_date: string;
  end_date: string | null;
  status: string;
  priority: string;
  event_type: string | null;
}

const EVENT_TYPES = ["Inspection", "Maintenance", "Metering", "Audit", "Site Visit", "Other"];

const Calendar = () => {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedEventDay, setSelectedEventDay] = useState<Date | null>(null);
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [sitePickerOpen, setSitePickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [viewMode, setViewMode] = useState<"year" | "agenda">("year");
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    site_id: "",
    site_name: "",
    start_date: "",
    end_date: "",
    status: "Scheduled",
    priority: "Medium",
    event_type: "",
  });
  const { toast } = useToast();
  
  const yearStart = startOfYear(new Date(currentYear, 0, 1));
  const yearEnd = endOfYear(new Date(currentYear, 0, 1));
  const monthsInYear = eachMonthOfInterval({ start: yearStart, end: yearEnd });

  // Fetch all events for the current year
  const { data: events, refetch, isLoading, isError } = useQuery({
    queryKey: ["calendar-events", currentYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .gte("start_date", format(yearStart, "yyyy-MM-dd"))
        .lte("start_date", format(yearEnd, "yyyy-MM-dd"))
        .order("start_date", { ascending: true });

      if (error) throw error;
      return data as CalendarEvent[];
    },
  });

  // Sites for the event form picker (replaces free-text site entry so events link to a real site).
  const { data: sites } = useQuery({
    queryKey: ["calendar-sites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  // Events after applying the site + status filters. Drives both the grid and the agenda.
  const filteredEvents = useMemo(() => {
    return (events ?? []).filter(event => {
      if (siteFilter !== "all" && event.site_name !== siteFilter) return false;
      if (statusFilter !== "all" && event.status !== statusFilter) return false;
      return true;
    });
  }, [events, siteFilter, statusFilter]);

  // Distinct site names for the site filter dropdown.
  const distinctSites = useMemo(() => {
    return Array.from(new Set((events ?? []).map(e => e.site_name))).sort();
  }, [events]);

  // Agenda: filtered events grouped by month label, each group sorted by start_date.
  const agendaGroups = useMemo(() => {
    const sorted = [...filteredEvents].sort((a, b) => a.start_date.localeCompare(b.start_date));
    const groups: { label: string; events: CalendarEvent[] }[] = [];
    for (const event of sorted) {
      const label = format(parseISO(event.start_date), "MMMM yyyy");
      const existing = groups.find(g => g.label === label);
      if (existing) existing.events.push(event);
      else groups.push({ label, events: [event] });
    }
    return groups;
  }, [filteredEvents]);

  const getEventsForDay = (day: Date): CalendarEvent[] => {
    return filteredEvents.filter(event => {
      const eventDate = parseISO(event.start_date);

      // Check if it's the start date
      if (isSameDay(eventDate, day)) return true;

      // Check if it's within the date range (start to end).
      // Guard against malformed rows (end before start): isWithinInterval throws a
      // RangeError on an inverted interval, which would crash every day cell.
      if (event.end_date) {
        const endDate = parseISO(event.end_date);
        if (endDate >= eventDate) {
          return isWithinInterval(day, { start: eventDate, end: endDate });
        }
      }

      return false;
    });
  };

  const getPriorityColor = (priority: string | null) => {
    switch (priority?.toLowerCase()) {
      case "high":
        return "text-destructive";
      case "medium":
        return "text-warning";
      case "low":
        return "text-success";
      default:
        return "text-muted-foreground";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
        return "bg-success/10 text-success";
      case "in progress":
        return "bg-primary/10 text-primary";
      case "scheduled":
        return "bg-info/10 text-info";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  // Generate consistent color for a site based on its name
  const getSiteColor = (siteName: string) => {
    const colors = [
      { bg: "bg-blue-500", hover: "bg-blue-600", text: "text-blue-600" },
      { bg: "bg-purple-500", hover: "bg-purple-600", text: "text-purple-600" },
      { bg: "bg-green-500", hover: "bg-green-600", text: "text-green-600" },
      { bg: "bg-orange-500", hover: "bg-orange-600", text: "text-orange-600" },
      { bg: "bg-pink-500", hover: "bg-pink-600", text: "text-pink-600" },
      { bg: "bg-cyan-500", hover: "bg-cyan-600", text: "text-cyan-600" },
      { bg: "bg-yellow-500", hover: "bg-yellow-600", text: "text-yellow-600" },
      { bg: "bg-red-500", hover: "bg-red-600", text: "text-red-600" },
      { bg: "bg-indigo-500", hover: "bg-indigo-600", text: "text-indigo-600" },
      { bg: "bg-teal-500", hover: "bg-teal-600", text: "text-teal-600" },
    ];
    
    // Generate consistent hash from site name
    const hash = siteName.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  const previousYear = () => {
    setCurrentYear(currentYear - 1);
  };

  const nextYear = () => {
    setCurrentYear(currentYear + 1);
  };

  const openAddEventDialog = () => {
    setEditingEvent(null);
    setFormData({
      title: "",
      site_id: "",
      site_name: "",
      start_date: "",
      end_date: "",
      status: "Scheduled",
      priority: "Medium",
      event_type: "",
    });
    setIsEventDialogOpen(true);
  };

  // Clicking a day: if it has events, open the day-detail dialog; otherwise open the
  // Add dialog prefilled with that date.
  const handleDayClick = (day: Date, hasEvents: boolean) => {
    if (hasEvents) {
      setSelectedEventDay(day);
    } else {
      setEditingEvent(null);
      setFormData({
        title: "",
        site_id: "",
        site_name: "",
        start_date: format(day, "yyyy-MM-dd"),
        end_date: "",
        status: "Scheduled",
        priority: "Medium",
        event_type: "",
      });
      setIsEventDialogOpen(true);
    }
  };

  const openEditEventDialog = (event: CalendarEvent) => {
    setEditingEvent(event);
    setFormData({
      title: event.title,
      site_id: event.site_id || "",
      site_name: event.site_name,
      start_date: event.start_date,
      end_date: event.end_date || "",
      status: event.status,
      priority: event.priority,
      event_type: event.event_type || "",
    });
    setIsEventDialogOpen(true);
  };

  const handleSaveEvent = async () => {
    if (!formData.title.trim() || !formData.site_id || !formData.start_date) {
      toast({
        title: "Error",
        description: "Please fill in all required fields (title, site, start date)",
        variant: "destructive",
      });
      return;
    }

    if (formData.end_date && formData.end_date < formData.start_date) {
      toast({
        title: "Error",
        description: "End date cannot be before the start date",
        variant: "destructive",
      });
      return;
    }

    if (isSaving) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (editingEvent) {
        const { error } = await supabase
          .from("calendar_events")
          .update({
            title: formData.title.trim(),
            site_id: formData.site_id,
            site_name: formData.site_name.trim(),
            start_date: formData.start_date,
            end_date: formData.end_date || null,
            status: formData.status,
            priority: formData.priority,
            event_type: formData.event_type || null,
            updated_by: user?.id ?? null,
          })
          .eq("id", editingEvent.id);

        if (error) throw error;
        toast({ title: "Event updated successfully" });
      } else {
        const { error } = await supabase
          .from("calendar_events")
          .insert({
            title: formData.title.trim(),
            site_id: formData.site_id,
            site_name: formData.site_name.trim(),
            start_date: formData.start_date,
            end_date: formData.end_date || null,
            status: formData.status,
            priority: formData.priority,
            event_type: formData.event_type || null,
            created_by: user?.id ?? null,
          });

        if (error) throw error;
        toast({ title: "Event created successfully" });
      }

      setIsEventDialogOpen(false);
      refetch();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save event",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!deleteTarget) return;
    const eventId = deleteTarget.id;

    try {
      const { error } = await supabase
        .from("calendar_events")
        .delete()
        .eq("id", eventId);

      if (error) throw error;
      toast({ title: "Event deleted successfully" });
      refetch();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete event",
        variant: "destructive",
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  // A colored dot class for an event's status, used as a status cue on event bars and lists.
  const getStatusDotColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
        return "bg-green-500";
      case "in progress":
        return "bg-orange-500";
      case "scheduled":
        return "bg-blue-500";
      default:
        return "bg-muted-foreground";
    }
  };

  const { generatePdf, isGenerating: isExporting } = useUnifiedPdfGeneration();

  const exportToPDF = async () => {
    const now = new Date();
    const totalEvents = events?.length || 0;
    const completedCount = events?.filter(e => e.status.toLowerCase() === 'completed').length || 0;
    // Disjoint buckets: upcoming excludes completed events so they aren't double-counted.
    const upcomingCount = events?.filter(e => e.status.toLowerCase() !== 'completed' && parseISO(e.start_date) > now).length || 0;
    const pendingCount = totalEvents - completedCount - upcomingCount;

    const reportData: CalendarReportData = {
      reportType: 'calendar',
      title: 'Calendar Report',
      subtitle: `Year: ${currentYear}`,
      year: currentYear,
      generatedAt: new Date().toISOString(),
      events: events?.map(event => ({
        id: event.id,
        title: event.title,
        siteName: event.site_name,
        startDate: event.start_date,
        endDate: event.end_date || undefined,
        status: event.status,
        priority: event.priority,
        eventType: event.event_type || undefined,
      })) || [],
      stats: {
        totalEvents,
        upcomingCount,
        completedCount,
        pendingCount,
      },
    };

    const result = await generatePdf(reportData);
    
    if (result.success && result.url) {
      // Download the generated PDF
      const a = document.createElement('a');
      a.href = result.url;
      a.download = result.filename || `calendar-${currentYear}.pdf`;
      a.click();
      toast({ title: "PDF exported successfully" });
    } else {
      toast({ title: "Export failed", description: result.error, variant: "destructive" });
    }
  };

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Event-form validity: required fields present and a sane date range.
  const endBeforeStart = !!formData.end_date && formData.end_date < formData.start_date;
  const canSaveEvent =
    !!formData.title.trim() && !!formData.site_id && !!formData.start_date && !endBeforeStart;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Calendar</h1>
          <p className="text-muted-foreground mt-1">
            View and manage your schedule
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button onClick={exportToPDF} variant="outline" disabled={isExporting}>
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? "Exporting..." : "Export PDF"}
          </Button>
          <Button className="bg-sky-500 hover:bg-sky-600" onClick={openAddEventDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Add New Event
          </Button>
        </div>
      </div>

      {/* Year Navigation and Annual Calendar Grid */}
      <Card>
        <CardContent className="p-6">
          <TooltipProvider>
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" size="icon" onClick={previousYear}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-2xl font-bold">
              {currentYear}
            </h2>
            <Button variant="ghost" size="icon" onClick={nextYear}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {/* View toggle + filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "year" | "agenda")}>
              <TabsList>
                <TabsTrigger value="year">Year</TabsTrigger>
                <TabsTrigger value="agenda">Agenda</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap gap-2">
              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="w-[180px]" aria-label="Filter by site">
                  <SelectValue placeholder="All sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sites</SelectItem>
                  {distinctSites.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]" aria-label="Filter by status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="Scheduled">Scheduled</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 12 Month Grid — with explicit loading / error / empty states */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading calendar…
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-muted-foreground">Couldn't load the calendar. Please try again.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
            </div>
          ) : !events || events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <CalendarDays className="h-8 w-8 mb-2 opacity-50" />
              <p>No events scheduled for {currentYear}.</p>
            </div>
          ) : viewMode === "year" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {monthsInYear.map(month => {
              const monthStart = startOfMonth(month);
              const monthEnd = endOfMonth(month);
              const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
              
              return (
                <div key={month.toISOString()} className="space-y-3">
                  <h3 className="text-base font-semibold text-center">
                    {format(month, "MMMM yyyy")}
                  </h3>
                  
                  {/* Mini calendar grid with event bars */}
                  <div className="relative">
                    <div className="grid grid-cols-7 gap-1">
                      {/* Week day headers */}
                      {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day, idx) => (
                        <div
                          key={idx}
                          className="text-center text-xs font-medium text-muted-foreground pb-1"
                        >
                          {day}
                        </div>
                      ))}

                      {/* Empty cells for days before month starts */}
                      {Array.from({ length: monthStart.getDay() }).map((_, index) => (
                        <div key={`empty-${index}`} className="aspect-square p-1">
                          <div className="w-full h-full" />
                        </div>
                      ))}

                      {/* Calendar days */}
                      {daysInMonth.map(day => {
                        const dayEvents = getEventsForDay(day);
                        const isToday = isSameDay(day, new Date());
                        const hasEvents = dayEvents.length > 0;

                        // Show at most 3 event bars; the rest collapse into a "+N" badge.
                        const visibleEvents = dayEvents.slice(0, 3);
                        const overflowCount = dayEvents.length - visibleEvents.length;

                        return (
                          <div key={day.toISOString()} className="aspect-square p-1 relative">
                            <button
                              onClick={() => handleDayClick(day, hasEvents)}
                              aria-label={
                                `${format(day, "EEEE, MMMM d, yyyy")}` +
                                (hasEvents
                                  ? `, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`
                                  : ", no events")
                              }
                              className={cn(
                                "w-full h-full text-xs rounded flex items-center justify-center transition-all font-medium relative z-10 cursor-pointer hover:bg-muted/50",
                                isToday && "ring-2 ring-blue-500",
                                hasEvents && "font-semibold",
                                !hasEvents && "text-muted-foreground"
                              )}
                            >
                              {format(day, "d")}
                            </button>

                            {/* Event bars - positioned absolutely behind the date */}
                            {hasEvents && visibleEvents.map((event, idx) => {
                              const eventStart = parseISO(event.start_date);
                              const eventEnd = event.end_date ? parseISO(event.end_date) : eventStart;
                              const isEventStart = isSameDay(day, eventStart);
                              const isEventEnd = isSameDay(day, eventEnd);
                              const siteColor = getSiteColor(event.site_name);

                              // Calculate if this is the first day of the event in this month
                              const isFirstInMonth = isEventStart || !isSameMonth(eventStart, month);

                              return (
                                <Tooltip key={`${event.id}-${idx}`}>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      aria-label={`${event.title} — ${event.site_name} (${event.status})`}
                                      className={cn(
                                        "absolute z-10 transition-all cursor-pointer rounded-sm border-l-2",
                                        siteColor.bg,
                                        "opacity-70 hover:opacity-100"
                                      )}
                                      style={{
                                        top: `${18 + idx * 22}%`,
                                        height: '8px',
                                        left: isFirstInMonth ? '8%' : '0',
                                        right: isEventEnd || !isSameMonth(eventEnd, month) ? '8%' : '0',
                                        borderLeftColor: 'currentColor',
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDayClick(day, true);
                                      }}
                                    >
                                      <span
                                        className={cn(
                                          "absolute -left-px top-1/2 -translate-y-1/2 h-2 w-1 rounded-sm",
                                          getStatusDotColor(event.status)
                                        )}
                                      />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="z-50">
                                    <div className="text-xs space-y-1">
                                      <p className="font-semibold">{event.site_name}</p>
                                      <p className="text-muted-foreground">{event.title}</p>
                                      <p className="text-muted-foreground">{event.status}</p>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })}

                            {/* "+N more" badge for days with > 3 events */}
                            {overflowCount > 0 && (
                              <button
                                type="button"
                                aria-label={`${overflowCount} more event${overflowCount === 1 ? "" : "s"} on ${format(day, "MMMM d, yyyy")}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDayClick(day, true);
                                }}
                                className="absolute bottom-0 right-0 z-20 px-1 text-[9px] leading-none font-semibold rounded-sm bg-muted text-muted-foreground hover:bg-muted-foreground hover:text-background"
                              >
                                +{overflowCount}
                              </button>
                            )}
                          </div>
                        );
                      })}

                      {/* Fill remaining cells to complete the grid */}
                      {Array.from({ 
                        length: (7 - ((monthStart.getDay() + daysInMonth.length) % 7)) % 7 
                      }).map((_, index) => (
                        <div key={`fill-${index}`} className="aspect-square p-1">
                          <div className="w-full h-full" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          ) : (
            /* Agenda view: chronological list grouped by month */
            agendaGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <CalendarDays className="h-8 w-8 mb-2 opacity-50" />
                <p>No events match the current filters.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {agendaGroups.map((group) => (
                  <div key={group.label} className="space-y-2">
                    <h3 className="text-sm font-semibold text-muted-foreground sticky top-0 bg-background py-1">
                      {group.label}
                    </h3>
                    <div className="space-y-2">
                      {group.events.map((event) => (
                        <div
                          key={event.id}
                          className="flex items-center gap-3 rounded-md border p-3"
                        >
                          <span
                            className={cn("h-2.5 w-2.5 shrink-0 rounded-full", getStatusDotColor(event.status))}
                            aria-hidden="true"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{event.title}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {event.site_name}
                              {event.event_type ? ` · ${event.event_type}` : ""}
                              {" · "}
                              {event.start_date}
                              {event.end_date ? ` → ${event.end_date}` : ""}
                            </p>
                          </div>
                          <Badge variant="outline" className={cn("shrink-0", getStatusColor(event.status))}>
                            {event.status}
                          </Badge>
                          <Badge variant="outline" className={cn("shrink-0", getPriorityColor(event.priority))}>
                            {event.priority}
                          </Badge>
                          <div className="flex shrink-0 gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEditEventDialog(event)} aria-label="Edit event">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(event)} aria-label="Delete event">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
          </TooltipProvider>
        </CardContent>
      </Card>


      {/* Schedule Table */}
      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events && events.length > 0 ? (
                events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="font-medium">{event.title}</TableCell>
                    <TableCell>
                      <Badge className={cn(getSiteColor(event.site_name).bg, "text-white hover:opacity-90")}>
                        {event.site_name}
                      </Badge>
                    </TableCell>
                    <TableCell>{event.start_date}</TableCell>
                    <TableCell>{event.end_date || "—"}</TableCell>
                    <TableCell>
                      <Badge 
                        className={
                          event.status === "Scheduled" ? "bg-blue-500 hover:bg-blue-600 text-white" :
                          event.status === "In Progress" ? "bg-orange-500 hover:bg-orange-600 text-white" :
                          "bg-green-500 hover:bg-green-600 text-white"
                        }
                      >
                        {event.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        className={
                          event.priority === "High" ? "bg-red-500 hover:bg-red-600 text-white" :
                          event.priority === "Medium" ? "bg-orange-500 hover:bg-orange-600 text-white" :
                          "bg-green-500 hover:bg-green-600 text-white"
                        }
                      >
                        {event.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditEventDialog(event)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(event)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No scheduled events
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Event Dialog */}
      <Dialog open={isEventDialogOpen} onOpenChange={setIsEventDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingEvent ? "Edit Event" : "Add New Event"}
            </DialogTitle>
            <DialogDescription>
              {editingEvent
                ? "Update the event details below"
                : "Create a new calendar event"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                autoFocus
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="Event title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site_id">Site *</Label>
              <Popover open={sitePickerOpen} onOpenChange={setSitePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="site_id"
                    variant="outline"
                    role="combobox"
                    aria-expanded={sitePickerOpen}
                    className="w-full justify-between font-normal"
                  >
                    <span className={cn("truncate", !formData.site_name && "text-muted-foreground")}>
                      {formData.site_name || "Select a site"}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search sites…" />
                    <CommandList>
                      <CommandEmpty>No site found.</CommandEmpty>
                      <CommandGroup>
                        {sites?.map((s) => (
                          <CommandItem
                            key={s.id}
                            value={s.name}
                            onSelect={() => {
                              setFormData({ ...formData, site_id: s.id, site_name: s.name });
                              setSitePickerOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", formData.site_id === s.id ? "opacity-100" : "opacity-0")} />
                            {s.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">Start Date *</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) =>
                    setFormData({ ...formData, start_date: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">End Date <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  min={formData.start_date || undefined}
                  aria-invalid={endBeforeStart}
                  onChange={(e) =>
                    setFormData({ ...formData, end_date: e.target.value })
                  }
                />
                {endBeforeStart && (
                  <p className="text-xs text-destructive">End date can't be before the start date.</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) =>
                    setFormData({ ...formData, status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Scheduled">Scheduled</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) =>
                    setFormData({ ...formData, priority: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="event_type">Event Type <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Select
                value={formData.event_type}
                onValueChange={(value) =>
                  setFormData({ ...formData, event_type: value })
                }
              >
                <SelectTrigger id="event_type">
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  {(formData.event_type && !EVENT_TYPES.includes(formData.event_type)
                    ? [formData.event_type, ...EVENT_TYPES]
                    : EVENT_TYPES
                  ).map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setIsEventDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEvent} disabled={isSaving || !canSaveEvent}>
              {isSaving ? "Saving…" : editingEvent ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Day-detail Dialog: lists all events on the selected day */}
      <Dialog open={!!selectedEventDay} onOpenChange={(open) => !open && setSelectedEventDay(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedEventDay ? format(selectedEventDay, "EEEE, MMMM d, yyyy") : ""}
            </DialogTitle>
            <DialogDescription>
              {selectedEventDay
                ? `${getEventsForDay(selectedEventDay).length} event(s) on this day`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            {selectedEventDay &&
              getEventsForDay(selectedEventDay).map((event) => (
                <div key={event.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{event.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {event.site_name}
                        {event.event_type ? ` · ${event.event_type}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Edit event"
                        onClick={() => {
                          setSelectedEventDay(null);
                          openEditEventDialog(event);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Delete event"
                        onClick={() => setDeleteTarget(event)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={getStatusColor(event.status)}>
                      {event.status}
                    </Badge>
                    <Badge variant="outline" className={getPriorityColor(event.priority)}>
                      {event.priority}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {event.start_date}
                      {event.end_date ? ` → ${event.end_date}` : ""}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete event?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete
              {deleteTarget ? ` "${deleteTarget.title}"` : " this event"}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteEvent}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Calendar;
