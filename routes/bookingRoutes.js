const express = require('express');
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const {getAllBookings,getBookingById,createBooking,updateBooking,deleteBooking} = require("../controllers/bookingController");

//get all booking routes
router.get("/",authMiddleware,roleMiddleware("Admin","Staff","Player"), getAllBookings);

//get booking by id
router.get("/:id",authMiddleware,roleMiddleware("Admin","Staff","Player"), getBookingById);

//create booking route
router.post("/",authMiddleware,roleMiddleware("Admin","Staff"),createBooking);


//update booking route
router.put("/:id",authMiddleware,roleMiddleware("Admin","Staff"),updateBooking);

//delete booking route

//create booking route
router.delete("/:id",authMiddleware,roleMiddleware("Admin"),deleteBooking);

module.exports = router;