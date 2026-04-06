// const mongoose = require("mongoose");

// async function connectToDatabase() {
//   try {
//     console.log("🌐 Connecting to MongoDB with URI:", process.env.MONGO_URI);
//     await mongoose.connect(process.env.MONGO_URI, {
//       useNewUrlParser: true,
//       useUnifiedTopology: true,
//       // dbName: process.env.DB_NAME,
//     });
//     console.log("MongoDB connected via Mongoose");
//   } catch (err) {
//     console.error("MongoDB connection failed", err);
//     process.exit(1);
//   }
// }

// module.exports = connectToDatabase;

const mongoose = require("mongoose");

const connectToDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
      family: 4
    });

    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectToDatabase;


// const mongoose = require("mongoose");

// async function connectToDatabase() {
//   try {
//     await mongoose.connect(process.env.MONGO_URI
//     );
//     console.log("✅ MongoDB connected successfully");
//   } catch (error) {
//     console.error("❌ MongoDB connection failed:", error.message);
//     throw error; // 🔥 VERY IMPORTANT
//   }
// }
// module.exports = connectToDatabase;