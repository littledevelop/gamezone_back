const express = require("express");
const router = express.Router();

const {register,login} = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

//register
router.post("/register",register);

//login
router.post("/login",login);

//get logged-in user
router.get("/me", authMiddleware, (req,res) => {
    res.json({
        success: true,
        message: "Authenticated user",
        user:req.user
    });
});

router.get("/admin-test",authMiddleware,roleMiddleware("Admin"),(req,res)=>{
    res.json({
        success:true,
        message:"Admin access granted",
        user:req.user
    });
});

router.get("/staff-test",authMiddleware,roleMiddleware("Staff"),(req,res)=>{
    res.json({
        success:true,   
        message:"Staff access granted",
        user:req.user
    });
});

//player test route
router.get("/player-test", authMiddleware,roleMiddleware("Player"), (req,res) =>{
    res.json({
        success:true,
        message:"Admin access granted",
        user:req.user
    });
}
);


module.exports = router;