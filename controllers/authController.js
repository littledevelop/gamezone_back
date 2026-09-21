const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");

//register user
const register = async(req,res) => {
    try{

        const { full_name, mobile, email, password, date_of_birth, address} = req.body;

        //validate the fields
        if(!full_name || !email || !password){
            return res.status(400).json({
                success:false,
                message:"Full name,email,password are required"
            });
        }

        //check  whether mobile already exists
        const [existingEmail] = await db.query("select id from users where email= ?",[email]);

        if(existingEmail.length > 0){
            return res.status(409).json({
                success:false,
                message:"Email already registered"
            });
        }

        //hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        //default role = player
        const roleId = 3;
        const [result] = await db.query(`INSERT INTO users(full_name,mobile,email,password,date_of_birth,address,role_id)VALUES(?,?,?,?,?,?,?)`,[full_name,mobile,email || null, hashedPassword,date_of_birth || null, address || null, roleId]);

        return res.status(201).json({
            success:true,
            message:"user Registered successfully",
            user:{
                id: result.insertId,
                full_name,
                mobile,
                email:email||null,
                role_id:roleId
            }
        });
    }catch(error){
        console.log("Registeration Error:",error);
        return res.status(500).json({
            success:false,
            message:"Server error during registeration"
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