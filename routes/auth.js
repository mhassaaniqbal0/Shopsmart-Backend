import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();

router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  const existing = await User.findOne({ email });
  console.log('existing',existing)
  if (existing) return res.status(400).json({ message: "User already exists" });

  const hashed = await bcrypt.hash(password, 10);
  const user = new User({ name, email, password: hashed });
  await user.save();
  res.status(201).json({ message: "User registered" });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: "User not found" });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  
  // 👇 Send back name along with token
  res.json({ token, name: user.name });
});


export default router;
