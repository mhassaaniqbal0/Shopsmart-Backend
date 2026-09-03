const puppeteer = require("puppeteer");
const WholesaleProduct = require("../models/WholesaleProduct");

function normalizeName(name) {
  const s = String(name || "")
    .toLowerCase()
    .replace(/buy\s+/g, "")
    .replace(/at best price.*$/g, "")
    .replace(/in pakistan.*$/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s || "unknown";
}

function parseNumberFromText(v) {
  const s = String(v ?? "");
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parsePriceRange(priceText) {
  const t = String(priceText || "").replace(/\s+/g, " ").trim();
  if (!t) return { currency: "", min: null, max: null, text: "" };

  const currency =
    t.includes("Rs.") || t.includes("PKR") ? "PKR" : t.includes("US $") || t.includes("USD") ? "USD" : "";

  const nums = t
    .replace(/Rs\.|PKR|US\s*\$|USD|\/.*$/gi, "")
    .split(/-|to|–|—/i)
    .map((p) => parseNumberFromText(p))
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

function parseMoq(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return { moq: null, unit: "" };

  const m = t.match(/min\.?\s*order\s*[:：]?\s*([0-9][0-9,\.]*)\s*([a-zA-Z]+)?/i);
  if (!m) return { moq: null, unit: "" };

  const moq = Number(String(m[1]).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(moq) || moq <= 0) return { moq: null, unit: "" };

  const unit = String(m[2] || "").trim();
  return { moq: Math.floor(moq), unit };
}

async function scrapeDaraz(page, q, max) {
  await page.setExtraHTTPHeaders({
    Accept: "application/json, text/plain, */*",
    "X-Requested-With": "XMLHttpRequest",
    Referer: `https://www.daraz.pk/catalog/?q=${encodeURIComponent(q)}`,
  });

  const out = [];
  const seen = new Set();
  const perPage = 40;
  const pages = Math.max(1, Math.ceil(max / perPage));

  for (let pageNum = 1; pageNum <= pages; pageNum++) {
    const ajaxUrl = `https://www.daraz.pk/catalog/?q=${encodeURIComponent(q)}&page=${pageNum}&ajax=true`;
    const res = await page.goto(ajaxUrl, { waitUntil: "networkidle2", timeout: 120000 }).catch(() => null);
    const body = await res?.text?.().catch(() => "");
    if (!body) continue;

    let json;
    try {
      const trimmed = body.trim();
      json = trimmed.startsWith("{") ? JSON.parse(trimmed) : null;
    } catch {
      json = null;
    }
    if (!json) continue;

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
    if (!Array.isArray(items) || items.length === 0) continue;

    for (const it of items) {
      const rawUrl = it?.productUrl || it?.itemUrl || it?.productDetailUrl || "";
      const productUrl = rawUrl
        ? rawUrl.startsWith("http")
          ? rawUrl
          : rawUrl.startsWith("//")
            ? `https:${rawUrl}`
            : `https:${rawUrl}`
        : "";
      if (!productUrl || seen.has(productUrl)) continue;
      seen.add(productUrl);

      const rawImage = it?.image || it?.imageUrl || "";
      const image = rawImage
        ? rawImage.startsWith("http")
          ? rawImage
          : rawImage.startsWith("//")
            ? `https:${rawImage}`
            : rawImage
        : "";

      const name = it?.name || it?.title || "";
      const priceText = it?.priceShow || it?.price || "";
      const parsedPrice = parsePriceRange(priceText);

      const rating = typeof it?.ratingScore === "number" ? it.ratingScore : parseNumberFromText(it?.ratingScore);
      const reviewsCount = typeof it?.review === "number" ? it.review : parseNumberFromText(it?.review);

      out.push({
        platform: "Daraz",
        sourceQuery: q,
        productName: String(name || "").trim(),
        normalizedName: normalizeName(name),
        productUrl,
        image,
        currency: parsedPrice.currency,
        priceMin: parsedPrice.min,
        priceMax: parsedPrice.max,
        priceText: parsedPrice.text,
        moq: 1,
        moqUnit: "unit",
        tierPrices: [],
        sellerName: String(it?.sellerName || "").trim(),
        sellerUrl: "",
        sellerVerified: false,
        rating: typeof rating === "number" ? rating : null,
        reviewsCount: typeof reviewsCount === "number" ? reviewsCount : null,
        deliveryText: "",
        deliveryMinDays: null,
        deliveryMaxDays: null,
        inStock: true,
        stockText: "",
        lastScrapedAt: new Date(),
        raw: it,
      });

      if (out.length >= max) return out;
    }
  }

  return out;
}

async function extractTelemartProduct(detailPage, productUrl) {
  await detailPage.goto(productUrl, { waitUntil: "networkidle2", timeout: 120000 }).catch(() => {});

  const extra = await detailPage
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
      const currentPriceMatch = bodyText.match(/Rs\.\s*([0-9][0-9,]*)/i);
      const oldPriceMatch = bodyText.match(/~\s*Rs\.\s*([0-9][0-9,]*)/i);
      const discountMatch = bodyText.match(/(\d+)\s*%\s*Off/i);
      const deliveryMatch = bodyText.match(/Delivery Time\s*([0-9]+)\s*(?:to|-)\s*([0-9]+)\s*Days/i);
      const availabilityMatch = bodyText.match(/Availability\s*(In Stock|Out of Stock)/i);
      const ratingMatch = bodyText.match(/(\d+(?:\.\d+)?)\s+Ratings?/i);

      return {
        title,
        image,
        currentPrice: currentPriceMatch?.[1] ? `Rs. ${currentPriceMatch[1]}` : "",
        oldPrice: oldPriceMatch?.[1] ? `Rs. ${oldPriceMatch[1]}` : "",
        discountText: discountMatch?.[1] ? `${discountMatch[1]}% Off` : "",
        deliveryText: deliveryMatch ? `${deliveryMatch[1]} to ${deliveryMatch[2]} Days` : "",
        availability: availabilityMatch?.[1] || "",
        ratingCountText: ratingMatch?.[1] || "",
      };
    })
    .catch(() => null);

  if (!extra?.title) return null;

  const price = parsePriceRange(extra.currentPrice || "");
  const delivery = parseDeliveryDays(extra.deliveryText || "");

  const inStock = extra.availability ? /in stock/i.test(extra.availability) : null;

  const rawImage = String(extra.image || "").trim();
  const image = rawImage
    ? rawImage.startsWith("//")
      ? `https:${rawImage}`
      : rawImage.startsWith("/")
        ? `https://www.telemart.pk${rawImage}`
        : rawImage
    : "";

  return {
    productName: extra.title,
    normalizedName: normalizeName(extra.title),
    image,
    currency: price.currency,
    priceMin: price.min,
    priceMax: price.max,
    priceText: extra.currentPrice || "",
    discountText: extra.discountText || "",
    deliveryText: extra.deliveryText || "",
    deliveryMinDays: delivery.min,
    deliveryMaxDays: delivery.max,
    inStock,
  };
}

async function scrapeTelemart(browser, q, max) {
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"
  );

  const searchUrl = `https://www.telemart.pk/search?q=${encodeURIComponent(q)}`;
  await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 120000 }).catch(() => {});

  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await new Promise((r) => setTimeout(r, 700));
  }

  const links = await page
    .evaluate(() => {
      const isProduct = (href) => {
        if (!href || typeof href !== "string") return false;
        if (!href.startsWith("https://www.telemart.pk/")) return false;
        if (!href.endsWith(".html")) return false;
        const h = href.toLowerCase();
        if (h.includes("/mobile-and-tablets/mobile-phone.html")) return false;
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
  const detailPage = await browser.newPage();
  await detailPage.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"
  );

  try {
    for (const url of links) {
      const item = await extractTelemartProduct(detailPage, url);
      if (!item?.productName) continue;

      out.push({
        platform: "Telemart",
        sourceQuery: q,
        productName: item.productName,
        normalizedName: item.normalizedName,
        productUrl: url,
        image: item.image,
        currency: item.currency,
        priceMin: item.priceMin,
        priceMax: item.priceMax,
        priceText: item.priceText,
        moq: 1,
        moqUnit: "unit",
        tierPrices: [],
        sellerName: "Telemart",
        sellerUrl: "https://www.telemart.pk",
        sellerVerified: true,
        rating: null,
        reviewsCount: null,
        deliveryText: item.deliveryText,
        deliveryMinDays: item.deliveryMinDays,
        deliveryMaxDays: item.deliveryMaxDays,
        inStock: item.inStock,
        stockText: item.inStock === null ? "" : item.inStock ? "In Stock" : "Out of Stock",
        lastScrapedAt: new Date(),
        raw: item,
      });

      if (out.length >= max) break;
    }
  } finally {
    await page.close().catch(() => {});
    await detailPage.close().catch(() => {});
  }

  return out;
}

async function scrapeMadeInChina(browser, q, max) {
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"
  );

  const candidates = [
    `https://www.made-in-china.com/multi-search/${encodeURIComponent(q)}/F1/1.html`,
    `https://www.made-in-china.com/multi-search/${encodeURIComponent(q)}/1.html`,
  ];

  let loaded = false;
  for (const u of candidates) {
    const res = await page.goto(u, { waitUntil: "networkidle2", timeout: 120000 }).catch(() => null);
    const status = res?.status?.() ?? 0;
    if (status >= 200 && status < 400) {
      loaded = true;
      break;
    }
  }

  if (!loaded) {
    await page.close().catch(() => {});
    return [];
  }

  const productUrls = await page
    .evaluate((maxCount) => {
      const hrefs = Array.from(document.querySelectorAll("a"))
        .map((a) => String(a.href || ""))
        .filter((h) => h.includes("/product/") && h.includes(".html") && h.toLowerCase().includes("made-in-china.com"));
      const uniq = [];
      const seen = new Set();
      for (const h of hrefs) {
        if (seen.has(h)) continue;
        seen.add(h);
        uniq.push(h);
        if (uniq.length >= Math.max(50, maxCount * 10)) break;
      }
      return uniq;
    }, max)
    .catch(() => []);

  await page.close().catch(() => {});

  const detailPage = await browser.newPage();
  await detailPage.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"
  );

  const out = [];
  try {
    for (const productUrl of productUrls) {
      await detailPage.goto(productUrl, { waitUntil: "networkidle2", timeout: 120000 }).catch(() => {});
      await detailPage.waitForSelector('meta[property="og:title"], h1', { timeout: 8000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 600));
      const item = await detailPage
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
          ).replace(/\s+/g, " ").trim();

          const jsonLdImage = (() => {
            try {
              const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
              for (const s of scripts) {
                const raw = s.textContent || "";
                if (!raw.trim()) continue;
                const data = JSON.parse(raw);
                const candidates = Array.isArray(data) ? data : [data];
                for (const obj of candidates) {
                  const img = obj?.image;
                  if (typeof img === "string" && img.trim()) return img.trim();
                  if (Array.isArray(img) && typeof img[0] === "string" && img[0].trim()) return img[0].trim();
                }
              }
            } catch {}
            return "";
          })();

          const domImage = (() => {
            const urls = Array.from(document.images || [])
              .map((img) => String(img.currentSrc || img.src || "").trim())
              .filter((u) => u && !u.startsWith("data:"));
            const preferred = urls.find((u) => /made-in-china\.com|image\.made-in-china\.com|micstatic/i.test(u));
            return preferred || urls[0] || "";
          })();

          const image = pick(
            document.querySelector('meta[property="og:image"]')?.getAttribute("content") || "",
            document.querySelector('meta[name="twitter:image"]')?.getAttribute("content") || "",
            jsonLdImage,
            domImage
          );

          const body = (document.body?.innerText || "").replace(/\s+/g, " ");
          const html = String(document.documentElement?.innerHTML || "").replace(/\s+/g, " ");

          const fob =
            body.match(/FOB\s*Price\s*:\s*(US\s*\$[^\s].*?)(?:Min\.?\s*Order|Port|Payment|$)/i) ||
            html.match(/FOB\s*Price\s*:\s*(US\s*\$[^\s].*?)(?:Min\.?\s*Order|Port|Payment|<|$)/i);

          const us =
            body.match(/US\s*\$?\s*[0-9][0-9,\.]*(?:\s*-\s*US\s*\$?\s*[0-9][0-9,\.]*)?(?:\s*\/\s*[a-z]+)?/i) ||
            html.match(/US\s*\$?\s*[0-9][0-9,\.]*(?:\s*-\s*US\s*\$?\s*[0-9][0-9,\.]*)?(?:\s*\/\s*[a-z]+)?/i);

          const priceText = (fob?.[1] || us?.[0] || "").trim();

          const moqMatch =
            body.match(/Min(?:imum)?\.?\s*Order(?:\s*Quantity)?(?:\s*:\s*|\s+)([0-9][0-9,\.]*)\s*([a-zA-Z]+)?/i) ||
            body.match(/MOQ(?:\s*:\s*|\s+)([0-9][0-9,\.]*)\s*([a-zA-Z]+)?/i);
          const moq = moqMatch?.[1] ? Number(String(moqMatch[1]).replace(/[^\d.]/g, "")) : null;
          const moqUnit = String(moqMatch?.[2] || "").trim();

          return {
            title,
            image,
            priceText,
            moq: Number.isFinite(moq) && moq && moq > 0 ? Math.floor(moq) : null,
            moqUnit,
          };
        })
        .catch(() => null);

      if (!item?.title) continue;

      const rawImage = String(item.image || "").trim();
      const image = rawImage
        ? rawImage.startsWith("//")
          ? `https:${rawImage}`
          : rawImage.startsWith("/")
            ? `https://www.made-in-china.com${rawImage}`
            : rawImage
        : "";

      out.push({
        platform: "MadeInChina",
        sourceQuery: q,
        productName: item.title,
        productUrl,
        image,
        priceText: String(item.priceText || ""),
        moq: typeof item.moq === "number" ? item.moq : null,
        moqUnit: String(item.moqUnit || ""),
        sellerName: "",
        sellerVerified: false,
        raw: item,
      });

      if (out.length >= max) break;
    }
  } finally {
    await detailPage.close().catch(() => {});
  }

  return out.map((r) => {
    const parsedPrice = parsePriceRange(r.priceText || "");
    const moqTierMinQty = typeof r.moq === "number" ? r.moq : null;
    return {
      platform: "MadeInChina",
      sourceQuery: q,
      productName: r.productName,
      normalizedName: normalizeName(r.productName),
      productUrl: r.productUrl,
      image: String(r.image || ""),
      currency: parsedPrice.currency,
      priceMin: parsedPrice.min,
      priceMax: parsedPrice.max,
      priceText: parsedPrice.text,
      moq: typeof r.moq === "number" ? r.moq : null,
      moqUnit: String(r.moqUnit || ""),
      tierPrices: moqTierMinQty
        ? [
            {
              minQty: moqTierMinQty,
              maxQty: null,
              priceMin: parsedPrice.min,
              priceMax: parsedPrice.max,
              priceText: parsedPrice.text,
            },
          ]
        : [],
      sellerName: String(r.sellerName || ""),
      sellerUrl: "",
      sellerVerified: false,
      rating: null,
      reviewsCount: null,
      deliveryText: "",
      deliveryMinDays: null,
      deliveryMaxDays: null,
      inStock: null,
      stockText: "",
      lastScrapedAt: new Date(),
      raw: r.raw,
    };
  });
}

async function scrapeAlibaba(browser, q, max) {
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
    .evaluate((qStr, maxCount) => {
      const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
      const cards = Array.from(document.querySelectorAll("a[href]"))
        .map((a) => ({ href: a.href, text: norm(a.textContent || "") }))
        .filter((x) => x.href.includes("/product-detail/") && x.text.length > 8);

      const unique = [];
      const seen = new Set();
      for (const c of cards) {
        if (seen.has(c.href)) continue;
        seen.add(c.href);
        unique.push(c);
        if (unique.length >= maxCount) break;
      }

      return unique.map((c) => ({
        platform: "Alibaba",
        sourceQuery: qStr,
        productName: c.text,
        productUrl: c.href,
        raw: c,
      }));
    }, q, max)
    .catch(() => []);

  await page.close().catch(() => {});

  return out.map((r) => ({
    platform: "Alibaba",
    sourceQuery: q,
    productName: r.productName,
    normalizedName: normalizeName(r.productName),
    productUrl: r.productUrl,
    image: "",
    currency: "",
    priceMin: null,
    priceMax: null,
    priceText: "",
    moq: null,
    moqUnit: "",
    tierPrices: [],
    sellerName: "",
    sellerUrl: "",
    sellerVerified: false,
    rating: null,
    reviewsCount: null,
    deliveryText: "",
    deliveryMinDays: null,
    deliveryMaxDays: null,
    inStock: null,
    stockText: "",
    lastScrapedAt: new Date(),
    raw: r.raw,
  }));
}

async function upsertAll(items) {
  let upserted = 0;
  for (const p of items) {
    if (!p?.platform || !p?.productUrl || !p?.productName) continue;
    const update = { ...p, normalizedName: p.normalizedName || normalizeName(p.productName), lastScrapedAt: new Date() };
    await WholesaleProduct.updateOne(
      { platform: p.platform, productUrl: p.productUrl },
      { $set: update, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
    upserted += 1;
  }
  return upserted;
}

async function scrapeWholesaleAndStore({
  query,
  platforms = ["Daraz", "Telemart", "MadeInChina", "Alibaba"],
  maxPerPlatform = 30,
  headful = false,
  chromePath,
  userDataDir,
}) {
  const max = Math.max(1, Number(maxPerPlatform) || 30);
  const q = String(query || "").trim();
  if (!q) throw new Error("query is required");

  const browser = await puppeteer.launch({
    headless: headful ? false : "new",
    executablePath: chromePath,
    userDataDir,
    defaultViewport: { width: 1366, height: 768 },
  });

  const results = {};
  try {
    const pages = [];
    if (platforms.includes("Daraz")) {
      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"
      );
      pages.push(page);
      results.Daraz = await scrapeDaraz(page, q, max).catch(() => []);
    }
    if (platforms.includes("Telemart")) {
      results.Telemart = await scrapeTelemart(browser, q, max).catch(() => []);
    }
    if (platforms.includes("MadeInChina")) {
      results.MadeInChina = await scrapeMadeInChina(browser, q, max).catch(() => []);
    }
    if (platforms.includes("Alibaba")) {
      results.Alibaba = await scrapeAlibaba(browser, q, max).catch(() => []);
    }

    for (const p of pages) await p.close().catch(() => {});

    const all = Object.values(results).flat();
    const upserted = await upsertAll(all);

    return {
      query: q,
      platformCounts: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.length])),
      upserted,
    };
  } finally {
    await browser.close();
  }
}

module.exports = {
  normalizeName,
  parsePriceRange,
  parseDeliveryDays,
  parseMoq,
  scrapeWholesaleAndStore,
};
