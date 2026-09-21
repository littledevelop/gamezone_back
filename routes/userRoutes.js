const express = require("express");

const router = express.Router();

const { getPlayers } = require("../controllers/userController");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// Get registered players
router.get(
    "/players",
    authMiddleware,
    roleMiddleware("Admin", "Staff"),
    getPlayers
);

module.exports = router;