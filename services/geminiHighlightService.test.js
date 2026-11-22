const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
    analyzeVideoHighlights,
    isGeminiHighlightEnabled,
    parseHighlights,
} = require("./geminiHighlightService");

test("parses valid Gemini highlight JSON and rejects out-of-range clips", () => {
    const highlights = parseHighlights(
        '```json\n{"highlights":[' +
        '{"start_seconds":2,"end_seconds":5,"score":0.8},' +
        '{"start_seconds":10,"end_seconds":12,"score":0.9},' +
        '{"start_seconds":6,"end_seconds":5,"score":0.7}]}\n```',
        8
    );

    assert.deepEqual(highlights, [
        {
            start_seconds: 2,
            end_seconds: 5,
            score: 0.8,
        },
    ]);
});

test("rejects malformed or missing highlight output", () => {
    assert.throws(
        () => parseHighlights("No highlight data", 30),
        /without a JSON highlight list/
    );

    assert.throws(
        () => parseHighlights('{"segments":[]}', 30),
        /must contain a highlights array/
    );
});

test("requires explicit customer-media opt-in before using Gemini", () => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_ALLOW_CUSTOMER_VIDEO;
    assert.equal(isGeminiHighlightEnabled(), false);

    process.env.GEMINI_ALLOW_CUSTOMER_VIDEO = "true";
    assert.equal(isGeminiHighlightEnabled(), true);

    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_ALLOW_CUSTOMER_VIDEO;
});

test("uploads, analyzes, and deletes a temporary Gemini video", async () => {
    const originalPost = axios.post;
    const originalGet = axios.get;
    const originalDelete = axios.delete;
    const originalApiKey = process.env.GEMINI_API_KEY;
    const originalConsent =
        process.env.GEMINI_ALLOW_CUSTOMER_VIDEO;
    const tempDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "gemini-highlight-test-")
    );
    const videoPath = path.join(tempDir, "sample.mp4");
    const requests = [];

    await fs.promises.writeFile(videoPath, Buffer.from("sample video"));
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_ALLOW_CUSTOMER_VIDEO = "true";

    axios.post = async (url, body) => {
        requests.push({ url, body });

        if (url.endsWith("/files")) {
            return {
                headers: {
                    "x-goog-upload-url": "https://upload.example/file",
                },
            };
        }

        if (url === "https://upload.example/file") {
            body.destroy();
            return {
                data: {
                    file: {
                        name: "files/test",
                        uri: "https://files.example/test",
                        mime_type: "video/mp4",
                        state: "ACTIVE",
                    },
                },
            };
        }

        return {
            data: {
                steps: [{
                    content: [{
                        text: JSON.stringify({
                            highlights: [{
                                start_seconds: 1,
                                end_seconds: 4,
                                score: 0.9,
                            }],
                        }),
                    }],
                }],
            },
        };
    };

    axios.get = async url => {
        requests.push({ url });
        return {
            data: {
                name: "files/test",
                uri: "https://files.example/test",
                mime_type: "video/mp4",
                state: "ACTIVE",
            },
        };
    };

    axios.delete = async url => {
        requests.push({ url });
        return { status: 200 };
    };

    try {
        const highlights = await analyzeVideoHighlights(
            videoPath,
            10,
            2
        );

        assert.deepEqual(highlights, [{
            start_seconds: 1,
            end_seconds: 4,
            score: 0.9,
        }]);
        assert.equal(
            requests.some(request => request.url.includes("/interactions")),
            true
        );
        assert.equal(
            requests.some(request => request.url.endsWith("/files/test")),
            true
        );
    } finally {
        axios.post = originalPost;
        axios.get = originalGet;
        axios.delete = originalDelete;

        if (originalApiKey === undefined) {
            delete process.env.GEMINI_API_KEY;
        } else {
            process.env.GEMINI_API_KEY = originalApiKey;
        }

        if (originalConsent === undefined) {
            delete process.env.GEMINI_ALLOW_CUSTOMER_VIDEO;
        } else {
            process.env.GEMINI_ALLOW_CUSTOMER_VIDEO = originalConsent;
        }

        await fs.promises.rm(tempDir, {
            recursive: true,
            force: true,
        });
    }
});
