import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, parseISO, isWithinInterval, eachMonthOfInterval } from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
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
import { cn } from "@/lib/utils";

interface CalendarEvent {
  id: string;
  title: string;
  site_name: string;
  start_date: string;
  end_date: string | null;
  status: string;
  priority: string;
  event_type: string | null;
}

const Calendar = () => {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  
  const yearStart = startOfYear(new Date(currentYear, 0, 1));
  const yearEnd = endOfYear(new Date(currentYear, 0, 1));
  const monthsInYear = eachMonthOfInterval({ start: yearStart, end: yearEnd });

  // Fetch all events for the current year
  const { data: events, refetch } = useQuery({
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

  const getEventsForDay = (day: Date) => {
    return events?.filter(event => {
      const eventDate = parseISO(event.start_date);
      
      // Check if it's the start date
      if (isSameDay(eventDate, day)) return true;
      
      // Check if it's within the date range (start to end)
      if (event.end_date) {
        const endDate = parseISO(event.end_date);
        return isWithinInterval(day, { start: eventDate, end: endDate });
      }
      
      return false;
    }) || [];
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

  const previousYear = () => {
    setCurrentYear(currentYear - 1);
  };

  const nextYear = () => {
    setCurrentYear(currentYear + 1);
  };

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Calendar</h1>
          <p className="text-muted-foreground mt-1">
            View and manage your schedule
          </p>
        </div>
        
        <Button className="bg-sky-500 hover:bg-sky-600">
          <Plus className="h-4 w-4 mr-2" />
          Add New Event
        </Button>
      </div>

      {/* Year Navigation and Annual Calendar Grid */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" size="icon" onClick={previousYear}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-2xl font-bold">
              {format(new Date(currentYear, 0, 1), "MMMM yyyy")}
            </h2>
            <Button variant="ghost" size="icon" onClick={nextYear}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {/* 12 Month Grid */}
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
                  
                  {/* Mini calendar grid */}
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
                      const eventCount = dayEvents.length;
                      
                      // Determine blue shade based on event density
                      let bgClass = "";
                      if (hasEvents) {
                        if (eventCount >= 3) {
                          bgClass = "bg-blue-600 text-white hover:bg-blue-700";
                        } else if (eventCount === 2) {
                          bgClass = "bg-blue-500 text-white hover:bg-blue-600";
                        } else {
                          bgClass = "bg-blue-400 text-white hover:bg-blue-500";
                        }
                      }

                      return (
                        <div key={day.toISOString()} className="aspect-square p-1">
                          <button
                            onClick={() => dayEvents.length > 0 && setSelectedEvent(dayEvents[0])}
                            disabled={!hasEvents}
                            className={cn(
                              "w-full h-full text-xs rounded flex items-center justify-center transition-all font-medium",
                              isToday && !hasEvents && "ring-2 ring-blue-500",
                              isToday && hasEvents && "ring-2 ring-white",
                              hasEvents && "cursor-pointer",
                              !hasEvents && "cursor-default text-muted-foreground hover:bg-muted/50",
                              bgClass
                            )}
                          >
                            {format(day, "d")}
                          </button>
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
              );
            })}
          </div>
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
                    <TableCell>{event.site_name}</TableCell>
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
                      <Button variant="ghost" size="sm">
                        ⋯
                      </Button>
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
    </div>
  );
};

export default Calendar;
