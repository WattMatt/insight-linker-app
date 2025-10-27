import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { MapPin, CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { ScrollArea } from "./ui/scroll-area";

interface Pin {
  id: string;
  pin_number: number;
  pin_type: 'snag' | 'observation';
  status: 'open' | 'resolved';
  priority?: string;
  title?: string;
  notes?: string;
  photo_url?: string;
}

interface FloorPlanPinsListProps {
  pins: Pin[];
  onPinClick: (pin: Pin) => void;
}

export const FloorPlanPinsList = ({ pins, onPinClick }: FloorPlanPinsListProps) => {
  const snags = pins.filter(p => p.pin_type === 'snag');
  const observations = pins.filter(p => p.pin_type === 'observation');
  const openSnags = snags.filter(p => p.status === 'open');
  const resolvedSnags = snags.filter(p => p.status === 'resolved');

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

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-lg">Items</CardTitle>
        <div className="flex gap-2 text-sm">
          <Badge variant="destructive">{openSnags.length} Open Snags</Badge>
          <Badge variant="secondary">{resolvedSnags.length} Resolved</Badge>
          <Badge variant="default">{observations.length} Observations</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-6 pb-6">
          {pins.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No items yet. Click "Add Snag" or "Add Observation" to start.
            </div>
          ) : (
            <div className="space-y-2">
              {pins
                .sort((a, b) => a.pin_number - b.pin_number)
                .map((pin) => (
                  <Button
                    key={pin.id}
                    variant="outline"
                    className="w-full justify-start h-auto py-3 px-4"
                    onClick={() => onPinClick(pin)}
                  >
                    <div className="flex items-start gap-3 w-full">
                      {/* Pin Number Badge */}
                      <div className={`
                        flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                        ${pin.pin_type === 'snag' ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'}
                        ${pin.status === 'resolved' ? 'opacity-50' : ''}
                      `}>
                        {pin.pin_number}
                      </div>

                      {/* Content */}
                      <div className="flex-1 text-left min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={pin.pin_type === 'snag' ? 'destructive' : 'default'} className="text-xs">
                            {pin.pin_type}
                          </Badge>
                          {pin.priority && (
                            <Badge variant={getPriorityColor(pin.priority)} className="text-xs">
                              {getPriorityIcon(pin.priority)}
                              <span className="ml-1">{pin.priority}</span>
                            </Badge>
                          )}
                          {pin.status === 'resolved' ? (
                            <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <Circle className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="font-medium text-sm mb-1 truncate">
                          {pin.title || 'Untitled'}
                        </div>
                        {pin.notes && (
                          <div className="text-xs text-muted-foreground line-clamp-2">
                            {pin.notes}
                          </div>
                        )}
                      </div>

                      {/* Photo indicator */}
                      {pin.photo_url && (
                        <div className="flex-shrink-0">
                          <img 
                            src={pin.photo_url} 
                            alt="thumbnail" 
                            className="w-12 h-12 object-cover rounded border"
                          />
                        </div>
                      )}
                    </div>
                  </Button>
                ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};