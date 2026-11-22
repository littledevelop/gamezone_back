const test = require("node:test");
const assert = require("node:assert/strict");

const {
    getReelExpirationDate,
} = require("./reelRetention");

test("uses a 60-minute reel retention by default", () => {
    delete process.env.REEL_RETENTION_MINUTES;

    assert.equal(
        getReelExpirationDate(0).getTime(),
        60 * 60 * 1000
    );
});

test("supports a 30-minute reel retention", () => {
    process.env.REEL_RETENTION_MINUTES = "30";

    assert.equal(
        getReelExpirationDate(1000).getTime(),
        1000 + 30 * 60 * 1000
    );

    delete process.env.REEL_RETENTION_MINUTES;
});

test("rejects retention values outside the client requirement", () => {
    process.env.REEL_RETENTION_MINUTES = "15";

    assert.throws(
        () => getReelExpirationDate(0),
        /must be either 30 or 60/
    );

    delete process.env.REEL_RETENTION_MINUTES;
});
