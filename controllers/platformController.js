const db = require("../config/db");

// Get all platforms
const getPlatforms = async (req, res) => {
    try {
        const [platforms] = await db.query(`
            SELECT
                id,
                name,
                status,
                created_at,
                updated_at
            FROM platforms
            ORDER BY id DESC
        `);

        res.json({
            success: true,
            count: platforms.length,
            platforms
        });

    } catch (error) {
        console.error("Get platforms error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch platforms"
        });
    }
};


// Get platform by ID
const getPlatformById = async (req, res) => {
    try {
        const { id } = req.params;

        const [platforms] = await db.query(`
            SELECT
                id,
                name,
                status,
                created_at,
                updated_at
            FROM platforms
            WHERE id = ?
        `, [id]);

        if (platforms.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Platform not found"
            });
        }

        res.json({
            success: true,
            platform: platforms[0]
        });

    } catch (error) {
        console.error("Get platform error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch platform"
        });
    }
};


// Create platform
const createPlatform = async (req, res) => {
    try {
        const { name, status = "active" } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Platform name is required"
            });
        }

        const platformName = name.trim();

        if (!["active", "inactive"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid platform status"
            });
        }

        // Check duplicate name
        const [existing] = await db.query(
            "SELECT id FROM platforms WHERE name = ?",
            [platformName]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Platform already exists"
            });
        }

        const [result] = await db.query(`
            INSERT INTO platforms (name, status)
            VALUES (?, ?)
        `, [platformName, status]);

        res.status(201).json({
            success: true,
            message: "Platform created successfully",
            platform_id: result.insertId
        });

    } catch (error) {
        console.error("Create platform error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create platform"
        });
    }
};


// Update platform
const updatePlatform = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, status } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Platform name is required"
            });
        }

        if (!["active", "inactive"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid platform status"
            });
        }

        // Check platform exists
        const [existingPlatform] = await db.query(
            "SELECT id FROM platforms WHERE id = ?",
            [id]
        );

        if (existingPlatform.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Platform not found"
            });
        }

        const platformName = name.trim();

        // Check duplicate name excluding current platform
        const [duplicate] = await db.query(
            "SELECT id FROM platforms WHERE name = ? AND id != ?",
            [platformName, id]
        );

        if (duplicate.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Platform already exists"
            });
        }

        await db.query(`
            UPDATE platforms
            SET name = ?, status = ?
            WHERE id = ?
        `, [platformName, status, id]);

        res.json({
            success: true,
            message: "Platform updated successfully"
        });

    } catch (error) {
        console.error("Update platform error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update platform"
        });
    }
};


// Delete platform
const deletePlatform = async (req, res) => {
    try {
        const { id } = req.params;

        // Check platform exists
        const [existingPlatform] = await db.query(
            "SELECT id FROM platforms WHERE id = ?",
            [id]
        );

        if (existingPlatform.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Platform not found"
            });
        }

        // Check if platform is being used by a game
        const [games] = await db.query(
            "SELECT id FROM games WHERE platform_id = ? LIMIT 1",
            [id]
        );

        if (games.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Cannot delete platform because it is being used by a game"
            });
        }

        await db.query(
            "DELETE FROM platforms WHERE id = ?",
            [id]
        );

        res.json({
            success: true,
            message: "Platform deleted successfully"
        });

    } catch (error) {
        console.error("Delete platform error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to delete platform"
        });
    }
};


module.exports = {
    getPlatforms,
    getPlatformById,
    createPlatform,
    updatePlatform,
    deletePlatform
};