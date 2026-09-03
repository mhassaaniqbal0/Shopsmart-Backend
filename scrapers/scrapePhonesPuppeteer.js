const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    args[key] = val;
  }
  return args;
}

function toCsv(rows) {
  const headers = ["phone", "product_name", "price", "discount", "delivery_time", "seller", "image"];
  const escape = (v) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => escape(r[h])).join(","));
  return lines.join("\n");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function autoScroll(page, steps = 8) {
  for (let i = 0; i < steps; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(800);
  }
}

async function scrapeDarazPhones(page, max = 30) {
  await page.setExtraHTTPHeaders({
    Accept: "application/json, text/plain, */*",
    "X-Requested-With": "XMLHttpRequest",
    Referer: "https://www.daraz.pk/catalog/?q=mobile+phone"
  });

  const out = [];
  const seen = new Set();

  const perPage = 40;
  const pages = Math.max(1, Math.ceil(max / perPage));

  for (let pageNum = 1; pageNum <= pages; pageNum++) {
    const ajaxUrl = `https://www.daraz.pk/catalog/?q=mobile+phone&page=${pageNum}&ajax=true`;
    const res = await page.goto(ajaxUrl, { waitUntil: "networkidle2", timeout: 120000 });
    if (pageNum === 1) {
      const status = res?.status?.() ?? null;
      const headers = res?.headers?.() ?? {};
      const ct = headers["content-type"] || headers["Content-Type"] || "";
      console.log("Daraz ajax status:", status, "content-type:", ct);
    }
    const body = await res?.text();
    if (!body) continue;
    if (pageNum === 1) {
      console.log("Daraz ajax body preview:", body.slice(0, 160).replace(/\s+/g, " "));
    }

    let json;
    try {
      const trimmed = body.trim();
      if (trimmed.startsWith("{")) {
        json = JSON.parse(trimmed);
      } else {
        const start = trimmed.indexOf("{");
        const end = trimmed.lastIndexOf("}");
        json = start !== -1 && end !== -1 ? JSON.parse(trimmed.slice(start, end + 1)) : null;
      }
    } catch {
      json = null;
    }
    const isProductLike = (it) => !!(it && (it.productUrl || it.itemUrl || it.productDetailUrl));
    const arrays = [];
    const seenObjs = new Set();
    const stack = [{ v: json, d: 0 }];
    while (stack.length) {
      const { v, d } = stack.pop();
      if (!v || d > 5) continue;
      if (Array.isArray(v)) {
        arrays.push(v);
        continue;
      }
      if (typeof v !== "object") continue;
      if (seenObjs.has(v)) continue;
      seenObjs.add(v);
      for (const child of Object.values(v)) {
        stack.push({ v: child, d: d + 1 });
      }
    }
    const items = arrays.find((arr) => arr.some(isProductLike)) || [];
    if (!Array.isArray(items) || items.length === 0) continue;

    for (const it of items) {
      const rawUrl = it?.productUrl || it?.itemUrl || it?.productDetailUrl || "";
      const productUrl = rawUrl
        ? (rawUrl.startsWith("http") ? rawUrl : rawUrl.startsWith("//") ? `https:${rawUrl}` : `https:${rawUrl}`)
        : "";
      if (!productUrl || seen.has(productUrl)) continue;
      seen.add(productUrl);

      const rawImage = it?.image || it?.imageUrl || "";
      const image = rawImage
        ? (rawImage.startsWith("http") ? rawImage : rawImage.startsWith("//") ? `https:${rawImage}` : rawImage)
        : "";

      out.push({
        phone: productUrl,
        product_name: it?.name || it?.title || "",
        price: it?.priceShow || it?.price || "",
        discount: it?.discount || it?.discountShow || "",
        delivery_time: "",
        seller: it?.sellerName || "",
        image
      });


      if (out.length >= max) return out;
    }
  }

  return out;
}

async function scrapeTelemartPhones(page, max = 30) {
  const url = "https://www.telemart.pk/mobile-and-tablets/mobile-phone.html";

  await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 }).catch(() => {});
  await sleep(1200);

  const filterResponsePromise = page
    .waitForResponse(
      (r) => {
        const ct = r.headers()["content-type"] || "";
        return r.url().includes("://www.telemart.pk/api/filter") && ct.includes("application/json");
      },
      { timeout: 20000 }
    )
    .catch(() => null);

  const cookies = await page.cookies("https://www.telemart.pk").catch(() => []);
  const xsrfCookie = cookies.find((c) => c.name === "XSRF-TOKEN")?.value || "";
  const xsrf = xsrfCookie ? decodeURIComponent(xsrfCookie) : "";

  const manualJson = await page
    .evaluate(async (token) => {
      try {
        const headers = {
          Accept: "application/json, text/plain, */*",
          "X-Requested-With": "XMLHttpRequest",
        };
        if (token) headers["X-XSRF-TOKEN"] = token;

        const res = await fetch("/api/filter?page=1", {
          method: "GET",
          credentials: "include",
          headers,
        });

        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      } catch {
        return null;
      }
    }, xsrf)
    .catch(() => null);

  const usableManualJson = Array.isArray(manualJson?.data) && manualJson.data.length ? manualJson : null;
  const filterRes = usableManualJson ? null : await filterResponsePromise;
  const json = usableManualJson || (await filterRes?.json?.().catch(() => null));
  let items = Array.isArray(json?.data) ? json.data : [];
  if (!items.length) {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 }).catch(() => {});
    await sleep(4000);
    await autoScroll(page, 10);

    const links = await page
      .evaluate(() => {
        const isProbablyProductLink = (href) => {
          if (!href || typeof href !== "string") return false;
          const h = href.toLowerCase();
          if (!h.startsWith("https://www.telemart.pk/")) return false;
          try {
            const u = new URL(href);
            if (!u.pathname || u.pathname === "/" || u.pathname.length < 2) return false;
            if (u.pathname.endsWith("/")) return false;
            if (/\.(png|jpg|jpeg|webp|svg|gif)$/i.test(u.pathname)) return false;
            const hyphens = (u.pathname.match(/-/g) || []).length;
            if (hyphens < 2 && !u.pathname.endsWith(".html")) return false;
          } catch {
            return false;
          }
          if (h.includes("/api/")) return false;
          if (h.includes("/mobile-and-tablets/mobile-phone.html")) return false;
          if (h.includes("/search")) return false;
          if (h.includes("/cart")) return false;
          if (h.includes("/checkout")) return false;
          if (h.includes("/customer")) return false;
          if (h.includes("/account")) return false;
          if (h.includes("#")) return false;
          return true;
        };

        const anchors = Array.from(document.querySelectorAll("a[href]"))
          .filter((a) => a.querySelector("img"))
          .map((a) => a.href)
          .filter(isProbablyProductLink);

        return Array.from(new Set(anchors));
      })
      .catch(() => []);

    items = links.slice(0, max * 5).map((u) => ({ url: u }));
  }
  if (!items.length) return [];

  const toNumber = (v) => {
    const s = String(v ?? "");
    const n = Number(s.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const computeDiscount = (regular, special) => {
    const r = toNumber(regular);
    const s = toNumber(special);
    if (!r || !s || s >= r) return "";
    return `${Math.round(((r - s) / r) * 100)}% Off`;
  };

  const out = [];
  const seen = new Set();

  const browser = page.browser();
  const detailPage = await browser.newPage();

  try {
    for (const it of items) {
      const rawUrl = it?.url || it?.product_url || it?.productUrl || it?.slug || "";
      const phone = rawUrl
        ? rawUrl.startsWith("http")
          ? rawUrl
          : `https://www.telemart.pk/${String(rawUrl).replace(/^\//, "")}`
        : "";
      if (phone === "https://www.telemart.pk" || phone === "https://www.telemart.pk/") continue;
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);

      let product_name = it?.title || it?.name || it?.product_name || "";

      const regularPrice =
        it?.regular_price ||
        it?.regularPrice ||
        it?.original_price ||
        it?.originalPrice ||
        it?.old_price ||
        it?.oldPrice ||
        it?.price ||
        "";
      const specialPrice = it?.special_price || it?.specialPrice || it?.sale_price || it?.salePrice || "";

      let price = String(specialPrice || regularPrice || it?.price_text || it?.priceText || "");
      let discount = it?.discount || it?.discount_text || it?.discountText || it?.sale_percentage || it?.salePercentage || "";
      discount = String(discount || computeDiscount(regularPrice, specialPrice) || "");
      if (discount && !/off/i.test(discount)) discount = `${discount} Off`;

      const rawImage =
        it?.thumbnail ||
        it?.thumbnail_url ||
        it?.thumb ||
        it?.image ||
        it?.image_url ||
        it?.img ||
        it?.img_url ||
        it?.product_image ||
        it?.small_image ||
        it?.media?.[0]?.url ||
        it?.images?.[0] ||
        "";

      let image = rawImage ? String(rawImage) : "";
      if (image.startsWith("//")) image = `https:${image}`;
      if (image.startsWith("/")) image = `https://www.telemart.pk${image}`;

      if (!image || !discount) {
        await detailPage.goto(phone, { waitUntil: "networkidle2", timeout: 120000 }).catch(() => {});
        await sleep(600);
        const extra = await detailPage
          .evaluate(() => {
            const pickFirstNonEmpty = (...vals) => {
              for (const v of vals) {
                if (typeof v === "string" && v.trim()) return v.trim();
              }
              return "";
            };

            const rawMetaTitle = pickFirstNonEmpty(
              document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "",
              document.querySelector('meta[name="twitter:title"]')?.getAttribute("content") || "",
              document.title || ""
            );

            const metaImage = pickFirstNonEmpty(
              document.querySelector('meta[property="og:image"]')?.getAttribute("content") || "",
              document.querySelector('meta[name="twitter:image"]')?.getAttribute("content") || ""
            );

            const allImgs = Array.from(document.querySelectorAll("img"))
              .flatMap((img) => {
                const src = img.getAttribute("src") || "";
                const dataSrc = img.getAttribute("data-src") || "";
                const lazy = img.getAttribute("data-original") || "";
                const srcset = img.getAttribute("srcset") || "";
                const fromSrcset = srcset
                  ? srcset
                      .split(",")
                      .map((p) => p.trim().split(" ")[0])
                      .filter(Boolean)
                  : [];
                return [src, dataSrc, lazy, ...fromSrcset].filter(Boolean);
              })
              .map((s) => s.trim())
              .filter(Boolean);

            const imageCandidates = allImgs.filter((s) => {
              const u = s.toLowerCase();
              if (u.includes("settings/")) return false;
              if (u.includes("logo")) return false;
              if (u.includes("icon")) return false;
              if (u.includes("bismillah")) return false;
              if (u.includes("/frontend/assets/")) return false;
              if (u.includes("placeholder")) return false;
              if (u.includes("data:image")) return false;
              if (u.includes("cloudfront") || u.includes("cdn")) return true;
              if (u.includes("/uploads/") || u.includes("/media/") || u.includes("/products/")) return true;
              return u.endsWith(".jpg") || u.endsWith(".jpeg") || u.endsWith(".png") || u.endsWith(".webp");
            });

            const scored = imageCandidates
              .map((s) => {
                const u = s.toLowerCase();
                const score = u.includes("cloudfront") || u.includes("cdn") ? 3 : u.includes("/uploads/") || u.includes("/products/") ? 2 : 1;
                return { s, score };
              })
              .sort((a, b) => b.score - a.score);

            const image = scored[0]?.s || metaImage || "";

            const text = (document.body?.innerText || "").replace(/\s+/g, " ");
            const currentPriceMatch = text.match(/Rs\.\s*([0-9][0-9,]*)/i);
            const oldPriceMatch = text.match(/~\s*Rs\.\s*([0-9][0-9,]*)/i);
            const discountMatch = text.match(/(\d+)\s*%\s*Off/i);

            return {
              title: (() => {
                const cleanMeta = (t) => {
                  const s = String(t || "").replace(/\s+/g, " ").trim();
                  if (!s) return "";
                  const first = s.split("|")[0]?.trim() || s;
                  return first.replace(/\s*-\s*Telemart.*$/i, "").trim();
                };

                const metaTitle = cleanMeta(rawMetaTitle);
                if (metaTitle && metaTitle.length > 10) return metaTitle;

                const bad = new Set([
                  "description",
                  "rating & review",
                  "rating & reviews",
                  "reviews",
                  "customers & reviews",
                  "customers and reviews",
                ]);
                const h1s = Array.from(document.querySelectorAll("h1"))
                  .map((n) => (n.textContent || "").trim())
                  .filter(Boolean)
                  .filter((t) => t.length > 10 && !bad.has(t.toLowerCase()));
                h1s.sort((a, b) => b.length - a.length);
                return h1s[0] || "";
              })(),
              image,
              currentPrice: currentPriceMatch?.[1] ? `Rs. ${currentPriceMatch[1]}` : "",
              oldPrice: oldPriceMatch?.[1] ? `Rs. ${oldPriceMatch[1]}` : "",
              discountText: discountMatch?.[1] ? `${discountMatch[1]}% Off` : "",
            };
          })
          .catch(() => null);

        if (extra) {
          const extraImage = String(extra.image || "");
          if (!image && extraImage) {
            image = extraImage.startsWith("//")
              ? `https:${extraImage}`
              : extraImage.startsWith("/")
                ? `https://www.telemart.pk${extraImage}`
                : extraImage;
          }
          if (!product_name && extra.title) {
            const t = String(extra.title || "").trim();
            if (t) {
              product_name = t;
            }
          }
          if (extra.currentPrice) price = String(extra.currentPrice);
          if (!discount && extra.discountText) discount = String(extra.discountText);
          if ((!specialPrice || !regularPrice) && extra.oldPrice && extra.currentPrice && !discount) {
            discount = computeDiscount(extra.oldPrice, extra.currentPrice);
          }
        }
      }

      if (!product_name || !price) continue;

      out.push({
        phone,
        product_name,
        price,
        discount: discount || "",
        delivery_time: "",
        seller: "Telemart",
        image: image || "",
      });

      if (out.length >= max) break;
    }
  } finally {
    await detailPage.close().catch(() => {});
  }

  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const max = Number(args.max || 40);
  const headless = args.headful ? false : "new";
  const isHeadful = headless === false;
  const executablePath = typeof args.chrome === "string" ? args.chrome : undefined;
  const userDataDir = typeof args.userDataDir === "string" ? args.userDataDir : undefined;
  const slowMo = args.slowMo ? Number(args.slowMo) : undefined;
  const launchArgs = [];
  if (args.noSandbox) {
    launchArgs.push("--no-sandbox", "--disable-setuid-sandbox");
  }

  const repoRoot = path.resolve(__dirname, "..", "..");
  const frontendPublic = path.join(repoRoot, "Frontend", "public");
  const outDaraz = path.join(frontendPublic, "daraz_phone.csv");
  const outTelemart = path.join(frontendPublic, "telemart_phone.csv");

  if (!fs.existsSync(frontendPublic)) {
    throw new Error(`Frontend public folder not found: ${frontendPublic}`);
  }

  const browser = await puppeteer.launch({
    headless,
    executablePath,
    userDataDir,
    slowMo,
    args: launchArgs,
    defaultViewport: { width: 1366, height: 768 }
  });

  try {
    const pageDaraz = await browser.newPage();
    await pageDaraz.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"
    );

    const daraz = await scrapeDarazPhones(pageDaraz, max).catch((e) => {
      console.error("Daraz scrape failed:", e.message);
      return [];
    });

    await pageDaraz.close().catch(() => {});

    const pageTelemart = await browser.newPage();
    await pageTelemart.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"
    );

    const telemart = await scrapeTelemartPhones(pageTelemart, max).catch((e) => {
      console.error("Telemart scrape failed:", e.message);
      return [];
    });

    await pageTelemart.close().catch(() => {});

    fs.writeFileSync(outDaraz, toCsv(daraz), "utf8");
    fs.writeFileSync(outTelemart, toCsv(telemart), "utf8");

    console.log(`Saved: ${daraz.length} Daraz phones -> ${outDaraz}`);
    console.log(`Saved: ${telemart.length} Telemart phones -> ${outTelemart}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
