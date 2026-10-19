const db = require("../config/db");

// =====================================================
// GET CAMERAS ASSIGNED TO A GAME
// =====================================================

const getCamerasByGame = async (req, res) => {
    try {
        const { gameId } = req.params;

        if (!gameId || !Number.isInteger(Number(gameId))) {
            return res.status(400).json({
                success: false,
                message: "Valid gameId is required"
            });
        }

        const [cameras] = await db.query(
            `
            SELECT
                gc.id AS mapping_id,
                gc.game_id,
                gc.camera_id,
                gc.is_primary,
                gc.status AS mapping_status,

                c.camera_name,
                c.camera_code,
                c.gaming_station_id,
                c.ip_address,
                c.camera_type,
                c.status AS camera_status,
                c.location,
                c.notes,

                gs.station_name

            FROM game_cameras gc

            INNER JOIN cameras c
                ON gc.camera_id = c.id

            INNER JOIN gaming_stations gs
                ON c.gaming_station_id = gs.id

            WHERE gc.game_id = ?
              AND gc.status = 'active'
              AND c.status = 'active'

            ORDER BY
                gc.is_primary DESC,
                c.id ASC
            `,
            [Number(gameId)]
        );

        return res.status(200).json({
            success: true,
            data: cameras
        });

    } catch (error) {
        console.log(
            "Getting Game Cameras Error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};


// =====================================================
// ASSIGN CAMERA TO GAME
// =====================================================

const assignCameraToGame = async (req, res) => {
    try {
        const {
            game_id,
            camera_id,
            is_primary = 0
        } = req.body;

        if (!game_id || !camera_id) {
            return res.status(400).json({
                success: false,
                message: "game_id and camera_id are required"
            });
        }

        const gameId = Number(game_id);
        const cameraId = Number(camera_id);

        if (
            !Number.isInteger(gameId) ||
            !Number.isInteger(cameraId)
        ) {
            return res.status(400).json({
                success: false,
                message: "game_id and camera_id must be valid integers"
            });
        }

        // Check game
        const [games] = await db.query(
            `
            SELECT id
            FROM games
            WHERE id = ?
            `,
            [gameId]
        );

        if (games.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Game not found"
            });
        }

        // Check camera
        const [cameras] = await db.query(
            `
            SELECT id
            FROM cameras
            WHERE id = ?
            `,
            [cameraId]
        );

        if (cameras.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Camera not found"
            });
        }

        // Check duplicate mapping
        const [existing] = await db.query(
            `
            SELECT id
            FROM game_cameras
            WHERE game_id = ?
              AND camera_id = ?
            `,
            [gameId, cameraId]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Camera is already assigned to this game"
            });
        }

        // If this camera becomes primary,
        // remove primary status from other cameras
        if (Number(is_primary) === 1) {
            await db.query(
                `
                UPDATE game_cameras
                SET is_primary = 0
                WHERE game_id = ?
                `,
                [gameId]
            );
        }

        const [result] = await db.query(
            `
            INSERT INTO game_cameras
            (
                game_id,
                camera_id,
                is_primary,
                status
            )
            VALUES (?, ?, ?, 'active')
            `,
            [
                gameId,
                cameraId,
                Number(is_primary) === 1 ? 1 : 0
            ]
        );

        return res.status(201).json({
            success: true,
            message: "Camera assigned to game successfully",
            mapping_id: result.insertId
        });

    } catch (error) {
        console.log(
            "Assign Camera To Game Error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};


// =====================================================
// REMOVE CAMERA FROM GAME
// =====================================================

const removeCameraFromGame = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || !Number.isInteger(Number(id))) {
            return res.status(400).json({
                success: false,
                message: "Valid mapping id is required"
            });
        }

        const [result] = await db.query(
            `
            DELETE FROM game_cameras
            WHERE id = ?
            `,
            [Number(id)]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Game camera mapping not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Camera removed from game successfully"
        });

    } catch (error) {
        console.log(
            "Remove Camera From Game Error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};


module.exports = {
    getCamerasByGame,
    assignCameraToGame,
    removeCameraFromGame
};