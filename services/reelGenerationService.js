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
// REEL ASSETS
// =====================================================

const logoPath = path.join(
    __dirname,
    "../assets/logo/Zestopia_Logo_CDR15.jpg.jpeg"
);

const musicPath = path.join(
    __dirname,
    "../assets/music/background.mp3"
);

const MAX_SECONDS_PER_RECORDING = 20;
const MAX_PHOTOS = 5;

const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;
const VIDEO_FPS = 30;

const GAMEPLAY_AUDIO_VOLUME = 0.30;

// =====================================================
// TEMPLATE SETTINGS
// =====================================================

const getTemplateNumber = (value, fallback, min = 0) => {
    const number = Number(value);

    if (!Number.isFinite(number) || number < min) {
        return fallback;
    }

    return number;
};

const getReelSettings = (configuration = {}) => {
    const photos = configuration.photos || {};
    const gameplay = configuration.gameplay || {};
    const ending = configuration.ending || {};
    const branding = configuration.branding || {};

    const textWords = Array.isArray(gameplay.text_words)
        ? gameplay.text_words
        : ["GET", "FOR", "RUN", "SHOOT", "REPEAT"];

    return {
        collageDuration: getTemplateNumber(
            photos.collage_duration,
            6,
            1
        ),

        maxPhotos: Math.min(
            MAX_PHOTOS,
            getTemplateNumber(
                photos.max_photos,
                MAX_PHOTOS,
                0
            )
        ),

        gameplayDuration: getTemplateNumber(
            gameplay.duration,
            24,
            1
        ),

        endingDuration: getTemplateNumber(
            ending.duration,
            5,
            1
        ),

        musicVolume: Math.min(
            1,
            getTemplateNumber(
                branding.music_volume,
                0.18
            )
        ),

        gameplayAudioVolume: Math.min(
            1,
            getTemplateNumber(
                gameplay.audio_volume,
                GAMEPLAY_AUDIO_VOLUME
            )
        ),

        showLogo: branding.show_logo !== false,

        backgroundMusic:
            branding.background_music !== false,

        logoPosition:
            branding.logo_position || "top_right",

        textWords,

        textAnimation:
            gameplay.text_animation !== false,

        gameplayEffect:
            gameplay.effect || "none",

        endingText:
            ending.text || "WELCOME TO ZESTOPIA",

        endingSubtitle:
            ending.subtitle || "PLAY. FIGHT. REPEAT.",
    };
};

// =====================================================
// VERIFY FFMPEG
// =====================================================

const verifyFFmpeg = () => {
    return new Promise((resolve, reject) => {
        ffmpeg().getAvailableFormats((error, formats) => {
            if (error) return reject(error);

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
            timeout: 120000,
        });

        await pipeline(
            response.data,
            fs.createWriteStream(outputPath)
        );

        console.log("Download completed:", outputPath);
    } catch (error) {
        console.error("DOWNLOAD FAILED:", error.message);
        console.error("URL:", url);
        console.error("HTTP STATUS:", error.response?.status);

        throw error;
    }
}

// =====================================================
// CREATE SILENT AUDIO WAV
// =====================================================

const createSilentWav = async (outputPath, duration) => {
    const sampleRate = 44100;
    const channels = 2;
    const bitsPerSample = 16;

    const dataSize =
        Math.ceil(duration * sampleRate) *
        channels *
        (bitsPerSample / 8);

    const wavBuffer = Buffer.alloc(44 + dataSize);

    wavBuffer.write("RIFF", 0);
    wavBuffer.writeUInt32LE(36 + dataSize, 4);
    wavBuffer.write("WAVE", 8);

    wavBuffer.write("fmt ", 12);
    wavBuffer.writeUInt32LE(16, 16);
    wavBuffer.writeUInt16LE(1, 20);
    wavBuffer.writeUInt16LE(channels, 22);
    wavBuffer.writeUInt32LE(sampleRate, 24);

    wavBuffer.writeUInt32LE(
        sampleRate * channels * bitsPerSample / 8,
        28
    );

    wavBuffer.writeUInt16LE(
        channels * bitsPerSample / 8,
        32
    );

    wavBuffer.writeUInt16LE(bitsPerSample, 34);

    wavBuffer.write("data", 36);
    wavBuffer.writeUInt32LE(dataSize, 40);

    await fsp.writeFile(outputPath, wavBuffer);
};

// =====================================================
// GET RECORDING DATA
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
// GET ALL COMPLETED RECORDINGS FOR A SESSION
// =====================================================

const getSessionRecordings = async (sessionId) => {
    const [rows] = await db.query(
        `
        SELECT
            vr.id AS video_recording_id,
            vr.session_id,
            vr.camera_id,
            vr.cloudinary_url,
            vr.cloudinary_public_id,
            vr.duration_seconds,
            vr.recording_status,

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

        WHERE vr.session_id = ?
          AND vr.recording_status = 'completed'
          AND vr.cloudinary_url IS NOT NULL

        ORDER BY vr.id ASC
        `,
        [sessionId]
    );

    if (!rows.length) {
        throw new Error(
            `No completed uploaded recordings found for session ${sessionId}`
        );
    }

    return rows;
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
// GET MEDIA INFORMATION
// =====================================================

const getMediaInfo = (videoPath) => {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (error, metadata) => {
            if (error) return reject(error);

            const videoStream = metadata.streams.find(
                stream => stream.codec_type === "video"
            );

            const audioStream = metadata.streams.some(
                stream => stream.codec_type === "audio"
            );

            if (!videoStream) {
                return reject(
                    new Error("Source video stream not found.")
                );
            }

            resolve({
                duration: Number(metadata.format.duration || 0),
                hasAudio: audioStream,
            });
        });
    });
};

// =====================================================
// NORMALIZE ONE RECORDING
// =====================================================

const normalizeRecording = async (
    inputPath,
    outputPath,
    tempDir
) => {
    const mediaInfo = await getMediaInfo(inputPath);

    if (mediaInfo.duration <= 0) {
        throw new Error(
            `Invalid source video duration: ${inputPath}`
        );
    }

    const duration = Math.min(
        MAX_SECONDS_PER_RECORDING,
        mediaInfo.duration
    );

    let audioInputPath = null;

    if (!mediaInfo.hasAudio) {
        audioInputPath = path.join(
            tempDir,
            `silent_${path.basename(outputPath, ".mp4")}.wav`
        );

        await createSilentWav(audioInputPath, duration);
    }

    return new Promise((resolve, reject) => {
        const command = ffmpeg(inputPath);

        if (audioInputPath) {
            command.input(audioInputPath);
        }

        const audioInput = mediaInfo.hasAudio
            ? "0:a:0"
            : "1:a:0";

        command
            .videoFilters([
                "scale=1120:1991:force_original_aspect_ratio=increase",
                "crop=1080:1920",
                "setsar=1",
                `fps=${VIDEO_FPS}`,
                "eq=contrast=1.06:saturation=1.12",
                "format=yuv420p",
            ])
            .outputOptions([
                "-map 0:v:0",
                `-map ${audioInput}`,
                "-t", String(duration),
                "-c:v libx264",
                "-preset veryfast",
                "-crf 23",
                "-pix_fmt yuv420p",
                "-c:a aac",
                "-ar 44100",
                "-ac 2",
                "-b:a 128k",
                "-avoid_negative_ts make_zero",
                "-movflags +faststart",
            ])
            .output(outputPath)
            .on("start", commandLine => {
                console.log("Normalize command:", commandLine);
            })
            .on("end", resolve)
            .on("error", reject)
            .run();
    });
};

// =====================================================
// CONCATENATE NORMALIZED RECORDINGS
// =====================================================

const concatRecordings = async (
    recordingPaths,
    outputPath,
    tempDir
) => {
    if (!recordingPaths.length) {
        throw new Error(
            "No recordings available to concatenate."
        );
    }

    if (recordingPaths.length === 1) {
        await fsp.copyFile(recordingPaths[0], outputPath);
        return;
    }

    const listPath = path.join(
        tempDir,
        `concat_${path.basename(outputPath, ".mp4")}.txt`
    );

    const escapePath = filePath =>
        filePath.replace(/\\/g, "/").replace(/'/g, "'\\''");

    const listContent = recordingPaths
        .map(filePath => `file '${escapePath(filePath)}'`)
        .join("\n");

    await fsp.writeFile(listPath, listContent, "utf8");

    return new Promise((resolve, reject) => {
        ffmpeg()
            .input(listPath)
            .inputOptions([
                "-f", "concat",
                "-safe", "0",
            ])
            .outputOptions([
                "-c", "copy",
                "-movflags +faststart",
            ])
            .output(outputPath)
            .on("start", commandLine => {
                console.log("Concat command:", commandLine);
            })
            .on("end", resolve)
            .on("error", reject)
            .run();
    });
};
// =====================================================
// FIND A FONT FOR ANIMATED TEXT
// =====================================================

const getFontPath = () => {
    const candidates = [
        process.env.REEL_FONT_FILE,
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
    ].filter(Boolean);

    const font = candidates.find(candidate =>
        fs.existsSync(candidate)
    );

    if (!font) {
        console.warn(
            "No supported font found. Animated text will be skipped."
        );

        return null;
    }

    return font
        .replace(/\\/g, "/")
        .replace(/:/g, "\\:");
};

const escapeDrawtext = (value) => {
    return String(value)
        .replace(/\\/g, "\\\\")
        .replace(/:/g, "\\:")
        .replace(/'/g, "\\'")
        .replace(/%/g, "\\%")
        .replace(/\[/g, "\\[")
        .replace(/\]/g, "\\]")
        .replace(/,/g, "\\,");
};

// =====================================================
// CREATE GAMEPLAY TIMELINE SEGMENT
// Adds animated words over gameplay.
// =====================================================

const createGameplaySegment = async (
    videoPath,
    outputPath,
    startTime,
    duration,
    settings = {},
    includeText = true
) => {
    if (duration <= 0) return;

    const words = Array.isArray(settings.textWords)
        ? settings.textWords.filter(Boolean)
        : [];

    const fontPath = getFontPath();

    const filters = [
        "scale=1080:1920:force_original_aspect_ratio=increase",
        "crop=1080:1920",
        "setsar=1",
        `fps=${VIDEO_FPS}`,
        "eq=contrast=1.08:saturation=1.15",
        "format=yuv420p",
    ];

    if (
        includeText &&
        settings.textAnimation !== false &&
        fontPath &&
        words.length
    ) {
        const wordDuration = Math.max(
            0.8,
            duration / words.length
        );

        words.forEach((word, index) => {
            const start = index * wordDuration;
            const end = Math.min(
                duration,
                start + wordDuration
            );

            if (start >= duration) return;

            const safeWord = escapeDrawtext(word);

            filters.push(
                `drawtext=fontfile='${fontPath}':` +
                `text='${safeWord}':` +
                "fontcolor=0x65E51B:" +
                "fontsize=100:" +
                "borderw=5:" +
                "bordercolor=black@0.8:" +
                "shadowcolor=black@0.8:" +
                "shadowx=5:" +
                "shadowy=5:" +
                "x=(w-text_w)/2:" +
                `y='h*0.40-25*sin((t-${start})*3)':` +
                `alpha='if(lt(t,${start}),0,if(lt(t,${start + 0.25}),(t-${start})/0.25,if(lt(t,${end - 0.2}),1,if(lt(t,${end}),(${end}-t)/0.2,0))))':` +
                `enable='between(t,${start},${end})'`
            );
        });
    }

    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .seekInput(startTime)
            .duration(duration)
            .videoFilters(filters)
            .audioFilters([
                `volume=${settings.gameplayAudioVolume ?? GAMEPLAY_AUDIO_VOLUME}`,
            ])
            .outputOptions([
                "-map 0:v:0",
                "-map 0:a:0",
                "-c:v libx264",
                "-preset veryfast",
                "-crf 23",
                "-pix_fmt yuv420p",
                "-c:a aac",
                "-ar 44100",
                "-ac 2",
                "-b:a 128k",
                "-t", String(duration),
                "-movflags +faststart",
            ])
            .output(outputPath)
            .on("start", commandLine => {
                console.log("Gameplay segment command:", commandLine);
            })
            .on("end", resolve)
            .on("error", (error, stdout, stderr) => {
                console.error(
                    "Gameplay segment failed:",
                    error.message
                );

                if (stderr) console.error(stderr);

                reject(error);
            })
            .run();
    });
};

// =====================================================
// CREATE ANIMATED PHOTO COLLAGE
// Multiple Polaroid cards appear together.
// =====================================================


const createPhotoCollage = async (
    photoPaths,
    outputPath,
    duration,
    tempDir
) => {
    const photos = photoPaths.slice(0, MAX_PHOTOS);

    if (!photos.length) {
        return null;
    }

    const silentAudioPath = path.join(
        tempDir,
        "collage_silence.wav"
    );

    await createSilentWav(
        silentAudioPath,
        duration
    );

    return new Promise((resolve, reject) => {
        const command = ffmpeg();

        // Add looping photo inputs.
        photos.forEach(photoPath => {
            command
                .input(photoPath)
                .inputOptions([
                    "-loop", "1",
                    "-framerate", String(VIDEO_FPS),
                ]);
        });

        const audioInputIndex = photos.length;

        command.input(silentAudioPath);

        const filters = [];

        // First photo becomes the blurred background.
        filters.push(
            "[0:v]" +
            "scale=1080:1920:force_original_aspect_ratio=increase," +
            "crop=1080:1920," +
            "boxblur=28:18," +
            "eq=brightness=-0.30:saturation=0.8," +
            "setsar=1," +
            "fps=30[background]"
        );

        let currentBackground = "background";

        const cardWidth = photos.length === 1 ? 760 : 520;
        const cardHeight = photos.length === 1 ? 980 : 700;

        const positions = [
            { x: 280, y: 520, angle: -0.07 },
            { x: 30, y: 330, angle: 0.09 },
            { x: 540, y: 330, angle: -0.09 },
            { x: 70, y: 1050, angle: -0.06 },
            { x: 510, y: 1050, angle: 0.07 },
        ];

        photos.forEach((photoPath, index) => {
            const position = positions[index];

            const cardLabel = `card${index}`;
            const outputLabel = `collage${index}`;

            filters.push(
                `[${index}:v]` +
                `scale=${cardWidth - 50}:${cardHeight - 130}:force_original_aspect_ratio=decrease,` +
                `pad=${cardWidth - 50}:${cardHeight - 130}:(ow-iw)/2:(oh-ih)/2:color=white,` +
                `pad=${cardWidth}:${cardHeight}:25:25:color=white,` +
                "setsar=1," +
                "format=rgba," +
                `rotate=${position.angle}:ow=rotw(iw):oh=roth(ih):c=black@0,` +
                `fade=t=in:st=${index * 0.25}:d=0.45:alpha=1,` +
                `trim=duration=${duration},` +
                "setpts=PTS-STARTPTS" +
                `[${cardLabel}]`
            );

            const xExpression =
                `${position.x}+8*sin(2*PI*t/3+${index})`;

            const yExpression =
                `${position.y}+10*cos(2*PI*t/3+${index})`;

            filters.push(
                `[${currentBackground}][${cardLabel}]` +
                `overlay=x='${xExpression}':y='${yExpression}':` +
                "eof_action=repeat:" +
                `shortest=0[${outputLabel}]`
            );

            currentBackground = outputLabel;
        });

        filters.push(
            `[${currentBackground}]` +
            `trim=duration=${duration},` +
            "setpts=PTS-STARTPTS," +
            "fps=30," +
            "format=yuv420p[vout]"
        );

        filters.push(
            `[${audioInputIndex}:a]` +
            `atrim=duration=${duration},` +
            "asetpts=PTS-STARTPTS[aout]"
        );

        command
            .complexFilter(filters)
            .outputOptions([
                "-map [vout]",
                "-map [aout]",
                "-c:v libx264",
                "-preset veryfast",
                "-crf 23",
                "-pix_fmt yuv420p",
                "-r 30",
                "-c:a aac",
                "-ar 44100",
                "-ac 2",
                "-b:a 128k",
                "-t", String(duration),
                "-movflags +faststart",
            ])
            .output(outputPath)
            .on("start", commandLine => {
                console.log(
                    "PHOTO COLLAGE COMMAND:",
                    commandLine
                );
            })
            .on("end", () => {
                console.log(
                    "Animated photo collage created:",
                    outputPath
                );

                resolve(outputPath);
            })
            .on("error", (error, stdout, stderr) => {
                console.error(
                    "PHOTO COLLAGE FAILED:",
                    error.message
                );

                if (stderr) {
                    console.error(stderr);
                }

                reject(error);
            })
            .run();
    });
};

// =====================================================
// CREATE ACTION-STYLE BRANDED ENDING
// =====================================================

const createEndingSegment = async (
    videoPath,
    outputPath,
    startTime,
    duration,
    settings = {}
) => {
    if (duration <= 0) return;

    const fontPath = getFontPath();

    const filters = [
        "scale=1080:1920:force_original_aspect_ratio=increase",
        "crop=1080:1920",
        "setsar=1",
        `fps=${VIDEO_FPS}`,
        "eq=contrast=1.12:saturation=1.25",
        "format=yuv420p",
    ];

    if (fontPath) {
        const mainText = escapeDrawtext(
            settings.endingText || "WELCOME TO ZESTOPIA"
        );

        const subtitle = escapeDrawtext(
            settings.endingSubtitle || "PLAY. FIGHT. REPEAT."
        );

        filters.push(
            `drawtext=fontfile='${fontPath}':` +
            `text='${mainText}':` +
            "fontcolor=0x65E51B:" +
            "fontsize=68:" +
            "borderw=4:" +
            "bordercolor=black:" +
            "x=(w-text_w)/2:" +
            "y=h*0.36:" +
            "shadowcolor=black@0.8:" +
            "shadowx=4:shadowy=4"
        );

        filters.push(
            `drawtext=fontfile='${fontPath}':` +
            `text='${subtitle}':` +
            "fontcolor=white:" +
            "fontsize=48:" +
            "borderw=3:" +
            "bordercolor=black:" +
            "x=(w-text_w)/2:" +
            "y=h*0.43"
        );
    }

    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .seekInput(startTime)
            .duration(duration)
            .videoFilters(filters)
            .audioFilters([
                `volume=${settings.gameplayAudioVolume ?? GAMEPLAY_AUDIO_VOLUME}`,
            ])
            .outputOptions([
                "-map 0:v:0",
                "-map 0:a:0",
                "-c:v libx264",
                "-preset veryfast",
                "-crf 23",
                "-pix_fmt yuv420p",
                "-c:a aac",
                "-ar 44100",
                "-ac 2",
                "-b:a 128k",
                "-t", String(duration),
                "-movflags +faststart",
            ])
            .output(outputPath)
            .on("start", commandLine => {
                console.log("ENDING SEGMENT COMMAND:", commandLine);
            })
            .on("end", resolve)
            .on("error", (error, stdout, stderr) => {
                console.error(
                    "ENDING SEGMENT FAILED:",
                    error.message
                );

                if (stderr) console.error(stderr);

                reject(error);
            })
            .run();
    });
};

// =====================================================
// CREATE TEMPLATE-BASED VERTICAL REEL
//
// ORDER:
// 1. Animated photo collage
// 2. Main gameplay + animated words
// 3. Action ending + Zestopia branding
// =====================================================

const createVerticalReel = async ({
    videoPath,
    photoPaths,
    outputPath,
    tempDir,
    configuration = {},
}) => {
    const settings = getReelSettings(configuration);

    const mediaInfo = await getMediaInfo(videoPath);

    console.log("=================================");
    console.log("STARTING VERTICAL REEL");
    console.log("GAMEPLAY VIDEO:", videoPath);
    console.log("GAMEPLAY INFO:", mediaInfo);
    console.log("=================================");

    if (!mediaInfo.hasAudio) {
        throw new Error(
            "Combined gameplay video does not contain audio."
        );
    }

    if (mediaInfo.duration <= 0) {
        throw new Error("Invalid gameplay video duration.");
    }

    const selectedPhotos = photoPaths.slice(
        0,
        settings.maxPhotos
    );

    const availableGameplay = mediaInfo.duration;

    // Reserve the final footage for the branded ending.
    const endingDuration = Math.min(
        settings.endingDuration,
        availableGameplay
    );

    const mainGameplayDuration = Math.min(
        settings.gameplayDuration,
        Math.max(0, availableGameplay - endingDuration)
    );

    // If the source is shorter than the requested ending,
    // use the available footage as the ending.
    const actualEndingDuration =
        mainGameplayDuration > 0
            ? endingDuration
            : availableGameplay;

    const actualMainDuration =
        mainGameplayDuration > 0
            ? mainGameplayDuration
            : 0;

    const timelinePaths = [];

    let gameplayPosition = 0;

    // -------------------------------------------------
    // 1. ANIMATED PHOTO COLLAGE FIRST
    // -------------------------------------------------

    if (selectedPhotos.length > 0) {
        const collagePath = path.join(
            tempDir,
            "timeline_photo_collage.mp4"
        );

        console.log(
            "Creating animated collage:",
            selectedPhotos.length,
            "photos"
        );

        await createPhotoCollage(
            selectedPhotos,
            collagePath,
            settings.collageDuration,
            tempDir
        );

        timelinePaths.push(collagePath);
    }

    // -------------------------------------------------
    // 2. MAIN GAMEPLAY WITH ANIMATED WORDS
    // -------------------------------------------------

    if (actualMainDuration > 0) {
        const gameplayPath = path.join(
            tempDir,
            "timeline_main_gameplay.mp4"
        );

        await createGameplaySegment(
            videoPath,
            gameplayPath,
            gameplayPosition,
            actualMainDuration,
            settings,
            true
        );

        timelinePaths.push(gameplayPath);

        gameplayPosition += actualMainDuration;
    }

    // -------------------------------------------------
    // 3. ACTION ENDING
    // -------------------------------------------------

    if (actualEndingDuration > 0) {
        const endingPath = path.join(
            tempDir,
            "timeline_action_ending.mp4"
        );

        const endingStart = Math.max(
            0,
            availableGameplay - actualEndingDuration
        );

        await createEndingSegment(
            videoPath,
            endingPath,
            endingStart,
            actualEndingDuration,
            settings
        );

        timelinePaths.push(endingPath);
    }

    if (!timelinePaths.length) {
        throw new Error(
            "No reel timeline segments were created."
        );
    }

    // -------------------------------------------------
    // 4. CONCATENATE THE TIMELINE
    // -------------------------------------------------

    const timelinePath = path.join(
        tempDir,
        "reel_timeline.mp4"
    );

    await concatRecordings(
        timelinePaths,
        timelinePath,
        tempDir
    );

    const timelineInfo = await getMediaInfo(timelinePath);

    const totalDuration = timelineInfo.duration;

    if (!totalDuration || totalDuration <= 0) {
        throw new Error(
            "Generated reel timeline has invalid duration."
        );
    }

    console.log("=================================");
    console.log("REEL TIMELINE CREATED");
    console.log("Photos used:", selectedPhotos.length);
    console.log("Main gameplay:", actualMainDuration);
    console.log("Ending gameplay:", actualEndingDuration);
    console.log("Total duration:", totalDuration);
    console.log("=================================");

    // -------------------------------------------------
    // 5. CHECK OPTIONAL ASSETS
    // -------------------------------------------------

    const useLogo =
        settings.showLogo &&
        fs.existsSync(logoPath);

    const useMusic =
        settings.backgroundMusic &&
        fs.existsSync(musicPath);

    if (settings.showLogo && !useLogo) {
        console.warn(
            "Zestopia logo not found. Continuing without logo."
        );
    }

    if (settings.backgroundMusic && !useMusic) {
        console.warn(
            "Background music not found. Continuing without music."
        );
    }

    // -------------------------------------------------
    // 6. ADD LOGO + MIX MUSIC AND GAMEPLAY AUDIO
    // -------------------------------------------------

    return new Promise((resolve, reject) => {
        const command = ffmpeg(timelinePath);

        let logoIndex = null;
        let musicIndex = null;

        if (useLogo) {
            logoIndex = 1;

            command
                .input(logoPath)
                .inputOptions(["-loop", "1"]);
        }

        if (useMusic) {
            musicIndex = useLogo ? 2 : 1;

            command
                .input(musicPath)
                .inputOptions(["-stream_loop", "-1"]);
        }

        const filters = [];

        // Base video
        filters.push(
            "[0:v]format=yuv420p[basev]"
        );

        let finalVideoLabel = "basev";

        // Logo overlay
        if (useLogo) {
            filters.push(
                `[${logoIndex}:v]` +
                "scale=220:-1," +
                "format=rgba[logo]"
            );

            let logoX = "W-w-45";
            let logoY = "55";

            if (settings.logoPosition === "top_left") {
                logoX = "45";
            } else if (
                settings.logoPosition === "bottom_right"
            ) {
                logoY = "H-h-55";
            } else if (
                settings.logoPosition === "bottom_left"
            ) {
                logoX = "45";
                logoY = "H-h-55";
            }

            filters.push(
                `[basev][logo]overlay=` +
                `x=${logoX}:y=${logoY}:` +
                "eof_action=repeat[outv]"
            );

            finalVideoLabel = "outv";
        }

        // Audio mixing
        if (useMusic) {
            const fadeDuration = Math.min(
                2,
                totalDuration
            );

            const fadeStart = Math.max(
                0,
                totalDuration - fadeDuration
            );

            filters.push(
                `[${musicIndex}:a]` +
                `atrim=duration=${totalDuration},` +
                "asetpts=PTS-STARTPTS," +
                `volume=${settings.musicVolume},` +
                `afade=t=in:st=0:d=1,` +
                `afade=t=out:st=${fadeStart}:d=${fadeDuration}` +
                "[music]"
            );

            filters.push(
                "[0:a]volume=1[gameaudio]"
            );

            filters.push(
                "[gameaudio][music]" +
                "amix=inputs=2:duration=first:" +
                "dropout_transition=2," +
                `atrim=duration=${totalDuration},` +
                "alimiter=limit=0.95[outa]"
            );
        } else {
            filters.push(
                "[0:a]anull[outa]"
            );
        }

        command
            .complexFilter(filters)
            .outputOptions([
                `-map [${finalVideoLabel}]`,
                "-map [outa]",
                "-c:v libx264",
                "-preset medium",
                "-crf 23",
                "-pix_fmt yuv420p",
                "-r 30",
                "-c:a aac",
                "-ar 44100",
                "-ac 2",
                "-b:a 192k",
                "-movflags +faststart",
                "-t", String(totalDuration),
            ])
            .output(outputPath)
            .on("start", commandLine => {
                console.log("FINAL REEL GENERATION STARTED");
                console.log(commandLine);
            })
            .on("progress", progress => {
                if (progress.percent) {
                    console.log(
                        `Reel generation: ${progress.percent.toFixed(1)}%`
                    );
                }
            })
            .on("end", () => {
                console.log("FINAL REEL CREATED:", outputPath);
                resolve();
            })
            .on("error", (error, stdout, stderr) => {
                console.error(
                    "FINAL REEL FAILED:",
                    error.message
                );

                if (stderr) console.error(stderr);

                reject(error);
            })
            .run();
    });
};

// =====================================================
// GENERATE REEL FOR A SESSION
// =====================================================

const generateReelForSession = async (
    sessionId,
    options = {}
) => {
    const template = options.template || null;
    const configuration = template?.configuration || {};

    let tempDir = null;

    try {
        const numericSessionId = Number(sessionId);

        if (
            !Number.isInteger(numericSessionId) ||
            numericSessionId <= 0
        ) {
            throw new Error("Invalid session ID.");
        }

        console.log("\n=================================");
        console.log("STARTING SESSION REEL GENERATION");
        console.log("Session ID:", numericSessionId);
        console.log("=================================");

        // 1. GET COMPLETED RECORDINGS

        const recordings = await getSessionRecordings(
            numericSessionId
        );

        const session = recordings[0];

        console.log("Recordings found:", recordings.length);
        console.log("Game:", session.game_name);
        console.log("Player:", session.player_name);

        // 2. GET SESSION PHOTOS

        const photos = await getSessionPhotos(
            numericSessionId
        );

        const settings = getReelSettings(configuration);

        const selectedPhotos = photos.slice(
            0,
            settings.maxPhotos
        );

        console.log("Photos found:", photos.length);
        console.log("Photos selected:", selectedPhotos.length);

        // 3. CREATE TEMPORARY DIRECTORY

        tempDir = await fsp.mkdtemp(
            path.join(os.tmpdir(), "zestopia-session-reel-")
        );

        // 4. DOWNLOAD AND NORMALIZE RECORDINGS

        const normalizedPaths = [];

        for (let i = 0; i < recordings.length; i++) {
            const recording = recordings[i];

            const originalPath = path.join(
                tempDir,
                `source_${i + 1}.mp4`
            );

            const normalizedPath = path.join(
                tempDir,
                `normalized_${i + 1}.mp4`
            );

            console.log(
                `Downloading recording ${i + 1}/${recordings.length}`,
                recording.video_recording_id
            );

            await downloadFile(
                recording.cloudinary_url,
                originalPath
            );

            await normalizeRecording(
                originalPath,
                normalizedPath,
                tempDir
            );

            normalizedPaths.push(normalizedPath);
        }

        // 5. COMBINE RECORDINGS

        const combinedVideoPath = path.join(
            tempDir,
            "combined_gameplay.mp4"
        );

        await concatRecordings(
            normalizedPaths,
            combinedVideoPath,
            tempDir
        );

        // 6. DOWNLOAD SESSION PHOTOS

        const photoPaths = [];

        for (let i = 0; i < selectedPhotos.length; i++) {
            const photoPath = path.join(
                tempDir,
                `photo_${i + 1}.jpg`
            );

            console.log(
                `Downloading photo ${i + 1}/${selectedPhotos.length}`
            );

            await downloadFile(
                selectedPhotos[i].cloudinary_url,
                photoPath
            );

            photoPaths.push(photoPath);
        }

        // 7. GENERATE FINAL REEL

        const outputPath = path.join(
            tempDir,
            `zestopia_session_${numericSessionId}.mp4`
        );

        await createVerticalReel({
            videoPath: combinedVideoPath,
            photoPaths,
            outputPath,
            tempDir,
            configuration,
        });

        // 8. VERIFY OUTPUT

        const outputStats = await fsp.stat(outputPath);

        if (!outputStats.size) {
            throw new Error(
                "Generated reel file is empty."
            );
        }

        const outputInfo = await getMediaInfo(outputPath);

        console.log("Generated reel size:", outputStats.size);
        console.log("Generated reel duration:", outputInfo.duration);

        // 9. UPLOAD TO CLOUDINARY

        console.log("Uploading session reel to Cloudinary...");

        const uploadResult = await cloudinary.uploader.upload(
            outputPath,
            {
                resource_type: "video",
                folder: "gamezone/gameplay-reels",
                public_id:
                    `session_${numericSessionId}_` +
                    `${Date.now()}`,
            }
        );

        console.log("Session reel uploaded successfully.");
        console.log("Cloudinary URL:", uploadResult.secure_url);
        console.log("Cloudinary Public ID:", uploadResult.public_id);

        return {
            success: true,

            session_id: numericSessionId,

            video_recording_id:
                session.video_recording_id,

            recording_ids: recordings.map(
                recording => recording.video_recording_id
            ),

            recordings_used: recordings.length,

            game_id: session.game_id,
            game_name: session.game_name,
            player_name: session.player_name,

            photos_used: photoPaths.length,

            cloudinary_url: uploadResult.secure_url,
            cloudinary_public_id: uploadResult.public_id,

            duration_seconds:
                uploadResult.duration || outputInfo.duration,

            resource_type: uploadResult.resource_type,
        };

    } catch (error) {
        console.error(
            "SESSION REEL GENERATION ERROR:",
            error
        );

        throw error;

    } finally {
        // 10. CLEANUP TEMPORARY FILES

        if (tempDir) {
            try {
                await fsp.rm(tempDir, {
                    recursive: true,
                    force: true,
                });

                console.log(
                    "Temporary reel files cleaned up."
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
// LEGACY FUNCTION
// =====================================================

const generateReelForRecording = async (recordingId) => {
    const recording = await getRecordingData(recordingId);

    return generateReelForSession(
        recording.session_id
    );
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    verifyFFmpeg,
    generateReelForRecording,
    generateReelForSession,
};