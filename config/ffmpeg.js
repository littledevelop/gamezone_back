const path = require("path");
const fs = require("fs");

const configuredPath = process.env.FFMPEG_PATH;
const ffmpegPath = configuredPath || "ffmpeg";

if (
    configuredPath &&
    path.isAbsolute(configuredPath) &&
    !fs.existsSync(configuredPath)
) {
    throw new Error(`FFmpeg executable not found: ${configuredPath}`);
}

module.exports = path.isAbsolute(ffmpegPath)
    ? path.resolve(ffmpegPath)
    : ffmpegPath;