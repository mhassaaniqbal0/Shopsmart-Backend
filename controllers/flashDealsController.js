const Product = require("../models/Product");
const User = require("../models/User");

/**
 * GET /api/flash-deals
 * 
 * Returns flash deals, best value deals, limited time offers, and personalized deals
 * Query params:
 * - userId (optional): For personalized recommendations
 * - limit (optional): Number of results per category (default: 20)
 * - platform (optional): Filter by "Daraz" or "Telemart"
 */
async function getFlashDeals(req, res) {
  try {
    const { userId, limit = 20, platform } = req.query;
    const limitNum = parseInt(limit, 10) || 20;

    // Build base match conditions
    const matchConditions = {
      platform: { $in: ["Daraz", "Telemart"] },
      availability: { $ne: "Out of Stock" }, // Only in-stock items
    };

    // Add platform filter if specified
    if (platform && ["Daraz", "Telemart"].includes(platform)) {
      matchConditions.platform = platform;
    }

    // ============================================
    // 1. FLASH DEALS - Products with discount >= 20% OR price drop
    // ============================================
    const flashDealsMatch = {
      ...matchConditions,
      $or: [
        { discountPercentage: { $gte: 20 } },
        { previousPrice: { $exists: true, $gt: "$price" } },
      ],
    };

    const flashDeals = await Product.aggregate([
      { $match: flashDealsMatch },
      {
        $addFields: {
          // Calculate discount if not already set
          calculatedDiscount: {
            $cond: {
              if: {
                $and: [
                  { $ne: ["$previousPrice", null] },
                  { $gt: ["$previousPrice", "$price"] },
                ],
              },
              then: {
                $round: {
                  $multiply: [
                    {
                      $divide: [
                        { $subtract: ["$previousPrice", "$price"] },
                        "$previousPrice",
                      ],
                    },
                    100,
                  ],
                },
              },
              else: "$discountPercentage",
            },
          },
          // Determine dealType
          finalDealType: {
            $cond: {
              if: { $gte: ["$discountPercentage", 20] },
              then: "FLASH_SALE",
              else: {
                $cond: {
                  if: { $gt: ["$discountPercentage", 0] },
                  then: "DISCOUNTED",
                  else: "BUNDLE",
                },
              },
            },
          },
        },
      },
      { $sort: { discountPercentage: -1, createdAt: -1 } },
      { $limit: limitNum },
      {
        $project: {
          _id: 1,
          productName: 1,
          price: 1,
          previousPrice: 1,
          productImage: 1,
          productUrl: 1,
          brand: 1,
          rating: 1,
          availability: 1,
          platform: 1,
          discountPercentage: {
            $cond: {
              if: {
                $and: [
                  { $ne: ["$previousPrice", null] },
                  { $gt: ["$previousPrice", "$price"] },
                ],
              },
              then: "$calculatedDiscount",
              else: "$discountPercentage",
            },
          },
          dealType: "$finalDealType",
          valueScore: 1,
          expiryTime: 1,
          createdAt: 1,
        },
      },
    ]);

    // ============================================
    // 2. BEST VALUE DEALS - Top products by valueScore (rating / price)
    // ============================================
    const bestValueDeals = await Product.aggregate([
      { $match: matchConditions },
      {
        $match: {
          rating: { $ne: null, $gt: 0 },
          price: { $gt: 0 },
        },
      },
      {
        $addFields: {
          valueScore: {
            $divide: ["$rating", "$price"],
          },
        },
      },
      { $sort: { valueScore: -1, rating: -1 } },
      { $limit: limitNum },
      {
        $project: {
          _id: 1,
          productName: 1,
          price: 1,
          previousPrice: 1,
          productImage: 1,
          productUrl: 1,
          brand: 1,
          rating: 1,
          availability: 1,
          platform: 1,
          discountPercentage: 1,
          dealType: 1,
          valueScore: 1,
          isBestValue: { $literal: true },
          expiryTime: 1,
          createdAt: 1,
        },
      },
    ]);

    // ============================================
    // 3. LIMITED TIME DEALS - Products with expiryTime
    // ============================================
    const now = new Date();
    const limitedTimeDeals = await Product.aggregate([
      {
        $match: {
          ...matchConditions,
          expiryTime: { $exists: true, $ne: null, $gt: now },
        },
      },
      {
        $addFields: {
          remainingTime: {
            $subtract: ["$expiryTime", now],
          },
        },
      },
      {
        $addFields: {
          remainingTimeSeconds: {
            $divide: ["$remainingTime", 1000],
          },
        },
      },
      { $sort: { expiryTime: 1 } }, // Soonest to expire first
      { $limit: limitNum },
      {
        $project: {
          _id: 1,
          productName: 1,
          price: 1,
          previousPrice: 1,
          productImage: 1,
          productUrl: 1,
          brand: 1,
          rating: 1,
          availability: 1,
          platform: 1,
          discountPercentage: 1,
          dealType: 1,
          valueScore: 1,
          expiryTime: 1,
          remainingTime: {
            $round: "$remainingTimeSeconds",
          },
          createdAt: 1,
        },
      },
    ]);

    // ============================================
    // 4. PERSONALIZED DEALS - Based on userId
    // ============================================
    let personalizedDeals = [];

    if (userId) {
      try {
        const user = await User.findById(userId)
          .populate("wishlist")
          .populate("recentlyViewed.productId");

        if (user) {
          const personalizedMatch = { ...matchConditions };

          // Get user's preferred platforms if set
          if (
            user.preferredPlatforms &&
            user.preferredPlatforms.length > 0
          ) {
            personalizedMatch.platform = {
              $in: user.preferredPlatforms,
            };
          }

          // Get product IDs from wishlist and recently viewed
          const wishlistIds =
            user.wishlist && user.wishlist.length > 0
              ? user.wishlist.map((p) => p._id || p)
              : [];
          const recentlyViewedIds =
            user.recentlyViewed && user.recentlyViewed.length > 0
              ? user.recentlyViewed
                  .slice(-10)
                  .map((rv) => rv.productId?._id || rv.productId)
                  .filter(Boolean)
              : [];

          const allPersonalizedIds = [
            ...new Set([...wishlistIds, ...recentlyViewedIds]),
          ];

          if (allPersonalizedIds.length > 0) {
            personalizedMatch._id = { $in: allPersonalizedIds };
          }

          // Also include similar products (same brand or category)
          const brandMatch = { ...personalizedMatch };
          if (wishlistIds.length > 0) {
            const wishlistProducts = await Product.find({
              _id: { $in: wishlistIds },
            }).select("brand");
            const brands = [
              ...new Set(
                wishlistProducts.map((p) => p.brand).filter(Boolean)
              ),
            ];
            if (brands.length > 0) {
              delete brandMatch._id; // Remove ID restriction for brand match
              brandMatch.brand = { $in: brands };
            }
          }

          personalizedDeals = await Product.aggregate([
            {
              $match: {
                $or: [personalizedMatch, brandMatch],
              },
            },
            {
              $addFields: {
                // Prioritize wishlist items
                isWishlisted: {
                  $cond: {
                    if: { $in: ["$_id", wishlistIds] },
                    then: 1,
                    else: 0,
                  },
                },
                // Prioritize recently viewed
                isRecentlyViewed: {
                  $cond: {
                    if: { $in: ["$_id", recentlyViewedIds] },
                    then: 1,
                    else: 0,
                  },
                },
              },
            },
            {
              $sort: {
                isWishlisted: -1,
                isRecentlyViewed: -1,
                discountPercentage: -1,
                valueScore: -1,
              },
            },
            { $limit: limitNum },
            {
              $project: {
                _id: 1,
                productName: 1,
                price: 1,
                previousPrice: 1,
                productImage: 1,
                productUrl: 1,
                brand: 1,
                rating: 1,
                availability: 1,
                platform: 1,
                discountPercentage: 1,
                dealType: 1,
                valueScore: 1,
                expiryTime: 1,
                createdAt: 1,
              },
            },
          ]);
        }
      } catch (userError) {
        console.error("Error fetching user for personalization:", userError);
        // Continue without personalization if user fetch fails
      }
    }

    // ============================================
    // 5. Add expiryTime to flash deals and best value deals if not set
    // ============================================
    const addExpiryTime = (deals, hours = 6) => {
      return deals.map((deal) => {
        if (!deal.expiryTime) {
          const expiry = new Date();
          expiry.setHours(expiry.getHours() + hours);
          deal.expiryTime = expiry;
          const remainingSeconds = Math.max(
            0,
            Math.floor((expiry - new Date()) / 1000)
          );
          deal.remainingTime = remainingSeconds;
        } else {
          const remainingSeconds = Math.max(
            0,
            Math.floor((deal.expiryTime - new Date()) / 1000)
          );
          deal.remainingTime = remainingSeconds;
        }
        return deal;
      });
    };

    const flashDealsWithExpiry = addExpiryTime(flashDeals, 6);
    const bestValueDealsWithExpiry = addExpiryTime(bestValueDeals, 12);

    // ============================================
    // 6. Update isBestValue flag in database for top products
    // ============================================
    if (bestValueDeals.length > 0) {
      const topValueIds = bestValueDeals
        .slice(0, 10)
        .map((deal) => deal._id);
      await Product.updateMany(
        { _id: { $in: topValueIds } },
        { $set: { isBestValue: true } }
      );
    }

    // ============================================
    // 7. Return formatted response
    // ============================================
    return res.status(200).json({
      success: true,
      flashDeals: flashDealsWithExpiry,
      bestValueDeals: bestValueDealsWithExpiry,
      limitedTimeDeals: limitedTimeDeals,
      personalizedDeals: personalizedDeals.length > 0 ? personalizedDeals : [],
      meta: {
        totalFlashDeals: flashDealsWithExpiry.length,
        totalBestValue: bestValueDealsWithExpiry.length,
        totalLimitedTime: limitedTimeDeals.length,
        totalPersonalized: personalizedDeals.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error in getFlashDeals:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch flash deals",
      error: error.message,
    });
  }
}

module.exports = {
  getFlashDeals,
};


