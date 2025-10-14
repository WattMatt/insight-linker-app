import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, parseISO, isWithinInterval } from "date-fns";
import { ChevronLeft, ChevronRight, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Inspection {
  id: string;
  title: string;
  site_id: string;
  inspection_date: string | null;
  end_date: string | null;
  status: string;
  priority: string | null;
  assigned_to: string[] | null;
  description: string | null;
}

const Calendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);
  
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Fetch inspections for the current month
  const { data: inspections } = useQuery({
    queryKey: ["calendar-inspections", format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("*")
        .gte("inspection_date", format(monthStart, "yyyy-MM-dd"))
        .lte("inspection_date", format(monthEnd, "yyyy-MM-dd"))
        .order("inspection_date", { ascending: true });

      if (error) throw error;
      return data as Inspection[];
    },
  });

  const getInspectionsForDay = (day: Date) => {
    return inspections?.filter(inspection => {
      if (!inspection.inspection_date) return false;
      const inspectionDate = parseISO(inspection.inspection_date);
      
      // Check if it's the start date
      if (isSameDay(inspectionDate, day)) return true;
      
      // Check if it's within the date range (start to end)
      if (inspection.end_date) {
        const endDate = parseISO(inspection.end_date);
        return isWithinInterval(day, { start: inspectionDate, end: endDate });
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

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Inspection Calendar</h1>
          <p className="text-muted-foreground mt-1">
            View and manage scheduled inspections
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={previousMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-semibold min-w-[200px] text-center">
            {format(currentDate, "MMMM yyyy")}
          </h2>
          <Button variant="outline" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-2">
            {/* Week day headers */}
            {weekDays.map(day => (
              <div
                key={day}
                className="text-center font-semibold text-sm text-muted-foreground p-2"
              >
                {day}
              </div>
            ))}

            {/* Empty cells for days before month starts */}
            {Array.from({ length: monthStart.getDay() }).map((_, index) => (
              <div key={`empty-${index}`} className="min-h-[120px] p-2 border rounded-lg bg-muted/20" />
            ))}

            {/* Calendar days */}
            {daysInMonth.map(day => {
              const dayInspections = getInspectionsForDay(day);
              const isToday = isSameDay(day, new Date());

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-[120px] p-2 border rounded-lg transition-colors hover:bg-accent/50",
                    !isSameMonth(day, currentDate) && "opacity-50",
                    isToday && "border-primary border-2"
                  )}
                >
                  <div className={cn(
                    "text-sm font-medium mb-2",
                    isToday && "text-primary font-bold"
                  )}>
                    {format(day, "d")}
                  </div>
                  
                  <div className="space-y-1">
                    {dayInspections.slice(0, 2).map(inspection => (
                      <button
                        key={inspection.id}
                        onClick={() => setSelectedInspection(inspection)}
                        className="w-full text-left"
                      >
                        <div className={cn(
                          "text-xs p-1 rounded truncate",
                          getStatusColor(inspection.status)
                        )}>
                          <Circle className={cn("h-2 w-2 inline mr-1", getPriorityColor(inspection.priority))} />
                          {inspection.title}
                        </div>
                      </button>
                    ))}
                    {dayInspections.length > 2 && (
                      <div className="text-xs text-muted-foreground pl-1">
                        +{dayInspections.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

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

      {/* Inspection Details Dialog */}
      <Dialog open={!!selectedInspection} onOpenChange={() => setSelectedInspection(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedInspection?.title}</DialogTitle>
            <DialogDescription>
              Inspection details and schedule
            </DialogDescription>
          </DialogHeader>
          
          {selectedInspection && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Start Date</p>
                  <p className="text-sm">
                    {selectedInspection.inspection_date 
                      ? format(parseISO(selectedInspection.inspection_date), "PPP")
                      : "Not set"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">End Date</p>
                  <p className="text-sm">
                    {selectedInspection.end_date 
                      ? format(parseISO(selectedInspection.end_date), "PPP")
                      : "Not set"}
                  </p>
                </div>
              </div>
              
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Status</p>
                <Badge className={getStatusColor(selectedInspection.status)}>
                  {selectedInspection.status}
                </Badge>
              </div>
              
              {selectedInspection.priority && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Priority</p>
                  <div className="flex items-center gap-2">
                    <Circle className={cn("h-3 w-3", getPriorityColor(selectedInspection.priority))} />
                    <span className="text-sm">{selectedInspection.priority}</span>
                  </div>
                </div>
              )}
              
              {selectedInspection.description && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Description</p>
                  <p className="text-sm">{selectedInspection.description}</p>
                </div>
              )}
              
              {selectedInspection.assigned_to && selectedInspection.assigned_to.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Assigned To</p>
                  <div className="flex gap-2 flex-wrap">
                    {selectedInspection.assigned_to.map((user, index) => (
                      <Badge key={index} variant="outline">{user}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Calendar;
