const crypto = require("crypto");
const db = require("../config/db");
const cloudinary = require("../config/cloudinary");
// =====================================================
// CREATE VIDEO QR CODE
// =====================================================

const createVideoQRCode = async (req, res) => {
    try {
        const { session_id, video_recording_id } = req.body;

        if (!session_id) {
            return res.status(400).json({
                success: false,
                message: "Session ID is required",
            });
        }

        if (!video_recording_id) {
            return res.status(400).json({
                success: false,
                message: "Video recording ID is required",
            });
        }

        // Check video + session
        const [videos] = await db.query(
            `
            SELECT
                vr.id,
                vr.session_id,
                vr.recording_status,
                gs.user_id
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

        // Check existing active QR
        const [existingQR] = await db.query(
            `
            SELECT id, qr_code, expires_at
            FROM qr_codes
            WHERE video_recording_id = ?
              AND status = 'active'
              AND expires_at > NOW()
            ORDER BY id DESC
            LIMIT 1
            `,
            [video_recording_id]
        );

        if (existingQR.length > 0) {
            return res.json({
                success: true,
                message: "Active QR code already exists",
                data: {
                    id: existingQR[0].id,
                    qr_code: existingQR[0].qr_code,
                    expires_at: existingQR[0].expires_at,
                },
            });
        }

        // Generate secure random QR token
        const qrCode = crypto.randomBytes(32).toString("hex");

        // QR expires after 1 hour
// const expiresAt = new Date(Date.now() + 2 * 60 * 1000);
const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
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

        res.status(201).json({
            success: true,
            message: "Video QR code created successfully",
            data: {
                id: result.insertId,
                qr_code: qrCode,
                qr_type: "video",
                session_id,
                video_recording_id,
                expires_at: expiresAt,
            },
        });

    } catch (error) {
        console.error("Create video QR error:", error);

        res.status(500).json({
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

        // Check expiry
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

        res.json({
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

        res.status(500).json({
            success: false,
            message: "Failed to load video",
        });
    }
};


// =====================================================
// DELETE EXPIRED VIDEO
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

        if (new Date(video.expires_at) > new Date()) {
            return res.status(400).json({
                success: false,
                message: "Video has not expired yet",
            });
        }

        if (video.cloudinary_public_id) {
            const result = await cloudinary.uploader.destroy(
                video.cloudinary_public_id,
                {
                    resource_type: "video",
                    type: "upload",
                    invalidate: true,
                }
            );

            console.log("Cloudinary delete result:", result);
        }

        await db.query(
            `
            UPDATE qr_codes
            SET status = 'expired'
            WHERE id = ?
            `,
            [video.qr_id]
        );

        await db.query(
            `
            UPDATE video_recordings
            SET recording_status = 'failed'
            WHERE id = ?
            `,
            [video.video_recording_id]
        );

        return res.json({
            success: true,
            message: "Expired video deleted successfully",
        });

    } catch (error) {
        console.error("Delete expired video error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to delete expired video",
        });
    }
};

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

        res.json({
            success: true,
            data: rows[0],
        });

    } catch (error) {
        console.error("Get latest active QR error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to load latest QR code",
        });
    }
};

module.exports = {
    createVideoQRCode,
    getVideoByQRCode,
    deleteExpiredVideo,
    getLatestActiveVideoQR,
};