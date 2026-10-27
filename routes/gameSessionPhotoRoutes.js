
const express = require("express");
const router = express.Router();

const {
    uploadGameSessionPhoto,
    getGameSessionPhotos
} = require("../controllers/photoController");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const photoUpload = require("../middleware/photoUploadMiddleware");

// =====================================================
// CAMERA SERVICE AUTHENTICATION
// =====================================================

const cameraServiceAuth = (req, res, next) => {
    const expectedSecret = process.env.CAMERA_SERVICE_SECRET;
    const providedSecret = req.get("x-camera-service-secret");

    if (!expectedSecret) {
        console.error("CAMERA_SERVICE_SECRET is not configured");

        return res.status(500).json({
            success: false,
            message: "Camera service authentication is not configured"
        });
    }

    if (!providedSecret || providedSecret !== expectedSecret) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized camera service"
        });
    }

    req.cameraService = true;
    next();
};

// =====================================================
// CAMERA SERVICE → BACKEND PHOTO UPLOAD
// =====================================================

router.post(
    "/internal-upload",
    cameraServiceAuth,
    photoUpload.single("photo"),
    uploadGameSessionPhoto
);

// =====================================================
// GET PHOTOS FOR A GAME SESSION
// =====================================================

router.get(
    "/session/:sessionId",
    authMiddleware,
    roleMiddleware("Admin", "Staff", "Player"),
    getGameSessionPhotos
);

module.exports = router;
