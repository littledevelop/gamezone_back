const db = require("../config/db");

// Get all registered players
const getPlayers = async (req, res) => {
    try {
        const [players] = await db.query(`
            SELECT
                u.id,
                u.full_name,
                u.mobile,
                u.email
            FROM users u
            INNER JOIN roles r ON u.role_id = r.id
            WHERE r.role_name = 'Player'
            ORDER BY u.full_name ASC
        `);

        return res.status(200).json({
            success: true,
            data: players
        });

    } catch (error) {
        console.error("Get players error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load players"
        });
    }
};

module.exports = {
    getPlayers
};