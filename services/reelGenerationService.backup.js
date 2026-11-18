const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("../config/ffmpeg");
const db = require("../config/db");
const cloudinary = require("../config/cloudinary");

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const axios = require("axios");
const { pipeline } = require("stream/promises");

ffmpeg.setFfmpegPath(ffmpegPath);

// =====================================================
// VERIFY FFMPEG
// =====================================================

const verifyFFmpeg = () => {
    return new Promise((resolve, reject) => {
        ffmpeg().getAvailableFormats((error, formats) => {
            if (error) {
                return reject(error);
            }

            resolve({
                available: true,
                formatCount: Object.keys(formats || {}).length,
            });
        });
    });
};

// =====================================================
// DOWNLOAD FILE
// =====================================================

async function downloadFile(url, outputPath) {
    try {
        console.log("Downloading file:", url);

        const response = await axios({
            method: "GET",
            url,
            responseType: "stream",
            timeout: 120000
        });

        await pipeline(
            response.data,
            fs.createWriteStream(outputPath)
        );

        console.log("Download completed:", outputPath);

    } catch (error) {
        console.error("DOWNLOAD FAILED:");
        console.error("URL:", error.config?.url || url);
        console.error("HTTP STATUS:", error.response?.status);
        console.error("ERROR:", error.message);

        throw error;
    }
}

// =====================================================
// GET RECORDING + SESSION + GAME
// =====================================================

const getRecordingData = async (recordingId) => {
    const [rows] = await db.query(
        `
        SELECT
            vr.id AS video_recording_id,
            vr.session_id,
            vr.camera_id,
            vr.cloudinary_url,
            vr.cloudinary_public_id,
            vr.duration_seconds,

            gs.user_id,
            gs.game_id,

            g.game_name,
            g.genre,

            u.full_name AS player_name

        FROM video_recordings vr

        INNER JOIN game_sessions gs
            ON gs.id = vr.session_id

        INNER JOIN games g
            ON g.id = gs.game_id

        LEFT JOIN users u
            ON u.id = gs.user_id

        WHERE vr.id = ?
          AND vr.recording_status = 'completed'
          AND vr.cloudinary_url IS NOT NULL

        LIMIT 1
        `,
        [recordingId]
    );

    if (!rows.length) {
        throw new Error(
            `Completed video recording not found: ${recordingId}`
        );
    }

    return rows[0];
};

// =====================================================
// GET SESSION PHOTOS
// =====================================================

const getSessionPhotos = async (sessionId) => {
    const [rows] = await db.query(
        `
        SELECT
            id,
            cloudinary_url,
            captured_at

        FROM game_session_photos

        WHERE session_id = ?
          AND cloudinary_url IS NOT NULL

        ORDER BY captured_at ASC, id ASC
        `,
        [sessionId]
    );

    return rows;
};

// =====================================================
// CREATE VERTICAL REEL
// =====================================================

const createVerticalReel = ({
    videoPath,
    photoPaths,
    outputPath,
}) => {
    return new Promise((resolve, reject) => {
        const command = ffmpeg(videoPath);

        // -------------------------------------------------
        // Add photos as additional FFmpeg inputs
        // -------------------------------------------------

        photoPaths.forEach((photoPath) => {
            command
                .input(photoPath)
                .inputOptions(["-loop", "1"]);
        });

        const filterGraph = [];

        // -------------------------------------------------
        // Main gameplay video
        // Maximum 20 seconds
        // -------------------------------------------------

        filterGraph.push(
            `[0:v]` +
            `scale=1080:1920:force_original_aspect_ratio=increase,` +
            `crop=1080:1920:(iw-1080)/2:(ih-1920)/2,` +
            `setsar=1,` +
            `fps=30,` +
            `trim=duration=20,` +
            `setpts=PTS-STARTPTS` +
            `[v0]`
        );

        // -------------------------------------------------
        // Each photo = 3 seconds
        // -------------------------------------------------

        photoPaths.forEach((photoPath, index) => {
            const inputIndex = index + 1;

            filterGraph.push(
                `[${inputIndex}:v]` +
                `scale=1080:1920:force_original_aspect_ratio=increase,` +
                `crop=1080:1920:(iw-1080)/2:(ih-1920)/2,` +
                `setsar=1,` +
                `fps=30,` +
                `trim=duration=3,` +
                `setpts=PTS-STARTPTS` +
                `[v${inputIndex}]`
            );
        });

        // -------------------------------------------------
        // Combine video + photos
        // -------------------------------------------------

        if (photoPaths.length > 0) {
            const concatInputs = ["[v0]"];

            photoPaths.forEach((photoPath, index) => {
                concatInputs.push(`[v${index + 1}]`);
            });

            filterGraph.push(
                `${concatInputs.join("")}` +
                `concat=n=${photoPaths.length + 1}:v=1:a=0` +
                `[outv]`
            );
        } else {
            filterGraph.push("[v0]copy[outv]");
        }

        command
            .complexFilter(filterGraph, ["outv"])
            .videoCodec("libx264")
            .outputOptions([
                "-pix_fmt yuv420p",
                "-movflags +faststart",
                "-preset medium",
                "-crf 23",
                "-an",
            ])
            .output(outputPath)
            .on("start", (commandLine) => {
                console.log("\n=================================");
                console.log("FFmpeg started");
                console.log("=================================");
                console.log(commandLine);
            })
            .on("progress", (progress) => {
                if (progress.percent) {
                    console.log(
                        `Reel generation: ${progress.percent.toFixed(1)}%`
                    );
                }
            })
            .on("end", () => {
                console.log("\n=================================");
                console.log("FFmpeg reel created successfully");
                console.log("=================================\n");

                resolve();
            })
            .on("error", (error, stdout, stderr) => {
                console.error("\n=================================");
                console.error("FFmpeg reel generation failed");
                console.error("=================================");
                console.error(error.message);

                if (stderr) {
                    console.error(stderr);
                }

                reject(error);
            })
            .run();
    });
};

// =====================================================
// GENERATE REEL FOR VIDEO RECORDING
// =====================================================

const generateReelForRecording = async (recordingId) => {
    let tempDir = null;

    try {
        console.log("\n=================================");
        console.log("STARTING REEL GENERATION");
        console.log("=================================");
        console.log("Recording ID:", recordingId);

        // -------------------------------------------------
        // 1. Get recording information
        // -------------------------------------------------

        const recording = await getRecordingData(recordingId);

        console.log("\nRecording found:");
        console.log("Video Recording ID:", recording.video_recording_id);
        console.log("Session ID:", recording.session_id);
        console.log("Game:", recording.game_name);
        console.log("Genre:", recording.genre);
        console.log("Player:", recording.player_name);
        console.log("Duration:", recording.duration_seconds);

        // -------------------------------------------------
        // 2. Get session photos
        // -------------------------------------------------

        const photos = await getSessionPhotos(recording.session_id);

        console.log("\nPhotos found:", photos.length);

        // -------------------------------------------------
        // 3. Create temporary directory
        // -------------------------------------------------

        tempDir = await fsp.mkdtemp(
            path.join(os.tmpdir(), "zestopia-reel-")
        );

        console.log("\nTemporary directory:");
        console.log(tempDir);

        // -------------------------------------------------
        // 4. Download gameplay video
        // -------------------------------------------------

        const videoPath = path.join(
            tempDir,
            "gameplay.mp4"
        );

        console.log("\nDownloading gameplay video...");

        await downloadFile(
            recording.cloudinary_url,
            videoPath
        );

        console.log("Gameplay video downloaded.");

        // -------------------------------------------------
        // 5. Download photos
        // -------------------------------------------------

        const photoPaths = [];

        // For the first test, use maximum 5 photos.
        const selectedPhotos = photos.slice(0, 5);

        for (let i = 0; i < selectedPhotos.length; i++) {
            const photoPath = path.join(
                tempDir,
                `photo_${i + 1}.jpg`
            );

            console.log(
                `Downloading photo ${i + 1}/${selectedPhotos.length}...`
            );

            await downloadFile(
                selectedPhotos[i].cloudinary_url,
                photoPath
            );

            photoPaths.push(photoPath);
        }

        console.log(
            "Downloaded photos:",
            photoPaths.length
        );

        // -------------------------------------------------
        // 6. Create output path
        // -------------------------------------------------

        const outputPath = path.join(
            tempDir,
            `zestopia_reel_${recordingId}.mp4`
        );

        // -------------------------------------------------
        // 7. Generate vertical reel
        // -------------------------------------------------

        await createVerticalReel({
            videoPath,
            photoPaths,
            outputPath,
        });

        // -------------------------------------------------
        // 8. Check output file
        // -------------------------------------------------

        const outputStats = await fsp.stat(outputPath);

        console.log("\nGenerated reel:");
        console.log(outputPath);
        console.log(
            "File size:",
            outputStats.size,
            "bytes"
        );

        // -------------------------------------------------
        // 9. Upload reel to Cloudinary
        // -------------------------------------------------

        console.log("\nUploading reel to Cloudinary...");

        const uploadResult = await cloudinary.uploader.upload(
            outputPath,
            {
                resource_type: "video",
                folder: "gamezone/gameplay-reels",
                public_id:
                    `session_${recording.session_id}` +
                    `_recording_${recordingId}_` +
                    `${Date.now()}`,
            }
        );

        console.log("\n=================================");
        console.log("REEL UPLOADED SUCCESSFULLY");
        console.log("=================================");

        console.log("Cloudinary URL:");
        console.log(uploadResult.secure_url);

        console.log("\nCloudinary Public ID:");
        console.log(uploadResult.public_id);

        return {
            success: true,

            video_recording_id:
                recording.video_recording_id,

            session_id:
                recording.session_id,

            game_id:
                recording.game_id,

            game_name:
                recording.game_name,

            player_name:
                recording.player_name,

            photos_used:
                photoPaths.length,

            cloudinary_url:
                uploadResult.secure_url,

            cloudinary_public_id:
                uploadResult.public_id,

            duration_seconds:
                uploadResult.duration || null,

            resource_type:
                uploadResult.resource_type,
        };

    } catch (error) {
        console.error("\n=================================");
        console.error("REEL GENERATION ERROR");
        console.error("=================================");
        console.error(error);

        throw error;

    } finally {
        // -------------------------------------------------
        // Cleanup temporary files
        // -------------------------------------------------

        if (tempDir) {
            try {
                await fsp.rm(tempDir, {
                    recursive: true,
                    force: true,
                });

                console.log(
                    "\nTemporary files cleaned up."
                );
            } catch (cleanupError) {
                console.error(
                    "Temporary cleanup failed:",
                    cleanupError.message
                );
            }
        }
    }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    verifyFFmpeg,
    generateReelForRecording,
};