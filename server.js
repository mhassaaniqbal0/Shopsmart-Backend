require("dns").setDefaultResultOrder("ipv4first");
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectToDatabase = require('./config/db'); 
const authRoutes = require('./routes/authRoutes');
const session = require("express-session");
const passport = require("passport");
const articleRoutes = require('./routes/articleRoutes');
const supportRoutes = require('./routes/supportRoutes');
const adminRoutes = require('./routes/adminRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const sellerRoutes = require('./routes/sellerRoutes'); 
const medicineRoutes = require('./routes/medicineRoutes');
const flashDealsRoutes = require('./routes/flashDealsRoutes');
const userRoutes = require('./routes/userRoutes');
const vocRoutes = require('./routes/vocRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const wholesaleRoutes = require('./routes/wholesaleRoutes');
const productDetailRoutes = require('./routes/productDetailRoutes');



require("./config/passport");
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true,
  transports: ['polling', 'websocket']
});
const PORT = process.env.PORT || 5000;

// Export io to use in controllers
app.set('socketio', io);

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('join', (userId) => {
    if (userId) {
      socket.join(userId.toString());
      console.log(`User ${userId} joined their notification room: ${userId}`);
    } else {
      console.log('Join event received but no userId provided');
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`User disconnected: ${socket.id}, reason: ${reason}`);
  });
});

// ============================================
// Static Files
// ============================================
app.use('/uploads', express.static('uploads'));

// ============================================
// CORS Configuration - MUST BE FIRST
// ============================================
app.use(
  cors({
    origin: "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    optionsSuccessStatus: 200,
  })
);

// Add security headers for COOP (fixes Google Auth popup issues)
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  next();
});

// ============================================
// Session & Passport Configuration
// ============================================
app.use(session({
  secret: process.env.JWT_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// ============================================
// Body Parser Middleware
// ============================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ============================================
// Connect to Database
// ============================================
connectToDatabase()
  .then(() => console.log('✅ Database connection established'))
  .catch(err => console.error('❌ Database connection error:', err));

// ============================================
// Health Check Route
// ============================================
app.get('/', (req, res) => {
  res.json({ 
    message: 'Server is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ============================================
// API Routes
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/voc', vocRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/medicine', medicineRoutes);
app.use('/api/flash-deals', flashDealsRoutes);
app.use('/api/user', userRoutes);

app.use('/api/sellers', sellerRoutes);
app.use('/api/wholesale', wholesaleRoutes);
app.use('/api/product-detail', productDetailRoutes);

function msUntilNextRun(hour, minute) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

async function runWholesaleDailyScrape() {
  const enabled = String(process.env.WHOLESALE_DAILY_SCRAPE || "").toLowerCase() === "true";
  if (!enabled) return;

  const rawQueries = String(process.env.WHOLESALE_DAILY_QUERIES || "").trim();
  const queries = rawQueries
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);

  if (!queries.length) return;

  const maxPerPlatform = Math.min(50, Math.max(5, Number(process.env.WHOLESALE_DAILY_MAX || 20)));
  const platforms = String(process.env.WHOLESALE_DAILY_PLATFORMS || "Daraz,Telemart,MadeInChina,Alibaba")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const { scrapeWholesaleAndStore } = require("./scrapers/wholesaleScraper");

  for (const q of queries) {
    try {
      await scrapeWholesaleAndStore({ query: q, platforms, maxPerPlatform });
    } catch (e) {
      console.error("Wholesale daily scrape failed for query:", q, e?.message || e);
    }
  }
}

async function runProductDetailDailyScrape() {
  const enabled = String(process.env.PRODUCT_DETAIL_DAILY_SCRAPE || "").toLowerCase() === "true";
  if (!enabled) return;

  const rawQueries = String(process.env.PRODUCT_DETAIL_DAILY_QUERIES || "").trim();
  const queries = rawQueries
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 15);

  if (!queries.length) return;

  const maxPerPlatform = Math.min(20, Math.max(3, Number(process.env.PRODUCT_DETAIL_DAILY_MAX || 10)));
  const platforms = String(process.env.PRODUCT_DETAIL_DAILY_PLATFORMS || "Daraz,Telemart,Alibaba,Temu")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const { aggregateProductByQuery } = require("./scrapers/productAggregator");

  for (const q of queries) {
    try {
      await aggregateProductByQuery({ query: q, platforms, maxPerPlatform, force: true });
    } catch (e) {
      console.error("Product detail daily scrape failed for query:", q, e?.message || e);
    }
  }
}

function scheduleWholesaleDailyScrape() {
  const enabled = String(process.env.WHOLESALE_DAILY_SCRAPE || "").toLowerCase() === "true";
  if (!enabled) return;

  const hour = Math.min(23, Math.max(0, Number(process.env.WHOLESALE_DAILY_HOUR || 3)));
  const minute = Math.min(59, Math.max(0, Number(process.env.WHOLESALE_DAILY_MINUTE || 0)));

  const scheduleNext = () => {
    const delay = msUntilNextRun(hour, minute);
    setTimeout(async () => {
      await runWholesaleDailyScrape();
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}

function scheduleProductDetailDailyScrape() {
  const enabled = String(process.env.PRODUCT_DETAIL_DAILY_SCRAPE || "").toLowerCase() === "true";
  if (!enabled) return;

  const hour = Math.min(23, Math.max(0, Number(process.env.PRODUCT_DETAIL_DAILY_HOUR || 4)));
  const minute = Math.min(59, Math.max(0, Number(process.env.PRODUCT_DETAIL_DAILY_MINUTE || 0)));

  const scheduleNext = () => {
    const delay = msUntilNextRun(hour, minute);
    setTimeout(async () => {
      await runProductDetailDailyScrape();
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}
// ============================================
// 404 Handler
// ============================================
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// ============================================
// Global Error Handler
// ============================================
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  
  res.status(err.status || 500).json({
    error: err.message || 'Something went wrong!',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================
// Start Server
// ============================================
http.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📍 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  scheduleWholesaleDailyScrape();
  scheduleProductDetailDailyScrape();
});

// const sellerRoutes = require('./routes/sellerRoutes');
// app.use('/api/sellers', sellerRoutes);

module.exports = app;
