import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { MapPin, CheckCircle2, Circle, AlertTriangle, Clock, Check, X, Minus } from "lucide-react";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "@/lib/utils";

interface Pin {
  id: string;
  pin_number: number;
  pin_type: 'snag' | 'observation';
  status: 'open' | 'in_progress' | 'finished' | 'closed' | 'resolved';
  priority?: string;
  title?: string;
  notes?: string;
  photo_url?: string;
}

interface FloorPlanPinsListProps {
  pins: Pin[];
  onPinClick: (pin: Pin) => void;
  onQuickStatusChange?: (pinId: string, newStatus: Pin['status']) => Promise<void>;
}

const STATUS_OPTIONS: { value: Pin['status']; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'open', label: 'Open', icon: <Circle className="w-3.5 h-3.5" />, color: 'bg-red-500 hover:bg-red-600 text-white' },
  { value: 'in_progress', label: 'In Progress', icon: <Clock className="w-3.5 h-3.5" />, color: 'bg-yellow-500 hover:bg-yellow-600 text-white' },
  { value: 'finished', label: 'Finished', icon: <Check className="w-3.5 h-3.5" />, color: 'bg-green-500 hover:bg-green-600 text-white' },
  { value: 'closed', label: 'Closed', icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: 'bg-gray-500 hover:bg-gray-600 text-white' },
];

export const FloorPlanPinsList = ({ pins, onPinClick, onQuickStatusChange }: FloorPlanPinsListProps) => {
  const [updatingPinId, setUpdatingPinId] = useState<string | null>(null);
  
  const snags = pins.filter(p => p.pin_type === 'snag');
  const observations = pins.filter(p => p.pin_type === 'observation');
  const openItems = pins.filter(p => p.status === 'open');
  const inProgressItems = pins.filter(p => p.status === 'in_progress');
  const finishedItems = pins.filter(p => p.status === 'finished' || p.status === 'closed' || p.status === 'resolved');

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'critical': return 'destructive';
      case 'high': return 'default';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  const getPriorityIcon = (priority?: string) => {
    if (priority === 'critical' || priority === 'high') {
      return <AlertTriangle className="w-3 h-3" />;
    }
    return null;
  };

  const getStatusIcon = (status: Pin['status']) => {
    switch (status) {
      case 'open': return <Circle className="w-4 h-4 text-red-500" />;
      case 'in_progress': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'finished': return <Check className="w-4 h-4 text-green-500" />;
      case 'closed': 
      case 'resolved': return <CheckCircle2 className="w-4 h-4 text-gray-500" />;
      default: return <Circle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const handleQuickStatus = async (e: React.MouseEvent, pinId: string, newStatus: Pin['status']) => {
    e.stopPropagation();
    if (!onQuickStatusChange) return;
    
    setUpdatingPinId(pinId);
    try {
      await onQuickStatusChange(pinId, newStatus);
    } finally {
      setUpdatingPinId(null);
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base md:text-lg">Items</CardTitle>
        <div className="flex flex-wrap gap-2 text-xs md:text-sm">
          <Badge variant="destructive" className="text-xs whitespace-nowrap gap-1">
            <Circle className="w-3 h-3" />
            {openItems.length} Open
          </Badge>
          <Badge className="text-xs whitespace-nowrap gap-1 bg-yellow-500">
            <Clock className="w-3 h-3" />
            {inProgressItems.length} In Progress
          </Badge>
          <Badge variant="secondary" className="text-xs whitespace-nowrap gap-1">
            <Check className="w-3 h-3" />
            {finishedItems.length} Done
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-4 md:px-6 pb-6">
          {pins.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No items yet. Tap on the floor plan to add pins.
            </div>
          ) : (
            <div className="space-y-2">
              {pins
                .sort((a, b) => a.pin_number - b.pin_number)
                .map((pin) => (
                  <div
                    key={pin.id}
                    className="border rounded-lg overflow-hidden bg-card"
                  >
                    {/* Main pin row - clickable */}
                    <Button
                      variant="ghost"
                      className="w-full justify-start h-auto py-3 px-3 rounded-none hover:bg-muted/50"
                      onClick={() => onPinClick(pin)}
                    >
                      <div className="flex items-start gap-2 md:gap-3 w-full">
                        {/* Pin Number Badge */}
                        <div className={cn(
                          "flex-shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs font-bold",
                          pin.pin_type === 'snag' ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground',
                          (pin.status === 'finished' || pin.status === 'closed' || pin.status === 'resolved') && 'opacity-50'
                        )}>
                          {pin.pin_number}
                        </div>

                        {/* Content */}
                        <div className="flex-1 text-left min-w-0">
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <Badge variant={pin.pin_type === 'snag' ? 'destructive' : 'default'} className="text-xs">
                              {pin.pin_type}
                            </Badge>
                            {pin.priority && (
                              <Badge variant={getPriorityColor(pin.priority)} className="text-xs">
                                {getPriorityIcon(pin.priority)}
                                <span className="ml-1">{pin.priority}</span>
                              </Badge>
                            )}
                            {getStatusIcon(pin.status)}
                          </div>
                          <div className="font-medium text-sm mb-1 truncate">
                            {pin.title || 'Untitled'}
                          </div>
                          {pin.notes && (
                            <div className="text-xs text-muted-foreground line-clamp-1">
                              {pin.notes}
                            </div>
                          )}
                        </div>

                        {/* Photo indicator */}
                        {pin.photo_url && (
                          <div className="flex-shrink-0 hidden md:block">
                            <img 
                              src={pin.photo_url} 
                              alt="thumbnail" 
                              className="w-10 h-10 md:w-12 md:h-12 object-cover rounded border"
                            />
                          </div>
                        )}
                      </div>
                    </Button>

                    {/* Quick Status Toggle Row */}
                    {onQuickStatusChange && (
                      <div className="flex border-t bg-muted/30">
                        {STATUS_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            onClick={(e) => handleQuickStatus(e, pin.id, option.value)}
                            disabled={updatingPinId === pin.id}
                            className={cn(
                              "flex-1 py-2 px-1 text-xs font-medium flex items-center justify-center gap-1 transition-all",
                              pin.status === option.value 
                                ? option.color
                                : "hover:bg-muted text-muted-foreground hover:text-foreground",
                              updatingPinId === pin.id && "opacity-50 cursor-wait"
                            )}
                          >
                            {option.icon}
                            <span className="hidden sm:inline">{option.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};