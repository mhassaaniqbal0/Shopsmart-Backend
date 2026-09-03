const MasterProduct = require("../models/MasterProduct");
const ProductListing = require("../models/ProductListing");
const Product = require("../models/Product");
const User = require("../models/user");
const MasterProductPriceSnapshot = require("../models/MasterProductPriceSnapshot");
const { aggregateProductByQuery, tokenize } = require("../scrapers/productAggregator");

function pickImage(master, offers) {
  const imgs = [];
  if (Array.isArray(master?.images)) imgs.push(...master.images);
  for (const o of offers) if (o.image) imgs.push(o.image);
  return imgs.find(Boolean) || "";
}

function offerScore(o, priceMin, maxReviews, bestDelivery) {
  const price = typeof o.priceMin === "number" ? o.priceMin : null;
  const rating = typeof o.rating === "number" ? o.rating : 0;
  const reviews = typeof o.reviewsCount === "number" ? o.reviewsCount : 0;
  const delivery = typeof o.deliveryMinDays === "number" ? o.deliveryMinDays : null;

  const priceScore = priceMin && price ? Math.max(0, Math.min(1, priceMin / price)) : 0;
  const ratingScore = Math.max(0, Math.min(1, rating / 5));
  const reviewsScore = maxReviews ? Math.max(0, Math.min(1, reviews / maxReviews)) : 0;
  const deliveryScore = bestDelivery && delivery ? Math.max(0, Math.min(1, bestDelivery / delivery)) : 0;

  return priceScore * 0.45 + ratingScore * 0.25 + reviewsScore * 0.2 + deliveryScore * 0.1;
}

function computeRecommendations(offers) {
  const priced = offers.filter((o) => typeof o.priceMin === "number" && o.priceMin > 0);
  const priceMin = priced.length ? Math.min(...priced.map((o) => o.priceMin)) : null;
  const maxReviews = offers.reduce((m, o) => Math.max(m, typeof o.reviewsCount === "number" ? o.reviewsCount : 0), 0);
  const bestDelivery = offers
    .map((o) => (typeof o.deliveryMinDays === "number" ? o.deliveryMinDays : null))
    .filter((x) => typeof x === "number")
    .sort((a, b) => a - b)[0];

  let bestValue = null;
  let bestValueScore = -1;

  for (const o of offers) {
    const s = offerScore(o, priceMin, maxReviews, bestDelivery);
    if (s > bestValueScore) {
      bestValueScore = s;
      bestValue = o;
    }
  }

  const bestSeller = offers
    .slice()
    .sort((a, b) => {
      const ar = typeof a.reviewsCount === "number" ? a.reviewsCount : -1;
      const br = typeof b.reviewsCount === "number" ? b.reviewsCount : -1;
      if (br !== ar) return br - ar;
      const arat = typeof a.rating === "number" ? a.rating : -1;
      const brat = typeof b.rating === "number" ? b.rating : -1;
      return brat - arat;
    })[0];

  const fastestDelivery = offers
    .filter((o) => typeof o.deliveryMinDays === "number")
    .slice()
    .sort((a, b) => (a.deliveryMinDays ?? 9999) - (b.deliveryMinDays ?? 9999))[0];

  return {
    bestValue: bestValue ? { platform: bestValue.platform, listingUrl: bestValue.listingUrl } : null,
    bestSeller: bestSeller ? { platform: bestSeller.platform, listingUrl: bestSeller.listingUrl } : null,
    fastestDelivery: fastestDelivery ? { platform: fastestDelivery.platform, listingUrl: fastestDelivery.listingUrl } : null,
  };
}

function mapProductDocToRec(p) {
  if (!p) return null;
  const title = String(p.productName || "").trim();
  if (!title) return null;
  const priceText = typeof p.price === "number" ? `Rs. ${p.price.toLocaleString("en-PK")}` : "";
  return {
    _id: p._id,
    title,
    image: String(p.productImage || ""),
    priceText,
    rating: typeof p.rating === "number" ? p.rating : null,
    platform: String(p.platform || ""),
    listingUrl: String(p.productUrl || ""),
  };
}

function mapMasterToRec(master, bestOffer) {
  if (!master) return null;
  const title = String(master.title || "").trim();
  if (!title) return null;
  const image = Array.isArray(master.images) ? master.images.find(Boolean) || "" : "";
  return {
    _id: master._id,
    title,
    image,
    priceText: String(bestOffer?.priceText || ""),
    rating: typeof bestOffer?.rating === "number" ? bestOffer.rating : null,
    platform: String(bestOffer?.platform || ""),
    listingUrl: String(bestOffer?.listingUrl || ""),
  };
}

function uniqBy(items, keyFn) {
  const out = [];
  const seen = new Set();
  for (const it of items) {
    const key = keyFn(it);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

async function getPriceHistory(masterProductId, days) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - days);
  start.setHours(0, 0, 0, 0);

  const rows = await MasterProductPriceSnapshot.find({
    masterProductId,
    source: "synthetic",
    capturedAt: { $gte: start, $lte: now },
  })
    .sort({ capturedAt: 1 })
    .lean();

  return rows.map((r) => ({
    date: new Date(r.capturedAt).toISOString().slice(0, 10),
    currency: r.currency,
    priceMin: r.priceMin,
    priceMax: r.priceMax,
    source: r.source,
  }));
}

async function getSimilarMasterProducts(master) {
  const keywords = Array.isArray(master.keywords) && master.keywords.length ? master.keywords : tokenize(master.title || "");
  const main = new Set(keywords.slice(0, 10));

  const candidates = await MasterProduct.find({ _id: { $ne: master._id }, category: master.category })
    .sort({ updatedAt: -1 })
    .limit(40)
    .lean();

  return candidates
    .map((c) => {
      const k = Array.isArray(c.keywords) ? c.keywords : tokenize(c.title || "");
      const overlap = k.reduce((acc, x) => acc + (main.has(x) ? 1 : 0), 0);
      return { c, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 12)
    .map(({ c }) => c);
}

async function getBestOffersByMasterIds(masterIds) {
  if (!Array.isArray(masterIds) || masterIds.length === 0) return new Map();
  const rows = await ProductListing.find({ masterProductId: { $in: masterIds } })
    .select("masterProductId platform listingUrl priceText priceMin rating reviewsCount")
    .sort({ priceMin: 1, rating: -1, reviewsCount: -1, updatedAt: -1 })
    .limit(400)
    .lean();

  const best = new Map();
  for (const r of rows) {
    const id = String(r.masterProductId);
    if (!best.has(id)) best.set(id, r);
  }
  return best;
}

async function getSimilarProducts(master) {
  const masters = await getSimilarMasterProducts(master);
  const bestById = await getBestOffersByMasterIds(masters.map((m) => m._id));
  const recs = masters
    .map((m) => mapMasterToRec(m, bestById.get(String(m._id))))
    .filter(Boolean);

  if (recs.length >= 8) return recs.slice(0, 8);

  const title = String(master.title || "").trim();
  const tokens = tokenize(title).slice(0, 3);
  const re = tokens.length ? new RegExp(tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i") : null;
  const more = re
    ? await Product.find({ productName: re }).sort({ rating: -1, discountPercentage: -1, updatedAt: -1 }).limit(12).lean()
    : await Product.find({}).sort({ rating: -1, discountPercentage: -1, updatedAt: -1 }).limit(12).lean();

  const moreRecs = more.map(mapProductDocToRec).filter(Boolean);
  return uniqBy([...recs, ...moreRecs], (x) => `${x.title}|${x.platform}`).slice(0, 10);
}

async function getPersonalizedRecommendations({ userId, master, limit = 10 }) {
  const fallback = await Product.find({}).sort({ isBestValue: -1, valueScore: -1, discountPercentage: -1, rating: -1, updatedAt: -1 }).limit(20).lean();
  const fallbackRecs = fallback.map(mapProductDocToRec).filter(Boolean);

  if (!userId) return uniqBy(fallbackRecs, (x) => `${x.title}|${x.platform}`).slice(0, limit);

  const user = await User.findById(userId).populate("wishlist").populate("recentlyViewed.productId").lean().catch(() => null);
  const wishlist = Array.isArray(user?.wishlist) ? user.wishlist : [];
  const recent = Array.isArray(user?.recentlyViewed) ? user.recentlyViewed : [];

  const recentProducts = recent
    .slice()
    .sort((a, b) => new Date(b.viewedAt || 0).getTime() - new Date(a.viewedAt || 0).getTime())
    .map((x) => x.productId)
    .filter(Boolean);

  const recs = [...wishlist, ...recentProducts].map(mapProductDocToRec).filter(Boolean);
  if (recs.length >= limit) return uniqBy(recs, (x) => `${x.title}|${x.platform}`).slice(0, limit);

  const brand = String(master?.brand || "").trim();
  const byBrand = brand ? await Product.find({ brand: new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).limit(15).lean() : [];
  const byBrandRecs = byBrand.map(mapProductDocToRec).filter(Boolean);
  return uniqBy([...recs, ...byBrandRecs, ...fallbackRecs], (x) => `${x.title}|${x.platform}`).slice(0, limit);
}

async function getRegionalTrends({ region, limit = 10 }) {
  const out = await Product.find({}).sort({ discountPercentage: -1, rating: -1, updatedAt: -1 }).limit(Math.max(limit, 18)).lean();
  const recs = out.map(mapProductDocToRec).filter(Boolean);
  if (recs.length >= limit) return recs.slice(0, limit);

  const masters = await MasterProduct.find({}).sort({ updatedAt: -1 }).limit(20).lean();
  const bestById = await getBestOffersByMasterIds(masters.map((m) => m._id));
  const more = masters.map((m) => mapMasterToRec(m, bestById.get(String(m._id)))).filter(Boolean);
  return uniqBy([...recs, ...more], (x) => `${x.title}|${x.platform}`).slice(0, limit);
}

async function getAlsoBought({ master, excludeTitles = new Set(), limit = 10 }) {
  const brand = String(master?.brand || "").trim();
  const q = String(master?.title || "").trim();
  const tokens = tokenize(q).slice(0, 3);
  const reTokens = tokens.length ? new RegExp(tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i") : null;

  const or = [];
  if (brand) or.push({ brand: new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") });
  if (reTokens) or.push({ productName: reTokens });

  const rows = or.length
    ? await Product.find({ $or: or }).sort({ updatedAt: -1, rating: -1 }).limit(30).lean()
    : await Product.find({}).sort({ updatedAt: -1, rating: -1 }).limit(30).lean();

  const recs = rows
    .map(mapProductDocToRec)
    .filter(Boolean)
    .filter((x) => !excludeTitles.has(x.title));

  if (recs.length >= limit) return uniqBy(recs, (x) => `${x.title}|${x.platform}`).slice(0, limit);

  const similar = await getSimilarProducts(master);
  const similarRecs = Array.isArray(similar) ? similar : [];
  const merged = uniqBy([...recs, ...similarRecs], (x) => `${x.title}|${x.platform}`).slice(0, limit);
  if (merged.length) return merged;

  const fallback = await Product.find({})
    .sort({ discountPercentage: -1, rating: -1, updatedAt: -1 })
    .limit(30)
    .lean();
  const fallbackRecs = fallback
    .map(mapProductDocToRec)
    .filter(Boolean)
    .filter((x) => !excludeTitles.has(x.title));
  return uniqBy(fallbackRecs, (x) => `${x.title}|${x.platform}`).slice(0, limit);
}

async function getProductDetail(req, res) {
  try {
    const q = String(req.query.q || req.query.query || "").trim();
    const id = String(req.query.id || "").trim();
    const maxPerPlatform = Math.min(20, Math.max(3, Number(req.query.max || 10)));
    const force = String(req.query.force || "").toLowerCase() === "true";
    const userId = String(req.query.userId || "").trim();
    const region = String(req.query.region || "Rawalpindi").trim();
    const fastMode = String(req.query.fast || "").toLowerCase() !== "false";

    let master = null;
    if (id) master = await MasterProduct.findById(id);
    else if (q) master = await aggregateProductByQuery({ query: q, maxPerPlatform, force, fastMode });
    else return res.status(400).json({ message: "q or id is required" });

    if (!master) return res.status(404).json({ message: "Product not found" });

    const offers = await ProductListing.find({ masterProductId: master._id })
      .sort({ priceMin: 1, rating: -1, reviewsCount: -1, updatedAt: -1 })
      .limit(60)
      .lean();

    const recommendations = computeRecommendations(offers);

    const labels = new Map();
    if (recommendations.bestValue) labels.set(`${recommendations.bestValue.platform}|${recommendations.bestValue.listingUrl}`, "Best Value");
    if (recommendations.bestSeller) labels.set(`${recommendations.bestSeller.platform}|${recommendations.bestSeller.listingUrl}`, "Best Seller");
    if (recommendations.fastestDelivery)
      labels.set(`${recommendations.fastestDelivery.platform}|${recommendations.fastestDelivery.listingUrl}`, "Fastest Delivery");

    const offersOut = offers.map((o) => ({
      platform: o.platform,
      title: o.title,
      listingUrl: o.listingUrl,
      image: o.image,
      currency: o.currency,
      priceMin: o.priceMin,
      priceMax: o.priceMax,
      priceText: o.priceText,
      rating: o.rating,
      reviewsCount: o.reviewsCount,
      sellerName: o.sellerName,
      sellerRating: o.sellerRating,
      deliveryText: o.deliveryText,
      deliveryMinDays: o.deliveryMinDays,
      deliveryMaxDays: o.deliveryMaxDays,
      availability: o.availability,
      label: labels.get(`${o.platform}|${o.listingUrl}`) || "",
      updatedAt: o.updatedAt,
    }));

    let totalReviews = 0;
    let weightedRatingSum = 0;
    let ratingCount = 0;
    let ratingSum = 0;
    for (const o of offers) {
      const r = typeof o.rating === "number" ? o.rating : null;
      const c = typeof o.reviewsCount === "number" ? o.reviewsCount : 0;
      if (c > 0 && typeof r === "number") {
        totalReviews += c;
        weightedRatingSum += r * c;
      }
      if (typeof r === "number") {
        ratingCount += 1;
        ratingSum += r;
      }
    }
    const avgRating = totalReviews > 0 ? Number((weightedRatingSum / totalReviews).toFixed(2)) : ratingCount ? Number((ratingSum / ratingCount).toFixed(2)) : null;

    const priceHistory = {
      days30: await getPriceHistory(master._id, 30),
      days60: await getPriceHistory(master._id, 60),
      days90: await getPriceHistory(master._id, 90),
    };

    const similarProducts = await getSimilarProducts(master);
    const personalizedRecommendations = await getPersonalizedRecommendations({ userId, master, limit: 10 });
    const regionalTrends = await getRegionalTrends({ region, limit: 10 });
    const excludeTitlesForAlsoBought = new Set([String(master.title || "").trim()].filter(Boolean));
    const alsoBought = await getAlsoBought({ master, excludeTitles: excludeTitlesForAlsoBought, limit: 10 });

    return res.json({
      masterProduct: {
        _id: master._id,
        title: master.title,
        category: master.category,
        brand: master.brand,
        model: master.model,
        specs: master.specs,
        image: pickImage(master, offers),
        images: Array.isArray(master.images) ? master.images : [],
        lastAggregatedAt: master.lastAggregatedAt,
        updatedAt: master.updatedAt,
      },
      offers: offersOut,
      reviewSummary: {
        avgRating,
        totalReviews,
      },
      recommendations,
      priceHistory,
      similarProducts,
      personalizedRecommendations,
      regionalTrends,
      alsoBought,
    });
  } catch (e) {
    return res.status(500).json({ message: e.message || "Failed to load product detail" });
  }
}

module.exports = {
  getProductDetail,
};
