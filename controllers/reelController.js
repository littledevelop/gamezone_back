const db = require("../config/db");

// =====================================================
// HELPER: CHECK ROLE
// =====================================================

const isAdmin = (req) => req.user.role_name === "Admin";

const isAdminOrStaff = (req) =>
    ["Admin", "Staff"].includes(req.user.role_name);

const isValidUserRole = (req) =>
    ["Admin", "Staff", "Player"].includes(req.user.role_name);

// =====================================================
// GET ALL REELS
// Admin: All reels
// Staff: Assigned game reels
// Player: Own published reels only
// =====================================================

const getAllReels = async (req, res) => {
    try {
        if (!isValidUserRole(req)) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        if (
            req.user.role_name === "Staff" &&
            !req.user.assigned_game_id
        ) {
            return res.status(403).json({
                success: false,
                message: "No game is assigned to this Staff account",
            });
        }

        let query = `
            SELECT
                r.id,
                r.session_id,
                r.video_recording_id,
                r.title,
                r.description,
                r.cloudinary_url,
                r.cloudinary_public_id,
                r.duration_seconds,
                r.status,
                r.views,
                r.likes,
                r.created_at,
                COALESCE(r.session_id, vr.session_id) AS resolved_session_id,
                gs.user_id,
                gs.game_id,
                u.full_name AS player_name
            FROM reels r
            LEFT JOIN video_recordings vr
                ON r.video_recording_id = vr.id
            INNER JOIN game_sessions gs
                ON gs.id = COALESCE(r.session_id, vr.session_id)
            INNER JOIN users u
                ON gs.user_id = u.id
        `;

        const conditions = [];
        const params = [];

        if (req.user.role_name === "Player") {
            conditions.push("gs.user_id = ?");
            params.push(req.user.id);

            // Players can see published reels only.
            conditions.push("r.status = 'published'");
        }

        if (req.user.role_name === "Staff") {
            conditions.push("gs.game_id = ?");
            params.push(req.user.assigned_game_id);
        }

        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(" AND ")}`;
        }

        query += ` ORDER BY r.created_at DESC`;

        const [rows] = await db.query(query, params);

        return res.json({
            success: true,
            count: rows.length,
            data: rows,
        });

    } catch (error) {
        console.error("Get reels error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch reels",
        });
    }
};

// =====================================================
// GET REEL BY ID
// Admin: All reels
// Staff: Assigned game reels
// Player: Own published reels only
// =====================================================

const getReelById = async (req, res) => {
    try {
        if (!isValidUserRole(req)) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        if (
            req.user.role_name === "Staff" &&
            !req.user.assigned_game_id
        ) {
            return res.status(403).json({
                success: false,
                message: "No game is assigned to this Staff account",
            });
        }

        const { id } = req.params;

        const [rows] = await db.query(
            `
            SELECT
                r.*,
                COALESCE(r.session_id, vr.session_id) AS resolved_session_id,
                vr.cloudinary_url AS source_video_url,
                vr.recording_status,
                gs.user_id,
                gs.game_id,
                u.full_name AS player_name
            FROM reels r
            LEFT JOIN video_recordings vr
                ON r.video_recording_id = vr.id
            INNER JOIN game_sessions gs
                ON gs.id = COALESCE(r.session_id, vr.session_id)
            INNER JOIN users u
                ON gs.user_id = u.id
            WHERE r.id = ?
            `,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Reel not found",
            });
        }

        const reel = rows[0];

        // Player ownership and publication check.
        if (req.user.role_name === "Player") {
            if (
                Number(reel.user_id) !== Number(req.user.id) ||
                reel.status !== "published"
            ) {
                return res.status(404).json({
                    success: false,
                    message: "Reel not found",
                });
            }
        }

        // Staff assigned game check.
        if (
            req.user.role_name === "Staff" &&
            Number(reel.game_id) !== Number(req.user.assigned_game_id)
        ) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        return res.json({
            success: true,
            data: reel,
        });

    } catch (error) {
        console.error("Get reel by ID error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch reel",
        });
    }
};

// =====================================================
// CREATE REEL DRAFT
// Admin: Any game
// Staff: Assigned game only
// One reel per session
// =====================================================

const createReelDraft = async (req, res) => {
    let connection;
    let transactionStarted = false;

    try {
        if (!isAdminOrStaff(req)) {
            return res.status(403).json({
                success: false,
                message: "Only Admin or Staff can create reels",
            });
        }

        if (
            req.user.role_name === "Staff" &&
            !req.user.assigned_game_id
        ) {
            return res.status(403).json({
                success: false,
                message: "No game is assigned to this Staff account",
            });
        }

        const { video_recording_id, title, description } = req.body;

        const recordingId = Number(video_recording_id);

        if (
            !Number.isInteger(recordingId) ||
            recordingId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Valid video recording ID is required",
            });
        }

        const [videos] = await db.query(
            `
            SELECT
                vr.id,
                vr.session_id,
                vr.recording_status,
                vr.cloudinary_url,
                gs.game_id,
                gs.user_id,
                g.game_name,
                u.full_name AS player_name
            FROM video_recordings vr
            INNER JOIN game_sessions gs
                ON vr.session_id = gs.id
            INNER JOIN games g
                ON gs.game_id = g.id
            INNER JOIN users u
                ON gs.user_id = u.id
            WHERE vr.id = ?
            `,
            [recordingId]
        );

        if (videos.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Video recording not found",
            });
        }

        const video = videos[0];

        if (video.recording_status !== "completed") {
            return res.status(400).json({
                success: false,
                message: "Video recording is not completed",
            });
        }

        if (!video.cloudinary_url) {
            return res.status(400).json({
                success: false,
                message: "Uploaded source video is not available",
            });
        }

        if (
            req.user.role_name === "Staff" &&
            Number(video.game_id) !== Number(req.user.assigned_game_id)
        ) {
            return res.status(403).json({
                success: false,
                message: "You can only create reels for your assigned game",
            });
        }

        // Lock the session to prevent simultaneous duplicate creation.
        connection = await db.getConnection();

        await connection.beginTransaction();
        transactionStarted = true;

        const [sessions] = await connection.query(
            `
            SELECT id
            FROM game_sessions
            WHERE id = ?
            FOR UPDATE
            `,
            [video.session_id]
        );

        if (sessions.length === 0) {
            await connection.rollback();
            transactionStarted = false;

            return res.status(404).json({
                success: false,
                message: "Game session not found",
            });
        }

        // Check existing reel inside the transaction.
        const [existing] = await connection.query(
            `
            SELECT id
            FROM reels
            WHERE session_id = ?
               OR video_recording_id = ?
            LIMIT 1
            `,
            [video.session_id, recordingId]
        );

        if (existing.length > 0) {
            await connection.rollback();
            transactionStarted = false;

            return res.status(409).json({
                success: false,
                message: "A reel already exists for this session or recording",
                data: {
                    id: existing[0].id,
                },
            });
        }

        const reelTitle =
            title || `${video.game_name} - ${video.player_name}`;

        const [result] = await connection.query(
            `
            INSERT INTO reels
                (
                    session_id,
                    video_recording_id,
                    title,
                    description,
                    status
                )
            VALUES (?, ?, ?, ?, 'draft')
            `,
            [
                video.session_id,
                recordingId,
                reelTitle,
                description || null,
            ]
        );

        await connection.commit();
        transactionStarted = false;

        return res.status(201).json({
            success: true,
            message: "Session reel draft created",
            data: {
                id: result.insertId,
                session_id: video.session_id,
                video_recording_id: recordingId,
                title: reelTitle,
                status: "draft",
            },
        });

    } catch (error) {
        if (connection && transactionStarted) {
            await connection.rollback();
        }

        console.error("Create reel draft error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to create reel draft",
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
};

// =====================================================
// SAVE GENERATED REEL
// Admin: Any game
// Staff: Assigned game only
// Called after successful generation and upload.
// =====================================================

const saveGeneratedReel = async (req, res) => {
    try {
        if (!isAdminOrStaff(req)) {
            return res.status(403).json({
                success: false,
                message: "Only Admin or Staff can update reels",
            });
        }

        if (
            req.user.role_name === "Staff" &&
            !req.user.assigned_game_id
        ) {
            return res.status(403).json({
                success: false,
                message: "No game is assigned to this Staff account",
            });
        }

        const { id } = req.params;

        const {
            cloudinary_url,
            cloudinary_public_id,
            duration_seconds,
        } = req.body;

        if (
            typeof cloudinary_url !== "string" ||
            !cloudinary_url.trim() ||
            typeof cloudinary_public_id !== "string" ||
            !cloudinary_public_id.trim()
        ) {
            return res.status(400).json({
                success: false,
                message: "Generated reel URL and public ID are required",
            });
        }

        let duration = null;

        if (
            duration_seconds !== undefined &&
            duration_seconds !== null
        ) {
            duration = Number(duration_seconds);

            if (
                !Number.isInteger(duration) ||
                duration < 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Duration must be a non-negative whole number",
                });
            }
        }

        const [rows] = await db.query(
            `
            SELECT
                r.id,
                gs.game_id
            FROM reels r
            LEFT JOIN video_recordings vr
                ON r.video_recording_id = vr.id
            INNER JOIN game_sessions gs
                ON gs.id = COALESCE(r.session_id, vr.session_id)
            WHERE r.id = ?
            `,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Reel not found",
            });
        }

        if (
            req.user.role_name === "Staff" &&
            Number(rows[0].game_id) !== Number(req.user.assigned_game_id)
        ) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        await db.query(
            `
            UPDATE reels
            SET
                cloudinary_url = ?,
                cloudinary_public_id = ?,
                duration_seconds = ?,
                status = 'published'
            WHERE id = ?
            `,
            [
                cloudinary_url.trim(),
                cloudinary_public_id.trim(),
                duration,
                id,
            ]
        );

        return res.json({
            success: true,
            message: "Generated reel saved and published",
        });

    } catch (error) {
        console.error("Save generated reel error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to save reel",
        });
    }
};

// =====================================================
// EXPORT CONTROLLERS
// =====================================================

module.exports = {
    getAllReels,
    getReelById,
    createReelDraft,
    saveGeneratedReel,
};