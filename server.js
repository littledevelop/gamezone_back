require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./config/db");

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
            success:fakse,
            message:"Database Connection Failed",
            error:error.message
        });
    }
});

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