const db = require("../config/db");

// =====================================================
// GET ALL VIDEO RECORDINGS
// =====================================================

const getAllVideoRecordings = async (req, res) => {
    try {
        let query = `
            SELECT
                vr.id,
                vr.session_id,
                gs.user_id,
                u.full_name AS player_name,
                gs.game_id,
                g.game_name,
                gs.station_id,
                st.station_name,
                vr.camera_id,
                c.camera_name,
                c.camera_code,
                vr.file_name,
                vr.file_path,
                vr.cloudinary_url,
                vr.cloudinary_public_id,
                vr.file_size,
                vr.duration_seconds,
                vr.recording_status,
                vr.recorded_at,
                vr.created_at,
                vr.updated_at
            FROM video_recordings vr
            INNER JOIN game_sessions gs
                ON vr.session_id = gs.id
            INNER JOIN users u
                ON gs.user_id = u.id
            INNER JOIN games g
                ON gs.game_id = g.id
            INNER JOIN gaming_stations st
                ON gs.station_id = st.id
            INNER JOIN cameras c
                ON vr.camera_id = c.id
        `;

        const params = [];

        // Player can see only own recordings
        if (req.user.role_name === "Player") {
            query += ` WHERE gs.user_id = ?`;
            params.push(req.user.id);
        }

        query += ` ORDER BY vr.created_at DESC`;

        const [rows] = await db.query(query, params);

        res.json({
            success: true,
            count: rows.length,
            data: rows
        });

    } catch (error) {
        console.error("Get video recordings error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch video recordings"
        });
    }
};


// =====================================================
// GET VIDEO RECORDING BY ID
// =====================================================

const getVideoRecordingById = async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.query(
            `
            SELECT
                vr.id,
                vr.session_id,
                gs.user_id,
                u.full_name AS player_name,
                gs.game_id,
                g.game_name,
                gs.station_id,
                st.station_name,
                vr.camera_id,
                c.camera_name,
                c.camera_code,
                vr.file_name,
                vr.file_path,
                vr.cloudinary_url,
                vr.cloudinary_public_id,
                vr.file_size,
                vr.duration_seconds,
                vr.recording_status,
                vr.recorded_at,
                vr.created_at,
                vr.updated_at
            FROM video_recordings vr
            INNER JOIN game_sessions gs
                ON vr.session_id = gs.id
            INNER JOIN users u
                ON gs.user_id = u.id
            INNER JOIN games g
                ON gs.game_id = g.id
            INNER JOIN gaming_stations st
                ON gs.station_id = st.id
            INNER JOIN cameras c
                ON vr.camera_id = c.id
            WHERE vr.id = ?
            `,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Video recording not found"
            });
        }

        // Player can only view own recording
        if (
            req.user.role_name === "Player" &&
            Number(rows[0].user_id) !== Number(req.user.id)
        ) {
            return res.status(403).json({
                success: false,
                message: "Access denied"
            });
        }

        res.json({
            success: true,
            data: rows[0]
        });

    } catch (error) {
        console.error("Get video recording error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch video recording"
        });
    }
};


// =====================================================
// CREATE VIDEO RECORDING
// =====================================================

const createVideoRecording = async (req, res) => {
    try {
        const {
            session_id,
            camera_id,
            file_name,
            file_path,
            cloudinary_url,
            cloudinary_public_id,
            file_size,
            duration_seconds,
            recording_status
        } = req.body;

        if (!session_id) {
            return res.status(400).json({
                success: false,
                message: "Session ID is required"
            });
        }

        if (!camera_id) {
            return res.status(400).json({
                success: false,
                message: "Camera ID is required"
            });
        }

        if (!file_name) {
            return res.status(400).json({
                success: false,
                message: "File name is required"
            });
        }

        const validStatuses = [
            "recording",
            "completed",
            "failed"
        ];

        const status = recording_status || "recording";

        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid recording status"
            });
        }

        // Check session
        const [sessions] = await db.query(
            `
            SELECT id, user_id, game_id, station_id
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

        // Check camera
        const [cameras] = await db.query(
            `
            SELECT id, status
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

        const [result] = await db.query(
            `
            INSERT INTO video_recordings
            (
                session_id,
                camera_id,
                file_name,
                file_path,
                cloudinary_url,
                cloudinary_public_id,
                file_size,
                duration_seconds,
                recording_status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                session_id,
                camera_id,
                file_name,
                file_path || null,
                cloudinary_url || null,
                cloudinary_public_id || null,
                file_size || null,
                duration_seconds || null,
                status
            ]
        );

        // Keep game_sessions recording information synchronized
        let sessionRecordingStatus = "not_recorded";

        if (status === "recording") {
            sessionRecordingStatus = "recording";
        }

        if (status === "completed") {
            sessionRecordingStatus = "completed";
        }

        await db.query(
            `
            UPDATE game_sessions
            SET recording_status = ?,
                video_file_id = ?
            WHERE id = ?
            `,
            [
                sessionRecordingStatus,
                result.insertId,
                session_id
            ]
        );

        res.status(201).json({
            success: true,
            message: "Video recording created successfully",
            id: result.insertId
        });

    } catch (error) {
        console.error("Create video recording error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create video recording"
        });
    }
};


// =====================================================
// UPDATE VIDEO RECORDING
// =====================================================

const updateVideoRecording = async (req, res) => {
    try {
        const { id } = req.params;

        const {
            camera_id,
            file_name,
            file_path,
            cloudinary_url,
            cloudinary_public_id,
            file_size,
            duration_seconds,
            recording_status
        } = req.body;

        const [existing] = await db.query(
            `
            SELECT *
            FROM video_recordings
            WHERE id = ?
            `,
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Video recording not found"
            });
        }

        const recording = existing[0];

        const newCameraId =
            camera_id !== undefined
                ? camera_id
                : recording.camera_id;

        const newFileName =
            file_name !== undefined
                ? file_name
                : recording.file_name;

        const newFilePath =
            file_path !== undefined
                ? file_path
                : recording.file_path;

        const newCloudinaryUrl =
            cloudinary_url !== undefined
                ? cloudinary_url
                : recording.cloudinary_url;

        const newCloudinaryPublicId =
            cloudinary_public_id !== undefined
                ? cloudinary_public_id
                : recording.cloudinary_public_id;

        const newFileSize =
            file_size !== undefined
                ? file_size
                : recording.file_size;

        const newDuration =
            duration_seconds !== undefined
                ? duration_seconds
                : recording.duration_seconds;

        const newStatus =
            recording_status !== undefined
                ? recording_status
                : recording.recording_status;

        const validStatuses = [
            "recording",
            "completed",
            "failed"
        ];

        if (!validStatuses.includes(newStatus)) {
            return res.status(400).json({
                success: false,
                message: "Invalid recording status"
            });
        }

        await db.query(
            `
            UPDATE video_recordings
            SET
                camera_id = ?,
                file_name = ?,
                file_path = ?,
                cloudinary_url = ?,
                cloudinary_public_id = ?,
                file_size = ?,
                duration_seconds = ?,
                recording_status = ?
            WHERE id = ?
            `,
            [
                newCameraId,
                newFileName,
                newFilePath,
                newCloudinaryUrl,
                newCloudinaryPublicId,
                newFileSize,
                newDuration,
                newStatus,
                id
            ]
        );

        let sessionRecordingStatus = "not_recorded";

        if (newStatus === "recording") {
            sessionRecordingStatus = "recording";
        }

        if (newStatus === "completed") {
            sessionRecordingStatus = "completed";
        }

        await db.query(
            `
            UPDATE game_sessions
            SET recording_status = ?,
                video_file_id = ?
            WHERE id = ?
            `,
            [
                sessionRecordingStatus,
                id,
                recording.session_id
            ]
        );

        res.json({
            success: true,
            message: "Video recording updated successfully"
        });

    } catch (error) {
        console.error("Update video recording error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update video recording"
        });
    }
};


// =====================================================
// DELETE VIDEO RECORDING
// =====================================================

const deleteVideoRecording = async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.query(
            `
            SELECT session_id
            FROM video_recordings
            WHERE id = ?
            `,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Video recording not found"
            });
        }

        const sessionId = rows[0].session_id;

        await db.query(
            `
            DELETE FROM video_recordings
            WHERE id = ?
            `,
            [id]
        );

        await db.query(
            `
            UPDATE game_sessions
            SET recording_status = 'not_recorded',
                video_file_id = NULL
            WHERE id = ?
              AND video_file_id = ?
            `,
            [sessionId, id]
        );

        res.json({
            success: true,
            message: "Video recording deleted successfully"
        });

    } catch (error) {
        console.error("Delete video recording error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to delete video recording"
        });
    }
};


module.exports = {
    getAllVideoRecordings,
    getVideoRecordingById,
    createVideoRecording,
    updateVideoRecording,
    deleteVideoRecording
};