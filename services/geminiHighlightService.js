const axios = require("axios");
const fs = require("fs");

const API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const FILE_UPLOAD_URL =
    "https://generativelanguage.googleapis.com/upload/v1beta/files";
const FREE_TIER_MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;
const FILE_POLL_INTERVAL_MS = 5000;

const isGeminiHighlightEnabled = () =>
    Boolean(
        process.env.GEMINI_API_KEY &&
        process.env.GEMINI_ALLOW_CUSTOMER_VIDEO === "true"
    );

const getApiKey = () => {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured");
    }

    return apiKey;
};

const getPositiveInteger = (value, fallback) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0
        ? parsed
        : fallback;
};

const sleep = duration =>
    new Promise(resolve => setTimeout(resolve, duration));

const getResponseText = response => {
    if (typeof response.output_text === "string") {
        return response.output_text;
    }

    if (typeof response.outputText === "string") {
        return response.outputText;
    }

    const outputTexts = [];

    for (const output of response.outputs || []) {
        if (typeof output.text === "string") {
            outputTexts.push(output.text);
        }
    }

    for (const step of response.steps || []) {
        for (const part of step.content || []) {
            if (typeof part.text === "string") {
                outputTexts.push(part.text);
            }
        }
    }

    return outputTexts.join("\n");
};

const parseHighlights = (responseText, durationSeconds) => {
    const withoutFence = responseText
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");

    if (start < 0 || end <= start) {
        throw new Error(
            "Gemini returned a response without a JSON highlight list"
        );
    }

    let response;

    try {
        response = JSON.parse(withoutFence.slice(start, end + 1));
    } catch (error) {
        throw new Error(
            `Gemini returned invalid highlight JSON: ${error.message}`
        );
    }

    if (!Array.isArray(response.highlights)) {
        throw new Error(
            "Gemini response must contain a highlights array"
        );
    }

    return response.highlights
        .map(highlight => ({
            start_seconds: Number(highlight.start_seconds),
            end_seconds: Number(highlight.end_seconds),
            score: Number(highlight.score),
        }))
        .filter(highlight =>
            Number.isFinite(highlight.start_seconds) &&
            Number.isFinite(highlight.end_seconds) &&
            Number.isFinite(highlight.score) &&
            highlight.start_seconds >= 0 &&
            highlight.end_seconds > highlight.start_seconds &&
            highlight.end_seconds <= durationSeconds
        )
        .map(highlight => ({
            ...highlight,
            score: Math.max(0, Math.min(1, highlight.score)),
        }));
};

const getUploadErrorMessage = error =>
    error.response?.data?.error?.message ||
    error.response?.data?.message ||
    error.message;

const uploadVideoFile = async (videoPath, apiKey) => {
    const fileStats = await fs.promises.stat(videoPath);

    if (fileStats.size > FREE_TIER_MAX_FILE_BYTES) {
        throw new Error(
            "Gemini free-tier video uploads are limited to 2 GB per file"
        );
    }

    if (fileStats.size <= 0) {
        throw new Error("Cannot upload an empty video to Gemini");
    }

    const displayName = `gameplay-highlight-${Date.now()}`;
    const contentType = "video/mp4";
    const startResponse = await axios.post(
        FILE_UPLOAD_URL,
        {
            file: {
                display_name: displayName,
            },
        },
        {
            headers: {
                "x-goog-api-key": apiKey,
                "X-Goog-Upload-Protocol": "resumable",
                "X-Goog-Upload-Command": "start",
                "X-Goog-Upload-Header-Content-Length":
                    String(fileStats.size),
                "X-Goog-Upload-Header-Content-Type": contentType,
                "Content-Type": "application/json",
            },
            timeout: 30000,
        }
    );

    const uploadUrl =
        startResponse.headers["x-goog-upload-url"];

    if (typeof uploadUrl !== "string" || !uploadUrl) {
        throw new Error(
            "Gemini did not return a resumable upload URL"
        );
    }

    const uploadResponse = await axios.post(
        uploadUrl,
        fs.createReadStream(videoPath),
        {
            headers: {
                "Content-Length": String(fileStats.size),
                "X-Goog-Upload-Offset": "0",
                "X-Goog-Upload-Command": "upload, finalize",
                "Content-Type": contentType,
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 0,
        }
    );

    const uploadedFile =
        uploadResponse.data?.file || uploadResponse.data;

    if (
        typeof uploadedFile?.name !== "string" ||
        typeof uploadedFile?.uri !== "string"
    ) {
        throw new Error(
            "Gemini did not confirm the uploaded video file"
        );
    }

    return {
        name: uploadedFile.name,
        uri: uploadedFile.uri,
        mimeType: uploadedFile.mime_type || contentType,
    };
};

const waitForFileProcessing = async (file, apiKey) => {
    const timeoutMs = getPositiveInteger(
        process.env.GEMINI_FILE_PROCESSING_TIMEOUT_MS,
        300000
    );
    const deadline = Date.now() + timeoutMs;
    let currentFile = file;

    while (
        currentFile.state !== "ACTIVE" &&
        Date.now() < deadline
    ) {
        if (currentFile.state === "FAILED") {
            throw new Error("Gemini failed to process the uploaded video");
        }

        await sleep(FILE_POLL_INTERVAL_MS);

        const statusResponse = await axios.get(
            `${API_BASE_URL}/${currentFile.name}`,
            {
                headers: {
                    "x-goog-api-key": apiKey,
                },
                timeout: 30000,
            }
        );

        currentFile = statusResponse.data;
    }

    if (currentFile.state !== "ACTIVE") {
        throw new Error(
            "Gemini video processing timed out"
        );
    }

    return currentFile;
};

const deleteUploadedFile = async (fileName, apiKey) => {
    try {
        await axios.delete(
            `${API_BASE_URL}/${fileName}`,
            {
                headers: {
                    "x-goog-api-key": apiKey,
                },
                timeout: 30000,
            }
        );
    } catch (error) {
        console.error(
            "Gemini temporary video deletion failed:",
            getUploadErrorMessage(error)
        );
    }
};

const analyzeVideoHighlights = async (
    videoPath,
    durationSeconds,
    maxHighlights
) => {
    const apiKey = getApiKey();
    let uploadedFile = null;

    try {
        uploadedFile = await uploadVideoFile(videoPath, apiKey);
        const readyFile = await waitForFileProcessing(
            uploadedFile,
            apiKey
        );

        const requestedHighlights = getPositiveInteger(
            maxHighlights,
            12
        );

        const prompt =
            "Analyze this gameplay video and find the most exciting " +
            "visible action moments: player movement, aiming, shooting, " +
            "dodging, celebrations, or other energetic gameplay. Ignore " +
            "idle footage, setup, empty scenes, and the final branded " +
            "ending. Only use timestamps from 0 through " +
            `${durationSeconds.toFixed(2)} seconds. Return up to ` +
            `${requestedHighlights} distinct, non-overlapping highlights. ` +
            "Each highlight should be 2 to 5 seconds and have a score " +
            "from 0 to 1. Return ONLY JSON in this exact shape: " +
            '{"highlights":[{"start_seconds":0.0,' +
            '"end_seconds":3.0,"score":0.9}]}';

        const interactionResponse = await axios.post(
            `${API_BASE_URL}/interactions`,
            {
                model:
                    process.env.GEMINI_MODEL ||
                    "gemini-4-hydrogen",
                input: [
                    {
                        type: "video",
                        uri: readyFile.uri || uploadedFile.uri,
                        mime_type:
                            readyFile.mime_type ||
                            uploadedFile.mimeType,
                    },
                    {
                        type: "text",
                        text: prompt,
                    },
                ],
            },
            {
                headers: {
                    "x-goog-api-key": apiKey,
                    "Content-Type": "application/json",
                },
                timeout: getPositiveInteger(
                    process.env.GEMINI_REQUEST_TIMEOUT_MS,
                    180000
                ),
            }
        );

        const responseText = getResponseText(
            interactionResponse.data
        );

        if (!responseText) {
            throw new Error(
                "Gemini returned no text for its highlight analysis"
            );
        }

        return parseHighlights(responseText, durationSeconds);
    } catch (error) {
        throw new Error(
            `Gemini highlight analysis failed: ${getUploadErrorMessage(error)}`
        );
    } finally {
        if (uploadedFile?.name) {
            await deleteUploadedFile(uploadedFile.name, apiKey);
        }
    }
};

module.exports = {
    analyzeVideoHighlights,
    isGeminiHighlightEnabled,
    parseHighlights,
};
