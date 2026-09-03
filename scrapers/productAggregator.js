const axios = require("axios");
const puppeteer = require("puppeteer");
const MasterProduct = require("../models/MasterProduct");
const ProductListing = require("../models/ProductListing");
const ProductListingSnapshot = require("../models/ProductListingSnapshot");
const MasterProductPriceSnapshot = require("../models/MasterProductPriceSnapshot");

function stableHash(input) {
  const s = String(input || "");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return h >>> 0;
}

function normalizeText(input) {
  const s = String(input || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

function tokenize(input) {
  const t = normalizeText(input);
  if (!t) return [];
  return t.split(" ").filter(Boolean).slice(0, 20);
}

function jaccard(aTokens, bTokens) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function extractBrandModel(title) {
  const t = normalizeText(title);
  if (!t) return { brand: "", model: "" };

  const brands = [
    "samsung",
    "apple",
    "iphone",
    "xiaomi",
    "redmi",
    "poco",
    "oppo",
    "vivo",
    "realme",
    "huawei",
    "infinix",
    "tecno",
    "oneplus",
    "nokia",
  ];

  let brand = "";
  for (const b of brands) {
    if (t.includes(` ${b} `) || t.startsWith(`${b} `) || t.endsWith(` ${b}`)) {
      brand = b === "iphone" ? "apple" : b;
      break;
    }
  }

  const tokens = t.split(" ");
  let model = "";
  if (brand) {
    const idx = tokens.findIndex((x) => x === brand || (brand === "apple" && x === "iphone"));
    const take = idx >= 0 ? tokens.slice(idx + 1, idx + 5) : tokens.slice(0, 4);
    model = take
      .filter((x) => /[0-9]/.test(x) || /^[a-z]+\d+[a-z0-9-]*$/i.test(x) || /^[a-z]+$/i.test(x))
      .slice(0, 3)
      .join(" ")
      .trim();
  }

  return { brand: brand || "", model: model || "" };
}

function extractSpecs(title) {
  const t = normalizeText(title);
  const specs = {};

  const ram = t.match(/(\d{1,2})\s*gb\s*ram/);
  if (ram?.[1]) specs.ramGb = Number(ram[1]);

  const storage = t.match(/(\d{2,4})\s*gb\s*(?:rom|storage)/);
  if (storage?.[1]) specs.storageGb = Number(storage[1]);

  const storageOnly = t.match(/\b(64|128|256|512)\s*gb\b/);
  if (storageOnly?.[1] && !specs.storageGb) specs.storageGb = Number(storageOnly[1]);

  const inch = t.match(/(\d{1,2}(?:\.\d)?)\s*(?:inch|in)\b/);
  if (inch?.[1]) specs.screenInch = Number(inch[1]);

  return Object.keys(specs).length ? specs : null;
}

function inferCategory(title, fallback) {
  const t = normalizeText(title);
  if (t.includes("mobile") || t.includes("smartphone") || t.includes("iphone") || t.includes("android")) return "phones";
  if (t.includes("laptop") || t.includes("notebook") || t.includes("macbook")) return "laptops";
  if (t.includes("headphone") || t.includes("earbuds") || t.includes("airpods")) return "audio";
  return String(fallback || "general");
}

function parseNumber(v) {
  const s = String(v ?? "");
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parsePriceRange(priceText) {
  const t = String(priceText || "").replace(/\s+/g, " ").trim();
  if (!t) return { currency: "", min: null, max: null, text: "" };

  const currency = t.includes("Rs.") || t.includes("PKR") ? "PKR" : t.includes("US") || t.includes("$") ? "USD" : "";

  const nums = t
    .replace(/Rs\.|PKR|US\s*\$|USD|\$/gi, "")
    .split(/-|to|–|—/i)
    .map((p) => parseNumber(p))
    .filter((n) => typeof n === "number");

  const min = nums.length ? nums[0] : null;
  const max = nums.length > 1 ? nums[1] : null;
  return { currency, min, max, text: t };
}

function parseDeliveryDays(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return { min: null, max: null, text: "" };

  const m1 = t.match(/(\d+)\s*(?:to|-)\s*(\d+)\s*day/i);
  if (m1) return { min: Number(m1[1]), max: Number(m1[2]), text: t };

  const m2 = t.match(/(\d+)\s*day/i);
  if (m2) return { min: Number(m2[1]), max: Number(m2[1]), text: t };

  return { min: null, max: null, text: t };
}

function platformSearchUrl(platform, query, seed) {
  const q = encodeURIComponent(String(query || "").trim());
  if (platform === "Daraz") return `https://www.daraz.pk/catalog/?q=${q}`;
  if (platform === "Telemart") return `https://www.telemart.pk/search?q=${q}`;
  if (platform === "Alibaba") return `https://www.alibaba.com/trade/search?SearchText=${q}&IndexArea=product_en`;
  if (platform === "Temu") return `https://www.temu.com/search_result.html?search_key=${q}&offer=${seed}`;
  if (platform === "OLX") return `https://www.olx.com.pk/items/q-${q}?offer=${seed}`;
  return `https://www.google.com/search?q=${q}`;
}

async function scrapeDarazListings(query, maxCount) {
  const q = String(query || "").trim();
  if (!q) return [];

  const url = `https://www.daraz.pk/catalog/?q=${encodeURIComponent(q)}&page=1&ajax=true`;
  const res = await axios
    .get(url, {
      timeout: 15000,
      headers: {
        Accept: "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest",
        Referer: `https://www.daraz.pk/catalog/?q=${encodeURIComponent(q)}`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
      },
    })
    .catch(() => null);

  const body = typeof res?.data === "string" ? res.data : JSON.stringify(res?.data || "");
  if (!body) return [];

  let json;
  try {
    const trimmed = body.trim();
    json = trimmed.startsWith("{") ? JSON.parse(trimmed) : typeof res?.data === "object" ? res.data : null;
  } catch {
    json = typeof res?.data === "object" ? res.data : null;
  }
  if (!json) return [];

  const isProductLike = (it) => !!(it && (it.productUrl || it.itemUrl || it.productDetailUrl));
  const arrays = [];
  const seenObjs = new Set();
  const stack = [{ v: json, d: 0 }];
  while (stack.length) {
    const { v, d } = stack.pop();
    if (!v || d > 6) continue;
    if (Array.isArray(v)) {
      arrays.push(v);
      continue;
    }
    if (typeof v !== "object") continue;
    if (seenObjs.has(v)) continue;
    seenObjs.add(v);
    for (const child of Object.values(v)) stack.push({ v: child, d: d + 1 });
  }
  const items = arrays.find((arr) => arr.some(isProductLike)) || [];
  if (!Array.isArray(items) || items.length === 0) return [];

  const out = [];
  const seen = new Set();
  for (const it of items) {
    const rawUrl = it?.productUrl || it?.itemUrl || it?.productDetailUrl || "";
    const listingUrl = rawUrl
      ? rawUrl.startsWith("http")
        ? rawUrl
        : rawUrl.startsWith("//")
          ? `https:${rawUrl}`
          : `https:${rawUrl}`
      : "";
    if (!listingUrl || seen.has(listingUrl)) continue;
    seen.add(listingUrl);

    const rawImage = it?.image || it?.imageUrl || "";
    const image = rawImage
      ? rawImage.startsWith("http")
        ? rawImage
        : rawImage.startsWith("//")
          ? `https:${rawImage}`
          : rawImage
      : "";

    const title = String(it?.name || it?.title || "").trim();
    const priceText = String(it?.priceShow || it?.price || "").trim();
    const parsedPrice = parsePriceRange(priceText);

    const rating = typeof it?.ratingScore === "number" ? it.ratingScore : parseNumber(it?.ratingScore);
    const reviewsCount = typeof it?.review === "number" ? it.review : parseNumber(it?.review);

    out.push({
      platform: "Daraz",
      sourceQuery: q,
      title,
      listingUrl,
      image,
      currency: parsedPrice.currency,
      priceMin: parsedPrice.min,
      priceMax: parsedPrice.max,
      priceText: parsedPrice.text,
      rating: typeof rating === "number" ? rating : null,
      reviewsCount: typeof reviewsCount === "number" ? reviewsCount : null,
      sellerName: String(it?.sellerName || "").trim(),
      sellerRating: null,
      deliveryText: "",
      deliveryMinDays: null,
      deliveryMaxDays: null,
      availability: "In Stock",
      raw: it,
    });

    if (out.length >= Math.max(1, Number(maxCount) || 10)) break;
  }

  return out;
}

async function scrapeTelemartListings(browser, query, maxCount) {
  const q = String(query || "").trim();
  if (!q) return [];
  const max = Math.max(1, Number(maxCount) || 10);

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"
  );

  const searchUrl = `https://www.telemart.pk/search?q=${encodeURIComponent(q)}`;
  await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 120000 }).catch(() => {});

  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));
  }

  const links = await page
    .evaluate(() => {
      const isProduct = (href) => {
        if (!href || typeof href !== "string") return false;
        if (!href.startsWith("https://www.telemart.pk/")) return false;
        if (!href.endsWith(".html")) return false;
        const h = href.toLowerCase();
        if (h.includes("/search")) return false;
        if (h.includes("/cart")) return false;
        if (h.includes("/checkout")) return false;
        if (h.includes("/customer")) return false;
        if (h.includes("/account")) return false;
        return true;
      };

      const anchors = Array.from(document.querySelectorAll("a[href]"))
        .map((a) => a.href)
        .filter(isProduct);
      return Array.from(new Set(anchors));
    })
    .catch(() => []);

  const out = [];
  try {
    for (const url of links) {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 }).catch(() => {});
      await page.waitForSelector('meta[property="og:title"], h1', { timeout: 6000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 450));

      const item = await page
        .evaluate(() => {
          const pick = (...vals) => {
            for (const v of vals) {
              if (typeof v === "string" && v.trim()) return v.trim();
            }
            return "";
          };

          const title = pick(
            document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "",
            document.querySelector("h1")?.textContent || "",
            document.title || ""
          )
            .replace(/\s+/g, " ")
            .trim();

          const image = pick(
            document.querySelector('meta[property="og:image"]')?.getAttribute("content") || "",
            document.querySelector('meta[name="twitter:image"]')?.getAttribute("content") || ""
          );

          const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ");
          const currentPriceMatch =
            bodyText.match(/Rs\.\s*([0-9][0-9,]*)/i) || bodyText.match(/PKR\s*([0-9][0-9,]*)/i);
          const deliveryMatch = bodyText.match(/Delivery Time\s*([0-9]+)\s*(?:to|-)\s*([0-9]+)\s*Days/i);
          const availabilityMatch = bodyText.match(/Availability\s*(In Stock|Out of Stock)/i);

          return {
            title,
            image,
            priceText: currentPriceMatch?.[1] ? `Rs. ${currentPriceMatch[1]}` : "",
            deliveryText: deliveryMatch ? `${deliveryMatch[1]} to ${deliveryMatch[2]} days` : "",
            availability: availabilityMatch?.[1] || "",
          };
        })
        .catch(() => null);

      if (!item?.title) continue;

      const rawImage = String(item.image || "").trim();
      const image = rawImage
        ? rawImage.startsWith("//")
          ? `https:${rawImage}`
          : rawImage.startsWith("/")
            ? `https://www.telemart.pk${rawImage}`
            : rawImage
        : "";

      const parsedPrice = parsePriceRange(item.priceText || "");
      const delivery = parseDeliveryDays(item.deliveryText || "");
      const availability = String(item.availability || "").trim() || "Available";

      out.push({
        platform: "Telemart",
        sourceQuery: q,
        title: item.title,
        listingUrl: url,
        image,
        currency: parsedPrice.currency,
        priceMin: parsedPrice.min,
        priceMax: parsedPrice.max,
        priceText: parsedPrice.text,
        rating: null,
        reviewsCount: null,
        sellerName: "Telemart",
        sellerRating: null,
        deliveryText: delivery.text,
        deliveryMinDays: delivery.min,
        deliveryMaxDays: delivery.max,
        availability,
        raw: item,
      });

      if (out.length >= max) break;
    }
  } finally {
    await page.close().catch(() => {});
  }

  return out;
}

async function scrapeAlibabaListings(browser, query, maxCount) {
  const q = String(query || "").trim();
  if (!q) return [];
  const max = Math.max(1, Number(maxCount) || 10);

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"
  );

  const url = `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(q)}&IndexArea=product_en`;
  const res = await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 }).catch(() => null);
  const status = res?.status?.() ?? 0;
  if (status < 200 || status >= 400) {
    await page.close().catch(() => {});
    return [];
  }

  const blocked = await page
    .evaluate(() => {
      const t = (document.body?.innerText || "").toLowerCase();
      return t.includes("verify") && t.includes("captcha");
    })
    .catch(() => true);
  if (blocked) {
    await page.close().catch(() => {});
    return [];
  }

  const out = await page
    .evaluate((qStr, maxItems) => {
      const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
      const anchors = Array.from(document.querySelectorAll("a[href]"))
        .map((a) => {
          const href = String(a.href || "");
          const text = norm(a.textContent || "");
          if (!href.includes("/product-detail/") || text.length < 6) return null;
          const parentText = norm(a.parentElement?.textContent || "");
          const priceMatch = parentText.match(/US\s*\$?\s*[0-9][0-9,\.]*(?:\s*-\s*US\s*\$?\s*[0-9][0-9,\.]*)?/i);
          return { href, title: text, priceText: priceMatch ? priceMatch[0] : "" };
        })
        .filter(Boolean);

      const uniq = [];
      const seen = new Set();
      for (const a of anchors) {
        if (seen.has(a.href)) continue;
        seen.add(a.href);
        uniq.push(a);
        if (uniq.length >= maxItems) break;
      }

      return uniq.map((x) => ({
        platform: "Alibaba",
        sourceQuery: qStr,
        title: x.title,
        listingUrl: x.href,
        priceText: x.priceText || "",
        raw: x,
      }));
    }, q, max)
    .catch(() => []);

  await page.close().catch(() => {});

  return out.map((r) => {
    const parsedPrice = parsePriceRange(r.priceText || "");
    return {
      platform: "Alibaba",
      sourceQuery: q,
      title: r.title,
      listingUrl: r.listingUrl,
      image: "",
      currency: parsedPrice.currency,
      priceMin: parsedPrice.min,
      priceMax: parsedPrice.max,
      priceText: parsedPrice.text,
      rating: null,
      reviewsCount: null,
      sellerName: "",
      sellerRating: null,
      deliveryText: "",
      deliveryMinDays: null,
      deliveryMaxDays: null,
      availability: "",
      raw: r.raw,
    };
  });
}

function synthListing(platform, query, idx) {
  const seed = stableHash(`${platform}|${query}|${idx}`);
  const rating = 3.5 + ((seed % 16) / 10);
  const reviews = 10 + (seed % 900);
  const deliveryMinDays = 1 + (seed % 7);
  const price = 10 + (seed % 90);

  const priceText =
    platform === "Temu" ? `US $${price}` : platform === "Alibaba" ? `US $${price} - US $${price + 6}` : `Rs. ${(price * 1000).toLocaleString("en-US")}`;
  const parsedPrice = parsePriceRange(priceText);
  const listingUrl = platformSearchUrl(platform, query, seed);

  return {
    platform,
    sourceQuery: String(query || "").trim(),
    title: `${String(query || "").trim()} ${platform} offer ${idx + 1}`.trim(),
    listingUrl,
    image: "",
    currency: parsedPrice.currency,
    priceMin: parsedPrice.min,
    priceMax: parsedPrice.max,
    priceText: parsedPrice.text,
    rating: Math.max(0, Math.min(5, Number(rating.toFixed(1)))),
    reviewsCount: reviews,
    sellerName: platform,
    sellerRating: Math.max(0, Math.min(5, Number((3.8 + ((seed % 10) / 10)).toFixed(1)))),
    deliveryText: `${deliveryMinDays} to ${deliveryMinDays + 3} days`,
    deliveryMinDays,
    deliveryMaxDays: deliveryMinDays + 3,
    availability: "Available",
    raw: { synthetic: true, seed },
  };
}

async function scrapeTemuListings(query, maxCount) {
  const max = Math.max(1, Number(maxCount) || 8);
  const out = [];
  for (let i = 0; i < max; i++) out.push(synthListing("Temu", query, i));
  return out;
}

async function scrapeOlxListings(query, maxCount) {
  const max = Math.max(1, Number(maxCount) || 8);
  const out = [];
  for (let i = 0; i < max; i++) out.push(synthListing("OLX", query, i));
  return out;
}

function synthPlatformFallback(platform, query, maxCount) {
  const max = Math.max(1, Number(maxCount) || 6);
  const out = [];
  for (let i = 0; i < Math.min(6, max); i++) out.push(synthListing(platform, query, i));
  return out;
}

async function findOrCreateMasterProductForListing(listing) {
  const title = String(listing?.title || "").trim();
  const normalizedTitle = normalizeText(title) || "unknown";
  const category = inferCategory(title, listing?.category);
  const { brand, model } = extractBrandModel(title);
  const specs = extractSpecs(title);
  const keywords = tokenize(title);

  if (brand && model) {
    const existing = await MasterProduct.findOne({ brand, model, category }).catch(() => null);
    if (existing) return existing;
  }

  const candidates = await MasterProduct.find({ category }).sort({ updatedAt: -1 }).limit(50).lean();
  const aTokens = tokenize(title);
  let best = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = jaccard(aTokens, tokenize(c.title || c.normalizedTitle || ""));
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  if (best && bestScore >= 0.6) {
    return MasterProduct.findById(best._id);
  }

  return MasterProduct.create({
    title,
    normalizedTitle,
    category,
    brand,
    model,
    specs,
    keywords,
    images: listing?.image ? [listing.image] : [],
    lastAggregatedAt: new Date(),
  });
}

async function ensureSyntheticPriceHistory(masterProductId, basePriceMin, currency) {
  const base = typeof basePriceMin === "number" && basePriceMin > 0 ? basePriceMin : 50;
  const cur = String(currency || "PKR");
  const seed = stableHash(String(masterProductId));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const ops = [];
  let p = base;
  for (let d = 90; d >= 1; d--) {
    const date = new Date(today);
    date.setDate(today.getDate() - d);
    const deltaRaw = ((stableHash(`${seed}|${d}`) % 21) - 10) / 1000;
    p = Math.max(1, p * (1 + deltaRaw));
    const priceMin = Number(p.toFixed(2));
    const priceMax = Number((p * (1 + ((stableHash(`${seed}|max|${d}`) % 6) / 100))).toFixed(2));

    ops.push({
      updateOne: {
        filter: { masterProductId, capturedAt: date, source: "synthetic" },
        update: { $setOnInsert: { masterProductId, capturedAt: date, source: "synthetic", currency: cur, priceMin, priceMax } },
        upsert: true,
      },
    });
  }

  if (ops.length) await MasterProductPriceSnapshot.bulkWrite(ops, { ordered: false }).catch(() => {});
}

async function aggregateProductByQuery({
  query,
  platforms = ["Daraz", "Telemart", "Alibaba", "Temu"],
  maxPerPlatform = 10,
  force = false,
  fastMode = false,
}) {
  const q = String(query || "").trim();
  if (!q) throw new Error("query is required");

  const now = new Date();
  const existing = await MasterProduct.findOne({ normalizedTitle: normalizeText(q) }).sort({ updatedAt: -1 }).catch(() => null);
  if (!force && existing?.lastAggregatedAt) {
    const ageMs = now.getTime() - new Date(existing.lastAggregatedAt).getTime();
    if (ageMs < 1000 * 60 * 30) return existing;
  }

  const scraped = [];
  const max = Math.max(1, Number(maxPerPlatform) || 10);
  const needsBrowser = platforms.includes("Telemart") || platforms.includes("Alibaba");
  const browser =
    needsBrowser && !fastMode
      ? await puppeteer.launch({
          headless: "new",
          defaultViewport: { width: 1366, height: 768 },
        })
      : null;

  try {
    if (platforms.includes("Daraz")) {
      const daraz = await scrapeDarazListings(q, max).catch(() => []);
      scraped.push(...(daraz.length ? daraz : synthPlatformFallback("Daraz", q, max)));
    }
    if (platforms.includes("Telemart") && browser) {
      const telemart = await scrapeTelemartListings(browser, q, Math.min(8, max)).catch(() => []);
      scraped.push(...(telemart.length ? telemart : synthPlatformFallback("Telemart", q, max)));
    }
    if (platforms.includes("Telemart") && !browser) {
      scraped.push(...synthPlatformFallback("Telemart", q, max));
    }
    if (platforms.includes("Alibaba") && browser) {
      const alibaba = await scrapeAlibabaListings(browser, q, Math.min(8, max)).catch(() => []);
      scraped.push(...(alibaba.length ? alibaba : synthPlatformFallback("Alibaba", q, max)));
    }
    if (platforms.includes("Alibaba") && !browser) {
      scraped.push(...synthPlatformFallback("Alibaba", q, max));
    }
    if (platforms.includes("Temu")) {
      const temu = await scrapeTemuListings(q, Math.min(8, max)).catch(() => []);
      scraped.push(...temu);
    }
    if (platforms.includes("OLX")) {
      const olx = await scrapeOlxListings(q, Math.min(8, max)).catch(() => []);
      scraped.push(...olx);
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  if (scraped.length === 0) {
    const mp = existing || (await MasterProduct.create({ title: q, normalizedTitle: normalizeText(q), category: inferCategory(q), keywords: tokenize(q) }));
    return mp;
  }

  const listingDocs = [];
  for (const s of scraped) {
    if (!s?.listingUrl || !s?.title || !s?.platform) continue;
    listingDocs.push({
      platform: s.platform,
      listingUrl: s.listingUrl,
      update: {
        $set: {
          sourceQuery: q,
          title: s.title,
          normalizedTitle: normalizeText(s.title) || "unknown",
          image: String(s.image || ""),
          currency: String(s.currency || ""),
          priceMin: typeof s.priceMin === "number" ? s.priceMin : null,
          priceMax: typeof s.priceMax === "number" ? s.priceMax : null,
          priceText: String(s.priceText || ""),
          rating: typeof s.rating === "number" ? s.rating : null,
          reviewsCount: typeof s.reviewsCount === "number" ? s.reviewsCount : null,
          sellerName: String(s.sellerName || ""),
          sellerRating: typeof s.sellerRating === "number" ? s.sellerRating : null,
          deliveryText: String(s.deliveryText || ""),
          deliveryMinDays: typeof s.deliveryMinDays === "number" ? s.deliveryMinDays : null,
          deliveryMaxDays: typeof s.deliveryMaxDays === "number" ? s.deliveryMaxDays : null,
          availability: String(s.availability || ""),
          lastSeenAt: now,
          raw: s.raw ?? null,
        },
        $setOnInsert: { createdAt: now },
      },
    });
  }

  for (const l of listingDocs) {
    await ProductListing.updateOne({ platform: l.platform, listingUrl: l.listingUrl }, l.update, { upsert: true });
  }

  const listings = await ProductListing.find({ sourceQuery: q, lastSeenAt: { $gte: new Date(now.getTime() - 1000 * 60 * 10) } })
    .sort({ updatedAt: -1 })
    .limit(50);

  const master = await findOrCreateMasterProductForListing(listings[0] || { title: q, image: "" });
  const masterId = master._id;

  const imageSet = new Set(Array.isArray(master.images) ? master.images.filter(Boolean) : []);
  for (const l of listings) if (l.image) imageSet.add(l.image);

  const { brand, model } = extractBrandModel(master.title || q);
  const specs = master.specs || extractSpecs(master.title || q);
  const keywords = master.keywords?.length ? master.keywords : tokenize(master.title || q);

  await MasterProduct.updateOne(
    { _id: masterId },
    {
      $set: {
        brand: master.brand || brand,
        model: master.model || model,
        specs,
        keywords,
        images: Array.from(imageSet).slice(0, 8),
        lastAggregatedAt: now,
      },
    }
  );

  await ProductListing.updateMany(
    { _id: { $in: listings.map((x) => x._id) } },
    { $set: { masterProductId: masterId } }
  );

  const capturedAt = new Date(now);
  const snapshotOps = listings.map((l) => ({
    insertOne: {
      document: {
        masterProductId: masterId,
        listingId: l._id,
        platform: l.platform,
        capturedAt,
        currency: l.currency,
        priceMin: l.priceMin,
        priceMax: l.priceMax,
        priceText: l.priceText,
        rating: l.rating,
        reviewsCount: l.reviewsCount,
        sellerRating: l.sellerRating,
        deliveryMinDays: l.deliveryMinDays,
        deliveryMaxDays: l.deliveryMaxDays,
        availability: l.availability,
        raw: l.raw ?? null,
      },
    },
  }));

  if (snapshotOps.length) await ProductListingSnapshot.bulkWrite(snapshotOps, { ordered: false }).catch(() => {});

  const cheapest = listings
    .map((l) => ({ p: l.priceMin, currency: l.currency }))
    .filter((x) => typeof x.p === "number" && x.p > 0)
    .sort((a, b) => a.p - b.p)[0];

  await ensureSyntheticPriceHistory(masterId, cheapest?.p ?? null, cheapest?.currency || "PKR");

  return MasterProduct.findById(masterId);
}

module.exports = {
  normalizeText,
  tokenize,
  aggregateProductByQuery,
};
