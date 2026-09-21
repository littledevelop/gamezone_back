const db = require("../config/db");

// Get all game types
const getGameTypes = async (req, res) => {
    try {
        const [gameTypes] = await db.query(`
            SELECT
                id,
                type_name,
                status,
                created_at,
                updated_at
            FROM game_types
            ORDER BY id DESC
        `);

        res.json({
            success: true,
            count: gameTypes.length,
            gameTypes
        });

    } catch (error) {
        console.error("Get game types error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch game types"
        });
    }
};


// Get game type by ID
const getGameTypeById = async (req, res) => {
    try {
        const { id } = req.params;

        const [gameTypes] = await db.query(`
            SELECT
                id,
                type_name,
                status,
                created_at,
                updated_at
            FROM game_types
            WHERE id = ?
        `, [id]);

        if (gameTypes.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Game type not found"
            });
        }

        res.json({
            success: true,
            gameType: gameTypes[0]
        });

    } catch (error) {
        console.error("Get game type error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch game type"
        });
    }
};


// Create game type
const createGameType = async (req, res) => {
    try {
        const { type_name, status = "active" } = req.body;

        if (!type_name || !type_name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Game type name is required"
            });
        }

        const gameTypeName = type_name.trim();

        if (!["active", "inactive"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid game type status"
            });
        }

        // Check duplicate name
        const [existing] = await db.query(
            "SELECT id FROM game_types WHERE type_name = ?",
            [gameTypeName]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Game type already exists"
            });
        }

        const [result] = await db.query(`
            INSERT INTO game_types (type_name, status)
            VALUES (?, ?)
        `, [gameTypeName, status]);

        res.status(201).json({
            success: true,
            message: "Game type created successfully",
            game_type_id: result.insertId
        });

    } catch (error) {
        console.error("Create game type error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create game type"
        });
    }
};


// Update game type
const updateGameType = async (req, res) => {
    try {
        const { id } = req.params;
        const { type_name, status } = req.body;

        if (!type_name || !type_name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Game type name is required"
            });
        }

        if (!["active", "inactive"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid game type status"
            });
        }

        // Check game type exists
        const [existingGameType] = await db.query(
            "SELECT id FROM game_types WHERE id = ?",
            [id]
        );

        if (existingGameType.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Game type not found"
            });
        }

        const gameTypeName = type_name.trim();

        // Check duplicate name excluding current game type
        const [duplicate] = await db.query(
            "SELECT id FROM game_types WHERE type_name = ? AND id != ?",
            [gameTypeName, id]
        );

        if (duplicate.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Game type already exists"
            });
        }

        await db.query(`
            UPDATE game_types
            SET type_name = ?, status = ?
            WHERE id = ?
        `, [gameTypeName, status, id]);

        res.json({
            success: true,
            message: "Game type updated successfully"
        });

    } catch (error) {
        console.error("Update game type error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update game type"
        });
    }
};


// Delete game type
const deleteGameType = async (req, res) => {
    try {
        const { id } = req.params;

        // Check game type exists
        const [existingGameType] = await db.query(
            "SELECT id FROM game_types WHERE id = ?",
            [id]
        );

        if (existingGameType.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Game type not found"
            });
        }

        // Check if game type is being used by a game
        const [games] = await db.query(
            "SELECT id FROM games WHERE game_type_id = ? LIMIT 1",
            [id]
        );

        if (games.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Cannot delete game type because it is being used by a game"
            });
        }

        await db.query(
            "DELETE FROM game_types WHERE id = ?",
            [id]
        );

        res.json({
            success: true,
            message: "Game type deleted successfully"
        });

    } catch (error) {
        console.error("Delete game type error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to delete game type"
        });
    }
};


module.exports = {
    getGameTypes,
    getGameTypeById,
    createGameType,
    updateGameType,
    deleteGameType
};