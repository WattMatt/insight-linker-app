import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, parseISO, isWithinInterval, eachMonthOfInterval } from "date-fns";
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
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);
  
  const yearStart = startOfYear(new Date(currentYear, 0, 1));
  const yearEnd = endOfYear(new Date(currentYear, 0, 1));
  const monthsInYear = eachMonthOfInterval({ start: yearStart, end: yearEnd });

  // Fetch all inspections for the current year
  const { data: inspections } = useQuery({
    queryKey: ["calendar-inspections", currentYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("*")
        .gte("inspection_date", format(yearStart, "yyyy-MM-dd"))
        .lte("inspection_date", format(yearEnd, "yyyy-MM-dd"))
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
          <h1 className="text-3xl font-bold">Annual Inspection Calendar</h1>
          <p className="text-muted-foreground mt-1">
            View all scheduled inspections for the year
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
                    const dayInspections = getInspectionsForDay(day);
                    const isToday = isSameDay(day, new Date());
                    const hasInspections = dayInspections.length > 0;
                    
                    // Get the highest priority for the day
                    const highestPriority = dayInspections.reduce((highest, inspection) => {
                      const priorities = { "high": 3, "medium": 2, "low": 1 };
                      const currentPriority = priorities[inspection.priority?.toLowerCase() as keyof typeof priorities] || 0;
                      const highestPriority = priorities[highest?.toLowerCase() as keyof typeof priorities] || 0;
                      return currentPriority > highestPriority ? inspection.priority : highest;
                    }, null as string | null);

                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => dayInspections.length > 0 && setSelectedInspection(dayInspections[0])}
                        disabled={!hasInspections}
                        className={cn(
                          "aspect-square text-[10px] rounded-sm transition-all relative",
                          "hover:scale-110",
                          isToday && "ring-2 ring-primary font-bold",
                          hasInspections && "font-semibold cursor-pointer",
                          !hasInspections && "cursor-default",
                          hasInspections && highestPriority?.toLowerCase() === "high" && "bg-destructive/20 text-destructive hover:bg-destructive/30",
                          hasInspections && highestPriority?.toLowerCase() === "medium" && "bg-warning/20 text-warning hover:bg-warning/30",
                          hasInspections && highestPriority?.toLowerCase() === "low" && "bg-success/20 text-success hover:bg-success/30",
                          !hasInspections && "text-muted-foreground/50"
                        )}
                      >
                        {format(day, "d")}
                        {dayInspections.length > 1 && (
                          <span className="absolute top-0 right-0 text-[6px] font-bold">
                            +{dayInspections.length - 1}
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
