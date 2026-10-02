const express = require("express");

const router = express.Router();

const { getPlayers, getUsers, createUser, updateUser } = require("../controllers/userController");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// Get registered players
router.get(
    "/players",
    authMiddleware,
    roleMiddleware("Admin", "Staff"),
    getPlayers
);

// Get all Staff and Players
router.get(
    "/",
    authMiddleware,
    roleMiddleware("Admin", "Staff"),
    getUsers
);

// Admin creates Staff or Player
router.post(
    "/",
    authMiddleware,
    roleMiddleware("Admin"),
    createUser
);

//Admin updates Staff or Player
router.put(
    "/:id",
    authMiddleware,
    roleMiddleware("Admin"),
    updateUser
);

module.exports = router;