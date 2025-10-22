import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  name: String,
  image: String,
  platformPrices: [
    {
      platform: String,
      price: String,
      link: String,
    },
  ],
});

export default mongoose.model("Product", productSchema);
