import { ChevronRight, Home, Building2, MapPin, Layers } from "lucide-react";
import { Link } from "@/lib/navigation";
import { cn } from "@/lib/utils";

interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: "home" | "client" | "site" | "subsection";
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

const iconMap = {
  home: Home,
  client: Building2,
  site: MapPin,
  subsection: Layers,
};

export const Breadcrumbs = ({ items, className }: BreadcrumbProps) => {
  return (
    <nav className={cn("flex items-center flex-wrap gap-1 text-sm text-muted-foreground mb-4", className)}>
      <Link 
        to="/dashboard" 
        className="hover:text-foreground transition-colors flex items-center gap-1 px-2 py-1 rounded-md hover:bg-accent"
      >
        <Home className="h-4 w-4" />
        <span className="hidden sm:inline">Home</span>
      </Link>
      {items.map((item, index) => {
        const IconComponent = item.icon ? iconMap[item.icon] : null;
        return (
          <div key={index} className="flex items-center gap-1">
            <ChevronRight className="h-4 w-4 flex-shrink-0" />
            {item.href ? (
              <Link
                to={item.href}
                className="hover:text-foreground transition-colors flex items-center gap-1 px-2 py-1 rounded-md hover:bg-accent truncate max-w-[150px] sm:max-w-[200px]"
                title={item.label}
              >
                {IconComponent && <IconComponent className="h-3.5 w-3.5 flex-shrink-0" />}
                <span className="truncate">{item.label}</span>
              </Link>
            ) : (
              <span className="text-foreground font-medium flex items-center gap-1 px-2 py-1 truncate max-w-[150px] sm:max-w-[200px]" title={item.label}>
                {IconComponent && <IconComponent className="h-3.5 w-3.5 flex-shrink-0" />}
                <span className="truncate">{item.label}</span>
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
};
