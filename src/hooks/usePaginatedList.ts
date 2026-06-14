/**
 * Reusable server-side pagination for Supabase list views.
 *
 * The caller supplies a `fetchPage` that runs a `.range(from, to)` query with
 * `{ count: 'exact' }` and returns `{ rows, total }`. This hook owns page state,
 * page-count math, and keeps the previous page visible during fetches (react-query
 * v5 `placeholderData: keepPreviousData`). Pure math lives in src/lib/pagination.ts.
 */
import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { getPageRange, getPageCount, clampPage, type PageRange } from '@/lib/pagination';

export interface PaginatedPage<T> {
  rows: T[];
  total: number;
}

export interface UsePaginatedListOptions<T> {
  /** Stable base key; the page + pageSize are appended automatically. */
  queryKey: unknown[];
  /** Runs the actual Supabase query for the given zero-based range. */
  fetchPage: (args: PageRange & { page: number; pageSize: number }) => Promise<PaginatedPage<T>>;
  pageSize?: number;
  enabled?: boolean;
}

export interface UsePaginatedListResult<T> {
  rows: T[];
  total: number;
  /** 1-based current page. */
  page: number;
  pageSize: number;
  pageCount: number;
  setPage: (page: number) => void;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

export function usePaginatedList<T>(options: UsePaginatedListOptions<T>): UsePaginatedListResult<T> {
  const pageSize = options.pageSize ?? 20;
  const [page, setPageState] = useState(1);

  const query = useQuery({
    queryKey: [...options.queryKey, 'page', page, pageSize],
    queryFn: () => {
      const range = getPageRange(page, pageSize);
      return options.fetchPage({ ...range, page, pageSize });
    },
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });

  const total = query.data?.total ?? 0;
  const pageCount = getPageCount(total, pageSize);

  return {
    rows: query.data?.rows ?? [],
    total,
    page,
    pageSize,
    pageCount,
    setPage: (p: number) => setPageState(clampPage(p, pageCount)),
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
  };
}
