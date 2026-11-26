const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { downloadFile } = require("./reelGenerationService");

const listen = server =>
    new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });

const close = server =>
    new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
    });

test("retries a reset Cloudinary-style download and saves the file", async () => {
    let requestCount = 0;
    const contents = Buffer.from("downloaded video data");
    const server = http.createServer((request, response) => {
        requestCount += 1;

        if (requestCount === 1) {
            request.socket.destroy();
            return;
        }

        response.writeHead(200, {
            "Content-Length": String(contents.length),
        });
        response.end(contents);
    });
    const tempDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "reel-download-test-")
    );
    const outputPath = path.join(tempDir, "recording.mp4");

    await listen(server);

    try {
        const address = server.address();
        await downloadFile(
            `http://127.0.0.1:${address.port}/recording.mp4`,
            outputPath
        );

        assert.equal(requestCount, 2);
        assert.deepEqual(
            await fs.promises.readFile(outputPath),
            contents
        );
    } finally {
        await close(server);
        await fs.promises.rm(tempDir, {
            recursive: true,
            force: true,
        });
    }
});

test("does not retry permanent download errors", async () => {
    let requestCount = 0;
    const server = http.createServer((request, response) => {
        requestCount += 1;
        response.writeHead(404);
        response.end("Not found");
    });
    const tempDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "reel-download-test-")
    );
    const outputPath = path.join(tempDir, "missing.mp4");

    await listen(server);

    try {
        const address = server.address();

        await assert.rejects(
            downloadFile(
                `http://127.0.0.1:${address.port}/missing.mp4`,
                outputPath
            ),
            /status code 404/
        );

        assert.equal(requestCount, 1);
        assert.equal(fs.existsSync(outputPath), false);
    } finally {
        await close(server);
        await fs.promises.rm(tempDir, {
            recursive: true,
            force: true,
        });
    }
});
