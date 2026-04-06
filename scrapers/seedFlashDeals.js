require("dotenv").config();
const connectToDatabase = require("../config/db");
const Product = require("../models/Product");
const { scrapeDarazFlashDeals } = require("./darazScraper");
const { scrapeTelemartFlashDeals } = require("./telemartScraper");

function buildProductDoc(p) {
  const price = typeof p.price === "number" ? p.price : Number(p.price) || 0;
  const previousPrice = typeof p.previousPrice === "number" ? p.previousPrice : Number(p.previousPrice) || null;
  const rating = typeof p.rating === "number" ? p.rating : Number(p.rating) || 0;

  const discount = previousPrice && previousPrice > price
      ? Math.round(((previousPrice - price) / previousPrice) * 100)
      : p.discountPercentage || 0;

  const valueScore = price > 0 && rating > 0 ? rating / price : 0;

  return {
    productName: p.productName,
    price,
    previousPrice,
    productImage: p.productImage,
    productUrl: p.productUrl,
    brand: p.brand,
    rating,
    availability: p.availability,
    platform: p.platform,
    discountPercentage: discount,
    dealType: "FLASH_SALE",
    isBestValue: !!p.isBestValue,
    valueScore,
    expiryTime: p.expiryTime || null,
  };
}

async function upsertProducts(products) {
  for (const raw of products) {
    const doc = buildProductDoc(raw);
    await Product.findOneAndUpdate(
      { productUrl: doc.productUrl },
      doc,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function run() {
  await connectToDatabase();

  console.log("Removing old dummy flash deals...");
  await Product.deleteMany({ dealType: "FLASH_SALE" });

  console.log("Starting scrape...");
  
  const [daraz, telemart] = await Promise.all([
      scrapeDarazFlashDeals().catch(e => { console.error("Daraz failed:", e); return []; }),
      scrapeTelemartFlashDeals().catch(e => { console.error("Telemart failed:", e); return []; })
  ]);

  console.log(`Scraped: ${daraz.length} Daraz deals, ${telemart.length} Telemart deals`);

  const all = [...daraz, ...telemart];

  if (!all.length) {
    console.log("No deals found.");
    process.exit(0);
  }

  await upsertProducts(all);
  console.log(`Successfully seeded ${all.length} flash deals!`);
  process.exit(0);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});