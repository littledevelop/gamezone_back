const express = require('express');
const router = express.Router();
const {getAllMemberships, getMyMembership ,getMembershipByID, createMembership, updateMembership, deleteMembership} = require('../controllers/membershipController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

// Get all memberships
router.get('/', authMiddleware,roleMiddleware("Admin","Staff"),getAllMemberships);

// Get logged-in player's membership
router.get(
    '/my-membership',
    authMiddleware,
    roleMiddleware("Player"),
    getMyMembership
);

// Get membership by ID
router.get('/:id', authMiddleware,roleMiddleware("Admin","Staff"),getMembershipByID);

// Create a new membership
router.post('/', authMiddleware,roleMiddleware("Admin","Staff"),createMembership);

//update a membership by ID
router.put('/:id', authMiddleware,roleMiddleware("Admin","Staff"),updateMembership);

//delete a membership by ID
router.delete('/:id', authMiddleware,roleMiddleware("Admin"),deleteMembership);

module.exports = router; 