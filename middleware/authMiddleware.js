const jwt = require("jsonwebtoken");
const User = require("../models/user");

exports.verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    console.log("Incoming request for:", req.originalUrl, "Auth Header:", authHeader ? "Present" : "Missing");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("Auth failed: Missing or malformed header", { authHeader });
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      console.log("Auth failed: Token is empty after split");
      return res.status(401).json({ message: "Invalid token format" });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log("Token verified successfully for user ID:", decoded.id || decoded._id);

      const user = await User.findById(decoded.id || decoded._id).select("-password");
      if (!user) {
        console.log("Auth failed: User not found in DB for ID:", decoded.id || decoded._id);
        return res.status(404).json({ message: "User not found" });
      }

      req.user = user;
      next();
    } catch (jwtErr) {
      console.error("JWT Verification Error:", jwtErr.message);
      if (jwtErr.name === 'TokenExpiredError') {
        return res.status(401).json({ message: "Token expired" });
      }
      return res.status(401).json({ message: "Invalid token" });
    }
  } catch (err) {
    console.error("Auth Middleware Error:", err.message);
    return res.status(500).json({ message: "Internal server error during authentication" });
  }
};

exports.verifyAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }
  next();
};
