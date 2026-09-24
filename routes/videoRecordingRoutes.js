const express = require("express");
const router = express.Router();

const {
    getAllVideoRecordings,
    getVideoRecordingById,
    createVideoRecording,
    updateVideoRecording,
    deleteVideoRecording
} = require("../controllers/videoRecordingController");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

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

module.exports = router;