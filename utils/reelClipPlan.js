const MAX_CLIP_SECONDS = 5;

const buildSampledGameplayClipPlan = (
    sources,
    targetDuration,
    maxClipSeconds
) => {
    const availableSources = sources
        .map((source, index) => ({
            index,
            duration: Number(source?.duration),
        }))
        .filter(source =>
            Number.isFinite(source.duration) &&
            source.duration > 0
        );

    if (!availableSources.length) {
        return [];
    }

    const clipDurations = [];
    let remainingDuration = targetDuration;

    while (remainingDuration > 0) {
        const clipDuration = Math.min(
            maxClipSeconds,
            remainingDuration
        );

        clipDurations.push(clipDuration);
        remainingDuration -= clipDuration;
    }

    const capacities = availableSources.map(source => ({
        ...source,
        remaining: Math.max(
            1,
            Math.floor(source.duration / maxClipSeconds)
        ),
    }));

    const selected = [];

    for (const clipDuration of clipDurations) {
        const source = capacities.find(item => item.remaining > 0);

        if (!source) {
            break;
        }

        source.remaining -= 1;
        selected.push({
            sourceIndex: source.index,
            duration: Math.min(clipDuration, source.duration),
            sourceDuration: source.duration,
            selectionType: "sampled",
        });

        capacities.push(capacities.shift());
    }

    const sourceClipCounts = new Map();

    for (const clip of selected) {
        sourceClipCounts.set(
            clip.sourceIndex,
            (sourceClipCounts.get(clip.sourceIndex) || 0) + 1
        );
    }

    const sourceClipPositions = new Map();
    const sourceClipDurations = new Map();
    const sourceUsedDurations = new Map();

    for (const clip of selected) {
        sourceClipDurations.set(
            clip.sourceIndex,
            (sourceClipDurations.get(clip.sourceIndex) || 0) +
                clip.duration
        );
    }

    return selected.map(clip => {
        const clipCount = sourceClipCounts.get(clip.sourceIndex);
        const clipIndex =
            sourceClipPositions.get(clip.sourceIndex) || 0;
        const unusedDuration = Math.max(
            0,
            clip.sourceDuration -
                sourceClipDurations.get(clip.sourceIndex)
        );
        const usedBefore =
            sourceUsedDurations.get(clip.sourceIndex) || 0;

        sourceClipPositions.set(clip.sourceIndex, clipIndex + 1);
        sourceUsedDurations.set(
            clip.sourceIndex,
            usedBefore + clip.duration
        );

        return {
            sourceIndex: clip.sourceIndex,
            startTime: clipCount > 1
                ? usedBefore +
                    unusedDuration * clipIndex / (clipCount - 1)
                : unusedDuration / 2,
            duration: clip.duration,
            selectionType: clip.selectionType,
        };
    });
};

const buildGameplayClipPlan = (
    sources,
    targetDuration,
    maxClipSeconds = MAX_CLIP_SECONDS,
    highlightsBySource = null
) => {
    if (
        !Array.isArray(sources) ||
        !Number.isFinite(targetDuration) ||
        targetDuration <= 0 ||
        !Number.isFinite(maxClipSeconds) ||
        maxClipSeconds <= 0
    ) {
        return [];
    }

    if (
        !Array.isArray(highlightsBySource) ||
        !highlightsBySource.some(Array.isArray)
    ) {
        return buildSampledGameplayClipPlan(
            sources,
            targetDuration,
            maxClipSeconds
        );
    }

    const candidatesBySource = sources.map((source, sourceIndex) => {
        const sourceDuration = Number(source?.duration);
        const highlights = highlightsBySource[sourceIndex];

        if (!Array.isArray(highlights) || sourceDuration <= 0) {
            return [];
        }

        return highlights
            .map(highlight => {
                const startTime = Number(highlight?.start_seconds);
                const endTime = Number(highlight?.end_seconds);
                const score = Number(highlight?.score);

                if (
                    !Number.isFinite(startTime) ||
                    !Number.isFinite(endTime) ||
                    !Number.isFinite(score) ||
                    startTime < 0 ||
                    endTime <= startTime ||
                    endTime > sourceDuration
                ) {
                    return null;
                }

                const duration = Math.min(
                    maxClipSeconds,
                    endTime - startTime
                );

                return {
                    sourceIndex,
                    startTime,
                    duration,
                    score,
                    selectionType: "ai",
                };
            })
            .filter(Boolean)
            .sort((left, right) => right.score - left.score);
    });

    const selected = [];
    let remainingDuration = targetDuration;
    let hasCandidates = true;

    while (remainingDuration > 0 && hasCandidates) {
        hasCandidates = false;

        for (
            let sourceIndex = 0;
            sourceIndex < candidatesBySource.length &&
            remainingDuration > 0;
            sourceIndex++
        ) {
            const candidates = candidatesBySource[sourceIndex];

            const candidateIndex = candidates.findIndex(candidate =>
                !selected.some(clip =>
                    clip.sourceIndex === sourceIndex &&
                    candidate.startTime < clip.startTime + clip.duration &&
                    candidate.startTime + candidate.duration > clip.startTime
                )
            );

            if (candidateIndex < 0) {
                continue;
            }

            const candidate = candidates.splice(candidateIndex, 1)[0];
            const duration = Math.min(
                candidate.duration,
                remainingDuration
            );

            selected.push({
                ...candidate,
                duration,
            });

            remainingDuration -= duration;
            hasCandidates = true;
        }
    }

    if (remainingDuration > 0) {
        const sampledClips = buildSampledGameplayClipPlan(
            sources,
            targetDuration,
            maxClipSeconds
        );

        for (const clip of sampledClips) {
            if (remainingDuration <= 0) {
                break;
            }

            const overlaps = selected.some(selectedClip =>
                selectedClip.sourceIndex === clip.sourceIndex &&
                clip.startTime < selectedClip.startTime + selectedClip.duration &&
                clip.startTime + clip.duration > selectedClip.startTime
            );

            if (overlaps) {
                continue;
            }

            const duration = Math.min(
                clip.duration,
                remainingDuration
            );

            selected.push({
                ...clip,
                duration,
            });

            remainingDuration -= duration;
        }
    }

    for (
        let sourceIndex = 0;
        sourceIndex < sources.length && remainingDuration > 0;
        sourceIndex++
    ) {
        const sourceDuration = Number(sources[sourceIndex]?.duration);
        let startTime = 0;

        while (startTime < sourceDuration && remainingDuration > 0) {
            const overlappingClip = selected.find(clip =>
                clip.sourceIndex === sourceIndex &&
                startTime < clip.startTime + clip.duration &&
                startTime + maxClipSeconds > clip.startTime
            );

            if (overlappingClip) {
                startTime = overlappingClip.startTime +
                    overlappingClip.duration;
                continue;
            }

            const duration = Math.min(
                maxClipSeconds,
                remainingDuration,
                sourceDuration - startTime
            );

            if (duration <= 0) {
                break;
            }

            selected.push({
                sourceIndex,
                startTime,
                duration,
                selectionType: "sampled",
            });

            remainingDuration -= duration;
            startTime += duration;
        }
    }

    return selected.sort((left, right) =>
        left.startTime - right.startTime ||
        left.sourceIndex - right.sourceIndex
    );
};

module.exports = {
    buildGameplayClipPlan,
};
