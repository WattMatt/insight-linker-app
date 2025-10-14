import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, parseISO, isWithinInterval, eachMonthOfInterval } from "date-fns";
import { ChevronLeft, ChevronRight, Circle, Plus } from "lucide-react";
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
        
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={previousYear}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-semibold min-w-[120px] text-center">
            {currentYear}
          </h2>
          <Button variant="outline" size="icon" onClick={nextYear}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Event
          </Button>
        </div>
      </div>

      {/* Annual Calendar Grid - 12 months */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {monthsInYear.map(month => {
          const monthStart = startOfMonth(month);
          const monthEnd = endOfMonth(month);
          const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
          
          return (
            <Card key={month.toISOString()}>
              <CardContent className="p-3">
                <h3 className="text-sm font-semibold mb-2 text-center">
                  {format(month, "MMMM")}
                </h3>
                
                {/* Mini calendar grid */}
                <div className="grid grid-cols-7 gap-1">
                  {/* Week day headers */}
                  {["S", "M", "T", "W", "T", "F", "S"].map((day, idx) => (
                    <div
                      key={idx}
                      className="text-center text-[10px] font-medium text-muted-foreground"
                    >
                      {day}
                    </div>
                  ))}

                  {/* Empty cells for days before month starts */}
                  {Array.from({ length: monthStart.getDay() }).map((_, index) => (
                    <div key={`empty-${index}`} className="aspect-square" />
                  ))}

                  {/* Calendar days */}
                  {daysInMonth.map(day => {
                    const dayEvents = getEventsForDay(day);
                    const isToday = isSameDay(day, new Date());
                    const hasEvents = dayEvents.length > 0;
                    
                    // Get the highest priority for the day
                    const highestPriority = dayEvents.reduce((highest, event) => {
                      const priorities = { "high": 3, "medium": 2, "low": 1 };
                      const currentPriority = priorities[event.priority?.toLowerCase() as keyof typeof priorities] || 0;
                      const highestPriority = priorities[highest?.toLowerCase() as keyof typeof priorities] || 0;
                      return currentPriority > highestPriority ? event.priority : highest;
                    }, null as string | null);

                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => dayEvents.length > 0 && setSelectedEvent(dayEvents[0])}
                        disabled={!hasEvents}
                        className={cn(
                          "aspect-square text-[10px] rounded-sm transition-all relative",
                          "hover:scale-110",
                          isToday && "ring-2 ring-primary font-bold",
                          hasEvents && "font-semibold cursor-pointer",
                          !hasEvents && "cursor-default",
                          hasEvents && highestPriority?.toLowerCase() === "high" && "bg-destructive/20 text-destructive hover:bg-destructive/30",
                          hasEvents && highestPriority?.toLowerCase() === "medium" && "bg-warning/20 text-warning hover:bg-warning/30",
                          hasEvents && highestPriority?.toLowerCase() === "low" && "bg-success/20 text-success hover:bg-success/30",
                          !hasEvents && "text-muted-foreground/50"
                        )}
                      >
                        {format(day, "d")}
                        {dayEvents.length > 1 && (
                          <span className="absolute top-0 right-0 text-[6px] font-bold">
                            +{dayEvents.length - 1}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Legend */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Priority:</span>
              <Circle className="h-3 w-3 text-destructive" />
              <span className="text-xs text-muted-foreground">High</span>
              <Circle className="h-3 w-3 text-warning" />
              <span className="text-xs text-muted-foreground">Medium</span>
              <Circle className="h-3 w-3 text-success" />
              <span className="text-xs text-muted-foreground">Low</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Status:</span>
              <Badge variant="secondary" className="bg-success/10 text-success">Completed</Badge>
              <Badge variant="secondary" className="bg-primary/10 text-primary">In Progress</Badge>
              <Badge variant="secondary" className="bg-info/10 text-info">Scheduled</Badge>
            </div>
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
                        variant="secondary"
                        className={
                          event.status === "Scheduled" ? "bg-blue-500/10 text-blue-500" :
                          event.status === "In Progress" ? "bg-orange-500/10 text-orange-500" :
                          "bg-green-500/10 text-green-500"
                        }
                      >
                        {event.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="secondary"
                        className={
                          event.priority === "High" ? "bg-red-500/10 text-red-500" :
                          event.priority === "Medium" ? "bg-orange-500/10 text-orange-500" :
                          "bg-green-500/10 text-green-500"
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
