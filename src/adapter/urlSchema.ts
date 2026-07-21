import type { Constraints } from "../api/types";

// Helper to extract the core path, e.g., "men-sneakers" from /men-sneakers
function parseCategory(pathname: string): { articleType: string; gender?: string } {
  const parts = pathname.split("/").filter(Boolean);
  const slug = parts[0] || "";
  return {
    articleType: slug, // we'll use the whole slug as articleType for now
  };
}

function parseFilterParam(fStr: string, keyName: string): string[] {
  if (!fStr) return [];
  
  // Myntra typically separates different filter categories with "::" or sometimes just "&" if they are different URL params.
  // Within the `f=` param, it's usually `f=Brand:Nike,Puma::Categories:Bra`
  // So we decode it first, then split by "::"
  const decodedF = decodeURIComponent(fStr.replace(/\+/g, " "));
  const parts = decodedF.split("::");
  
  for (const part of parts) {
    if (part.startsWith(`${keyName}:`)) {
      const valuesStr = part.substring(keyName.length + 1);
      return valuesStr.split(",").filter(Boolean);
    }
  }
  
  return [];
}

export function parseUrlToConstraints(url: string): Constraints {
  const u = new URL(url);
  const params = u.searchParams;
  
  const f = params.get("f") || "";
  // const _rf = params.get("rf") || "";

  return {
    category: parseCategory(u.pathname),
    price: { min: 0, max: 0 }, // We will hook up price via 'rf' later when we know the exact format
    brand: { 
      include: parseFilterParam(f, "Brand"), 
      exclude: [] 
    },
    fabric: { include: parseFilterParam(f, "Fabric") },
    sleeve: { include: parseFilterParam(f, "Sleeve") },
    size: { include: parseFilterParam(f, "Size") },
    color: { 
      include: parseFilterParam(f, "Color"), 
      exclude: [] 
    },
    // Adding sort just as an example of pulling top-level params
    // sort: params.get("sort") || undefined, 
  };
}

export function buildUrlFromConstraints(c: Constraints): string {
  const base = `https://www.myntra.com/${c.category.articleType}`;
  const params = new URLSearchParams();
  
  const fParts = [];
  if (c.brand.include.length) fParts.push(`Brand:${c.brand.include.join(",")}`);
  if (c.fabric.include.length) fParts.push(`Fabric:${c.fabric.include.join(",")}`);
  if (c.size.include.length) fParts.push(`Size:${c.size.include.join(",")}`);
  if (c.color.include.length) fParts.push(`Color:${c.color.include.join(",")}`);
  
  if (fParts.length > 0) {
    // Myntra uses :: to separate different filter keys
    params.set("f", fParts.join("::"));
  }

  return `${base}?${params.toString()}`;
}

export function constraintsEqual(a: Constraints, b: Constraints): boolean {
  return JSON.stringify(a) === JSON.stringify(b); // Simple deep equality for MVP
}
