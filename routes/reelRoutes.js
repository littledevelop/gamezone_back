const express = require("express");
const router = express.Router();

const {
    getAllReels,
    getReelById,
    createReelDraft,
    saveGeneratedReel,
} = require("../controllers/reelController");

const authMiddleware = require("../middleware/authMiddleware");
const {
    generateReel
} = require("../controllers/reelGenerationController");

const{
    getAllTemplates,
    getTemplateById,
    createTemplate,
    updateTemplate,
    activateTemplate
} = require("../controllers/reelTemplateController");

// Reel template routes — keep these before /:id
router.get("/templates", authMiddleware, getAllTemplates);
router.get("/templates/:id", authMiddleware, getTemplateById);
router.post("/templates", authMiddleware, createTemplate);
router.put("/templates/:id", authMiddleware, updateTemplate);
router.put("/templates/:id/activate", authMiddleware, activateTemplate);


// Existing reel routes

router.get("/", authMiddleware, getAllReels);
router.get("/:id", authMiddleware, getReelById);
router.post("/", authMiddleware, createReelDraft);
router.put("/:id/generated", authMiddleware, saveGeneratedReel);
router.post("/:id/generate", authMiddleware, generateReel);

module.exports = router;
