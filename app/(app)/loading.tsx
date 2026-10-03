import { RouteSkeleton } from "@/components/RouteSkeleton";

// Shown the moment a page in the app is tapped, while its data loads. It also lets Next
// prefetch every tab's shell, so a tab tap switches pages without waiting for the server.
export default function Loading() {
  return <RouteSkeleton />;
}
