"use client";
import { deleteRecipe } from "@/lib/actions";

export function DeleteRecipe({ id }: { id: string }) {
  return (
    <form
      action={deleteRecipe.bind(null, id)}
      onSubmit={(e) => {
        if (!confirm("Delete this recipe for everyone?")) e.preventDefault();
      }}
      style={{ marginTop: 12 }}
    >
      <button type="submit" className="btn danger block">Delete recipe</button>
    </form>
  );
}
