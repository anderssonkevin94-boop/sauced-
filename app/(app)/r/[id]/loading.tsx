import { RouteSkeleton } from "@/components/RouteSkeleton";

// Covers moves within a recipe (recipe → edit or cook mode), which the (app) one doesn't catch.
export default function Loading() {
  return <RouteSkeleton />;
}
