// backend/middleware/auth.js
import jwt from "jsonwebtoken";
import User from "../models/user.js"; // path must match your project

/**
 * Usage:
 * app.use('/api/wishlists', auth, wishlistRoutes)
 *
 * Behavior:
 * - If header 'x-user-id' exists (dev convenience) it will set req.user = { id: x-user-id }
 * - Otherwise it expects Authorization: Bearer <token> and verifies it with process.env.JWT_SECRET
 * - On success: req.user = { id, email } (payload values depend on how you sign the token)
 * - On failure: returns 401 with message
 */

export default async function auth(req, res, next) {
  try {
    // Dev helper: allow x-user-id to simulate login during development
    const devUserId = req.headers['x-user-id'];
    if (devUserId) {
      req.user = { id: devUserId };
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'Authorization header missing' });

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ message: 'Malformed Authorization header' });
    }

    const token = parts[1];
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    // payload shape depends on how you sign tokens - adapt if you use different keys
    // common pattern in your login: jwt.sign({ id: user._id, email: user.email }, JWT_SECRET)
    const userId = payload.id || payload.sub || payload._id;
    if (!userId) return res.status(401).json({ message: 'Token missing user id' });

    // Optionally fetch user from DB to ensure still exists / not disabled.
    // This step is optional if you want faster auth without DB hit.
    try {
      const user = await User.findById(userId).select('+password'); // no password returned because toJSON strips; but select ensures presence if needed
      if (!user) return res.status(401).json({ message: 'User not found' });

      // Attach minimal user info to request
      req.user = { id: user._id.toString(), email: user.email, name: user.name };
      return next();
    } catch (err) {
      console.error('Auth middleware DB error:', err);
      return res.status(500).json({ message: 'Server error' });
    }

  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}
