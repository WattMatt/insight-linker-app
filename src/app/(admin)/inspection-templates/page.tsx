"use client";
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/LoadingState";
const InspectionTemplates = dynamic(() => import("@/views/InspectionTemplates"), {
  ssr: false,
  loading: () => <LoadingState variant="full-page" message="Loading..." />,
});
export default function Page() { return <InspectionTemplates />; }
