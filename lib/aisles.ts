// Which part of the shop an ingredient is in, for "Go shopping". A word list in Swedish and
// English, checked in order (first match wins), so "kokosmjölk" is a tin before "mjölk" is dairy.
// A cook's own choice for an item (moved by hand) is kept on the phone and wins over the list.

export const AISLES = [
  { id: "veg", label: "Fruit & veg" },
  { id: "meat", label: "Meat & fish" },
  { id: "dairy", label: "Dairy & eggs" },
  { id: "bread", label: "Bread" },
  { id: "pantry", label: "Pantry" },
  { id: "spice", label: "Oils, sauces & spices" },
  { id: "tins", label: "Tins & jars" },
  { id: "frozen", label: "Frozen" },
  { id: "drinks", label: "Drinks" },
  { id: "home", label: "Household" },
  { id: "other", label: "Other" },
] as const;

export type Aisle = (typeof AISLES)[number]["id"];

const RULES: [Aisle, string[]][] = [
  ["veg", ["eggplant"]],
  // Before anything they contain: "kokosmjölk", "jordnötssmör", "fryst spenat", "krossade tomater".
  ["frozen", ["fryst", "frysta", "frozen", "glass", "ice cream", "ärtor fryst"]],
  [
    "tins",
    [
      "kokosmjölk", "coconut milk", "coconut cream", "kokosgrädde", "krossade tomater", "krossad tomat", "chopped tomatoes",
      "passata", "tomatpuré", "tomato paste", "tomato purée", "konserv", "burk", "tinned", "canned", "kikärt", "chickpea",
      "vita bönor", "svarta bönor", "kidneybön", "bönor", "beans", "linser", "lentils", "majs", "sweetcorn", "oliver", "olives",
      "kapris", "capers", "pickles", "inlagd", "saltgurka", "sylt", "jam", "marmelad", "honung", "honey", "jordnötssmör",
      "peanut butter", "tonfisk", "tuna", "ansjovis", "anchov", "sardin", "kronärtskocka", "soltorkade", "sun-dried",
    ],
  ],
  [
    "spice",
    [
      "olja", "oil", "vinäger", "vinegar", "soja", "soy", "fisksås", "fish sauce", "ostronsås", "oyster sauce", "senap", "mustard",
      "ketchup", "majonnäs", "mayo", "sriracha", "sambal", "tabasco", "worcester", "miso", "tahini", "pesto", "buljong", "fond",
      "stock", "bouillon", "salt", "peppar", "black pepper", "white pepper", "peppercorn", "sås", "sauce", "paprikapulver", "paprika powder", "spiskummin", "cumin", "kanel", "cinnamon",
      "kardemumma", "cardamom", "muskot", "nutmeg", "gurkmeja", "turmeric", "curry", "chiliflakes", "chili flakes", "chilipulver",
      "cayenne", "chilli flakes", "chilliflakes", "chili powder", "chilli powder", "oregano", "timjan", "thyme", "rosmarin torkad", "lagerblad", "bay lea", "kryddnejlika", "clove", "ingefära malen",
      "vanilj", "vanilla", "garam masala", "koriander malen", "ground coriander", "fänkålsfrö", "senapsfrö", "kryddpeppar", "allspice",
      "saffran", "saffron", "malen", "sirap", "syrup",
    ],
  ],
  [
    "dairy",
    [
      "mjölk", "milk", "grädde", "cream", "crème fraiche", "creme fraiche", "gräddfil", "filmjölk", "yoghurt", "yogurt", "kvarg",
      "quark", "smör", "butter", " ost", "ost ", "cheese", "parmesan", "mozzarella", "fetaost", "feta", "halloumi", "ricotta", "mascarpone",
      "cheddar", "ägg", " egg", "keso", "cottage", "kesella", "margarin", "bregott",
    ],
  ],
  [
    "meat",
    [
      "kött", "meat", "färs", "mince", "kyckling", "chicken", "fläsk", "pork", "nötkött", "nötfärs", "beef", "biff", "entrecote", "oxfilé", "lamm",
      "lamb", "bacon", "sidfläsk", "skinka", " ham", "korv", "sausage", "chorizo", "salami", "prosciutto", "pancetta", "kalkon",
      "turkey", "anka", "duck", "lax", "salmon", "torsk", "cod", "fisk", "fish", "räk", "prawn", "shrimp", "musslor", "mussel",
      "kräft", "crab", "wings", "vingar", "thighs", "lårfilé", "bröstfilé", "krabba", "sej", "kolja", "rödspätta", "tofu", "halloumi",
    ],
  ],
  [
    "pantry",
    [
      "mjöl", "flour", "socker", "sugar", "florsocker", "bakpulver", "baking powder", "bikarbonat", "baking soda", "jäst", "yeast",
      "pasta", "spaghetti", "penne", "tagliatelle", "lasagne", "nudlar", "noodle", "ris", "rice", "couscous", "bulgur", "quinoa",
      "havre", "oat", "müsli", "granola", "flingor", "cornflakes", "ströbröd", "panko", "breadcrumb", "majsstärkelse", "maizena",
      "cornstarch", "potatismjöl", "kakao", "cocoa", "choklad", "chocolate", "nötter", "nuts", "mandel", "almond", "cashew",
      "valnöt", "walnut", "hasselnöt", "hazelnut", "pinjenöt", "pine nut", "sesamfrö", "sesame", "russin", "raisin", "dadlar",
      "dates", "kokosflingor", "desiccated", "gelatin", "pärlsocker", "sirap",
    ],
  ],
  [
    "bread",
    ["bröd", "bread", "baguette", "tortilla", "pita", "naan", "fralla", "frallor", "bulle", "bullar", " bun", "croissant", "knäcke", "wrap"],
  ],
  ["drinks", [" vin ", "vitt vin", "rött vin", "wine", " öl ", "beer", "juice", "läsk", "soda", "cider", "kaffe", "coffee", " te ", " tea", "vatten", "water", " rom ", "vodka", "whisky"]],
  [
    "home",
    ["toalettpapper", "toilet", "hushållspapper", "kitchen roll", "diskmedel", "washing", "tvättmedel", "soppåse", "bin bag", "folie", "foil", "bakplåtspapper", "baking paper", "plastfolie", "cling", "tvål", "soap", "tandkräm", "toothpaste", "schampo", "shampoo", "batteri", "batter"],
  ],
  [
    "veg",
    [
      "lök", "onion", "vitlök", "garlic", "schalott", "shallot", "purjo", "leek", "potatis", "potato", "morot", "morötter", "carrot",
      "tomat", "tomato", "gurka", "cucumber", "paprika", "pepper", "chili", "sallad", "lettuce", "rucola", "rocket", "spenat",
      "spinach", "grönkål", "kale", "kål", "cabbage", "broccoli", "blomkål", "cauliflower", "zucchini", "squash", "aubergine",
      "svamp", "champinjon", "mushroom", "kantarell", "selleri", "celery", "fänkål", "fennel", "rödbet", "beetroot", "palsternacka",
      "parsnip", "rotselleri", "sötpotatis", "sweet potato", "ingefära", "ginger", "citron", "lemon", "lime", "apelsin", "orange",
      "äpple", "apple", "päron", "pear", "banan", "banana", "bär", "berr", "jordgubb", "strawberr", "hallon", "raspberr", "blåbär",
      "avokado", "avocado", "mango", "ananas", "pineapple", "druv", "grape", "persilja", "parsley", "koriander", "coriander",
      "cilantro", "basilika", "basil", "dill", "gräslök", "chive", "mynta", "mint", "rosmarin", "rosemary", "salvia", "sage",
      "timjan färsk", "vårlök", "salladslök", "spring onion", "scallion", "majskolv", "sparris", "asparagus", "ärtor", "peas",
      "haricots", "bönor färska", "rädis", "radish", "pumpa", "pumpkin", "groddar", "sprouts",
    ],
  ],
];

/** The aisle for an ingredient name ("gul lök, tunt skivad" → Fruit & veg), "other" if unknown. */
export function aisleOf(name: string): Aisle {
  const n = ` ${name.toLowerCase()} `;
  for (const [aisle, words] of RULES) if (words.some((w) => n.includes(w))) return aisle;
  return "other";
}

/** The key a cook's own aisle choice is saved under: the name, without amounts or how it's cut. */
export const aisleKey = (name: string) => name.toLowerCase().split(",")[0].trim();
