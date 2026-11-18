const db = require("../config/db");

// =====================================================
// HELPER: CHECK ADMIN
// =====================================================

const isAdmin = (req) => req.user.role_name === "Admin";

const isAdminOrStaff = (req) =>
    ["Admin", "Staff"].includes(req.user.role_name);

// =====================================================
// GET ALL REEL TEMPLATES
// Admin: all templates
// Staff: assigned game + general templates
// =====================================================

const getAllTemplates = async (req, res) => {
    try {
        if (!isAdminOrStaff(req)) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        let query = `
            SELECT
                id,
                template_name,
                description,
                game_id,
                configuration,
                is_active,
                is_default,
                created_at,
                updated_at
            FROM reel_templates
        `;

        const params = [];

        if (req.user.role_name === "Staff") {
            if (!req.user.assigned_game_id) {
                return res.status(403).json({
                    success: false,
                    message: "No game is assigned to this Staff account",
                });
            }

            query += ` WHERE game_id = ? OR game_id IS NULL`;
            params.push(req.user.assigned_game_id);
        }

        query += ` ORDER BY is_default DESC, updated_at DESC`;

        const [rows] = await db.query(query, params);

        return res.json({
            success: true,
            count: rows.length,
            data: rows,
        });

    } catch (error) {
        console.error("Get reel templates error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch reel templates",
        });
    }
};

// =====================================================
// GET REEL TEMPLATE BY ID
// =====================================================

const getTemplateById = async (req, res) => {
    try {
        if (!isAdminOrStaff(req)) {
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
            SELECT *
            FROM reel_templates
            WHERE id = ?
            `,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Reel template not found",
            });
        }

        const template = rows[0];

        if (
            req.user.role_name === "Staff" &&
            template.game_id !== null &&
            Number(template.game_id) !== Number(req.user.assigned_game_id)
        ) {
            return res.status(403).json({
                success: false,
                message: "You cannot access this game's template",
            });
        }

        return res.json({
            success: true,
            data: template,
        });

    } catch (error) {
        console.error("Get reel template error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch reel template",
        });
    }
};

// =====================================================
// CREATE REEL TEMPLATE
// Admin only
// =====================================================

const createTemplate = async (req, res) => {
    let connection;
    let transactionStarted = false;

    try {
        if (!isAdmin(req)) {
            return res.status(403).json({
                success: false,
                message: "Only Admin can create reel templates",
            });
        }

        const {
            template_name,
            description,
            game_id,
            configuration,
            is_active,
            is_default,
        } = req.body;

        if (!template_name || !template_name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Template name is required",
            });
        }

        if (!configuration) {
            return res.status(400).json({
                success: false,
                message: "Template configuration is required",
            });
        }

        let parsedConfiguration;

        try {
            parsedConfiguration =
                typeof configuration === "string"
                    ? JSON.parse(configuration)
                    : configuration;
        } catch {
            return res.status(400).json({
                success: false,
                message: "Invalid template configuration JSON",
            });
        }

        if (
            !parsedConfiguration ||
            typeof parsedConfiguration !== "object" ||
            Array.isArray(parsedConfiguration)
        ) {
            return res.status(400).json({
                success: false,
                message: "Configuration must be a valid JSON object",
            });
        }

        const selectedGameId =
            game_id === "" || game_id === undefined || game_id === null
                ? null
                : Number(game_id);

        if (
            selectedGameId !== null &&
            (!Number.isInteger(selectedGameId) || selectedGameId <= 0)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid game ID",
            });
        }

        if (selectedGameId !== null) {
            const [games] = await db.query(
                "SELECT id FROM games WHERE id = ?",
                [selectedGameId]
            );

            if (games.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Selected game not found",
                });
            }
        }

        const active = is_active === undefined ? 1 : Number(is_active);
        const makeDefault = is_default === undefined ? 0 : Number(is_default);

        if (![0, 1].includes(active) || ![0, 1].includes(makeDefault)) {
            return res.status(400).json({
                success: false,
                message: "is_active and is_default must be 0 or 1",
            });
        }

        if (makeDefault && !active) {
            return res.status(400).json({
                success: false,
                message: "A default template must be active",
            });
        }

        connection = await db.getConnection();

        await connection.beginTransaction();
        transactionStarted = true;

        // Clear previous default for the same game.
        // <=> also matches NULL for general templates.

        if (makeDefault === 1) {
            await connection.query(
                `
                UPDATE reel_templates
                SET is_default = 0
                WHERE game_id <=> ?
                `,
                [selectedGameId]
            );
        }

        const [result] = await connection.query(
            `
            INSERT INTO reel_templates (
                template_name,
                description,
                game_id,
                configuration,
                is_active,
                is_default
            )
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [
                template_name.trim(),
                description || null,
                selectedGameId,
                JSON.stringify(parsedConfiguration),
                active,
                makeDefault,
            ]
        );

        await connection.commit();
        transactionStarted = false;

        return res.status(201).json({
            success: true,
            message: "Reel template created successfully",
            data: {
                id: result.insertId,
                template_name: template_name.trim(),
                game_id: selectedGameId,
                is_active: active,
                is_default: makeDefault,
            },
        });

    } catch (error) {
        if (connection && transactionStarted) {
            await connection.rollback();
        }

        console.error("Create reel template error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to create reel template",
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
};

// =====================================================
// UPDATE REEL TEMPLATE
// Admin only
// =====================================================

const updateTemplate = async (req, res) => {
    let connection;
    let transactionStarted = false;

    try {
        if (!isAdmin(req)) {
            return res.status(403).json({
                success: false,
                message: "Only Admin can update reel templates",
            });
        }

        const { id } = req.params;

        const [existing] = await db.query(
            "SELECT * FROM reel_templates WHERE id = ?",
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Reel template not found",
            });
        }

        const current = existing[0];

        const {
            template_name,
            description,
            game_id,
            configuration,
            is_active,
            is_default,
        } = req.body;

        const name =
            template_name === undefined
                ? current.template_name
                : typeof template_name === "string"
                    ? template_name.trim()
                    : "";

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Template name cannot be empty",
            });
        }

        let selectedGameId = current.game_id;

        if (game_id !== undefined) {
            selectedGameId =
                game_id === "" || game_id === null
                    ? null
                    : Number(game_id);

            if (
                selectedGameId !== null &&
                (!Number.isInteger(selectedGameId) || selectedGameId <= 0)
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid game ID",
                });
            }

            if (selectedGameId !== null) {
                const [games] = await db.query(
                    "SELECT id FROM games WHERE id = ?",
                    [selectedGameId]
                );

                if (games.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Selected game not found",
                    });
                }
            }
        }

        let parsedConfiguration = current.configuration;

        if (configuration !== undefined) {
            try {
                parsedConfiguration =
                    typeof configuration === "string"
                        ? JSON.parse(configuration)
                        : configuration;
            } catch {
                return res.status(400).json({
                    success: false,
                    message: "Invalid template configuration JSON",
                });
            }

            if (
                !parsedConfiguration ||
                typeof parsedConfiguration !== "object" ||
                Array.isArray(parsedConfiguration)
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Configuration must be a valid JSON object",
                });
            }

            parsedConfiguration = JSON.stringify(parsedConfiguration);
        }

        const active =
            is_active === undefined
                ? Number(current.is_active)
                : Number(is_active);

        const makeDefault =
            is_default === undefined
                ? Number(current.is_default)
                : Number(is_default);

        if (![0, 1].includes(active) || ![0, 1].includes(makeDefault)) {
            return res.status(400).json({
                success: false,
                message: "is_active and is_default must be 0 or 1",
            });
        }

        if (makeDefault && !active) {
            return res.status(400).json({
                success: false,
                message: "A default template must be active",
            });
        }

        connection = await db.getConnection();

        await connection.beginTransaction();
        transactionStarted = true;

        // Clear previous default for the target game.

        if (makeDefault === 1) {
            await connection.query(
                `
                UPDATE reel_templates
                SET is_default = 0
                WHERE game_id <=> ?
                `,
                [selectedGameId]
            );
        }

        await connection.query(
            `
            UPDATE reel_templates
            SET
                template_name = ?,
                description = ?,
                game_id = ?,
                configuration = ?,
                is_active = ?,
                is_default = ?
            WHERE id = ?
            `,
            [
                name,
                description === undefined ? current.description : description,
                selectedGameId,
                parsedConfiguration,
                active,
                makeDefault,
                id,
            ]
        );

        await connection.commit();
        transactionStarted = false;

        return res.json({
            success: true,
            message: "Reel template updated successfully",
        });

    } catch (error) {
        if (connection && transactionStarted) {
            await connection.rollback();
        }

        console.error("Update reel template error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update reel template",
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
};

// =====================================================
// ACTIVATE TEMPLATE AS DEFAULT
// Admin only
// =====================================================

const activateTemplate = async (req, res) => {
    let connection;
    let transactionStarted = false;

    try {
        if (!isAdmin(req)) {
            return res.status(403).json({
                success: false,
                message: "Only Admin can activate reel templates",
            });
        }

        connection = await db.getConnection();

        await connection.beginTransaction();
        transactionStarted = true;

        const { id } = req.params;

        const [rows] = await connection.query(
            `
            SELECT id, game_id
            FROM reel_templates
            WHERE id = ?
            FOR UPDATE
            `,
            [id]
        );

        if (rows.length === 0) {
            await connection.rollback();
            transactionStarted = false;

            return res.status(404).json({
                success: false,
                message: "Reel template not found",
            });
        }

        const template = rows[0];

        // Clear existing default for this game.

        await connection.query(
            `
            UPDATE reel_templates
            SET is_default = 0
            WHERE game_id <=> ?
            `,
            [template.game_id]
        );

        // Activate selected template as default.

        await connection.query(
            `
            UPDATE reel_templates
            SET is_active = 1, is_default = 1
            WHERE id = ?
            `,
            [id]
        );

        await connection.commit();
        transactionStarted = false;

        return res.json({
            success: true,
            message: "Reel template activated successfully",
            data: {
                id: Number(id),
                game_id: template.game_id,
                is_active: 1,
                is_default: 1,
            },
        });

    } catch (error) {
        if (connection && transactionStarted) {
            await connection.rollback();
        }

        console.error("Activate reel template error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to activate reel template",
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
};

// =====================================================
// EXPORT CONTROLLERS
// =====================================================

module.exports = {
    getAllTemplates,
    getTemplateById,
    createTemplate,
    updateTemplate,
    activateTemplate,
};
