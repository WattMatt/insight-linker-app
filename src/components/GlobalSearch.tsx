import { useState, useEffect } from "react";
import { useNavigate } from "@/lib/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  Building2,
  MapPin,
  FileText,
  ClipboardList,
  Filter,
  X,
  Calendar as CalendarIcon,
} from "lucide-react";
import { useGlobalSearch, useSearchFilterOptions, SearchFilters } from "@/hooks/useGlobalSearch";
import { cn } from "@/lib/utils";

export const GlobalSearch = () => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<SearchFilters>({});
  const navigate = useNavigate();

  const { data: results, isLoading } = useGlobalSearch(searchQuery, filters);
  const filterOptions = useSearchFilterOptions();

  // Keyboard shortcut (Cmd+K or Ctrl+K)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = (url: string) => {
    setOpen(false);
    navigate(url);
    setSearchQuery("");
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "client":
        return <Building2 className="h-4 w-4" />;
      case "site":
        return <MapPin className="h-4 w-4" />;
      case "subsection":
        return <FileText className="h-4 w-4" />;
      case "inspection":
        return <ClipboardList className="h-4 w-4" />;
      default:
        return <Search className="h-4 w-4" />;
    }
  };

  const activeFiltersCount =
    (filters.clientIds?.length || 0) +
    (filters.siteTypes?.length || 0) +
    (filters.cocStatuses?.length || 0) +
    (filters.inspectionStatuses?.length || 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0);

  const clearFilters = () => {
    setFilters({});
  };

  return (
    <>
      <Button
        variant="outline"
        className="relative w-full justify-start text-sm text-muted-foreground sm:pr-12 md:w-40 lg:w-64"
        onClick={() => setOpen(true)}
      >
        <Search className="mr-2 h-4 w-4" />
        <span className="hidden lg:inline-flex">Search...</span>
        <span className="inline-flex lg:hidden">Search</span>
        <kbd className="pointer-events-none absolute right-1.5 top-2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Search clients, sites, subsections, inspections..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 px-2">
                <Filter className="h-4 w-4" />
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 text-xs">
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96" align="end">
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Filters</h4>
                    {activeFiltersCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFilters}
                        className="h-8 px-2"
                      >
                        Clear all
                      </Button>
                    )}
                  </div>

                  {/* Client Filter */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Clients</Label>
                    {filterOptions.clients.map((client) => (
                      <div key={client.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`client-${client.id}`}
                          checked={filters.clientIds?.includes(client.id)}
                          onCheckedChange={(checked) => {
                            setFilters((prev) => ({
                              ...prev,
                              clientIds: checked
                                ? [...(prev.clientIds || []), client.id]
                                : prev.clientIds?.filter((id) => id !== client.id),
                            }));
                          }}
                        />
                        <Label
                          htmlFor={`client-${client.id}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {client.name}
                        </Label>
                      </div>
                    ))}
                  </div>

                  <CommandSeparator />

                  {/* Site Type Filter */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Site Types</Label>
                    {filterOptions.siteTypes.map((type) => (
                      <div key={type} className="flex items-center space-x-2">
                        <Checkbox
                          id={`type-${type}`}
                          checked={filters.siteTypes?.includes(type)}
                          onCheckedChange={(checked) => {
                            setFilters((prev) => ({
                              ...prev,
                              siteTypes: checked
                                ? [...(prev.siteTypes || []), type]
                                : prev.siteTypes?.filter((t) => t !== type),
                            }));
                          }}
                        />
                        <Label
                          htmlFor={`type-${type}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {type}
                        </Label>
                      </div>
                    ))}
                  </div>

                  <CommandSeparator />

                  {/* COC Status Filter */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">COC Status</Label>
                    {filterOptions.cocStatuses.map((status) => (
                      <div key={status} className="flex items-center space-x-2">
                        <Checkbox
                          id={`coc-${status}`}
                          checked={filters.cocStatuses?.includes(status)}
                          onCheckedChange={(checked) => {
                            setFilters((prev) => ({
                              ...prev,
                              cocStatuses: checked
                                ? [...(prev.cocStatuses || []), status]
                                : prev.cocStatuses?.filter((s) => s !== status),
                            }));
                          }}
                        />
                        <Label
                          htmlFor={`coc-${status}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {status}
                        </Label>
                      </div>
                    ))}
                  </div>

                  <CommandSeparator />

                  {/* Inspection Status Filter */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Inspection Status</Label>
                    {filterOptions.inspectionStatuses.map((status) => (
                      <div key={status} className="flex items-center space-x-2">
                        <Checkbox
                          id={`inspection-${status}`}
                          checked={filters.inspectionStatuses?.includes(status)}
                          onCheckedChange={(checked) => {
                            setFilters((prev) => ({
                              ...prev,
                              inspectionStatuses: checked
                                ? [...(prev.inspectionStatuses || []), status]
                                : prev.inspectionStatuses?.filter((s) => s !== status),
                            }));
                          }}
                        />
                        <Label
                          htmlFor={`inspection-${status}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {status}
                        </Label>
                      </div>
                    ))}
                  </div>

                  <CommandSeparator />

                  {/* Date Range Filter */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Date Range</Label>
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">From</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left">
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {filters.dateFrom
                                ? filters.dateFrom.toLocaleDateString()
                                : "Pick a date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={filters.dateFrom}
                              onSelect={(date) =>
                                setFilters((prev) => ({ ...prev, dateFrom: date }))
                              }
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">To</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left">
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {filters.dateTo
                                ? filters.dateTo.toLocaleDateString()
                                : "Pick a date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={filters.dateTo}
                              onSelect={(date) =>
                                setFilters((prev) => ({ ...prev, dateTo: date }))
                              }
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </div>

        <CommandList>
          <CommandEmpty>
            {searchQuery.length < 2
              ? "Type at least 2 characters to search..."
              : isLoading
              ? "Searching..."
              : "No results found."}
          </CommandEmpty>

          {results && results.length > 0 && (
            <>
              {["client", "site", "subsection", "inspection"].map((type) => {
                const typeResults = results.filter((r) => r.type === type);
                if (typeResults.length === 0) return null;

                return (
                  <CommandGroup
                    key={type}
                    heading={type.charAt(0).toUpperCase() + type.slice(1) + "s"}
                  >
                    {typeResults.map((result) => (
                      <CommandItem
                        key={result.id}
                        value={result.title}
                        onSelect={() => handleSelect(result.url)}
                        className="cursor-pointer"
                      >
                        {getIcon(result.type)}
                        <div className="ml-2 flex flex-col">
                          <span className="font-medium">{result.title}</span>
                          {result.subtitle && (
                            <span className="text-xs text-muted-foreground">
                              {result.subtitle}
                            </span>
                          )}
                          {result.description && (
                            <span className="text-xs text-muted-foreground">
                              {result.description}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
};
