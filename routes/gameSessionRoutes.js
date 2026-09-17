const express = require("express");
const router = express.Router();

const {getAllGameSessions, getGameSessionById, createGameSession, updateGameSession, deleteGameSession} = require("../controllers/gameSessionController");

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');


router.get("/",authMiddleware, roleMiddleware("Admin","Staff","Player"),getAllGameSessions);

router.get("/:id",authMiddleware, roleMiddleware("Admin","Staff","Player"),getGameSessionById);

router.post("/",authMiddleware, roleMiddleware("Admin","Staff"),createGameSession);

router.put("/:id",authMiddleware, roleMiddleware("Admin","Staff"),updateGameSession);

router.delete("/:id",authMiddleware, roleMiddleware("Admin"),deleteGameSession);

module.exports = router;