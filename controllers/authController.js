const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const {createUserRecord} = require("./userController");

// Register Player
const register = async (req, res) => {
    try {
        const {
            full_name,
            mobile,
            email,
            password,
            date_of_birth,
            address
        } = req.body;

        // Validate fields
        if (!full_name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Full name, email, password are required"
            });
        }

        // Always create Player
        const user = await createUserRecord({
            full_name,
            mobile,
            email,
            password,
            date_of_birth,
            address,
            role_id: 3
        });

        return res.status(201).json({
            success: true,
            message: "User registered successfully",
            user
        });

    } catch (error) {
        console.error("Registration Error:", error);

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }

        return res.status(500).json({
            success: false,
            message: "Server error during registration"
        });
    }
};

//login user
const login = async(req,res)=>{
    try{
        const {email,password} = req.body;
        if(!email || !password){
            return res.status(400).json({
                success:false,
                message:"Email and password are required"
            });
        }

        //find user
        const [users] = await db.query(
            `SELECT u.id, u.full_name, u.mobile, u.email, u.password, u.role_id, r.role_name From users u INNER JOIN roles r ON u.role_id = r.id WHERE u.email=?`,[email]
        );

        if(users.length == 0){
            return res.status(401).json({
                success:false,
                message:"Invalid email or password"
            });
        }
        const user = users[0];

        //compare password
        const passwordMatch = await bcrypt.compare(password,user.password);
        
        if(!passwordMatch){
            return res.status(401).json({
                success:false,
                message:"Invalid Email ID or password"
            });
        }
        
        //create jwt token
        const token = jwt.sign({
            id:user.id,
            role_id:user.role_id,
            role_name:user.role_name
        },
        process.env.JWT_SECRET,{
            expiresIn:"1d"
        }
    );

    return res.status(200).json({
        success:true,
        message:"Login successful",
        token,
        user:{
            id:user.id,
            full_name:user.full_name,
            mobile:user.mobile,
            email:user.email,
            role_id:user.role_id,
            role_name:user.role_name
        }
    });

    }catch(error){
        console.log("Login Error:",error.message);
        return res.status(500).json({
            success:false,
            message:"Server error during login"
        });
    }
};

module.exports={
    register, login
};