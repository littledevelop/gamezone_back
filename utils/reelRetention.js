const getReelRetentionMinutes = () => {
    const configuredMinutes = process.env.REEL_RETENTION_MINUTES;
    const minutes = configuredMinutes
        ? Number(configuredMinutes)
        : 60;

    if (![30, 60].includes(minutes)) {
        throw new Error(
            "REEL_RETENTION_MINUTES must be either 30 or 60"
        );
    }

    return minutes;
};

const getReelExpirationDate = (now = Date.now()) => new Date(
    now + getReelRetentionMinutes() * 60 * 1000
);

module.exports = {
    getReelRetentionMinutes,
    getReelExpirationDate,
};
