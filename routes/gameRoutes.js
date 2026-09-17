const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleWare = require("../middleware/roleMiddleware");
const { getGames, getGameById, createGame, updateGame, deleteGame } = require("../controllers/gameController");

//get all games
router.get("/",authMiddleware,roleMiddleWare("Admin","Staff","Player"),getGames);


//get single game
router.get("/:id",authMiddleware,roleMiddleWare("Admin","Staff","Player"),getGameById);


//create game
router.post("/",authMiddleware,roleMiddleWare("Admin","Staff"),createGame);

//update game
router.put("/:id",authMiddleware,roleMiddleWare("Admin","Staff"),updateGame);


//Delete game
router.delete("/:id",authMiddleware,roleMiddleWare("Admin"),deleteGame);

module.exports = router;