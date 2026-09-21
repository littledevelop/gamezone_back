const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleWare = require("../middleware/roleMiddleware");

const {
    getPlatforms,
    getPlatformById,
    createPlatform,
    updatePlatform,
    deletePlatform
} = require("../controllers/platformController");


// View platforms
router.get(
    "/",
    authMiddleware,
    roleMiddleWare("Admin", "Staff", "Player"),
    getPlatforms
);


// View single platform
router.get(
    "/:id",
    authMiddleware,
    roleMiddleWare("Admin", "Staff", "Player"),
    getPlatformById
);


// Add platform
router.post(
    "/",
    authMiddleware,
    roleMiddleWare("Admin", "Staff"),
    createPlatform
);


// Edit platform
router.put(
    "/:id",
    authMiddleware,
    roleMiddleWare("Admin", "Staff"),
    updatePlatform
);


// Delete platform
router.delete(
    "/:id",
    authMiddleware,
    roleMiddleWare("Admin"),
    deletePlatform
);


module.exports = router;