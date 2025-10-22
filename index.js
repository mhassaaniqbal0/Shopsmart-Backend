import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
// import authRoutes from "./routes/auth.js";
import productRoutes from "./routes/products.js";
import authRoutes from "./routes/authRoutes.js";



dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
console.log('email user',process.env.EMAIL_USER)
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(5000, () => console.log("Server running on http://localhost:5000"));
  })
  .catch((err) => console.error("MongoDB connection error:", err));
