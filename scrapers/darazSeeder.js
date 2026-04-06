function futureHours(hours) {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d;
}

async function scrapeDarazFlashDeals() {
  const expiryShort = futureHours(3);
  const expiryLong = futureHours(8);
  return [
    {
      productName: "Apple iPhone 13 128GB",
      price: 220000,
      previousPrice: 249999,
      productImage:
        "https://tse3.mm.bing.net/th/id/OIP.ykw83Uy-wp2Ql2xKjH-vLAHaHa?pid=Api&P=0&h=220",
      productUrl: "https://www.daraz.pk/smartphones/apple-iphone-13-128gb/",
      brand: "Apple",
      rating: 4.7,
      availability: "In Stock",
      platform: "Daraz",
      discountPercentage: 12,
      dealType: "FLASH_SALE",
      isBestValue: false,
      expiryTime: expiryShort,
    },
    {
      productName: "Samsung Galaxy S22 8GB 256GB",
      price: 198000,
      previousPrice: 229999,
      productImage:
        "https://tse1.mm.bing.net/th/id/OIP.XwJ889hbrMie6iA452AivgHaE7?pid=Api&P=0&h=220",
      productUrl: "https://www.daraz.pk/smartphones/samsung-galaxy-s22-8gb-256gb/",
      brand: "Samsung",
      rating: 4.6,
      availability: "In Stock",
      platform: "Daraz",
      discountPercentage: 14,
      dealType: "FLASH_SALE",
      isBestValue: false,
      expiryTime: expiryShort,
    },
    {
      productName: "Infinix Zero 30 256GB",
      price: 65000,
      previousPrice: 79999,
      productImage:
        "https://tse4.mm.bing.net/th/id/OIP.LMtr_QpOp5Vh4rpUrdrFygHaEK?pid=Api&P=0&h=220",
      productUrl: "https://www.daraz.pk/smartphones/infinix-zero-30-256gb/",
      brand: "Infinix",
      rating: 4.3,
      availability: "In Stock",
      platform: "Daraz",
      discountPercentage: 19,
      dealType: "FLASH_SALE",
      isBestValue: true,
      expiryTime: expiryLong,
    },
  ];
}

module.exports = {
  scrapeDarazFlashDeals,
};
