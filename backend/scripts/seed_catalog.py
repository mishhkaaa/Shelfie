"""Generates SYNTHETIC product catalog data (master prompt Part 2, Section 4.2).

This is legitimate, necessary reference data for computing real counts and
diffs in the coverage advisor / dry-run diff features — it is NOT real
Myntra inventory and must never be presented as such anywhere in the UI.

Vocabulary (article types, brands, colors, fabrics) intentionally reuses the
exact values seen during real-browser testing (LULU & SKY, StyleCast,
Fabindia, Nike, Cotton, Black_36454f, Grey_808080, etc. — see
BACKEND_BUILD_LOG.md) so coverage/diff numbers feel grounded in this app's
actual data shapes rather than arbitrary.

Run with: .venv\\Scripts\\python -m scripts.seed_catalog
"""

import itertools
import random
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text  # noqa: E402

from app.db import SessionLocal, engine  # noqa: E402
from app.models import Base, Product  # noqa: E402

random.seed(42)

# Colors use the "Name_hexsuffix" encoding actually observed from real
# Myntra URLs during testing (Black_36454f, Grey_808080) — the rest follow
# the same format for consistency, they are not scraped/verified against
# Myntra's real facet values.
COLORS = [
    "Black_36454f",
    "White_ffffff",
    "Grey_808080",
    "Blue_0000ff",
    "Red_ff0000",
    "Pink_ffc0cb",
    "Green_008000",
    "Brown_a52a2a",
    "Beige_f5f5dc",
    "Yellow_ffff00",
]

APPAREL_SIZES = ["XS", "S", "M", "L", "XL", "XXL"]
SHOE_SIZES = ["6", "7", "8", "9", "10", "11"]

CATEGORIES = {
    "kurtas": {
        "brands": ["Fabindia", "W", "StyleCast", "Suo", "Trendyol", "bebe"],
        "fabrics": ["Cotton", "Silk", "Rayon", "Linen"],
        "sleeves": ["Full Sleeve", "Half Sleeve", "Three-Quarter Sleeve", "Sleeveless"],
        "necks": ["Round Neck", "V-Neck", "Mandarin Collar"],
        "occasions": ["Casual", "Formal", "Festive"],
        "sizes": APPAREL_SIZES,
        "price_range": (400, 3500),
    },
    "dresses-for-birthday-women": {
        "brands": ["LULU & SKY", "StyleCast", "StyleCast x Revolte", "DressBerry", "ZYVRA"],
        "fabrics": ["Cotton", "Polyester", "Satin"],
        "sleeves": ["Sleeveless", "Half Sleeve", "Full Sleeve"],
        "necks": ["Halter Neck", "Round Neck", "Off-Shoulder", "V-Neck"],
        "occasions": ["Party", "Wedding", "Casual"],
        "sizes": APPAREL_SIZES,
        "price_range": (600, 6000),
    },
    "birthday-dresses-for-women": {
        "brands": ["LULU & SKY", "StyleCast", "JC Mode", "PELLE LUXUR", "SHOWOFFFF"],
        "fabrics": ["Cotton", "Polyester", "Satin", "Velvet"],
        "sleeves": ["Sleeveless", "Half Sleeve", "Full Sleeve"],
        "necks": ["Halter Neck", "Round Neck", "Off-Shoulder"],
        "occasions": ["Party", "Wedding"],
        "sizes": APPAREL_SIZES,
        "price_range": (600, 6000),
    },
    "nike-shoes": {
        "brands": ["Nike"],
        "fabrics": [None],
        "sleeves": [None],
        "necks": [None],
        "occasions": [None],
        "sizes": SHOE_SIZES,
        "price_range": (1500, 13000),
    },
    "sneakers": {
        "brands": ["Nike", "Puma", "Adidas", "StyleCast"],
        "fabrics": [None],
        "sleeves": [None],
        "necks": [None],
        "occasions": [None],
        "sizes": SHOE_SIZES,
        "price_range": (1200, 9000),
    },
}

ROWS_PER_CATEGORY = 1200


def generate_products() -> list[dict]:
    rows: list[dict] = []
    for article_type, attrs in CATEGORIES.items():
        combos = list(
            itertools.product(attrs["brands"], COLORS, attrs["fabrics"], attrs["sleeves"], attrs["necks"], attrs["occasions"])
        )
        # Shoe categories have very few attribute combos (no fabric/sleeve/
        # neck/occasion variation) — sample with replacement so every
        # category reaches a reasonable row count instead of capping at
        # however many unique combos happen to exist. Different price/size
        # per row still makes each a distinct product, same as real
        # multi-SKU catalogs.
        selected = random.choices(combos, k=ROWS_PER_CATEGORY) if len(combos) < ROWS_PER_CATEGORY else random.sample(
            combos, k=ROWS_PER_CATEGORY
        )
        for brand, color, fabric, sleeve, neck, occasion in selected:
            price_min, price_max = attrs["price_range"]
            price = round(random.uniform(price_min, price_max), 2)
            size_pool = attrs["sizes"]
            sizes = sorted(random.sample(size_pool, k=random.randint(2, min(4, len(size_pool)))))
            rows.append(
                {
                    "product_id": f"product_{uuid.uuid4().hex}",
                    "article_type": article_type,
                    "brand": brand,
                    "fabric": fabric,
                    "price": price,
                    "primary_color": color,
                    "sleeve": sleeve,
                    "neck": neck,
                    "occasion": occasion,
                    "sizes": sizes,
                }
            )
    return rows


def main() -> None:
    Base.metadata.create_all(bind=engine, tables=[Product.__table__])

    rows = generate_products()

    db = SessionLocal()
    try:
        existing = db.execute(text("SELECT COUNT(*) FROM products")).scalar() or 0
        if existing > 0:
            print(f"products table already has {existing} rows — clearing before reseeding.")
            db.execute(text("DELETE FROM products"))
            db.commit()

        db.bulk_insert_mappings(Product, rows)
        db.commit()
        print(f"Seeded {len(rows)} SYNTHETIC products across {len(CATEGORIES)} article types.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
