import { Seal, Spark } from "@/components/icons";
import { initials, tileColor } from "@/lib/parse";
import { KIND_LABEL, type Kind, type Recipe } from "@/lib/types";

export function KindBadge({ kind }: { kind: Kind }) {
  return (
    <span className={`kind ${kind}`}>
      {kind === "classic" ? <Seal /> : <Spark />}
      {KIND_LABEL[kind]}
    </span>
  );
}

export function Tile({ recipe, className = "" }: { recipe: Pick<Recipe, "id" | "title" | "photoUrl">; className?: string }) {
  return (
    <div className={`tile ${className}`} style={{ background: tileColor(recipe.id) }}>
      {recipe.photoUrl ? <img src={recipe.photoUrl} alt="" loading="lazy" /> : initials(recipe.title)}
    </div>
  );
}

export function Avatar({ name, id, large }: { name: string; id: string; large?: boolean }) {
  return (
    <span className={`avatar${large ? " lg" : ""}`} style={{ background: tileColor(id + "·") }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
