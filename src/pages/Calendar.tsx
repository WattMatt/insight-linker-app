import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, parseISO, isWithinInterval, eachMonthOfInterval } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Download, Pencil, Trash2 } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  addCoverPage,
  addStandardHeader,
  addFootersToAllPages,
  addSectionHeader,
  logComplianceCheck,
  RGB_COLORS,
  PAGE,
} from "@/lib/pdfUtils";
import { DOCUMENT_DESIGN_STANDARDS, getContentWidth } from "@/lib/documentDesignStandards";

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
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [formData, setFormData] = useState({
    title: "",
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
      site_name: "",
      start_date: "",
      end_date: "",
      status: "Scheduled",
      priority: "Medium",
      event_type: "",
    });
    setIsEventDialogOpen(true);
  };

  const openEditEventDialog = (event: CalendarEvent) => {
    setEditingEvent(event);
    setFormData({
      title: event.title,
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
    if (!formData.title || !formData.site_name || !formData.start_date) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingEvent) {
        const { error } = await supabase
          .from("calendar_events")
          .update({
            title: formData.title,
            site_name: formData.site_name,
            start_date: formData.start_date,
            end_date: formData.end_date || null,
            status: formData.status,
            priority: formData.priority,
            event_type: formData.event_type || null,
          })
          .eq("id", editingEvent.id);

        if (error) throw error;
        toast({ title: "Event updated successfully" });
      } else {
        const { error } = await supabase
          .from("calendar_events")
          .insert({
            title: formData.title,
            site_name: formData.site_name,
            start_date: formData.start_date,
            end_date: formData.end_date || null,
            status: formData.status,
            priority: formData.priority,
            event_type: formData.event_type || null,
          });

        if (error) throw error;
        toast({ title: "Event created successfully" });
      }

      setIsEventDialogOpen(false);
      refetch();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save event",
        variant: "destructive",
      });
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm("Are you sure you want to delete this event?")) return;

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
    }
  };

  const exportToPDF = async () => {
    const doc = new jsPDF();
    
    // Cover page with professional styling
    doc.setFillColor(240, 245, 250);
    doc.rect(0, 0, 210, 297, 'F');
    
    doc.setTextColor(30, 40, 50);
    doc.setFontSize(28);
    doc.setFont(undefined, 'bold');
    doc.text("Calendar Report", 105, 60, { align: "center" });
    
    doc.setFontSize(18);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(70, 80, 90);
    doc.text(`Year: ${currentYear}`, 105, 80, { align: "center" });
    
    doc.setFontSize(11);
    doc.setTextColor(100, 110, 120);
    doc.text(`Generated: ${format(new Date(), "dd MMMM yyyy")}`, 105, 95, { align: "center" });
    
    // Add new page for calendar view
    doc.addPage();
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 297, 'F');
    
    doc.setTextColor(30, 40, 50);
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text("Calendar View", 14, 15);
    
    // Draw calendar grid (3x4 grid for 12 months)
    const monthWidth = 60;
    const monthHeight = 45;
    const startX = 15;
    const startY = 25;
    const spacing = 5;
    
    monthsInYear.forEach((month, index) => {
      const row = Math.floor(index / 3);
      const col = index % 3;
      const x = startX + col * (monthWidth + spacing);
      const y = startY + row * (monthHeight + spacing);
      
      // Draw month border with subtle shadow effect
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.5);
      doc.rect(x, y, monthWidth, monthHeight);
      
      // Month header background
      doc.setFillColor(59, 130, 246);
      doc.rect(x, y, monthWidth, 7, 'F');
      
      // Month name
      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(format(month, "MMMM yyyy"), x + monthWidth / 2, y + 5, { align: "center" });
      
      // Draw mini calendar
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
      
      // Day headers (S M T W T F S)
      doc.setFontSize(6);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(100, 110, 120);
      const dayHeaders = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
      const cellWidth = monthWidth / 7;
      const cellHeight = 4;
      
      dayHeaders.forEach((day, i) => {
        doc.text(day, x + i * cellWidth + cellWidth / 2, y + 11, { align: "center" });
      });
      
      // Draw days
      let currentRow = 0;
      daysInMonth.forEach((day, dayIndex) => {
        const dayOfWeek = day.getDay();
        if (dayIndex === 0) {
          currentRow = 0;
        } else if (dayOfWeek === 0 && dayIndex > 0) {
          currentRow++;
        }
        
        const dayX = x + dayOfWeek * cellWidth;
        const dayY = y + 14 + currentRow * cellHeight;
        
        // Check if day has events
        const dayEvents = getEventsForDay(day);
        const hasEvents = dayEvents.length > 0;
        
        // Draw day cell with color if has events
        if (hasEvents) {
          // Use gradient-like effect with multiple shades
          const highPriority = dayEvents.some(e => e.priority === "High");
          const mediumPriority = dayEvents.some(e => e.priority === "Medium");
          
          if (highPriority) {
            doc.setFillColor(239, 68, 68); // Red for high priority
          } else if (mediumPriority) {
            doc.setFillColor(251, 146, 60); // Orange for medium priority
          } else {
            doc.setFillColor(34, 197, 94); // Green for low priority
          }
          
          doc.setDrawColor(255, 255, 255);
          doc.setLineWidth(0.3);
          doc.roundedRect(dayX + 0.5, dayY - 2, cellWidth - 1, cellHeight - 0.5, 0.5, 0.5, 'FD');
        }
        
        // Day number
        doc.setFontSize(6);
        doc.setFont(undefined, hasEvents ? 'bold' : 'normal');
        doc.setTextColor(hasEvents ? 255 : 60, hasEvents ? 255 : 70, hasEvents ? 255 : 80);
        doc.text(format(day, "d"), dayX + cellWidth / 2, dayY + 1.5, { align: "center" });
      });
    });
    
    // Add enhanced legend
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(30, 40, 50);
    doc.text("Legend:", 15, startY + 4 * (monthHeight + spacing) + 8);
    
    // High Priority
    doc.setFillColor(239, 68, 68);
    doc.roundedRect(15, startY + 4 * (monthHeight + spacing) + 10, 4, 4, 0.5, 0.5, 'F');
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(60, 70, 80);
    doc.text("High Priority Event", 21, startY + 4 * (monthHeight + spacing) + 13);
    
    // Medium Priority
    doc.setFillColor(251, 146, 60);
    doc.roundedRect(65, startY + 4 * (monthHeight + spacing) + 10, 4, 4, 0.5, 0.5, 'F');
    doc.text("Medium Priority Event", 71, startY + 4 * (monthHeight + spacing) + 13);
    
    // Low Priority
    doc.setFillColor(34, 197, 94);
    doc.roundedRect(125, startY + 4 * (monthHeight + spacing) + 10, 4, 4, 0.5, 0.5, 'F');
    doc.text("Low Priority Event", 131, startY + 4 * (monthHeight + spacing) + 13);
    
    // Add new page for event summary table
    doc.addPage();
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 297, 'F');
    
    doc.setTextColor(30, 40, 50);
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text("Event Summary", 14, 15);
    
    // Add summary stats
    const totalEvents = events?.length || 0;
    const highPriorityCount = events?.filter(e => e.priority === "High").length || 0;
    const mediumPriorityCount = events?.filter(e => e.priority === "Medium").length || 0;
    const lowPriorityCount = events?.filter(e => e.priority === "Low").length || 0;
    
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 110, 120);
    doc.text(`Total Events: ${totalEvents}  |  High Priority: ${highPriorityCount}  |  Medium: ${mediumPriorityCount}  |  Low: ${lowPriorityCount}`, 14, 22);
    
    // Prepare table data with status colors
    const tableData = events?.map(event => [
      event.title,
      event.site_name,
      format(parseISO(event.start_date), "dd MMM yyyy"),
      event.end_date ? format(parseISO(event.end_date), "dd MMM yyyy") : "—",
      event.status,
      event.priority,
    ]) || [];

    autoTable(doc, {
      startY: 28,
      head: [["Title", "Site", "Start Date", "End Date", "Status", "Priority"]],
      body: tableData,
      theme: "grid",
      headStyles: { 
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10,
      },
      bodyStyles: {
        fontSize: 9,
        textColor: [40, 50, 60],
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 35 },
        2: { cellWidth: 28 },
        3: { cellWidth: 28 },
        4: { cellWidth: 25 },
        5: { cellWidth: 25 },
      },
      didParseCell: function(data) {
        // Color code priority column
        if (data.column.index === 5 && data.section === 'body') {
          const priority = data.cell.raw;
          if (priority === 'High') {
            data.cell.styles.fillColor = [254, 226, 226];
            data.cell.styles.textColor = [185, 28, 28];
            data.cell.styles.fontStyle = 'bold';
          } else if (priority === 'Medium') {
            data.cell.styles.fillColor = [254, 243, 199];
            data.cell.styles.textColor = [180, 83, 9];
            data.cell.styles.fontStyle = 'bold';
          } else if (priority === 'Low') {
            data.cell.styles.fillColor = [220, 252, 231];
            data.cell.styles.textColor = [22, 101, 52];
            data.cell.styles.fontStyle = 'bold';
          }
        }
        
        // Color code status column
        if (data.column.index === 4 && data.section === 'body') {
          const status = data.cell.raw;
          if (status === 'Completed') {
            data.cell.styles.fillColor = [220, 252, 231];
            data.cell.styles.textColor = [22, 101, 52];
          } else if (status === 'In Progress') {
            data.cell.styles.fillColor = [254, 243, 199];
            data.cell.styles.textColor = [180, 83, 9];
          } else if (status === 'Scheduled') {
            data.cell.styles.fillColor = [219, 234, 254];
            data.cell.styles.textColor = [30, 64, 175];
          }
        }
      }
    });

    doc.save(`calendar-${currentYear}.pdf`);
    toast({ title: "PDF exported successfully" });
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
        
        <div className="flex gap-2">
          <Button onClick={exportToPDF} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export PDF
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

                        return (
                          <div key={day.toISOString()} className="aspect-square p-1 relative">
                            <button
                              onClick={() => dayEvents.length > 0 && setSelectedEvent(dayEvents[0])}
                              className={cn(
                                "w-full h-full text-xs rounded flex items-center justify-center transition-all font-medium relative z-10",
                                isToday && "ring-2 ring-blue-500",
                                hasEvents && "cursor-pointer font-semibold",
                                !hasEvents && "cursor-default text-muted-foreground"
                              )}
                            >
                              {format(day, "d")}
                            </button>
                            
                            {/* Event bars - positioned absolutely behind the date */}
                            {hasEvents && dayEvents.map((event, idx) => {
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
                                    <div
                                      className={cn(
                                        "absolute z-10 transition-all cursor-pointer rounded-sm",
                                        siteColor.bg,
                                        "opacity-70 hover:opacity-100"
                                      )}
                                      style={{
                                        top: `${20 + idx * 8}%`,
                                        height: '6px',
                                        left: isFirstInMonth ? '10%' : '0',
                                        right: isEventEnd || !isSameMonth(eventEnd, month) ? '10%' : '0',
                                        borderRadius: `${isFirstInMonth ? '3px' : '0'} ${isEventEnd || !isSameMonth(eventEnd, month) ? '3px' : '0'} ${isEventEnd || !isSameMonth(eventEnd, month) ? '3px' : '0'} ${isFirstInMonth ? '3px' : '0'}`
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedEvent(event);
                                      }}
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="z-50">
                                    <div className="text-xs space-y-1">
                                      <p className="font-semibold">{event.site_name}</p>
                                      <p className="text-muted-foreground">{event.title}</p>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })}
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
                          onClick={() => handleDeleteEvent(event.id)}
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
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="Event title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site_name">Site Name *</Label>
              <Input
                id="site_name"
                value={formData.site_name}
                onChange={(e) =>
                  setFormData({ ...formData, site_name: e.target.value })
                }
                placeholder="Site name"
              />
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
                <Label htmlFor="end_date">End Date</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) =>
                    setFormData({ ...formData, end_date: e.target.value })
                  }
                />
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
              <Label htmlFor="event_type">Event Type</Label>
              <Input
                id="event_type"
                value={formData.event_type}
                onChange={(e) =>
                  setFormData({ ...formData, event_type: e.target.value })
                }
                placeholder="e.g., Inspection, Maintenance"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setIsEventDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEvent}>
              {editingEvent ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Calendar;
