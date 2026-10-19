const express = require("express");
const router = express.Router();

const {
    getAllVideoRecordings,
    getVideoRecordingById,
    createVideoRecording,
    updateVideoRecording,
    deleteVideoRecording,
    uploadVideoToCloudinary
} = require("../controllers/videoRecordingController");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const upload = require("../middleware/uploadMiddleware");
// View recordings
router.get(
    "/",
    authMiddleware,
    roleMiddleware("Admin", "Staff", "Player"),
    getAllVideoRecordings
);

// View single recording
router.get(
    "/:id",
    authMiddleware,
    roleMiddleware("Admin", "Staff", "Player"),
    getVideoRecordingById
);

// Create recording
router.post(
    "/",
    authMiddleware,
    roleMiddleware("Admin", "Staff"),
    createVideoRecording
);

// Update recording
router.put(
    "/:id",
    authMiddleware,
    roleMiddleware("Admin", "Staff"),
    updateVideoRecording
);

// Delete recording
router.delete(
    "/:id",
    authMiddleware,
    roleMiddleware("Admin"),
    deleteVideoRecording
);

router.post(
    "/upload",
    authMiddleware,
    roleMiddleware("Admin", "Staff"),
    upload.single("video"),
    uploadVideoToCloudinary
);


// Internal upload authentication for the camera service
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

    if (
        !providedSecret ||
        providedSecret !== expectedSecret
    ) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized camera service"
        });
    }

    req.cameraService = true;
    next();
};

// Automatic upload from the local camera service
router.post(
    "/internal-upload",
    cameraServiceAuth,
    upload.single("video"),
    uploadVideoToCloudinary
);


module.exports = router;