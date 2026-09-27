"use client";

import { useEffect } from "react";
import { listenForGlobalErrors } from "@/lib/client-errors";

export function ErrorListener() {
  useEffect(() => listenForGlobalErrors(), []);
  return null;
}
