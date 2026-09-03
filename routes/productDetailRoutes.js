const express = require("express");
const router = express.Router();

const { getProductDetail } = require("../controllers/productDetailController");

router.get("/", getProductDetail);

module.exports = router;
