
const db = require("../config/db");

// ======================================================
// GET ALL GAMES
// ======================================================

const getGames = async (req, res) => {
    try {
        const [games] = await db.query(`
            SELECT
                g.id,
                g.game_name,
                g.platform_id,
                p.name AS platform_name,
                g.game_type_id,
                gt.type_name AS game_type_name,
                g.genre,
                g.description,
                g.price,
                g.status,
                g.created_at,
                g.updated_at
            FROM games g
            LEFT JOIN platforms p
                ON g.platform_id = p.id
            LEFT JOIN game_types gt
                ON g.game_type_id = gt.id
            ORDER BY g.id DESC
        `);

        return res.status(200).json({
            success: true,
            count: games.length,
            games
        });

    } catch (error) {
        console.log("Get Games Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server error while fetching games"
        });
    }
};


// ======================================================
// GET SINGLE GAME
// ======================================================

const getGameById = async (req, res) => {
    try {
        const { id } = req.params;

        const [games] = await db.query(`
            SELECT
                g.id,
                g.game_name,
                g.platform_id,
                p.name AS platform_name,
                g.game_type_id,
                gt.type_name AS game_type_name,
                g.genre,
                g.description,
                g.price,
                g.status,
                g.created_at,
                g.updated_at
            FROM games g
            LEFT JOIN platforms p
                ON g.platform_id = p.id
            LEFT JOIN game_types gt
                ON g.game_type_id = gt.id
            WHERE g.id=?
        `, [id]);

        if (games.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Game not found"
            });
        }

        return res.status(200).json({
            success: true,
            game: games[0]
        });

    } catch (error) {
        console.log("Get Game By ID Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server error while fetching game"
        });
    }
};


// ======================================================
// COMMON GAME VALIDATION
// ======================================================

const validateGameData = async ({
    game_name,
    platform_id,
    price,
    status
}) => {

    // --------------------------------------------------
    // GAME NAME
    // --------------------------------------------------

    if (!game_name || !game_name.trim()) {
        return "Game name is required";
    }


    // --------------------------------------------------
    // PLATFORM
    // --------------------------------------------------

    if (!platform_id) {
        return "Platform is required";
    }

    const [platform] = await db.query(
        "SELECT id FROM platforms WHERE id=?",
        [platform_id]
    );

    if (platform.length === 0) {
        return "Invalid Platform";
    }


    // --------------------------------------------------
    // PRICE
    // --------------------------------------------------

    if (
        price === undefined ||
        price === null ||
        price === "" ||
        isNaN(price) ||
        Number(price) < 0
    ) {
        return "Price must be a valid non-negative number";
    }


    // --------------------------------------------------
    // STATUS
    // --------------------------------------------------

    if (
        status &&
        !["active", "inactive", "maintenance"].includes(status)
    ) {
        return "Status must be active, inactive or maintenance";
    }

    return null;
};


// ======================================================
// CREATE GAME
// ======================================================

const createGame = async (req, res) => {
    try {

        const {
            game_name,
            platform_id,
            game_type_id,
            genre,
            description,
            price,
            status
        } = req.body;


        // --------------------------------------------------
        // COMMON VALIDATION
        // --------------------------------------------------

        const validationError = await validateGameData({
            game_name,
            platform_id,
            price,
            status
        });

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError
            });
        }


        const gameStatus = status || "active";


        // --------------------------------------------------
        // INSERT GAME
        // --------------------------------------------------

        const [result] = await db.query(`
            INSERT INTO games(
                game_name,
                platform_id,
                game_type_id,
                genre,
                description,
                price,
                status
            )
            VALUES(?,?,?,?,?,?,?)
        `,
        [
            game_name.trim(),
            platform_id,
            game_type_id || null,
            genre?.trim() || null,
            description?.trim() || null,
            Number(price),
            gameStatus
        ]);


        return res.status(201).json({
            success: true,
            message: "Game created successfully",
            game_id: result.insertId
        });

    } catch (error) {

        console.log("Create Game Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server error while creating game"
        });
    }
};


// ======================================================
// UPDATE GAME
// ======================================================

const updateGame = async (req, res) => {
    try {

        const { id } = req.params;

        const {
            game_name,
            platform_id,
            game_type_id,
            genre,
            description,
            price,
            status
        } = req.body;


        // --------------------------------------------------
        // CHECK GAME EXISTS
        // --------------------------------------------------

        const [existingGame] = await db.query(
            "SELECT id FROM games WHERE id=?",
            [id]
        );

        if (existingGame.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Game not found"
            });
        }


        // --------------------------------------------------
        // COMMON VALIDATION
        // --------------------------------------------------

        const validationError = await validateGameData({
            game_name,
            platform_id,
            price,
            status
        });

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError
            });
        }


        const gameStatus = status || "active";


        // --------------------------------------------------
        // UPDATE GAME
        // --------------------------------------------------

        await db.query(`
            UPDATE games
            SET
                game_name=?,
                platform_id=?,
                game_type_id=?,
                genre=?,
                description=?,
                price=?,
                status=?
            WHERE id=?
        `,
        [
            game_name.trim(),
            platform_id,
            game_type_id || null,
            genre?.trim() || null,
            description?.trim() || null,
            Number(price),
            gameStatus,
            id
        ]);


        return res.status(200).json({
            success: true,
            message: "Game updated successfully"
        });

    } catch (error) {

        console.log("Update Game Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server error while updating game"
        });
    }
};


// ======================================================
// DELETE GAME
// ======================================================

const deleteGame = async (req, res) => {
    try {

        const { id } = req.params;


        // --------------------------------------------------
        // CHECK GAME EXISTS
        // --------------------------------------------------

        const [existingGame] = await db.query(
            "SELECT id FROM games WHERE id=?",
            [id]
        );

        if (existingGame.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Game not found"
            });
        }


        // --------------------------------------------------
        // DELETE GAME
        // --------------------------------------------------

        await db.query(
            "DELETE FROM games WHERE id=?",
            [id]
        );


        return res.status(200).json({
            success: true,
            message: "Game deleted successfully"
        });

    } catch (error) {

        console.log("Delete Game Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server error while deleting game"
        });
    }
};


// ======================================================
// EXPORTS
// ======================================================

module.exports = {
    getGames,
    getGameById,
    createGame,
    updateGame,
    deleteGame
};
