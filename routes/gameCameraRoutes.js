const express = require("express");

const router = express.Router();

const {
    getCamerasByGame,
    assignCameraToGame,
    removeCameraFromGame
} = require("../controllers/gameCameraController");


// GET cameras assigned to a game
router.get(
    "/game/:gameId",
    getCamerasByGame
);


// Assign camera to game
router.post(
    "/",
    assignCameraToGame
);


// Remove camera from game
router.delete(
    "/:id",
    removeCameraFromGame
);


module.exports = router;