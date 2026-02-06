import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, X } from "lucide-react";

export type StatusFilter = 'all' | 'open' | 'in_progress' | 'finished' | 'closed';
export type PriorityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';
export type TypeFilter = 'all' | 'snag' | 'observation';

interface PinFiltersProps {
  statusFilter: StatusFilter;
  priorityFilter: PriorityFilter;
  typeFilter: TypeFilter;
  onStatusChange: (status: StatusFilter) => void;
  onPriorityChange: (priority: PriorityFilter) => void;
  onTypeChange: (type: TypeFilter) => void;
  onClearFilters: () => void;
  activeFilterCount: number;
}

export const PinFilters = ({
  statusFilter,
  priorityFilter,
  typeFilter,
  onStatusChange,
  onPriorityChange,
  onTypeChange,
  onClearFilters,
  activeFilterCount,
}: PinFiltersProps) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Filter className="w-4 h-4" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {activeFilterCount} active
            </Badge>
          )}
        </div>
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-7 text-xs"
          >
            <X className="w-3 h-3 mr-1" />
            Clear
          </Button>
        )}
      </div>
      
      <div className="grid grid-cols-3 gap-2">
        <Select value={statusFilter} onValueChange={(v) => onStatusChange(v as StatusFilter)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">🔴 Open</SelectItem>
            <SelectItem value="in_progress">🟡 In Progress</SelectItem>
            <SelectItem value="finished">🟢 Finished</SelectItem>
            <SelectItem value="closed">⚫ Closed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={(v) => onPriorityChange(v as PriorityFilter)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="critical">🔴 Critical</SelectItem>
            <SelectItem value="high">🟠 High</SelectItem>
            <SelectItem value="medium">🟡 Medium</SelectItem>
            <SelectItem value="low">🟢 Low</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={(v) => onTypeChange(v as TypeFilter)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="snag">⚠️ Snags</SelectItem>
            <SelectItem value="observation">👁️ Observations</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
