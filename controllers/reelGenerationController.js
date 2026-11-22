
const db = require("../config/db");

const {
    generateReelForSession
} = require("../services/reelGenerationService");

// =====================================================
// GENERATE REEL FROM AN EXISTING SESSION REEL DRAFT
// =====================================================

const generateReel = async (req, res) => {
    let lockConnection = null;
    let generationLockAcquired = false;
    let lockName = null;

    try {
        const reelId = Number(req.params.id);
        const { role_name, assigned_game_id } = req.user;

        // 1. CHECK ROLE

        if (!["Admin", "Staff"].includes(role_name)) {
            return res.status(403).json({
                success: false,
                message: "Only Admin and Staff can generate reels"
            });
        }

        // 2. VALIDATE REEL ID

        if (!Number.isInteger(reelId) || reelId <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid reel ID"
            });
        }

        // 3. VALIDATE STAFF ASSIGNMENT

        if (
            role_name === "Staff" &&
            (!Number.isInteger(Number(assigned_game_id)) ||
                Number(assigned_game_id) <= 0)
        ) {
            return res.status(403).json({
                success: false,
                message: "Staff account has no assigned game"
            });
        }

        // 4. PREVENT SIMULTANEOUS GENERATION
        // MySQL named locks are connection-specific.
        // Keep this connection until generation finishes.

        lockName = `zestopia_reel_generation_${reelId}`;

        lockConnection = await db.getConnection();

        const [lockRows] = await lockConnection.query(
            "SELECT GET_LOCK(?, 0) AS lock_acquired",
            [lockName]
        );

        const lockValue = lockRows[0]?.lock_acquired;

        if (lockValue === null || lockValue === undefined) {
            throw new Error("Could not acquire reel generation lock");
        }

        if (Number(lockValue) !== 1) {
            return res.status(409).json({
                success: false,
                message: "This reel is already being generated. Please wait."
            });
        }

        generationLockAcquired = true;

        // 5. FETCH REEL AND SESSION

        const [rows] = await db.execute(
            `
            SELECT
                r.id AS reel_id,
                r.session_id,
                r.video_recording_id,
                r.status AS reel_status,
                r.cloudinary_url,

                COALESCE(r.session_id, vr.session_id)
                    AS resolved_session_id,

                gs.game_id,
                gs.user_id,

                g.game_name

            FROM reels r

            LEFT JOIN video_recordings vr
                ON r.video_recording_id = vr.id

            INNER JOIN game_sessions gs
                ON gs.id = COALESCE(r.session_id, vr.session_id)

            INNER JOIN games g
                ON gs.game_id = g.id

            WHERE r.id = ?

            LIMIT 1
            `,
            [reelId]
        );

        if (!rows.length) {
            return res.status(404).json({
                success: false,
                message: "Reel or associated game session not found"
            });
        }

        const reel = rows[0];

        const sessionId = Number(reel.resolved_session_id);
        const gameId = Number(reel.game_id);

        if (
            !Number.isInteger(sessionId) ||
            sessionId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid session associated with this reel"
            });
        }

        // 6. STAFF GAME ACCESS

        if (
            role_name === "Staff" &&
            Number(assigned_game_id) !== gameId
        ) {
            return res.status(403).json({
                success: false,
                message: "You can generate reels only for your assigned game"
            });
        }

        // 7. PREVENT REGENERATION OF ALREADY PUBLISHED REEL

        if (
            reel.reel_status === "published" &&
            reel.cloudinary_url
        ) {
            return res.status(200).json({
                success: true,
                message: "This session reel has already been generated",
                data: {
                    reel_id: reel.reel_id,
                    session_id: sessionId,
                    cloudinary_url: reel.cloudinary_url,
                    status: "published"
                }
            });
        }

        // 8. GET ACTIVE DEFAULT TEMPLATE
        // Prefer game-specific template.
        // Use general template only if no game-specific
        // default template is available.

        const [templates] = await db.execute(
            `
            SELECT
                id,
                template_name,
                game_id,
                configuration

            FROM reel_templates

            WHERE is_active = 1
              AND is_default = 1
              AND (game_id = ? OR game_id IS NULL)

            ORDER BY
                CASE
                    WHEN game_id = ? THEN 0
                    ELSE 1
                END

            LIMIT 1
            `,
            [gameId, gameId]
        );

        let selectedTemplate = null;
        let templateSnapshot = null;

        if (templates.length > 0) {
            const template = templates[0];

            let configuration;

            try {
                configuration =
                    typeof template.configuration === "string"
                        ? JSON.parse(template.configuration)
                        : template.configuration;
            } catch (error) {
                throw new Error(
                    `Invalid configuration for template ${template.id}`
                );
            }

            if (
                !configuration ||
                typeof configuration !== "object" ||
                Array.isArray(configuration)
            ) {
                throw new Error(
                    `Template ${template.id} configuration must be a JSON object`
                );
            }

            selectedTemplate = {
                id: template.id,
                template_name: template.template_name,
                game_id: template.game_id,
                configuration
            };

            // Save a complete snapshot so future template
            // changes do not affect this generated reel.

            templateSnapshot = JSON.stringify({
                template_id: template.id,
                template_name: template.template_name,
                game_id: template.game_id,
                configuration
            });

            console.log(
                "Selected reel template:",
                template.template_name,
                "ID:",
                template.id
            );
        } else {
            console.log(
                `No active default template found for game ${gameId}. Using legacy reel composition.`
            );
        }

        // 9. VERIFY COMPLETED RECORDINGS

        const [recordings] = await db.execute(
            `
            SELECT
                id,
                session_id,
                cloudinary_url,
                recording_status

            FROM video_recordings

            WHERE session_id = ?
              AND recording_status = 'completed'
              AND cloudinary_url IS NOT NULL

            ORDER BY id ASC
            `,
            [sessionId]
        );

        if (!recordings.length) {
            return res.status(400).json({
                success: false,
                message: "No completed uploaded camera recordings are available for this session"
            });
        }

        // 10. GENERATE SESSION REEL USING SELECTED TEMPLATE

        const result = await generateReelForSession(
            sessionId,
            {
                template: selectedTemplate
            }
        );

        if (
            !result ||
            !result.success ||
            !result.cloudinary_url ||
            !result.cloudinary_public_id
        ) {
            throw new Error(
                "Session reel generation or Cloudinary upload failed"
            );
        }

        // 11. VALIDATE GENERATED DURATION

        const duration = Number(result.duration_seconds);

        const finalDuration =
            Number.isFinite(duration) && duration >= 0
                ? Math.round(duration)
                : null;

        // 12. SAVE GENERATED REEL AND TEMPLATE SNAPSHOT

        const [updateResult] = await db.execute(
            `
            UPDATE reels

            SET
                session_id = ?,
                video_recording_id = ?,
                template_id = ?,
                template_snapshot = ?,
                cloudinary_url = ?,
                cloudinary_public_id = ?,
                duration_seconds = ?,
                status = 'published'

            WHERE id = ?
            `,
            [
                sessionId,
                recordings[0].id,
                selectedTemplate?.id ?? null,
                templateSnapshot,
                result.cloudinary_url,
                result.cloudinary_public_id,
                finalDuration,
                reelId
            ]
        );

        if (updateResult.affectedRows === 0) {
            throw new Error(
                "Generated reel could not be saved in the database"
            );
        }

        // 13. SUCCESS RESPONSE

        return res.status(200).json({
            success: true,
            message: "Combined session reel generated and published successfully",

            data: {
                reel_id: reelId,
                session_id: sessionId,

                template_id: selectedTemplate?.id ?? null,
                template_name: selectedTemplate?.template_name ?? null,

                video_recording_id: recordings[0].id,

                recordings_used: result.recordings_used,
                recording_ids: result.recording_ids,

                photos_used: result.photos_used,
                highlight_mode: result.highlight_mode,

                cloudinary_url: result.cloudinary_url,
                cloudinary_public_id: result.cloudinary_public_id,

                duration_seconds: finalDuration,

                game_name: result.game_name,
                player_name: result.player_name,

                status: "published"
            }
        });

    } catch (error) {
        console.error(
            "Generate Session Reel Error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to generate session reel",
            error: process.env.NODE_ENV === "production"
                ? undefined
                : error.message
        });

    } finally {
        // 14. ALWAYS RELEASE THE GENERATION LOCK

        if (lockConnection) {
            try {
                if (generationLockAcquired) {
                    await lockConnection.query(
                        "SELECT RELEASE_LOCK(?)",
                        [lockName]
                    );
                }
            } catch (lockError) {
                console.error(
                    "Reel generation lock release error:",
                    lockError
                );
            } finally {
                lockConnection.release();
            }
        }
    }
};

module.exports = {
    generateReel
};
