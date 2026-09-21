const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const roleMiddleware = require("../middleware/roleMiddleware");

const {getAllGamingStations,
    getGamingStationById,
    createGamingStation,
    updateGamingStation,
    deleteGamingStation
} = require("../controllers/gamingStationController");

//get all game station routes
router.get("/",authMiddleware,roleMiddleware("Admin","Staff","Player"),getAllGamingStations);

//get single game station route
router.get("/:id",authMiddleware,roleMiddleware("Admin","Staff"),getGamingStationById);

//create game station
router.post("/",authMiddleware,roleMiddleware("Admin","Staff"),createGamingStation);

//update game station
router.put("/:id",authMiddleware,roleMiddleware("Admin","Staff"),updateGamingStation);

//delete game station
router.delete("/:id",authMiddleware,roleMiddleware("Admin"),deleteGamingStation);

module.exports = router;