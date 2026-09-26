const express = require("express");
const router = express.Router();

const {
    getAllCameras,
    getCameraById,
    createCamera,
    updateCamera,
    deleteCamera
} = require("../controllers/cameraController");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// Get all cameras
router.get(
    "/",
    authMiddleware,
    roleMiddleware("Admin", "Staff"),
    getAllCameras
);

// Get single camera
router.get(
    "/:id",
    authMiddleware,
    roleMiddleware("Admin", "Staff"),
    getCameraById
);

// Create camera
router.post(
    "/",
    authMiddleware,
    roleMiddleware("Admin", "Staff"),
    createCamera
);

// Update camera
router.put(
    "/:id",
    authMiddleware,
    roleMiddleware("Admin", "Staff"),
    updateCamera
);

// Delete camera - Admin only
router.delete(
    "/:id",
    authMiddleware,
    roleMiddleware("Admin"),
    deleteCamera
);

module.exports = router;