const mongoose = require("mongoose");

async function connectToDatabase() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: process.env.DB_NAME,
    });
    console.log("MongoDB connected via Mongoose");
  } catch (err) {
    console.error("MongoDB connection failed", err);
    process.exit(1);
  }
}

module.exports = connectToDatabase;
