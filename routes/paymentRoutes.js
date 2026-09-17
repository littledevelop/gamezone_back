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

router.get("/",authMiddleware,roleMiddleware("Admin","Staff"),getAllPayments);

router.get("/:id",authMiddleware,roleMiddleware("Admin","Staff"),getPaymentById);

router.post("/",authMiddleware,roleMiddleware("Admin","Staff"),createPayment);

router.put("/:id",authMiddleware,roleMiddleware("Admin","Staff"),updatePayment);

router.delete("/:id",authMiddleware,roleMiddleware("Admin"),deletePayment);

module.exports = router;



