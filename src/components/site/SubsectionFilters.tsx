import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import {
  Search,
  LayoutGrid,
  List,
  X,
  SlidersHorizontal,
  LayoutList
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export interface SubsectionFiltersState {
  search: string;
  cocStatus: string[];
  compliance: string[];
  snags: string[];
  metering: string[];
  category: string[];
  groupBy: "none" | "category" | "cocStatus" | "compliance" | "snags";
  viewMode: "table" | "grid";
}

interface SubsectionFiltersProps {
  filters: SubsectionFiltersState;
  onFiltersChange: (filters: SubsectionFiltersState) => void;
  categories: string[];
  totalCount: number;
  filteredCount: number;
}

const COC_STATUS_OPTIONS = [
  { value: "Pass", label: "Pass", color: "bg-green-500" },
  { value: "Fail", label: "Fail", color: "bg-red-500" },
  { value: "Pending", label: "Pending", color: "bg-yellow-500" },
  { value: "Missing", label: "Missing", color: "bg-gray-500" },
  { value: "N/A", label: "N/A", color: "bg-gray-500" },
];

const COMPLIANCE_OPTIONS = [
  { value: "compliant", label: "Compliant", color: "bg-green-500" },
  { value: "non-compliant", label: "Non-Compliant", color: "bg-red-500" },
  { value: "pending", label: "Pending", color: "bg-gray-400" },
];

const METERING_OPTIONS = [
  { value: "installed", label: "Installed", color: "bg-green-500" },
  { value: "missing", label: "Missing", color: "bg-gray-500" },
];

const SNAG_OPTIONS = [
  { value: "has-snags", label: "Has Snags", color: "bg-orange-500" },
  { value: "no-snags", label: "No Snags", color: "bg-green-500" },
];

export function SubsectionFilters({ 
  filters, 
  onFiltersChange, 
  categories,
  totalCount,
  filteredCount
}: SubsectionFiltersProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const activeFilterCount = [
    filters.cocStatus.length > 0,
    filters.compliance.length > 0,
    filters.metering.length > 0,
    filters.category.length > 0,
    filters.snags.length > 0,
  ].filter(Boolean).length;

  const handleSearchChange = (value: string) => {
    onFiltersChange({ ...filters, search: value });
  };

  const handleCocStatusToggle = (status: string) => {
    const newStatuses = filters.cocStatus.includes(status)
      ? filters.cocStatus.filter(s => s !== status)
      : [...filters.cocStatus, status];
    onFiltersChange({ ...filters, cocStatus: newStatuses });
  };

  const handleComplianceToggle = (value: string) => {
    const newValues = filters.compliance.includes(value)
      ? filters.compliance.filter(v => v !== value)
      : [...filters.compliance, value];
    onFiltersChange({ ...filters, compliance: newValues });
  };

  const handleMeteringToggle = (value: string) => {
    const newValues = filters.metering.includes(value)
      ? filters.metering.filter(v => v !== value)
      : [...filters.metering, value];
    onFiltersChange({ ...filters, metering: newValues });
  };

  const handleSnagToggle = (value: string) => {
    const newValues = filters.snags.includes(value)
      ? filters.snags.filter(v => v !== value)
      : [...filters.snags, value];
    onFiltersChange({ ...filters, snags: newValues });
  };

  const handleCategoryToggle = (category: string) => {
    const newCategories = filters.category.includes(category)
      ? filters.category.filter(c => c !== category)
      : [...filters.category, category];
    onFiltersChange({ ...filters, category: newCategories });
  };

  const handleGroupByChange = (value: string) => {
    onFiltersChange({ ...filters, groupBy: value as SubsectionFiltersState["groupBy"] });
  };

  const handleViewModeChange = (mode: "table" | "grid") => {
    onFiltersChange({ ...filters, viewMode: mode });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      ...filters,
      search: "",
      cocStatus: [],
      compliance: [],
      snags: [],
      metering: [],
      category: [],
    });
  };

  const hasActiveFilters = filters.search || activeFilterCount > 0;

  return (
    <div className="space-y-4">
      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search subsections by name, tenant, or meter..."
            value={filters.search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10 bg-background/50 backdrop-blur-sm border-border/50 focus:border-primary/50"
          />
          {filters.search && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
              onClick={() => handleSearchChange("")}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Filter Button */}
        <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
          <PopoverTrigger asChild>
            <Button 
              variant="outline" 
              className="gap-2 relative bg-background/50 backdrop-blur-sm border-border/50"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 && (
                <Badge 
                  variant="secondary" 
                  className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs bg-primary text-primary-foreground"
                >
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4" align="end">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Filters</h4>
                {hasActiveFilters && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-xs"
                    onClick={clearAllFilters}
                  >
                    Clear all
                  </Button>
                )}
              </div>

              <Separator />

              {/* COC Status */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  COC Status
                </Label>
                <div className="flex flex-wrap gap-2">
                  {COC_STATUS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleCocStatusToggle(option.value)}
                      className={`
                        inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                        transition-all duration-200 border
                        ${filters.cocStatus.includes(option.value)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                        }
                      `}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${option.color}`} />
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Compliance */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Compliance
                </Label>
                <div className="flex flex-wrap gap-2">
                  {COMPLIANCE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleComplianceToggle(option.value)}
                      className={`
                        inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                        transition-all duration-200 border
                        ${filters.compliance.includes(option.value)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                        }
                      `}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${option.color}`} />
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Metering */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Metering
                </Label>
                <div className="flex flex-wrap gap-2">
                  {METERING_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleMeteringToggle(option.value)}
                      className={`
                        inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                        transition-all duration-200 border
                        ${filters.metering.includes(option.value)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                        }
                      `}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${option.color}`} />
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Snags */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Snags
                </Label>
                <div className="flex flex-wrap gap-2">
                  {SNAG_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleSnagToggle(option.value)}
                      className={`
                        inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                        transition-all duration-200 border
                        ${filters.snags.includes(option.value)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                        }
                      `}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${option.color}`} />
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {categories.length > 0 && (
                <>
                  <Separator />
                  {/* Categories */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Category
                    </Label>
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                      {categories.map((category) => (
                        <button
                          key={category}
                          onClick={() => handleCategoryToggle(category)}
                          className={`
                            inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium
                            transition-all duration-200 border
                            ${filters.category.includes(category)
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                            }
                          `}
                        >
                          {category}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Group By */}
        <Select value={filters.groupBy} onValueChange={handleGroupByChange}>
          <SelectTrigger className="w-[140px] bg-background/50 backdrop-blur-sm border-border/50">
            <LayoutList className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Group by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No grouping</SelectItem>
            <SelectItem value="category">By Category</SelectItem>
            <SelectItem value="cocStatus">By COC Status</SelectItem>
            <SelectItem value="compliance">By Compliance</SelectItem>
            <SelectItem value="snags">By Snags</SelectItem>
          </SelectContent>
        </Select>

        {/* View Mode Toggle */}
        <div className="flex border rounded-lg overflow-hidden bg-background/50 backdrop-blur-sm border-border/50">
          <Button
            variant={filters.viewMode === "table" ? "secondary" : "ghost"}
            size="sm"
            className="rounded-none h-10 px-3"
            onClick={() => handleViewModeChange("table")}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={filters.viewMode === "grid" ? "secondary" : "ghost"}
            size="sm"
            className="rounded-none h-10 px-3"
            onClick={() => handleViewModeChange("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">
            Showing {filteredCount} of {totalCount}
          </span>
          <Separator orientation="vertical" className="h-4" />
          {filters.search && (
            <Badge variant="secondary" className="gap-1">
              Search: "{filters.search}"
              <button onClick={() => handleSearchChange("")}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.cocStatus.map((status) => (
            <Badge key={status} variant="secondary" className="gap-1">
              COC: {status}
              <button onClick={() => handleCocStatusToggle(status)}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {filters.compliance.map((value) => (
            <Badge key={value} variant="secondary" className="gap-1">
              {COMPLIANCE_OPTIONS.find((o) => o.value === value)?.label ?? value}
              <button onClick={() => handleComplianceToggle(value)}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {filters.metering.map((value) => (
            <Badge key={value} variant="secondary" className="gap-1">
              Metering: {value}
              <button onClick={() => handleMeteringToggle(value)}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {filters.category.map((cat) => (
            <Badge key={cat} variant="secondary" className="gap-1">
              {cat}
              <button onClick={() => handleCategoryToggle(cat)}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {filters.snags.map((value) => (
            <Badge key={value} variant="secondary" className="gap-1">
              {value === "has-snags" ? "Has Snags" : "No Snags"}
              <button onClick={() => handleSnagToggle(value)}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
