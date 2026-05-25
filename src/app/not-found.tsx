"use client";
import { Suspense } from "react";
import NotFound from "@/views/NotFound";
export default function NotFoundPage() {
  return (
    <Suspense>
      <NotFound />
    </Suspense>
  );
}
