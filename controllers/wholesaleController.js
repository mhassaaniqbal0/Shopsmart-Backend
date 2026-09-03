const WholesaleProduct = require("../models/WholesaleProduct");
const { scrapeWholesaleAndStore, normalizeName } = require("../scrapers/wholesaleScraper");

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildNormalizedQueryRegex(q) {
  const normalized = normalizeName(q);
  const tokens = normalized.split(" ").filter(Boolean).slice(0, 6);
  if (!tokens.length) return null;
  const pattern = tokens.map(escapeRegex).join(".*");
  return new RegExp(pattern, "i");
}

async function listWholesaleProducts(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    const platform = String(req.query.platform || "").trim();
    const sort = String(req.query.sort || "reliability").trim();
    const includeRetailRaw = String(req.query.includeRetail || "").toLowerCase() === "true";
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
    const page = Math.max(1, Number(req.query.page || 1));
    const includeRetail = includeRetailRaw || platform === "Daraz" || platform === "Telemart";

    const filter = {};
    if (platform) filter.platform = platform;
    if (!includeRetail) {
      filter.$or = [
        { platform: { $in: ["MadeInChina", "Alibaba"] } },
        { $and: [{ platform: { $nin: ["Daraz", "Telemart"] } }, { priceText: { $ne: "" } }] },
        { moq: { $gte: 2 } },
        { "tierPrices.0": { $exists: true } },
      ];
      if (platform === "MadeInChina") {
        filter.priceText = { $ne: "" };
        filter.image = { $ne: "" };
      }
    }

    if (q) {
      const re = buildNormalizedQueryRegex(q);
      if (re) {
        const nameOr = [{ normalizedName: re }, { productName: new RegExp(escapeRegex(q), "i") }];
        if (filter.$or) {
          filter.$and = [{ $or: filter.$or }, { $or: nameOr }];
          delete filter.$or;
        } else {
          filter.$or = nameOr;
        }
      }
    }

    const sortBy =
      sort === "price"
        ? { priceMin: 1, reliabilityScore: -1 }
        : sort === "delivery"
          ? { deliveryMinDays: 1, reliabilityScore: -1 }
          : sort === "newest"
            ? { updatedAt: -1 }
            : { reliabilityScore: -1, updatedAt: -1 };

    const skip = (page - 1) * limit;
    let items = await WholesaleProduct.find(filter).sort(sortBy).skip(skip).limit(limit).lean();
    let total = await WholesaleProduct.countDocuments(filter);

    if (q && total === 0) {
      const maxPerPlatform = Math.min(20, Math.max(5, limit));
      const platforms = platform ? [platform] : ["Daraz", "Telemart", "MadeInChina", "Alibaba"];
      await scrapeWholesaleAndStore({ query: q, platforms, maxPerPlatform }).catch(() => {});
      items = await WholesaleProduct.find(filter).sort(sortBy).skip(skip).limit(limit).lean();
      total = await WholesaleProduct.countDocuments(filter);
    }

    return res.json({ items, total, page, limit });
  } catch (e) {
    return res.status(500).json({ message: e.message || "Failed to list wholesale products" });
  }
}

async function getWholesaleInsights(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    const platform = String(req.query.platform || "").trim();
    const includeRetailRaw = String(req.query.includeRetail || "").toLowerCase() === "true";
    const limit = Math.min(400, Math.max(10, Number(req.query.limit || 150)));
    const includeRetail = includeRetailRaw || platform === "Daraz" || platform === "Telemart";

    const filter = {};
    if (platform) filter.platform = platform;
    if (!includeRetail) {
      filter.$or = [
        { platform: { $in: ["MadeInChina", "Alibaba"] } },
        { $and: [{ platform: { $nin: ["Daraz", "Telemart"] } }, { priceText: { $ne: "" } }] },
        { moq: { $gte: 2 } },
        { "tierPrices.0": { $exists: true } },
      ];
      if (platform === "MadeInChina") {
        filter.priceText = { $ne: "" };
        filter.image = { $ne: "" };
      }
    }
    if (q) {
      const re = buildNormalizedQueryRegex(q);
      if (re) {
        const nameOr = [{ normalizedName: re }, { productName: new RegExp(escapeRegex(q), "i") }];
        if (filter.$or) {
          filter.$and = [{ $or: filter.$or }, { $or: nameOr }];
          delete filter.$or;
        } else {
          filter.$or = nameOr;
        }
      }
    }

    let rows = await WholesaleProduct.find(filter).sort({ reliabilityScore: -1 }).limit(limit).lean();
    if (q && rows.length === 0) {
      const maxPerPlatform = Math.min(25, Math.max(10, Math.floor(limit / 4)));
      const platforms = platform ? [platform] : ["Daraz", "Telemart", "MadeInChina", "Alibaba"];
      await scrapeWholesaleAndStore({ query: q, platforms, maxPerPlatform }).catch(() => {});
      rows = await WholesaleProduct.find(filter).sort({ reliabilityScore: -1 }).limit(limit).lean();
    }

    const groups = new Map();
    for (const r of rows) {
      const key = r.normalizedName || normalizeName(r.productName);
      const arr = groups.get(key) || [];
      arr.push(r);
      groups.set(key, arr);
    }

    const insights = [];
    for (const [key, arr] of groups.entries()) {
      let bestReliability = null;
      let fastest = null;
      let cheapest = null;

      for (const p of arr) {
        if (!bestReliability || (p.reliabilityScore ?? 0) > (bestReliability.reliabilityScore ?? 0)) bestReliability = p;
        if (typeof p.deliveryMinDays === "number") {
          if (!fastest || p.deliveryMinDays < fastest.deliveryMinDays) fastest = p;
        }
        if (typeof p.priceMin === "number") {
          if (!cheapest || p.priceMin < cheapest.priceMin) cheapest = p;
        }
      }

      insights.push({
        normalizedName: key,
        sampleName: bestReliability?.productName || cheapest?.productName || fastest?.productName || arr[0]?.productName || "",
        platforms: arr.map((p) => ({
          platform: p.platform,
          productUrl: p.productUrl,
          priceText: p.priceText,
          priceMin: p.priceMin,
          priceMax: p.priceMax,
          moq: p.moq,
          deliveryText: p.deliveryText,
          deliveryMinDays: p.deliveryMinDays,
          deliveryMaxDays: p.deliveryMaxDays,
          reliabilityScore: p.reliabilityScore,
          sellerName: p.sellerName,
          sellerVerified: p.sellerVerified,
        })),
        bestReliability: bestReliability
          ? { platform: bestReliability.platform, reliabilityScore: bestReliability.reliabilityScore, productUrl: bestReliability.productUrl }
          : null,
        fastestDelivery: fastest
          ? { platform: fastest.platform, deliveryMinDays: fastest.deliveryMinDays, productUrl: fastest.productUrl }
          : null,
        cheapest: cheapest ? { platform: cheapest.platform, priceMin: cheapest.priceMin, productUrl: cheapest.productUrl } : null,
      });
    }

    insights.sort((a, b) => (b.bestReliability?.reliabilityScore ?? 0) - (a.bestReliability?.reliabilityScore ?? 0));

    const fastestDelivery = insights
      .filter((x) => typeof x.fastestDelivery?.deliveryMinDays === "number")
      .sort((a, b) => (a.fastestDelivery.deliveryMinDays ?? 9999) - (b.fastestDelivery.deliveryMinDays ?? 9999))
      .slice(0, 10);

    return res.json({ insights, fastestDelivery });
  } catch (e) {
    return res.status(500).json({ message: e.message || "Failed to compute wholesale insights" });
  }
}

async function triggerWholesaleScrape(req, res) {
  try {
    const query = String(req.body?.query || "").trim();
    const platforms = Array.isArray(req.body?.platforms) ? req.body.platforms : undefined;
    const maxPerPlatform = Number(req.body?.maxPerPlatform || 30);

    if (!query) return res.status(400).json({ message: "query is required" });

    const result = await scrapeWholesaleAndStore({ query, platforms, maxPerPlatform });
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ message: e.message || "Wholesale scrape failed" });
  }
}

module.exports = {
  listWholesaleProducts,
  getWholesaleInsights,
  triggerWholesaleScrape,
};
