function futureHours(hours) {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d;
}

async function scrapeTelemartFlashDeals() {
  const expiryShort = futureHours(4);
  return [
    {
      productName: "HP Victus 15 Gaming Laptop",
      price: 185000,
      previousPrice: 209999,
      productImage:
        "https://images.pexels.com/photos/18105/pexels-photo.jpg",
      productUrl: "https://www.telemart.pk/hp-victus-15-gaming-laptop.html",
      brand: "HP",
      rating: 4.5,
      availability: "In Stock",
      platform: "Telemart",
      discountPercentage: 12,
      dealType: "FLASH_SALE",
      isBestValue: false,
      expiryTime: expiryShort,
    },
    {
      productName: "Lenovo IdeaPad 3 15ITL",
      price: 125000,
      previousPrice: 139999,
      productImage:
        "https://images.pexels.com/photos/18104/pexels-photo.jpg",
      productUrl: "https://www.telemart.pk/lenovo-ideapad-3-15itl.html",
      brand: "Lenovo",
      rating: 4.4,
      availability: "In Stock",
      platform: "Telemart",
      discountPercentage: 11,
      dealType: "FLASH_SALE",
      isBestValue: true,
      expiryTime: expiryShort,
    },
  ];
}

module.exports = {
  scrapeTelemartFlashDeals,
};
