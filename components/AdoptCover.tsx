"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { adoptCover } from "@/lib/import-link";

/** A shared recipe's photo still at the site's address: copy it into Sauced, then show that one. */
export function AdoptCover({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  useEffect(() => {
    adoptCover(recipeId)
      .then(() => router.refresh())
      .catch(() => {});
  }, [recipeId, router]);
  return null;
}
