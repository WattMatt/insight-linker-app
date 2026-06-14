/**
 * Presentational page control for usePaginatedList — wraps the shadcn Pagination
 * primitives and the getPageWindow math. Renders nothing for a single page.
 */
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { getPageWindow, ELLIPSIS } from "@/lib/pagination";
import { cn } from "@/lib/utils";

interface ListPaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Disable interaction (e.g. while a page is fetching). */
  disabled?: boolean;
  className?: string;
}

export function ListPagination({ page, pageCount, onPageChange, disabled, className }: ListPaginationProps) {
  if (pageCount <= 1) return null;

  const pages = getPageWindow(page, pageCount);
  const go = (target: number) => {
    if (disabled || target === page || target < 1 || target > pageCount) return;
    onPageChange(target);
  };

  const atStart = page <= 1;
  const atEnd = page >= pageCount;

  return (
    <Pagination className={cn("mt-4", className)}>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            onClick={(e) => {
              e.preventDefault();
              go(page - 1);
            }}
            aria-disabled={disabled || atStart}
            className={cn((disabled || atStart) && "pointer-events-none opacity-50")}
          />
        </PaginationItem>

        {pages.map((p, i) =>
          p === ELLIPSIS ? (
            <PaginationItem key={`ellipsis-${i}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={p}>
              <PaginationLink
                href="#"
                isActive={p === page}
                onClick={(e) => {
                  e.preventDefault();
                  go(p);
                }}
                className={cn(disabled && "pointer-events-none opacity-50")}
              >
                {p}
              </PaginationLink>
            </PaginationItem>
          ),
        )}

        <PaginationItem>
          <PaginationNext
            href="#"
            onClick={(e) => {
              e.preventDefault();
              go(page + 1);
            }}
            aria-disabled={disabled || atEnd}
            className={cn((disabled || atEnd) && "pointer-events-none opacity-50")}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
