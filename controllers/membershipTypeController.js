const db = require("../config/db");

//get all membership types

const getAllMembershipTypes = async(req,res)=>{
    try{
        const [membershipTypes] = await db.query(`SELECT 
            id,
            name,
            duration_days,
            price,
            discount_percentage,
            reward_points,
            description,
            status,
            created_at,
            updated_at 
            FROM membership_types 
            ORDER BY id DESC
            `);

            return res.status(200).json({
                success:true,
                count:membershipTypes.length,
                membershipTypes
            });
    }catch(error){
        console.log(
            "Getting all Membership Types Error:",error.message);
        return res.status(500).json({
            success:false,
            message:"Server error while fetching membership types"
        });
    }
};

//get membership type by id

const getMembershipTypeById = async(req,res)=>{
    try{
        const {id} = req.params;

        const [membershipType] = await db.query(`SELECT 
            id,
            name,
            duration_days,
            price,
            discount_percentage,
            reward_points,
            description,
            status,
            created_at,
            updated_at 
            FROM membership_types 
            WHERE id = ?`,[id]);
        
        if(membershipType.length === 0){
            return res.status(404).json({  
                success:false,
                message:"Membership type not found"
            });
        }

        return res.status(200).json({
            success:true,
            membershipType:membershipType[0]
        });
        
    }catch(error){
        console.log(
            "Getting Membership Type by ID Error:",error.message
        );

        return res.status(500).json({
            success:false,
            message:"Server error while fetching membership type"
        });
    }
};

//create membership type
const createMembershipType = async(req,res)=>{
    try{
        const {
            name,
            duration_days,
            price,
            discount_percentage,
            reward_points,
            description,
            status
        } = req.body;

        //required fields validation
        if(
            name===undefined || duration_days === undefined || price === undefined || status===undefined){
            return res.status(400).json({
                success:false,
                message:"name, duration_days, price and status are required"
            });
        }

        //validate name
        const trimedName = String(name).trim();

        if(trimedName === ""){
            return res.status(400).json({
                success:false,
                message:"name cannot be empty"
            });
        }

        //validate duration_days
        if(!Number.isInteger(duration_days) || duration_days <= 0){
            return res.status(400).json({
                success:false,
                message:"duration_days must be a positive integer"
            });
        }

        //validate price
        const membershipPrice = parseFloat(price);

        if(!Number.isFinite(membershipPrice) || membershipPrice < 0){
            return res.status(400).json({
                success:false,
                message:"price must be a non-negative number"
            });
        }

        //validate discount_percentage
        const discountPercentage = discount_percentage !== undefined ? Number(discount_percentage) : 0;

        if(!Number.isFinite(discountPercentage) || discountPercentage < 0 || discountPercentage > 100){
            return res.status(400).json({
                success:false,
                message:"discount_percentage must be a number between 0 and 100"
            });
        }

        //validate reward_points
        const rewardPoints = reward_points !== undefined ? Number(reward_points) : 0;

        if(!Number.isFinite(rewardPoints) || rewardPoints < 0){
            return res.status(400).json({
                success:false,
                message:"reward_points must be a non-negative number"
            });
        }
        //validate status
        const membershipStatus = status !== undefined ? String(status).trim().toLowerCase() : "active";

        if(!["active","inactive"].includes(membershipStatus)){      
            return res.status(400).json({
                success:false,
                message:"status must be either 'active' or 'inactive'"
            });
        }

        //create duplicate membership type name
        // ip type name uniqueness
        const [existingMembershipType] = await db.query(`SELECT id FROM membership_types WHERE name = ?`,[trimedName]);

        if(existingMembershipType.length > 0){
            return res.status(409).json({
                success:false,
                message:"Membership type with this name already exists"
            });
        }

        //insert new membership type
        const [result] = await db.query(`
            INSERT INTO membership_types (
            name,
            duration_days,
            price,
            discount_percentage,
            reward_points,
            description,
            status
            ) VALUES (?,?,?,?,?,?,?)
             `,[
                trimedName,
                duration_days,
                membershipPrice,
                discountPercentage ?? 0, rewardPoints ?? 0,
                description !== undefined ? description : null,
                membershipStatus
            ]);

        return res.status(201).json({
            success:true,
            message:"Membership type created successfully",
            membershipType_id:result.insertId
        });

    }catch(error){
        console.log(
            "Membershiptype Creation Error:",
            error.message);
        return res.status(500).json({
            success:false,
            message:"Server error while creating membership type"
        });
    }
};

//update membership type
const updateMembershipType = async(req,res)=>{
    try{
        const {id} = req.params;

        const [existingMembershipType] = await db.query(`SELECT * FROM membership_types WHERE id = ?`,[id]);

        if(existingMembershipType.length === 0){
            return res.status(404).json({
                success:false,
                message:"Membership type not found"
            });
        }

        const currentMembershipType = existingMembershipType[0];
        const fields = [];
        const values = [];
        //validate and prepare fields for update
        if(req.body.name !== undefined && req.body.name.trim() === ""){
            const trimedName = String(req.body.name).trim();

            if(trimedName === ""){
                return res.status(400).json({
                    success:false,
                    message:"name cannot be empty"
                });
            }

            //check for duplicate name
            const [duplicateName] = await db.query(`SELECT id FROM membership_types WHERE name = ? AND id != ?`,[trimedName,id]);

            if(duplicateName.length > 0){
                return res.status(409).json({
                    success:false,
                    message:"Membership type with this name already exists"
                });
            }

            fields.push("name = ?");
            values.push(trimedName);
        }

        //duration_days validation
        if(req.body.duration_days !== undefined){
            const durationDays = Number(req.body.duration_days);    

            if(!Number.isInteger(durationDays) || durationDays <= 0){
                return res.status(400).json({
                    success:false,
                    message:"duration_days must be a positive integer"
                });
            }   
            fields.push("duration_days = ?");
            values.push(durationDays);
        }

        //price validation
        if(req.body.price !== undefined){
            const membershipPrice = parseFloat(req.body.price);
            if(!Number.isFinite(membershipPrice) || membershipPrice < 0){
                return res.status(400).json({
                    success:false,
                    message:"price must be a non-negative number"
                });
            }
            fields.push("price = ?");
            values.push(membershipPrice);
        }

        //discount_percentage validation
        if(req.body.discount_percentage !== undefined){
            const discountPercentage = Number(req.body.discount_percentage);
            if(!Number.isFinite(discountPercentage) || discountPercentage < 0 || discountPercentage > 100){
                return res.status(400).json({
                    success:false,
                    message:"discount_percentage must be a number between 0 and 100"
                });
            }
            fields.push("discount_percentage = ?");
            values.push(discountPercentage);
        }

        //reward_points validation
        if(req.body.reward_points !== undefined){
            const rewardPoints = Number(req.body.reward_points);
            if(!Number.isInteger(rewardPoints) || rewardPoints < 0){
                return res.status(400).json({
                    success:false,
                    message:"reward_points must be a non-negative integer"
                });
            }
            fields.push("reward_points = ?");
            values.push(rewardPoints);
        }

        //description validation
        if(req.body.description !== undefined){
            const description = String(req.body.description).trim();
            fields.push("description = ?");
            values.push(description === "" ? null : description);
        }

        //status validation
        if(req.body.status !== undefined){
            const membershipStatus = String(req.body.status).trim().toLowerCase();
            if(!["active","inactive"].includes(membershipStatus)){
                return res.status(400).json({
                    success:false,
                    message:"status must be either 'active' or 'inactive'"
                });
            }   
            fields.push("status = ?");
            values.push(membershipStatus);
        }

        //no fields provided for update
        if(fields.length === 0){
            return res.status(400).json({
                success:false,
                message:"No valid fields provided for update"
            });
        }

        //update membership type

        values.push(id);

        await db.query(`UPDATE membership_types SET ${fields.join(", ")} WHERE id = ?`,values);

        return res.status(200).json({
            success:true,
            message:"Membership type updated successfully"
        });

    }catch(error){
        console.log(
            "Membershiptype Update Error:",error.message);
        return res.status(500).json({
            success:false,
            message:"Server error while updating membership type"
        });
    }
};

//delete membership type
const deleteMembershipType = async(req,res)=>{
    try{
        const {id} = req.params;

        const [existingMembershipType] = await db.query(`SELECT id FROM membership_types WHERE id = ?`,[id]);

        if(existingMembershipType.length === 0){
            return res.status(404).json({
                success:false,
                message:"Membership type not found"
            });
        }

        //check membership type is associated with any users
        const [associatedUsers] = await db.query(`SELECT id FROM users WHERE membership_type_id = ? LIMIT 1`,[id]);

        if(associatedUsers.length > 0){
            return res.status(400).json({
                success:false,
                message:"Cannot delete membership type as it is associated with existing users"
            });
        }

        await db.query(`DELETE FROM membership_types WHERE id = ?`,[id]);

        return res.status(200).json({
            success:true,
            message:"Membership type deleted successfully"
        });

    }catch(error){
        console.log("Membershiptype Deletion Error:",error.message);
        return res.status(500).json({
            success:false,
            message:"Server error while deleting membership type"
        });
    }
};

module.exports = {
    getAllMembershipTypes,
    getMembershipTypeById,
    createMembershipType,
    updateMembershipType,
    deleteMembershipType
};