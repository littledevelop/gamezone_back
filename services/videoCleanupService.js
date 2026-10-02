const db = require("../config/db");
const cloudinary = require("../config/cloudinary");

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

        if (videos.length === 0) {
            return;
        }

        console.log(
            `Found ${videos.length} expired video(s) to delete.`
        );

        for (const video of videos) {
            try {

                // -----------------------------------------
                // DELETE VIDEO FROM CLOUDINARY
                // -----------------------------------------

                if (video.cloudinary_public_id) {
                    const result =
                        await cloudinary.uploader.destroy(
                            video.cloudinary_public_id,
                            {
                                resource_type: "video",
                                type: "upload",
                                invalidate: true,
                            }
                        );

                    console.log(
                        `Cloudinary delete: ${video.cloudinary_public_id}`,
                        result.result
                    );

                    // If Cloudinary deletion failed,
                    // don't mark QR expired yet.
                    if (
                        result.result !== "ok" &&
                        result.result !== "not found"
                    ) {
                        console.error(
                            `Cloudinary deletion failed for video ${video.video_recording_id}`
                        );

                        continue;
                    }
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

    } catch (error) {
        console.error(
            "Expired video cleanup error:",
            error.message
        );
    }
};

module.exports = cleanupExpiredVideos;