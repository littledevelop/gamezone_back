const express = require('express');
const router = express.Router();
const setupController = require('../controllers/setupController');  

router.post('/setup-admin',setupController.setupdAdmin);

router.post('/setup-staff',setupController.setupStaff);

module.exports = router;