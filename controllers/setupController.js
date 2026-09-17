const bcrypt = require("bcryptjs");
const db = require('../config/db');

const setupdAdmin = async(req,res)=>{
    try{
        const {full_name,mobile,email,password,date_of_birth,address} = req.body;

        //validate the required fields
        if(!full_name || !email || !password){
            return res.status(400).json({
                success:false,
                message:"full name,mobile,password are required"
            });
        }
        
        const [admin] = await db.query("SELECT id FROM users WHERE role_id = 1 LIMIT 1");

        if(admin.length > 0){
            return res.status(400).json({
                success:false,
                message:"Admin already exists"
            });
        }
        //check mobile number already exists
        const [existingMobile] = await db.query("SELECT id FROM users WHERE mobile =?",[mobile]);

        if(existingMobile.length > 0){
            return res.status(400).json({
                success:false,
                message:"Mobile number already exists"
            });
        }
        //check email already exists
        const [existingEmail] = await db.query("SELECT id FROM users WHERE email =?",[email]);

        if(existingEmail.length > 0){
            return res.status(400).json({
                success:false,
                message:"Email already exists"
            });
        }

        //hash password
        const hashedPassword = await bcrypt.hash(password,10);

        //create Admin user
        const [result]  = await db.query("INSERT INTO users (full_name,mobile,email,password,date_of_birth,address,is_verified,role_id) VALUES (?,?,?,?,?,?,?,?)",[full_name,mobile,email,hashedPassword,date_of_birth || null,address || null,1,1]);

        return res.status(201).json({
            success:true,
            message:"Admin user created successfully",
            admin:{
                id:result.insertId,
                full_name,
                mobile,
                email,
                role_id:1,
                role_name:"Admin"
            }
        });
    }catch(error){
        console.log("Setup Admin Error:",error.message);
        return res.status(500).json({
            success:false,
            message:"Server error during admin setup"
        });
    }
};

const setupStaff = async(req,res) => {
    try{
        const {full_name,mobile,email,password,date_of_birth,address} = req.body;

        //validate the required fields
        if(!full_name || !email || !password){
            return res.status(400).json({
                success:false,
                message:"full name,mobile,password are required"
            });
        }

        //check whether the user is already a staff member
        const [existingStaff] = await db.query("SELECT id FROM users WHERE role_id = 2 AND (mobile = ? OR email = ?)",[mobile,email]);
        
        if(existingStaff.length > 0){
            return res.status(400).json({
                success:false,
                message:"Staff member already exists"
            });
        }

        //hash password
        const hashedPassword = await bcrypt.hash(password,10);

        //create Staff user
        const [result]  = await db.query("INSERT INTO users (full_name,mobile,email,password,date_of_birth,address,is_verified,role_id) VALUES (?,?,?,?,?,?,?,?)",[full_name,mobile,email,hashedPassword,date_of_birth || null,address || null,1,2]);

        return res.status(201).json({
            success:true,
            message:"Staff user created successfully",
            staff:{
                id:result.insertId,
                full_name,
                mobile,
                email,
                role_id:2,
                role_name:"Staff"
            }
        });

    }catch(error){
        console.log("Setup Staff Error:",error.message);
        return res.status(500).json({
            success:false,
            message:"Server error during staff setup"
        });
    }
};

module.exports = {setupdAdmin,setupStaff};
