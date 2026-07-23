import type { Constraints, DiscoverItem } from "../api/types";

function overlapCount(a: string[] | undefined, b: string[] | undefined): number {
  if (!a?.length || !b?.length) return 0;
  const bSet = new Set(b.map((v) => v.toLowerCase()));
  return a.filter((v) => bSet.has(v.toLowerCase())).length;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);
}

// Naive singular/plural + common-suffix folding — "shirts"/"shirt",
// "sarees"/"saree", "dresses"/"dress" should all be treated as the same
// word for matching purposes. Not a real stemmer (no attempt at
// irregulars), just enough to stop exact-string matching from treating
// trivially-related words as completely unrelated, which was the actual
// complaint: a search for "shirt" scoring zero against a profile literally
// named "...Shirts".
function stem(word: string): string {
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y"; // categories -> category
  if (word.endsWith("es") && word.length > 4) return word.slice(0, -2); // sarees -> saree, dresses -> dress
  if (word.endsWith("s") && word.length > 3) return word.slice(0, -1); // shirts -> shirt
  return word;
}

// How similar two individual words are, 0-1. Exact/stemmed match scores
// highest; a shared prefix (catches typos and partial words like "sare"
// typed while still finishing "saree") scores partial credit; otherwise 0.
function wordSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const sa = stem(a);
  const sb = stem(b);
  if (sa === sb) return 0.9;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return 0.6;
  return 0;
}

// Best-match score of a single sentence token against a profile's bag of
// words — takes the strongest match rather than summing every pairwise
// comparison, so one clearly-matched word doesn't get diluted by comparing
// it against every unrelated word in the bag too.
function bestMatch(token: string, bag: string[]): number {
  let best = 0;
  for (const word of bag) {
    const sim = wordSimilarity(token, word);
    if (sim > best) best = sim;
    if (best === 1) break;
  }
  return best;
}

// Flattens everything a profile is actually "about" into one bag of words —
// name, articleType, brand, fabric, color (stripping the trailing _hexcode),
// occasion. This is what makes free-text like "blue highlander shirts"
// actually find "Blue HIGHLANDER Shirts": the structured patch alone often
// can't (Groq's articleType guess is a slugified search phrase like
// "blue-highlander-shirts", which will never exactly equal the profile's
// real articleType "shirts", and brand names mentioned in passing aren't
// always extracted as a structured field) — matching against the raw
// sentence's words directly is a second, independent signal that catches
// what field-overlap scoring alone misses.
function profileTokens(item: DiscoverItem): string[] {
  const c = item.constraints;
  const words = [
    item.name,
    c.category.articleType,
    ...(c.brand?.include ?? []),
    ...(c.fabric?.include ?? []),
    ...(c.color?.include ?? []).map((v) => v.split("_")[0]),
    c.occasion ?? "",
  ].join(" ");
  return tokenize(words);
}

// Field-overlap scoring between a compiled NL patch and a stored public
// profile's constraints — a simple descending-sort signal, not a
// normalized 0-1 score. Pure/synchronous, no extension APIs, matches the
// adapter layer's existing convention of small single-purpose functions.
export function scoreProfileAgainstPatch(
  profile: DiscoverItem,
  patch: Partial<Constraints>,
  rawSentence?: string
): number {
  const c = profile.constraints;
  let score = 0;

  if (patch.category?.articleType && patch.category.articleType.toLowerCase() === c.category.articleType?.toLowerCase()) {
    score += 10;
  }
  if (patch.occasion && patch.occasion.toLowerCase() === c.occasion?.toLowerCase()) {
    score += 3;
  }

  score += overlapCount(patch.brand?.include, c.brand?.include) * 2;
  score += overlapCount(patch.fabric?.include, c.fabric?.include) * 2;
  score += overlapCount(patch.color?.include, c.color?.include) * 2;
  score += overlapCount(patch.size?.include, c.size?.include) * 2;
  score += overlapCount(patch.sleeve?.include, c.sleeve?.include) * 2;
  score += overlapCount(patch.neck?.include, c.neck?.include) * 2;

  if (patch.price && (patch.price.min || patch.price.max)) {
    const patchMin = patch.price.min ?? 0;
    const patchMax = patch.price.max ?? Infinity;
    const overlaps = c.price.max >= patchMin && c.price.min <= patchMax;
    if (overlaps) score += 2;
  }

  if (rawSentence) {
    const sentenceTokens = tokenize(rawSentence);
    const bag = profileTokens(profile);
    const fuzzyScore = sentenceTokens.reduce((sum, t) => sum + bestMatch(t, bag), 0);
    // Weighted lower per-match than a validated field overlap (2), but with
    // enough tokens (brand + article type + color, as in "blue highlander
    // shirts") it reliably surfaces the right profile even when none of
    // those words made it into the structured patch, and partial/stemmed
    // matches (shirt/shirts, saree/sarees) now count instead of scoring
    // zero just because the strings aren't byte-for-byte identical.
    score += fuzzyScore * 1.5;
  }

  return score;
}

// Ranks the feed by similarity to the patch, descending. An empty/failed
// compile (no recognizable fields) falls back to the unranked feed rather
// than filtering everything out.
export function rankDiscoverFeed(feed: DiscoverItem[], patch: Partial<Constraints>, rawSentence?: string): DiscoverItem[] {
  const hasAnyField = Object.keys(patch).length > 0;
  const hasSentence = !!rawSentence?.trim();
  if (!hasAnyField && !hasSentence) return feed;

  const scored = feed.map((item) => ({ item, score: scoreProfileAgainstPatch(item, patch, rawSentence) }));
  const anyMatch = scored.some((s) => s.score > 0);
  if (!anyMatch) return feed;

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.item);
}
