
const crypto = require("crypto");
const db = require("../config/db");
const cloudinary = require("../config/cloudinary");

// =====================================================
// CREATE VIDEO QR CODE
// =====================================================


const createVideoQRCode = async (req, res) => {
    try {
        const { session_id, video_recording_id } = req.body;

        if (!session_id || !video_recording_id) {
            return res.status(400).json({
                success: false,
                message: "Session ID and Video Recording ID are required",
            });
        }

        const [videos] = await db.query(
            `
            SELECT
                vr.id,
                vr.session_id,
                vr.recording_status,
                gs.user_id,
                gs.game_id
            FROM video_recordings vr
            INNER JOIN game_sessions gs
                ON vr.session_id = gs.id
            WHERE vr.id = ?
              AND vr.session_id = ?
            `,
            [video_recording_id, session_id]
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

        if (
            req.user.role_name === "Staff" &&
            Number(video.game_id) !== Number(req.user.assigned_game_id)
        ) {
            return res.status(403).json({
                success: false,
                message: "You can only create QR codes for your assigned game",
            });
        }

        const [existingQR] = await db.query(
            `
            SELECT id, qr_code, expires_at
            FROM qr_codes
            WHERE video_recording_id = ?
              AND qr_type = 'video'
              AND status = 'active'
              AND expires_at > NOW()
            ORDER BY id DESC
            LIMIT 1
            `,
            [video_recording_id]
        );

        const frontendUrl = (
            process.env.FRONTEND_URL || "http://localhost:5173"
        ).replace(/\/+$/, "");

        if (existingQR.length > 0) {
            const qr = existingQR[0];

            return res.json({
                success: true,
                message: "Active QR code already exists",
                data: {
                    id: qr.id,
                    qr_code: qr.qr_code,
                    qr_type: "video",
                    video_url: `${frontendUrl}/video/${qr.qr_code}`,
                    expires_at: qr.expires_at,
                },
            });
        }

        const qrCode = crypto.randomBytes(32).toString("hex");

        const expiresAt = new Date(
            Date.now() + 60 * 60 * 1000
        );

        const [result] = await db.query(
            `
            INSERT INTO qr_codes
            (
                qr_code,
                qr_type,
                game_session_id,
                video_recording_id,
                status,
                expires_at
            )
            VALUES (?, 'video', ?, ?, 'active', ?)
            `,
            [
                qrCode,
                session_id,
                video_recording_id,
                expiresAt,
            ]
        );

        return res.status(201).json({
            success: true,
            message: "Video QR code created successfully",
            data: {
                id: result.insertId,
                qr_code: qrCode,
                qr_type: "video",
                session_id,
                video_recording_id,
                video_url: `${frontendUrl}/video/${qrCode}`,
                expires_at: expiresAt,
            },
        });

    } catch (error) {
        console.error(
            "Create video QR error:",
            error.sqlMessage || error.message || error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to create video QR code",
        });
    }
};



// =====================================================
// GET VIDEO USING QR CODE
// =====================================================

const getVideoByQRCode = async (req, res) => {
    try {
        const { qrCode } = req.params;

        const [rows] = await db.query(
            `
            SELECT
                qr.id AS qr_id,
                qr.qr_code,
                qr.status,
                qr.expires_at,

                vr.id AS video_recording_id,
                vr.file_name,
                vr.cloudinary_url,
                vr.cloudinary_public_id,
                vr.duration_seconds,

                gs.id AS session_id,
                gs.user_id,

                u.full_name AS player_name,
                g.game_name,
                st.station_name

            FROM qr_codes qr

            INNER JOIN video_recordings vr
                ON qr.video_recording_id = vr.id

            INNER JOIN game_sessions gs
                ON qr.game_session_id = gs.id

            INNER JOIN users u
                ON gs.user_id = u.id

            INNER JOIN games g
                ON gs.game_id = g.id

            INNER JOIN gaming_stations st
                ON gs.station_id = st.id

            WHERE qr.qr_code = ?
              AND qr.qr_type = 'video'
            `,
            [qrCode]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "QR code not found",
            });
        }

        const video = rows[0];

        if (
            video.status !== "active" ||
            !video.expires_at ||
            new Date(video.expires_at) <= new Date()
        ) {
            await db.query(
                `
                UPDATE qr_codes
                SET status = 'expired'
                WHERE id = ?
                `,
                [video.qr_id]
            );

            return res.status(410).json({
                success: false,
                message: "This QR code has expired",
            });
        }

        return res.json({
            success: true,
            data: {
                video_recording_id: video.video_recording_id,
                file_name: video.file_name,
                video_url: cloudinary.utils.private_download_url(
                    video.cloudinary_public_id,
                    "mp4",
                    {
                        resource_type: "video",
                        type: "upload",
                        expires_at: Math.floor(
                            new Date(video.expires_at).getTime() / 1000
                        ),
                    }
                ),
                duration_seconds: video.duration_seconds,
                player_name: video.player_name,
                game_name: video.game_name,
                station_name: video.station_name,
                expires_at: video.expires_at,
            },
        });

    } catch (error) {
        console.error("Get video by QR error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load video",
        });
    }
};


// =====================================================
// DELETE EXPIRED VIDEO QR
// Original gameplay video remains in Cloudinary.
// =====================================================

const deleteExpiredVideo = async (req, res) => {
    try {
        const { qrCode } = req.params;

        const [rows] = await db.query(
            `
            SELECT
                qr.id AS qr_id,
                qr.expires_at,
                vr.id AS video_recording_id,
                vr.cloudinary_public_id
            FROM qr_codes qr
            INNER JOIN video_recordings vr
                ON qr.video_recording_id = vr.id
            WHERE qr.qr_code = ?
              AND qr.qr_type = 'video'
            `,
            [qrCode]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "QR code not found",
            });
        }

        const video = rows[0];

        if (
            video.expires_at &&
            new Date(video.expires_at) > new Date()
        ) {
            return res.status(400).json({
                success: false,
                message: "Video has not expired yet",
            });
        }

        console.log(
            "QR expired. Keeping original gameplay video in Cloudinary:",
            video.cloudinary_public_id
        );

        await db.query(
            `
            UPDATE qr_codes
            SET status = 'expired'
            WHERE id = ?
            `,
            [video.qr_id]
        );

        return res.json({
            success: true,
            message: "Expired QR code marked successfully",
        });

    } catch (error) {
        console.error("Delete expired video error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to delete expired video",
        });
    }
};


// =====================================================
// GET LATEST ACTIVE VIDEO QR
// =====================================================

const getLatestActiveVideoQR = async (req, res) => {
    try {
        const [rows] = await db.query(
            `
            SELECT
                qr.qr_code,
                qr.expires_at,
                vr.id AS video_recording_id,
                vr.file_name,
                gs.user_id,
                u.full_name AS player_name,
                g.game_name,
                st.station_name

            FROM qr_codes qr

            INNER JOIN video_recordings vr
                ON qr.video_recording_id = vr.id

            INNER JOIN game_sessions gs
                ON qr.game_session_id = gs.id

            INNER JOIN users u
                ON gs.user_id = u.id

            INNER JOIN games g
                ON gs.game_id = g.id

            INNER JOIN gaming_stations st
                ON gs.station_id = st.id

            WHERE qr.qr_type = 'video'
              AND qr.status = 'active'
              AND qr.expires_at > NOW()

            ORDER BY qr.id DESC
            LIMIT 1
            `
        );

        if (rows.length === 0) {
            return res.json({
                success: true,
                data: null,
                message: "No active QR code available",
            });
        }

        return res.json({
            success: true,
            data: rows[0],
        });

    } catch (error) {
        console.error("Get latest active QR error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load latest QR code",
        });
    }
};


// =====================================================
// CREATE REEL QR CODE
// Uses reels.session_id as the primary session reference.
// =====================================================

const createReelQRCode = async (req, res) => {
    try {
        const { reel_id } = req.body;

        if (!reel_id) {
            return res.status(400).json({
                success: false,
                message: "Reel ID is required",
            });
        }

        const [rows] = await db.query(
            `
            SELECT
                r.id AS reel_id,
                r.status AS reel_status,
                r.cloudinary_url,

                vr.id AS video_recording_id,

                COALESCE(
                    r.session_id,
                    vr.session_id
                ) AS session_id,

                gs.game_id

            FROM reels r

            LEFT JOIN video_recordings vr
    ON r.video_recording_id = vr.id

            INNER JOIN game_sessions gs
                ON gs.id = COALESCE(
                    r.session_id,
                    vr.session_id
                )

            WHERE r.id = ?
            LIMIT 1
            `,
            [reel_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Reel not found",
            });
        }

        const reel = rows[0];

        if (!reel.session_id) {
            return res.status(400).json({
                success: false,
                message: "Reel is not linked to a game session",
            });
        }

        // Staff can only create QR codes for their assigned game.
        if (
            req.user?.role_name === "Staff" &&
            Number(req.user.assigned_game_id) !== Number(reel.game_id)
        ) {
            return res.status(403).json({
                success: false,
                message: "You cannot create a QR code for this game's reel",
            });
        }

        if (
            reel.reel_status !== "published" ||
            !reel.cloudinary_url
        ) {
            return res.status(400).json({
                success: false,
                message: "The reel must be published and uploaded before creating its QR code",
            });
        }

        // Reuse an existing valid QR for this reel.
        const [existingQR] = await db.query(
            `
            SELECT id, qr_code, expires_at
            FROM qr_codes
            WHERE reel_id = ?
              AND qr_type = 'reel'
              AND status = 'active'
              AND expires_at > NOW()
            ORDER BY id DESC
            LIMIT 1
            `,
            [reel_id]
        );

        const frontendUrl = (
            process.env.FRONTEND_URL || "http://localhost:5173"
        ).replace(/\/+$/, "");

        if (existingQR.length > 0) {
            const qr = existingQR[0];

            return res.json({
                success: true,
                message: "Active reel QR code already exists",
                data: {
                    id: qr.id,
                    qr_code: qr.qr_code,
                    qr_type: "reel",
                    reel_id: Number(reel_id),
                    reel_url: `${frontendUrl}/reel/${qr.qr_code}`,
                    expires_at: qr.expires_at,
                },
            });
        }

        const qrCode = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        const [result] = await db.query(
            `
            INSERT INTO qr_codes (
                qr_code,
                qr_type,
                game_session_id,
                video_recording_id,
                reel_id,
                status,
                expires_at
            )
            VALUES (?, 'reel', ?, ?, ?, 'active', ?)
            `,
            [
                qrCode,
                reel.session_id,
                reel.video_recording_id,
                reel_id,
                expiresAt,
            ]
        );

        return res.status(201).json({
            success: true,
            message: "Reel QR code created successfully",
            data: {
                id: result.insertId,
                qr_code: qrCode,
                qr_type: "reel",
                reel_id: Number(reel_id),
                session_id: reel.session_id,
                reel_url: `${frontendUrl}/reel/${qrCode}`,
                expires_at: expiresAt,
            },
        });

    } catch (error) {
        console.error("Create reel QR error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to create reel QR code",
        });
    }
};


// =====================================================
// GET REEL USING QR CODE
// =====================================================

const getReelByQRCode = async (req, res) => {
    try {
        const { qrCode } = req.params;

        const [rows] = await db.query(
            `
            SELECT
                qr.id AS qr_id,
                qr.status AS qr_status,
                qr.expires_at,

                r.id AS reel_id,
                r.title,
                r.description,
                r.cloudinary_url AS reel_url,
                r.duration_seconds,
                r.status AS reel_status,

                COALESCE(
                    r.session_id,
                    vr.session_id
                ) AS session_id,

                gs.user_id,
                u.full_name AS player_name,
                g.game_name,
                st.station_name

            FROM qr_codes qr

            INNER JOIN reels r
                ON qr.reel_id = r.id

             LEFT JOIN video_recordings vr
                ON r.video_recording_id = vr.id

            INNER JOIN game_sessions gs
                ON gs.id = COALESCE(
                    r.session_id,
                    vr.session_id
                )

            INNER JOIN users u
                ON gs.user_id = u.id

            INNER JOIN games g
                ON gs.game_id = g.id

            INNER JOIN gaming_stations st
                ON gs.station_id = st.id

            WHERE qr.qr_code = ?
              AND qr.qr_type = 'reel'
            LIMIT 1
            `,
            [qrCode]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Reel QR code not found",
            });
        }

        const reel = rows[0];

        if (
            reel.qr_status !== "active" ||
            !reel.expires_at ||
            new Date(reel.expires_at) <= new Date()
        ) {
            await db.query(
                `
                UPDATE qr_codes
                SET status = 'expired'
                WHERE id = ?
                `,
                [reel.qr_id]
            );

            return res.status(410).json({
                success: false,
                message: "This reel QR code has expired",
            });
        }

        if (
            reel.reel_status !== "published" ||
            !reel.reel_url
        ) {
            return res.status(404).json({
                success: false,
                message: "Published reel is not available",
            });
        }

        return res.json({
            success: true,
            data: {
                reel_id: reel.reel_id,
                title: reel.title,
                description: reel.description,
                reel_url: reel.reel_url,
                duration_seconds: reel.duration_seconds,
                session_id: reel.session_id,
                player_name: reel.player_name,
                game_name: reel.game_name,
                station_name: reel.station_name,
                expires_at: reel.expires_at,
            },
        });

    } catch (error) {
        console.error("Get reel by QR error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load reel",
        });
    }
};

// =====================================================
// GET LATEST ACTIVE REEL QR
// =====================================================

const getLatestActiveReelQR = async (req, res) => {
    try {
        const [rows] = await db.query(
            `
            SELECT
                qr.qr_code,
                qr.expires_at,
                r.id AS reel_id,
                r.title,
                r.cloudinary_url AS reel_url,
                gs.user_id,
                u.full_name AS player_name,
                g.game_name,
                st.station_name

            FROM qr_codes qr

            INNER JOIN reels r
                ON qr.reel_id = r.id

            INNER JOIN game_sessions gs
                ON gs.id = qr.game_session_id

            INNER JOIN users u
                ON gs.user_id = u.id

            INNER JOIN games g
                ON gs.game_id = g.id

            INNER JOIN gaming_stations st
                ON gs.station_id = st.id

            WHERE qr.qr_type = 'reel'
              AND qr.status = 'active'
              AND qr.expires_at > NOW()
              AND r.status = 'published'

            ORDER BY qr.id DESC
            LIMIT 1
            `
        );

        return res.json({
            success: true,
            data: rows.length > 0 ? rows[0] : null,
        });

    } catch (error) {
        console.error("Get latest active reel QR error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load latest reel QR code",
        });
    }
};


module.exports = {
    createVideoQRCode,
    getVideoByQRCode,
    deleteExpiredVideo,
    getLatestActiveVideoQR,
    createReelQRCode,
    getReelByQRCode,
    getLatestActiveReelQR,
};
