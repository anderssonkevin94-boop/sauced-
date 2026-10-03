import type { Cook, CookedEntry, CookedWithRecipe, CookReply, Notice, Recipe, RecipeInput } from "@/lib/types";

// In-memory sample kitchen used when no Supabase keys are set.
const cooks: Cook[] = [
  { id: "kevin", name: "Kevin" },
  { id: "sam", name: "Sam" },
  { id: "priya", name: "Priya" },
  { id: "jonah", name: "Jonah" },
];

export const demoMe = cooks[0];

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

type Row = Omit<Recipe, "author" | "photoUrl" | "basedOn"> & { authorId: string; basedOn?: string | null };

const g = globalThis as unknown as { __saucedDemo?: Row[] };

g.__saucedDemo ??= [
  {
    id: "midnight-gochujang-pasta",
    authorId: "kevin",
    title: "Midnight gochujang butter pasta",
    kind: "experiment",
    ingredients: [
      "200g spaghetti",
      "3 tbsp butter",
      "1 heaped tbsp gochujang",
      "2 cloves garlic, smashed",
      "Splash of pasta water",
      "Parmesan, a lot",
      "Spring onion",
    ],
    steps: [
      "Boil the pasta in well-salted water. Save a mug of the water before draining.",
      "Melt butter with garlic over low heat until it smells nutty.",
      "Whisk in gochujang and a splash of pasta water until glossy.",
      "Toss the pasta through, then pile on parmesan and spring onion.",
    ],
    notes: "Made at 1am after Sam's birthday. Better than it has any right to be. Next time try a fried egg on top.",
    serves: "2",
    time: "15 min",
    photoPath: null,
    createdAt: hoursAgo(5),
    updatedAt: hoursAgo(5),
  },
  {
    id: "sunday-braised-short-ribs",
    authorId: "priya",
    title: "Sunday braised short ribs",
    kind: "classic",
    ingredients: [
      "1.5kg bone-in short ribs",
      "2 onions, 2 carrots, 2 celery sticks",
      "3 tbsp tomato paste",
      "750ml red wine",
      "500ml beef stock",
      "Thyme, bay leaves",
    ],
    steps: [
      "Season the ribs the night before.",
      "Brown hard in a heavy pot, in batches. Take your time.",
      "Soften the veg in the fat, then cook out the tomato paste.",
      "Add wine and reduce by half, then stock and herbs.",
      "Ribs back in, lid on, 160°C oven for 3 hours.",
      "Skim, reduce the sauce, serve over mash.",
    ],
    notes: "My mum's, slightly tweaked. Do not skip the overnight salt.",
    serves: "4–6",
    time: "4 hr",
    photoPath: null,
    createdAt: hoursAgo(30),
    updatedAt: hoursAgo(30),
  },
  {
    id: "jonahs-hot-honey-wings",
    authorId: "jonah",
    title: "Hot honey wings",
    kind: "experiment",
    ingredients: ["1kg wings", "2 tbsp baking powder", "Salt", "100ml honey", "2 tbsp chilli flakes", "Squeeze of lime"],
    steps: [
      "Toss wings in baking powder and salt, rack them in the fridge an hour if you can.",
      "Air fry at 200°C for 25 minutes, flipping halfway.",
      "Warm honey with chilli flakes, finish with lime, toss.",
    ],
    notes: "Too much chilli the first time. Halved it.",
    serves: "3",
    time: "40 min",
    photoPath: null,
    createdAt: hoursAgo(54),
    updatedAt: hoursAgo(54),
  },
  {
    id: "sams-green-shakshuka",
    authorId: "sam",
    title: "Green shakshuka",
    kind: "classic",
    ingredients: ["Leeks", "Spinach", "Feta", "4 eggs", "Cumin", "Lemon", "Dill"],
    steps: [
      "Sweat sliced leeks in olive oil with cumin.",
      "Wilt in spinach, season well.",
      "Make wells, crack in eggs, lid on until just set.",
      "Crumble feta, dill, lemon zest over the top.",
    ],
    notes: "",
    serves: "2",
    time: "25 min",
    photoPath: null,
    createdAt: hoursAgo(120),
    updatedAt: hoursAgo(120),
  },
  {
    id: "priyas-kanelbullar",
    authorId: "priya",
    title: "Kanelbullar",
    kind: "classic",
    ingredients: [
      "Deg:",
      "50 g jäst",
      "5 dl mjölk",
      "150 g smör",
      "1 dl socker",
      "1/2 tsk salt",
      "2 tsk kardemumma",
      "ca 13 dl vetemjöl",
      "Fyllning:",
      "150 g smör, rumsvarmt",
      "1 dl socker",
      "1 1/2 msk kanel",
      "Pärlsocker, till toppen",
    ],
    steps: [
      "Smält smöret, häll i mjölken och värm till 37°C.",
      "Smula jästen i en bunke, rör ut med lite av mjölken, häll i resten.",
      "Tillsätt socker, salt, kardemumma och nästan allt vetemjöl. Knåda 10 minuter.",
      "Låt degen jäsa under bakduk i 30 minuter.",
      "Rör ihop smör, socker och kanel till fyllningen.",
      "Kavla ut, bred på fyllningen, rulla ihop och skär i bitar. Jäs 30 minuter till.",
      "Pensla, strö över pärlsocker och grädda i 250°C i 5–7 minuter.",
    ],
    notes: "Mormors recept. Dubbla satsen och frys hälften.",
    serves: "40 bullar",
    time: "2 tim",
    photoPath: null,
    createdAt: hoursAgo(200),
    updatedAt: hoursAgo(200),
  },
  {
    id: "kevins-dad-chili",
    authorId: "kevin",
    title: "Dad's chili",
    kind: "classic",
    ingredients: ["500g beef mince", "2 tins kidney beans", "2 tins tomatoes", "Chipotle in adobo", "Dark chocolate, one square"],
    steps: ["Brown the mince properly.", "Everything else in, simmer low for 2 hours.", "Square of chocolate at the end."],
    notes: "",
    serves: "6",
    time: "2.5 hr",
    photoPath: null,
    createdAt: hoursAgo(300),
    updatedAt: hoursAgo(300),
  },
];

const rows = () => g.__saucedDemo!;

type CookedRow = {
  id: string;
  recipeId: string;
  cookId: string;
  on: string;
  note: string;
  photo?: string | null;
  groupId?: string | null;
  loggedBy?: string;
  rating?: number | null;
};
const c = globalThis as unknown as { __saucedCooked?: CookedRow[] };
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
c.__saucedCooked ??= [
  { id: "c1", recipeId: "kevins-dad-chili", cookId: "kevin", on: daysAgo(3), note: "Doubled the chipotle. Good call.", rating: 4.6 },
  { id: "c2", recipeId: "kevins-dad-chili", cookId: "sam", on: daysAgo(20), note: "", rating: 3.8 },
  { id: "c3", recipeId: "kevins-dad-chili", cookId: "kevin", on: daysAgo(45), note: "" },
  { id: "c4", recipeId: "midnight-gochujang-pasta", cookId: "kevin", on: daysAgo(1), note: "" },
];
const cookedRows = () => c.__saucedCooked!;

const rp = globalThis as unknown as { __saucedReplies?: (Omit<CookReply, "author"> & { authorId: string; recipeId: string })[] };
rp.__saucedReplies ??= [
  { id: "r1", cookedId: "c1", recipeId: "kevins-dad-chili", authorId: "sam", body: "Did you use the chipotle in adobo or the powder?", createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString() },
];

const nt = globalThis as unknown as { __saucedNotices?: (Omit<Notice, "actor" | "recipe"> & { userId: string; actorId: string; recipeId: string })[] };
nt.__saucedNotices ??= [
  { id: "n1", userId: "kevin", actorId: "sam", kind: "reply", recipeId: "kevins-dad-chili", body: "Did you use the chipotle in adobo or the powder?", read: false, createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString() },
  { id: "n2", userId: "kevin", actorId: "sam", kind: "cooked_yours", recipeId: "kevins-dad-chili", body: "", read: true, createdAt: new Date(Date.now() - 20 * 86_400_000).toISOString() },
  { id: "n3", userId: "kevin", actorId: "priya", kind: "new_recipe", recipeId: "priyas-kanelbullar", body: "", read: true, createdAt: new Date(Date.now() - 8 * 86_400_000).toISOString() },
];
const notify = (userId: string, actorId: string, kind: Notice["kind"], recipeId: string, body: string) =>
  nt.__saucedNotices!.unshift({ id: `n${Date.now().toString(36)}${userId}`, userId, actorId, kind, recipeId, body, read: false, createdAt: new Date().toISOString() });

const pg = globalThis as unknown as { __saucedPairs?: [string, string][] };
pg.__saucedPairs ??= [["kevins-dad-chili", "midnight-gochujang-pasta"]];

const toEntry = (r: CookedRow): CookedEntry => ({
  id: r.id,
  recipeId: r.recipeId,
  cook: cooks.find((x) => x.id === r.cookId) ?? demoMe,
  on: r.on,
  note: r.note,
  photoPath: r.photo ?? null,
  photoUrl: r.photo ?? null,
  groupId: r.groupId ?? null,
  loggedBy: r.loggedBy ?? r.cookId,
  rating: r.rating ?? null,
});
const newestFirst = (a: CookedRow, b: CookedRow) => b.on.localeCompare(a.on);

const hydrate = (r: Row): Recipe => {
  const { authorId, ...rest } = r;
  return { ...rest, basedOn: rest.basedOn ?? null, author: cooks.find((c) => c.id === authorId) ?? demoMe, photoUrl: r.photoPath };
};

export const demo = {
  cooks: () => cooks,
  list: () => [...rows()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(hydrate),
  get: (id: string) => {
    const r = rows().find((x) => x.id === id);
    return r ? hydrate(r) : null;
  },
  create: (input: RecipeInput, basedOn: string | null = null) => {
    const now = new Date().toISOString();
    const id = `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Date.now().toString(36)}`;
    rows().push({ ...input, id, authorId: demoMe.id, basedOn, createdAt: now, updatedAt: now });
    for (const c of cooks) if (c.id !== demoMe.id) notify(c.id, demoMe.id, "new_recipe", id, "");
    return id;
  },
  update: (id: string, input: RecipeInput) => {
    const r = rows().find((x) => x.id === id);
    if (r) Object.assign(r, input, { updatedAt: new Date().toISOString() });
  },
  patch: (id: string, input: Partial<RecipeInput>) => {
    const r = rows().find((x) => x.id === id);
    if (r) Object.assign(r, input, { updatedAt: new Date().toISOString() });
  },
  remove: (id: string) => {
    g.__saucedDemo = rows().filter((x) => x.id !== id);
  },
  cookLog: (recipeId: string) => cookedRows().filter((r) => r.recipeId === recipeId).sort(newestFirst).map(toEntry),
  kitchenLog: (): CookedWithRecipe[] =>
    [...cookedRows()].sort(newestFirst).flatMap((r) => {
      const recipe = rows().find((x) => x.id === r.recipeId);
      return recipe ? [{ ...toEntry(r), recipe: { id: recipe.id, title: recipe.title, photoUrl: recipe.photoPath, authorId: recipe.authorId } }] : [];
    }),
  profile: (id: string) => {
    const c = cooks.find((x) => x.id === id);
    return c ? { ...c, since: daysAgo(60) } : null;
  },
  logCooked: (recipeId: string, on: string, note: string, photo: string | null, cookIds: string[], groupId: string | null, rating: number | null) => {
    for (const cookId of cookIds) {
      cookedRows().push({ id: `c${Date.now().toString(36)}${cookId}`, recipeId, cookId, on, note, photo, groupId, loggedBy: demoMe.id, rating: cookId === demoMe.id ? rating : null });
      if (cookId !== demoMe.id) notify(cookId, demoMe.id, "cooked_with", recipeId, note);
    }
  },
  unlogCooked: (id: string) => {
    const row = cookedRows().find((r) => r.id === id);
    if (!row) return;
    const all = row.groupId && (row.loggedBy ?? row.cookId) === demoMe.id;
    c.__saucedCooked = cookedRows().filter((r) => (all ? r.groupId !== row.groupId : r.id !== id));
  },
  pairs: (id: string) => pg.__saucedPairs!.filter((p) => p.includes(id)).map((p) => (p[0] === id ? p[1] : p[0])),
  setPairs: (id: string, ids: string[]) => {
    pg.__saucedPairs = [...pg.__saucedPairs!.filter((p) => !p.includes(id)), ...ids.map((x) => [id, x] as [string, string])];
  },
  replies: (recipeId: string): CookReply[] =>
    rp.__saucedReplies!
      .filter((r) => r.recipeId === recipeId)
      .map(({ authorId, recipeId: _, ...r }) => ({ ...r, author: cooks.find((c) => c.id === authorId) ?? demoMe })),
  updateCooked: (id: string, meId: string, on: string, note: string, photo: string | null, want: string[], rating: number | null) => {
    const row = cookedRows().find((r) => r.id === id);
    if (!row || (row.loggedBy ?? row.cookId) !== meId) return "Only the person who logged this can edit it.";
    const groupId = row.groupId ?? (want.length > 1 ? `g${Date.now().toString(36)}` : null);
    const rows = row.groupId ? cookedRows().filter((r) => r.groupId === row.groupId) : [row];
    for (const r of rows) Object.assign(r, { on, note, photo, groupId }, r.cookId === meId ? { rating } : {});
    for (const cookId of want.filter((c) => !rows.some((r) => r.cookId === c))) {
      cookedRows().push({ id: `c${Date.now().toString(36)}${cookId}`, recipeId: row.recipeId, cookId, on, note, photo, groupId, loggedBy: meId });
      notify(cookId, meId, "cooked_with", row.recipeId, note);
    }
    c.__saucedCooked = cookedRows().filter((r) => !rows.includes(r) || want.includes(r.cookId));
    return null;
  },
  rateCooked: (id: string, rating: number | null) => {
    const row = cookedRows().find((r) => r.id === id && r.cookId === demoMe.id);
    if (row) row.rating = rating;
  },
  notices: (userId: string): Notice[] =>
    nt.__saucedNotices!
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ userId: _, actorId, recipeId, ...n }) => {
        const r = rows().find((x) => x.id === recipeId);
        return { ...n, actor: cooks.find((x) => x.id === actorId) ?? demoMe, recipe: r ? { id: r.id, title: r.title } : null };
      }),
  readNotices: (userId: string) => {
    for (const n of nt.__saucedNotices!) if (n.userId === userId) n.read = true;
  },
  addReply: (recipeId: string, cookedId: string, body: string) => {
    rp.__saucedReplies!.push({ id: `r${Date.now().toString(36)}`, cookedId, recipeId, authorId: demoMe.id, body, createdAt: new Date().toISOString() });
  },
  deleteReply: (id: string) => {
    rp.__saucedReplies = rp.__saucedReplies!.filter((r) => r.id !== id || r.authorId !== demoMe.id);
  },
  rename: (name: string) => {
    demoMe.name = name;
  },
};
