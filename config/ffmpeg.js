const path = require("path");
const fs = require("fs");

const ffmpegPath =
    process.env.FFMPEG_PATH ||
    "C:\\Users\\LATA\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin\\ffmpeg.exe";

if (!fs.existsSync(ffmpegPath)) {
    throw new Error(`FFmpeg executable not found: ${ffmpegPath}`);
}

module.exports = path.resolve(ffmpegPath);