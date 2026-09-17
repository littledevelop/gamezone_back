const db = require("../config/db.js");


// =====================================================
// GET ALL MEMBERSHIPS
// =====================================================

const getAllMemberships = async (req, res) => {
    try {

        const [memberships] = await db.query(`
            SELECT 
                m.id,
                m.user_id,
                u.full_name,
                u.email,
                m.membership_type_id,
                mt.name AS membership_type_name,
                mt.duration_days,
                mt.price,
                m.start_date,
                m.expiry_date,
                m.status,
                m.auto_renew,
                m.created_at,
                m.updated_at
            FROM memberships m
            INNER JOIN users u 
                ON m.user_id = u.id
            INNER JOIN membership_types mt
                ON m.membership_type_id = mt.id
            ORDER BY m.id DESC
        `);

        return res.status(200).json({
            success: true,
            message: "Memberships fetched successfully",
            count: memberships.length,
            memberships
        });

    } catch (error) {

        console.log("Get all memberships Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server Error while fetching all memberships records"
        });
    }
};


// =====================================================
// GET MEMBERSHIP BY ID
// =====================================================

const getMembershipByID = async (req, res) => {
    try {

        const { id } = req.params;

        const [memberships] = await db.query(`
            SELECT 
                m.id,
                m.user_id,
                u.full_name,
                u.email,
                m.membership_type_id,
                mt.name AS membership_type_name,
                mt.duration_days,
                mt.price,
                m.start_date,
                m.expiry_date,
                m.status,
                m.auto_renew,
                m.created_at,
                m.updated_at
            FROM memberships m
            INNER JOIN users u 
                ON m.user_id = u.id
            INNER JOIN membership_types mt 
                ON m.membership_type_id = mt.id
            WHERE m.id = ?
        `, [id]);

        if (memberships.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Membership not found"
            });
        }

        return res.status(200).json({
            success: true,
            membership: memberships[0]
        });

    } catch (error) {

        console.log("Get membership by ID Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server Error while fetching membership by ID"
        });
    }
};


// =====================================================
// CREATE MEMBERSHIP
// =====================================================

const createMembership = async (req, res) => {
    try {

        const {
            user_id,
            membership_type_id,
            start_date,
            auto_renew
        } = req.body;


        // ---------------------------------------------
        // Required fields
        // ---------------------------------------------

        if (
            user_id === undefined ||
            membership_type_id === undefined ||
            !start_date
        ) {
            return res.status(400).json({
                success: false,
                message: "user_id, membership_type_id and start_date are required"
            });
        }


        // ---------------------------------------------
        // Validate user
        // ---------------------------------------------

        const [user] = await db.query(
            `SELECT id, full_name, email
             FROM users
             WHERE id = ?`,
            [user_id]
        );

        if (user.length === 0) {
            return res.status(400).json({
                success: false,
                message: "User not found"
            });
        }


        // ---------------------------------------------
        // Validate membership type
        // ---------------------------------------------

        const [membershipType] = await db.query(
            `SELECT 
                id,
                name,
                duration_days,
                status
             FROM membership_types
             WHERE id = ?`,
            [membership_type_id]
        );

        if (membershipType.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Membership type not found"
            });
        }


        // ---------------------------------------------
        // Membership type must be active
        // ---------------------------------------------

        if (membershipType[0].status !== "active") {
            return res.status(400).json({
                success: false,
                message: "Membership type is not active"
            });
        }


        // ---------------------------------------------
        // Validate start date format
        // ---------------------------------------------

        if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
            return res.status(400).json({
                success: false,
                message: "Invalid start date. Use YYYY-MM-DD format"
            });
        }


        // ---------------------------------------------
        // Get today's date
        // ---------------------------------------------

        const today = new Date();

        const todayFormatted =
            today.getFullYear() +
            "-" +
            String(today.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(today.getDate()).padStart(2, "0");


        // ---------------------------------------------
        // Start date cannot be in past
        // Today is allowed
        // ---------------------------------------------

        if (start_date < todayFormatted) {
            return res.status(400).json({
                success: false,
                message: "Start date cannot be in the past"
            });
        }


        // ---------------------------------------------
        // Check existing active membership
        // ---------------------------------------------

        const [existingMembership] = await db.query(
            `SELECT id
             FROM memberships
             WHERE user_id = ?
             AND status = 'active'`,
            [user_id]
        );

        if (existingMembership.length > 0) {
            return res.status(400).json({
                success: false,
                message: "User already has an active membership"
            });
        }


        // ---------------------------------------------
        // Calculate expiry date
        // ---------------------------------------------

        const durationDays = Number(
            membershipType[0].duration_days
        );

        const expiryDate = new Date(
            Number(start_date.substring(0, 4)),
            Number(start_date.substring(5, 7)) - 1,
            Number(start_date.substring(8, 10))
        );

        expiryDate.setDate(
            expiryDate.getDate() + durationDays
        );

        const expiryDateFormatted =
            expiryDate.getFullYear() +
            "-" +
            String(expiryDate.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(expiryDate.getDate()).padStart(2, "0");


        // ---------------------------------------------
        // Create membership
        // ---------------------------------------------

        const [result] = await db.query(
            `INSERT INTO memberships (
                user_id,
                membership_type_id,
                start_date,
                expiry_date,
                status,
                auto_renew
            )
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
                user_id,
                membership_type_id,
                start_date,
                expiryDateFormatted,
                "active",
                auto_renew !== undefined
                    ? Boolean(auto_renew)
                    : false
            ]
        );


        return res.status(201).json({
            success: true,
            message: "Membership created successfully",
            membership_id: result.insertId
        });

    } catch (error) {

        console.log("Create membership Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server Error while creating membership"
        });
    }
};


// =====================================================
// UPDATE MEMBERSHIP
// =====================================================

const updateMembership = async (req, res) => {
    try {

        const { id } = req.params;


        // ---------------------------------------------
        // Check existing membership
        // ---------------------------------------------

        const [existingMembership] = await db.query(
            `SELECT
                id,
                user_id,
                membership_type_id,
                start_date,
                expiry_date,
                status,
                auto_renew
             FROM memberships
             WHERE id = ?`,
            [id]
        );

        if (existingMembership.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Membership not found"
            });
        }

        const currentMembership = existingMembership[0];


        // ---------------------------------------------
        // Fields allowed for direct update
        // ---------------------------------------------

        const allowedFields = [
            "user_id",
            "membership_type_id",
            "status",
            "auto_renew"
        ];

        const fields = [];
        const values = [];


        allowedFields.forEach(field => {

            if (req.body[field] !== undefined) {

                fields.push(`${field} = ?`);
                values.push(req.body[field]);

            }

        });


        // ---------------------------------------------
        // Final user ID
        // ---------------------------------------------

        const newUserId =
            req.body.user_id !== undefined
                ? Number(req.body.user_id)
                : Number(currentMembership.user_id);


        // ---------------------------------------------
        // Final status
        // ---------------------------------------------

        const newStatus =
            req.body.status !== undefined
                ? req.body.status
                : currentMembership.status;


        // ---------------------------------------------
        // Validate user if supplied
        // ---------------------------------------------

        if (req.body.user_id !== undefined) {

            const [user] = await db.query(
                `SELECT id
                 FROM users
                 WHERE id = ?`,
                [newUserId]
            );

            if (user.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "User not found"
                });
            }
        }


        // ---------------------------------------------
        // Validate status
        // ---------------------------------------------

        if (
            !["active", "expired", "cancelled"].includes(newStatus)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid status"
            });
        }


        // ---------------------------------------------
        // Final membership type
        // ---------------------------------------------

        const finalMembershipTypeId =
            req.body.membership_type_id !== undefined
                ? Number(req.body.membership_type_id)
                : Number(currentMembership.membership_type_id);


        // ---------------------------------------------
        // Validate membership type
        // ---------------------------------------------

        const [membershipType] = await db.query(
            `SELECT
                id,
                name,
                duration_days,
                status
             FROM membership_types
             WHERE id = ?`,
            [finalMembershipTypeId]
        );

        if (membershipType.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Membership type not found"
            });
        }

        if (membershipType[0].status !== "active") {
            return res.status(400).json({
                success: false,
                message: "Membership type is not active"
            });
        }


        // ---------------------------------------------
        // Prevent duplicate active membership
        // ---------------------------------------------

        if (newStatus === "active") {

            const [duplicateMembership] = await db.query(
                `SELECT id
                 FROM memberships
                 WHERE user_id = ?
                 AND status = 'active'
                 AND id != ?`,
                [newUserId, id]
            );

            if (duplicateMembership.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: "User already has an active membership"
                });
            }
        }


        // ---------------------------------------------
        // Handle start date + expiry date
        // ---------------------------------------------

        if (
            req.body.start_date !== undefined ||
            req.body.membership_type_id !== undefined
        ) {

            const newStartDate =
                req.body.start_date !== undefined
                    ? req.body.start_date
                    : currentMembership.start_date;


            // Validate format

            if (!/^\d{4}-\d{2}-\d{2}$/.test(newStartDate)) {

                return res.status(400).json({
                    success: false,
                    message: "Invalid start date. Use YYYY-MM-DD format"
                });

            }


            // Get today's date

            const today = new Date();

            const todayFormatted =
                today.getFullYear() +
                "-" +
                String(today.getMonth() + 1).padStart(2, "0") +
                "-" +
                String(today.getDate()).padStart(2, "0");


            // Start date cannot be past

            if (newStartDate < todayFormatted) {

                return res.status(400).json({
                    success: false,
                    message: "Start date cannot be in the past"
                });

            }


            // Calculate expiry

            const expiryDate = new Date(
                Number(newStartDate.substring(0, 4)),
                Number(newStartDate.substring(5, 7)) - 1,
                Number(newStartDate.substring(8, 10))
            );

            expiryDate.setDate(
                expiryDate.getDate() +
                Number(membershipType[0].duration_days)
            );


            const expiryDateFormatted =
                expiryDate.getFullYear() +
                "-" +
                String(expiryDate.getMonth() + 1).padStart(2, "0") +
                "-" +
                String(expiryDate.getDate()).padStart(2, "0");


            // Add start date only once

            fields.push("start_date = ?");
            values.push(newStartDate);


            // Add calculated expiry

            fields.push("expiry_date = ?");
            values.push(expiryDateFormatted);
        }


        // ---------------------------------------------
        // No valid fields
        // ---------------------------------------------

        if (fields.length === 0) {

            return res.status(400).json({
                success: false,
                message: "No valid fields provided for update"
            });

        }


        // ---------------------------------------------
        // Update membership
        // ---------------------------------------------

        values.push(id);

        await db.query(
            `UPDATE memberships
             SET ${fields.join(", ")}
             WHERE id = ?`,
            values
        );


        return res.status(200).json({
            success: true,
            message: "Membership updated successfully"
        });

    } catch (error) {

        console.log("Update membership Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server Error while updating membership"
        });
    }
};


// =====================================================
// DELETE MEMBERSHIP
// =====================================================

const deleteMembership = async (req, res) => {
    try {

        const { id } = req.params;


        // ---------------------------------------------
        // Check membership exists
        // ---------------------------------------------

        const [existingMembership] = await db.query(
            `SELECT id
             FROM memberships
             WHERE id = ?`,
            [id]
        );

        if (existingMembership.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Membership not found"
            });
        }


        // ---------------------------------------------
        // Delete
        // ---------------------------------------------

        await db.query(
            `DELETE FROM memberships
             WHERE id = ?`,
            [id]
        );


        return res.status(200).json({
            success: true,
            message: "Membership deleted successfully"
        });

    } catch (error) {

        console.log("Delete membership Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server Error while deleting membership"
        });
    }
};

module.exports = {
    getAllMemberships,
    getMembershipByID,
    createMembership,
    updateMembership,
    deleteMembership
};