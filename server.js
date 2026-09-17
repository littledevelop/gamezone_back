require("dotenv").config();
const express = require("express");
const cors = require("cors");+3
const db = require("./config/db");
const setupRoutes = require("./routes/setupRoutes");
const authRoutes = require("./routes/authRoutes");
const gameRoutes = require("./routes/gameRoutes");
const gamingStationRoutes = require("./routes/gamingStationRoutes");
const membershipTypesRoutes = require("./routes/membershipTypeRoutes");
const membershipRoutes = require("./routes/membershipRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const gameSessionRoutes = require("./routes/gameSessionRoutes");
const paymentRoutes = require("./routes/paymentRoutes");

const app = express();

//middleware
app.use(cors());
app.use(express.json());

//Home Route
app.get("/",(req,res)=>{
    res.json({
        success:true,
        message:"GameZone App is Running"
    });
});

//Database test route
app.get("/api/test-db",async(req,res)=>{

    try{
        const [result] = await db.query("Select 1 as test");
        res.json({
            success:true,
            message:"Database is Connected Successfully!",
            database: result
        });

    }catch(error){
        console.error("Database Test Failed:", error.message);
        res.status(500).json({
            success:false,
            message:"Database Connection Failed",
            error:error.message
        });
    }
});

//admin or staff setup routes
app.use("/api/setup",setupRoutes);

//auth routes 
app.use("/api/auth",authRoutes);

app.use("/api/games",gameRoutes);

app.use("/api/gaming-stations",gamingStationRoutes);

app.use("/api/membership-types",membershipTypesRoutes);

app.use("/api/memberships",membershipRoutes);

app.use("/api/booking", bookingRoutes);

app.use("/api/game-session", gameSessionRoutes);

app.use("/api/payments",paymentRoutes);

const PORT = process.env.PORT || 5000;

async function startServer(){
    try{
        const connection = await db.getConnection();
        
        console.log("MYSQL Database Connected Successfully");

        connection.release();

        app.listen(PORT,()=>{
            console.log(`GameZone Server running on port ${PORT}`);
        });
    }catch(error){
        console.error("MYSQL Connection Failed:", error.message);
        process.exit(1);
    }
}

startServer();