"use client";

/**
 * React Router DOM compatibility layer for Next.js App Router.
 * All existing components import from this module instead of react-router-dom.
 * This maps React Router APIs to their Next.js equivalents.
 */

import React, { useCallback, useMemo } from "react";
import {
  useRouter as useNextRouter,
  useParams as useNextParams,
  useSearchParams as useNextSearchParams,
  usePathname,
} from "next/navigation";
import NextLink from "next/link";

// ─── useNavigate ────────────────────────────────────────────────
type NavigateOptions = { replace?: boolean; state?: any };

export function useNavigate() {
  const router = useNextRouter();

  return useCallback(
    (to: string | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        if (to === -1) router.back();
        else router.forward();
        return;
      }
      if (options?.replace) {
        router.replace(to);
      } else {
        router.push(to);
      }
    },
    [router]
  );
}

// ─── useParams ──────────────────────────────────────────────────
export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  const params = useNextParams();
  return (params ?? {}) as T;
}

// ─── useSearchParams ────────────────────────────────────────────
// React Router returns [searchParams, setSearchParams]
// Next.js returns just searchParams (ReadonlyURLSearchParams)
// This shim provides the React Router-style tuple API
export function useSearchParams(): [URLSearchParams, (params: URLSearchParams | Record<string, string> | ((prev: URLSearchParams) => URLSearchParams)) => void] {
  const nextSearchParams = useNextSearchParams();
  const router = useNextRouter();
  const pathname = usePathname();

  const searchParams = useMemo(() => {
    return new URLSearchParams(nextSearchParams?.toString() ?? "");
  }, [nextSearchParams]);

  const setSearchParams = useCallback(
    (
      updater:
        | URLSearchParams
        | Record<string, string>
        | ((prev: URLSearchParams) => URLSearchParams)
    ) => {
      let newParams: URLSearchParams;
      if (typeof updater === "function") {
        newParams = updater(new URLSearchParams(nextSearchParams?.toString() ?? ""));
      } else if (updater instanceof URLSearchParams) {
        newParams = updater;
      } else {
        newParams = new URLSearchParams(updater);
      }
      const qs = newParams.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, nextSearchParams]
  );

  return [searchParams, setSearchParams];
}

// ─── useLocation ────────────────────────────────────────────────
// React Router's useLocation returns { pathname, search, hash, state, key }
export function useLocation() {
  const pathname = usePathname();
  const searchParams = useNextSearchParams();

  return useMemo(
    () => ({
      pathname: pathname ?? "/",
      search: searchParams?.toString() ? `?${searchParams.toString()}` : "",
      hash: typeof window !== "undefined" ? window.location.hash : "",
      state: null,
      key: "default",
    }),
    [pathname, searchParams]
  );
}

// ─── Link ───────────────────────────────────────────────────────
// Maps React Router's <Link to="..."> to Next.js <Link href="...">
interface LinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: string;
  replace?: boolean;
  children?: React.ReactNode;
}

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ to, replace, children, ...props }, ref) => {
    return (
      <NextLink href={to} replace={replace} ref={ref} {...props}>
        {children}
      </NextLink>
    );
  }
);
Link.displayName = "Link";

// ─── NavLink ────────────────────────────────────────────────────
// React Router's NavLink with active state detection
interface NavLinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className" | "children"> {
  to: string;
  end?: boolean;
  replace?: boolean;
  className?: string | ((props: { isActive: boolean; isPending: boolean }) => string);
  children?: React.ReactNode | ((props: { isActive: boolean; isPending: boolean }) => React.ReactNode);
}

export const NavLink = React.forwardRef<HTMLAnchorElement, NavLinkProps>(
  ({ to, end = false, replace: shouldReplace, className, children, ...props }, ref) => {
    const pathname = usePathname();
    const isActive = end
      ? pathname === to
      : (pathname ?? "").startsWith(to);

    const resolvedClassName =
      typeof className === "function"
        ? className({ isActive, isPending: false })
        : className;

    const resolvedChildren =
      typeof children === "function"
        ? children({ isActive, isPending: false })
        : children;

    return (
      <NextLink
        href={to}
        replace={shouldReplace}
        ref={ref}
        className={resolvedClassName}
        {...props}
      >
        {resolvedChildren}
      </NextLink>
    );
  }
);
NavLink.displayName = "NavLink";

// ─── Navigate ───────────────────────────────────────────────────
// React Router's <Navigate to="..." replace /> component
export function Navigate({ to, replace: shouldReplace = false }: { to: string; replace?: boolean }) {
  const router = useNextRouter();

  React.useEffect(() => {
    if (shouldReplace) {
      router.replace(to);
    } else {
      router.push(to);
    }
  }, [to, shouldReplace, router]);

  return null;
}
