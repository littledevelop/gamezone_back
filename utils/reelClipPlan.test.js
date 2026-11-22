const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildGameplayClipPlan,
} = require("./reelClipPlan");

test("samples a single long recording across its full duration", () => {
    const plan = buildGameplayClipPlan(
        [{ duration: 120 }],
        30
    );

    assert.equal(plan.length, 6);
    assert.deepEqual(
        plan.map(clip => clip.startTime),
        [0, 23, 46, 69, 92, 115]
    );
    assert.equal(
        plan.reduce((total, clip) => total + clip.duration, 0),
        30
    );
});

test("rotates clips across camera recordings", () => {
    const plan = buildGameplayClipPlan(
        [{ duration: 20 }, { duration: 20 }],
        30
    );

    assert.deepEqual(
        plan.map(clip => clip.sourceIndex),
        [0, 1, 0, 1, 0, 1]
    );
    assert.deepEqual(
        plan.map(clip => clip.startTime),
        [0, 0, 7.5, 7.5, 15, 15]
    );
});

test("does not repeat footage when the source is shorter than the target", () => {
    const plan = buildGameplayClipPlan(
        [{ duration: 12 }],
        30
    );

    assert.equal(plan.length, 2);
    assert.deepEqual(
        plan.map(clip => clip.startTime),
        [0, 7]
    );
    assert.equal(
        plan.reduce((total, clip) => total + clip.duration, 0),
        10
    );
});

test("returns no clips for invalid inputs", () => {
    assert.deepEqual(buildGameplayClipPlan([], 30), []);
    assert.deepEqual(buildGameplayClipPlan([{ duration: 10 }], 0), []);
});

test("prefers high-scoring AI highlights and interleaves cameras", () => {
    const plan = buildGameplayClipPlan(
        [{ duration: 20 }, { duration: 20 }],
        10,
        5,
        [
            [
                { start_seconds: 10, end_seconds: 15, score: 0.9 },
                { start_seconds: 0, end_seconds: 5, score: 0.5 },
            ],
            [
                { start_seconds: 2, end_seconds: 7, score: 0.8 },
            ],
        ]
    );

    assert.deepEqual(
        plan.map(clip => [
            clip.sourceIndex,
            clip.startTime,
            clip.selectionType,
        ]),
        [
            [1, 2, "ai"],
            [0, 10, "ai"],
        ]
    );
});

test("fills missing AI highlights with non-overlapping sampled clips", () => {
    const plan = buildGameplayClipPlan(
        [{ duration: 20 }],
        15,
        5,
        [[
            { start_seconds: 5, end_seconds: 10, score: 0.9 },
        ]]
    );

    assert.equal(
        plan.reduce((duration, clip) => duration + clip.duration, 0),
        15
    );
    assert.equal(
        plan.filter(clip => clip.selectionType === "ai").length,
        1
    );

    for (let index = 1; index < plan.length; index++) {
        assert.ok(
            plan[index - 1].startTime + plan[index - 1].duration <=
                plan[index].startTime
        );
    }
});
