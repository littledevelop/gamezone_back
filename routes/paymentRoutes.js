
const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const roleMiddleware = require("../middleware/roleMiddleware");

const {
    getAllPayments,
    getPaymentById,
    createPayment,
    updatePayment,
    deletePayment
} = require("../controllers/paymentController");


// ==================================================
// VIEW PAYMENTS
// Admin + Staff + Player
// Player will see only their own payments
// ==================================================

router.get(
    "/",
    authMiddleware,
    roleMiddleware("Admin", "Staff", "Player"),
    getAllPayments
);


// ==================================================
// VIEW SINGLE PAYMENT
// Admin + Staff + Player
// Controller should verify ownership for Player
// ==================================================

router.get(
    "/:id",
    authMiddleware,
    roleMiddleware("Admin", "Staff", "Player"),
    getPaymentById
);


// ==================================================
// CREATE PAYMENT
// Admin + Staff only
// ==================================================

router.post(
    "/",
    authMiddleware,
    roleMiddleware("Admin", "Staff"),
    createPayment
);


// ==================================================
// UPDATE PAYMENT
// Admin + Staff only
// ==================================================

router.put(
    "/:id",
    authMiddleware,
    roleMiddleware("Admin", "Staff"),
    updatePayment
);


// ==================================================
// DELETE PAYMENT
// Admin only
// ==================================================

router.delete(
    "/:id",
    authMiddleware,
    roleMiddleware("Admin"),
    deletePayment
);


module.exports = router;
