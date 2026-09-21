const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleWare = require("../middleware/roleMiddleware");

const {
    getGameTypes,
    getGameTypeById,
    createGameType,
    updateGameType,
    deleteGameType
} = require("../controllers/gameTypeContorller");


// View game types
router.get(
    "/",
    authMiddleware,
    roleMiddleWare("Admin", "Staff", "Player"),
    getGameTypes
);


// View single game type
router.get(
    "/:id",
    authMiddleware,
    roleMiddleWare("Admin", "Staff", "Player"),
    getGameTypeById
);


// Add game type
router.post(
    "/",
    authMiddleware,
    roleMiddleWare("Admin", "Staff"),
    createGameType
);


// Edit game type
router.put(
    "/:id",
    authMiddleware,
    roleMiddleWare("Admin", "Staff"),
    updateGameType
);


// Delete game type
router.delete(
    "/:id",
    authMiddleware,
    roleMiddleWare("Admin"),
    deleteGameType
);


module.exports = router;