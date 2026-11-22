const db = require("../config/db");
const cloudinary = require("../config/cloudinary");

const deleteVideoAsset = async publicId => {
    if (!publicId) {
        return true;
    }

    const result = await cloudinary.uploader.destroy(
        publicId,
        {
            resource_type: "video",
            type: "upload",
            invalidate: true,
        }
    );

    return result.result === "ok" || result.result === "not found";
};

const cleanupExpiredVideos = async () => {
    try {
        const [videos] = await db.query(`
            SELECT
                qr.id AS qr_id,
                qr.expires_at,
                vr.id AS video_recording_id,
                vr.cloudinary_public_id
            FROM qr_codes qr
            INNER JOIN video_recordings vr
                ON qr.video_recording_id = vr.id
            WHERE qr.qr_type = 'video'
              AND qr.status = 'active'
              AND qr.expires_at <= NOW()
        `);

        if (videos.length > 0) {
            console.log(
                `Found ${videos.length} expired video(s) to delete.`
            );
        }

        for (const video of videos) {
            try {

                const deleted = await deleteVideoAsset(
                    video.cloudinary_public_id
                );

                if (!deleted) {
                    console.error(
                        `Cloudinary deletion failed for video ${video.video_recording_id}`
                    );

                    continue;
                }

                // -----------------------------------------
                // MARK QR AS EXPIRED
                // -----------------------------------------

                await db.query(
                    `
                    UPDATE qr_codes
                    SET status = 'expired'
                    WHERE id = ?
                    `,
                    [video.qr_id]
                );

                console.log(
                    `Expired video cleaned: ${video.video_recording_id}`
                );

            } catch (error) {
                console.error(
                    `Failed to clean video ${video.video_recording_id}:`,
                    error.message
                );
            }
        }

        const [reels] = await db.query(`
            SELECT
                qr.id AS qr_id,
                qr.reel_id,
                r.cloudinary_public_id,
                NOT EXISTS (
                    SELECT 1
                    FROM qr_codes active_qr
                    WHERE active_qr.reel_id = qr.reel_id
                      AND active_qr.qr_type = 'reel'
                      AND active_qr.status = 'active'
                      AND active_qr.expires_at > NOW()
                ) AS last_active_qr
            FROM qr_codes qr
            INNER JOIN reels r
                ON qr.reel_id = r.id
            WHERE qr.qr_type = 'reel'
              AND qr.status IN ('active', 'expired')
              AND qr.expires_at <= NOW()
              AND (
                    qr.status = 'active'
                    OR (
                        r.cloudinary_public_id IS NOT NULL
                        AND NOT EXISTS (
                            SELECT 1
                            FROM qr_codes active_qr
                            WHERE active_qr.reel_id = qr.reel_id
                              AND active_qr.qr_type = 'reel'
                              AND active_qr.status = 'active'
                              AND active_qr.expires_at > NOW()
                        )
                    )
              )
        `);

        for (const reel of reels) {
            try {
                if (Number(reel.last_active_qr) === 1) {
                    const deleted = await deleteVideoAsset(
                        reel.cloudinary_public_id
                    );

                    if (!deleted) {
                        console.error(
                            `Cloudinary deletion failed for reel ${reel.reel_id}`
                        );

                        continue;
                    }

                    await db.query(
                        `
                        UPDATE reels
                        SET
                            status = 'draft',
                            cloudinary_url = NULL,
                            cloudinary_public_id = NULL,
                            duration_seconds = NULL
                        WHERE id = ?
                          AND cloudinary_public_id <=> ?
                        `,
                        [
                            reel.reel_id,
                            reel.cloudinary_public_id,
                        ]
                    );
                }

                await db.query(
                    `
                    UPDATE qr_codes
                    SET status = 'expired'
                    WHERE id = ?
                    `,
                    [reel.qr_id]
                );

                console.log(
                    `Expired reel QR cleaned: ${reel.reel_id}`
                );
            } catch (error) {
                console.error(
                    `Failed to clean reel ${reel.reel_id}:`,
                    error.message
                );
            }
        }

    } catch (error) {
        console.error(
            "Expired video cleanup error:",
            error.message
        );
    }
};

module.exports = cleanupExpiredVideos;