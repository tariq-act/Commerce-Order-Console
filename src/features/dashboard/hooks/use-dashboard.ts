"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { dashboardSchema } from "../types/dashboard";

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: ({ signal }) => apiGet("/api/dashboard", dashboardSchema, signal),
    refetchInterval: 60_000,
  });
}
