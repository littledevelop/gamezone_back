const express = require("express");

const router = express.Router();

const {
    createVideoQRCode,
    getVideoByQRCode,
    deleteExpiredVideo,
    getLatestActiveVideoQR,
} = require("../controllers/qrCodeController");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// Create QR - Admin/Staff only
router.post(
    "/video",
    authMiddleware,
    roleMiddleware("Admin", "Staff"),
    createVideoQRCode
);

// Latest active QR - public
router.get(
    "/latest",
    getLatestActiveVideoQR
);

// Scan QR - public
router.get(
    "/video/:qrCode",
    getVideoByQRCode
);

// Delete expired video - Admin/Staff only
router.delete(
    "/video/expired/:qrCode",
    authMiddleware,
    roleMiddleware("Admin", "Staff"),
    deleteExpiredVideo
);

module.exports = router;