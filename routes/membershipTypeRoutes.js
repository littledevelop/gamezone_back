const express = require("express");

const router = express.Router();

const authMiddleWare = require("../middleware/authMiddleware");

const roleMiddleware = require("../middleware/roleMiddleware");

const {getAllMembershipTypes,
    getMembershipTypeById,
    createMembershipType,
    updateMembershipType,
    deleteMembershipType
} = require("../controllers/membershipTypeController");

//get all membership types
router.get("/", authMiddleWare,roleMiddleware("Admin","Staff"),getAllMembershipTypes);

//get membertship type by id
router.get("/:id",authMiddleWare,roleMiddleware("Admin","Staff"),getMembershipTypeById);

//create membership type
router.post("/",authMiddleWare,roleMiddleware("Admin","Staff"),createMembershipType);

//update membership type
router.put("/:id",authMiddleWare,roleMiddleware("Admin","Staff"),updateMembershipType);

//delete Membership type
router.delete("/:id",authMiddleWare,roleMiddleware("Admin"),deleteMembershipType);

module.exports = router;