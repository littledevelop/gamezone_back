const db = require("../config/db");
const cloudinary = require("../config/cloudinary");
const fs = require("fs");

// =====================================================
// UPLOAD GAME SESSION PHOTO
// Camera Service -> Backend -> Cloudinary -> MySQL
// =====================================================

const uploadGameSessionPhoto = async (req, res) => {
    try {
        // -------------------------------------------------
        // 1. Check uploaded file
        // -------------------------------------------------
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Photo file is required"
            });
        }

        const { session_id, camera_id } = req.body;

        // -------------------------------------------------
        // 2. Validate session ID
        // -------------------------------------------------
        if (!session_id) {
            return res.status(400).json({
                success: false,
                message: "Session ID is required"
            });
        }

        // -------------------------------------------------
        // 3. Check game session exists
        // -------------------------------------------------
        const [sessions] = await db.query(
            `
            SELECT
                id,
                user_id,
                game_id,
                status
            FROM game_sessions
            WHERE id = ?
            `,
            [session_id]
        );

        if (sessions.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Game session not found"
            });
        }

        const session = sessions[0];

        // -------------------------------------------------
        // 4. Validate camera if provided
        // -------------------------------------------------
        if (camera_id) {
            const [cameras] = await db.query(
                `
                SELECT
                    id,
                    status
                FROM cameras
                WHERE id = ?
                `,
                [camera_id]
            );

            if (cameras.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Camera not found"
                });
            }

            if (cameras[0].status !== "active") {
                return res.status(400).json({
                    success: false,
                    message: "Camera is not active"
                });
            }
        }

        // -------------------------------------------------
        // 5. Upload photo to Cloudinary
        // -------------------------------------------------
        const uploadResult = await cloudinary.uploader.upload(
            req.file.path,
            {
                resource_type: "image",
                folder: "gamezone/gameplay-photos"
            }
        );

        // -------------------------------------------------
        // 6. Save photo information in MySQL
        // -------------------------------------------------
        const fileName = req.file.originalname;

        const [result] = await db.query(
            `
            INSERT INTO game_session_photos
            (
                session_id,
                camera_id,
                file_name,
                file_path,
                cloudinary_url,
                cloudinary_public_id,
                captured_at
            )
            VALUES (?, ?, ?, ?, ?, ?, NOW())
            `,
            [
                session_id,
                camera_id || null,
                fileName,
                req.file.path,
                uploadResult.secure_url,
                uploadResult.public_id
            ]
        );

        // -------------------------------------------------
        // 7. Delete temporary local photo
        // -------------------------------------------------
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        // -------------------------------------------------
        // 8. Success response
        // -------------------------------------------------
        return res.status(201).json({
            success: true,
            message: "Photo uploaded successfully",
            data: {
                id: result.insertId,
                session_id: Number(session_id),
                camera_id: camera_id ? Number(camera_id) : null,
                file_name: fileName,
                cloudinary_url: uploadResult.secure_url,
                cloudinary_public_id: uploadResult.public_id
            }
        });

    } catch (error) {
        console.error(
            "Game session photo upload error:",
            error
        );

        // Delete temporary file if upload/database fails
        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        return res.status(500).json({
            success: false,
            message: error.message || "Failed to upload photo"
        });
    }
};


// =====================================================
// GET PHOTOS FOR A GAME SESSION
// =====================================================

const getGameSessionPhotos = async (req, res) => {
    try {
        const { sessionId } = req.params;

        // -------------------------------------------------
        // 1. Check session exists
        // -------------------------------------------------
        const [sessions] = await db.query(
            `
            SELECT
                id,
                user_id
            FROM game_sessions
            WHERE id = ?
            `,
            [sessionId]
        );

        if (sessions.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Game session not found"
            });
        }

        // -------------------------------------------------
        // 2. Player can only see own session photos
        // -------------------------------------------------
        if (
            req.user.role_name === "Player" &&
            Number(sessions[0].user_id) !== Number(req.user.id)
        ) {
            return res.status(403).json({
                success: false,
                message: "Access denied"
            });
        }

        // -------------------------------------------------
        // 3. Get photos
        // -------------------------------------------------
        const [photos] = await db.query(
            `
            SELECT
                id,
                session_id,
                camera_id,
                file_name,
                file_path,
                cloudinary_url,
                cloudinary_public_id,
                captured_at,
                created_at
            FROM game_session_photos
            WHERE session_id = ?
            ORDER BY captured_at ASC, id ASC
            `,
            [sessionId]
        );

        return res.json({
            success: true,
            count: photos.length,
            data: photos
        });

    } catch (error) {
        console.error(
            "Get game session photos error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to fetch session photos"
        });
    }
};


module.exports = {
    uploadGameSessionPhoto,
    getGameSessionPhotos
};