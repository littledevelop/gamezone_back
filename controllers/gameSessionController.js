const db = require("../config/db");

// =====================================================
// HELPER FUNCTIONS
// =====================================================

// CHECK POSITIVE INTEGER
const isPositiveInteger = (value) => {
    const number = Number(value);
    return Number.isInteger(number) && number > 0;
};

// CHECK NON-NEGATIVE INTEGER
const isNonNegativeInteger = (value) => {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0;
};

// CHECK MYSQL DATETIME FORMAT
const isValidDateTime = (value) => {
    if (typeof value !== "string") {
        return false;
    }

    // Expected format: YYYY-MM-DD HH:MM:SS
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(value.replace(" ", "T"));

    return !Number.isNaN(date.getTime());
};

// CALCULATE DURATION IN MINUTES
const calculateDuration = (startTime, endTime) => {
    const start = new Date(startTime.replace(" ", "T"));
    const end = new Date(endTime.replace(" ", "T"));

    const difference = end - start;

    if (difference < 0) {
        return null;
    }

    return Math.round(difference / (1000 * 60));
};


// =====================================================
// GET ALL GAME SESSIONS
// =====================================================

const getAllGameSessions = async (req, res) => {
    try {

        const [gameSessions] = await db.query(`
            SELECT
                gs.id,
                gs.user_id,
                u.full_name AS user_name,
                gs.game_id,
                g.game_name,
                gs.station_id,
                st.station_name,
                gs.start_time,
                gs.end_time,
                gs.duration_minutes,
                gs.amount,
                gs.status,
                gs.recording_status,
                gs.video_file_id,
                gs.notes,
                gs.created_at,
                gs.updated_at
            FROM game_sessions gs

            INNER JOIN users u
                ON gs.user_id = u.id

            INNER JOIN games g
                ON gs.game_id = g.id

            INNER JOIN gaming_stations st
                ON gs.station_id = st.id

            ORDER BY gs.id DESC
        `);

        return res.status(200).json({
            success: true,
            data: gameSessions
        });

    } catch (error) {

        console.log("Get Game Sessions Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server error while fetching game sessions"
        });
    }
};


// =====================================================
// GET GAME SESSION BY ID
// =====================================================

const getGameSessionById = async (req, res) => {
    try {

        const { id } = req.params;

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Game Session ID"
            });
        }

        const [gameSessions] = await db.query(`
            SELECT
                gs.id,
                gs.user_id,
                u.full_name AS user_name,
                gs.game_id,
                g.game_name,
                gs.station_id,
                st.station_name,
                gs.start_time,
                gs.end_time,
                gs.duration_minutes,
                gs.amount,
                gs.status,
                gs.recording_status,
                gs.video_file_id,
                gs.notes,
                gs.created_at,
                gs.updated_at
            FROM game_sessions gs

            INNER JOIN users u
                ON gs.user_id = u.id

            INNER JOIN games g
                ON gs.game_id = g.id

            INNER JOIN gaming_stations st
                ON gs.station_id = st.id

            WHERE gs.id = ?
        `, [Number(id)]);

        if (gameSessions.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Game Session Not Found"
            });
        }

        return res.status(200).json({
            success: true,
            data: gameSessions[0]
        });

    } catch (error) {

        console.log("Get Game Session By ID Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server error while fetching game session"
        });
    }
};


// =====================================================
// VALIDATE GAME SESSION DATA
// =====================================================

const validateGameSession = async (data) => {

    const {
        user_id,
        game_id,
        station_id,
        start_time,
        end_time,
        duration_minutes,
        amount,
        status,
        recording_status,
        video_file_id,
        notes
    } = data;


    // -------------------------------------------------
    // USER VALIDATION
    // -------------------------------------------------

    if (user_id !== undefined && user_id !== null) {

        const userId = Number(user_id);

        if (!isPositiveInteger(userId)) {
            return "Invalid User ID";
        }

        const [users] = await db.query(`
            SELECT u.id
            FROM users u
            INNER JOIN roles r
                ON u.role_id = r.id
            WHERE u.id = ?
            AND r.role_name = 'Player'
        `, [userId]);

        if (users.length === 0) {
            return "user_id does not exist or is not a Player";
        }
    }


    // -------------------------------------------------
    // GAME VALIDATION
    // -------------------------------------------------

    if (game_id !== undefined && game_id !== null) {

        const gameId = Number(game_id);

        if (!isPositiveInteger(gameId)) {
            return "Invalid Game ID";
        }

        const [games] = await db.query(`
            SELECT id
            FROM games
            WHERE id = ?
        `, [gameId]);

        if (games.length === 0) {
            return "Invalid Game";
        }
    }


    // -------------------------------------------------
    // GAMING STATION VALIDATION
    // -------------------------------------------------

    if (station_id !== undefined && station_id !== null) {

        const stationId = Number(station_id);

        if (!isPositiveInteger(stationId)) {
            return "Invalid Gaming Station ID";
        }

        const [stations] = await db.query(`
            SELECT id
            FROM gaming_stations
            WHERE id = ?
        `, [stationId]);

        if (stations.length === 0) {
            return "Invalid Gaming Station";
        }
    }


    // -------------------------------------------------
    // START TIME VALIDATION
    // -------------------------------------------------

    if (start_time !== undefined && start_time !== null) {

        if (!isValidDateTime(start_time)) {
            return "Start time must be in YYYY-MM-DD HH:MM:SS format";
        }
    }


    // -------------------------------------------------
    // END TIME VALIDATION
    // -------------------------------------------------

    if (end_time !== undefined && end_time !== null && end_time !== "") {

        if (!isValidDateTime(end_time)) {
            return "End time must be in YYYY-MM-DD HH:MM:SS format";
        }
    }


    // -------------------------------------------------
    // DURATION VALIDATION
    // -------------------------------------------------

    if (
        duration_minutes !== undefined &&
        duration_minutes !== null &&
        duration_minutes !== ""
    ) {

        if (!isNonNegativeInteger(duration_minutes)) {
            return "Duration must be a non-negative integer";
        }
    }


    // -------------------------------------------------
    // AMOUNT VALIDATION
    // -------------------------------------------------

    if (
        amount !== undefined &&
        amount !== null &&
        amount !== ""
    ) {

        const numericAmount = Number(amount);

        if (
            !Number.isFinite(numericAmount) ||
            numericAmount < 0
        ) {
            return "Amount must be a valid non-negative number";
        }

        // DECIMAL(10,2)
        if (numericAmount > 99999999.99) {
            return "Amount is too large";
        }

        if (
            Math.round(numericAmount * 100) !==
            numericAmount * 100
        ) {
            return "Amount can have maximum 2 decimal places";
        }
    }


    // -------------------------------------------------
    // STATUS VALIDATION
    // -------------------------------------------------

    if (status !== undefined && status !== null) {

        const normalizedStatus = String(status).trim().toLowerCase();

        if (
            !["active", "completed", "cancelled"]
                .includes(normalizedStatus)
        ) {
            return "Status must be active, completed or cancelled";
        }
    }


    // -------------------------------------------------
    // RECORDING STATUS VALIDATION
    // -------------------------------------------------

    if (
        recording_status !== undefined &&
        recording_status !== null
    ) {

        const normalizedRecordingStatus =
            String(recording_status).trim().toLowerCase();

        // Known values from the database structure.
        // The fourth enum value is intentionally not assumed here.
        const validRecordingStatuses = [
            "not_recorded",
            "recording",
            "completed"
        ];

        if (
            !validRecordingStatuses
                .includes(normalizedRecordingStatus)
        ) {
            return "Invalid recording status";
        }
    }


    // -------------------------------------------------
    // VIDEO FILE ID VALIDATION
    // -------------------------------------------------

    if (
        video_file_id !== undefined &&
        video_file_id !== null
    ) {

        const videoFileId = String(video_file_id).trim();

        if (videoFileId.length > 255) {
            return "Video file ID cannot exceed 255 characters";
        }
    }


    // -------------------------------------------------
    // NOTES VALIDATION
    // -------------------------------------------------

    if (notes !== undefined && notes !== null) {

        if (typeof notes !== "string") {
            return "Notes must be text";
        }
    }


    return null;
};


// =====================================================
// CREATE GAME SESSION
// =====================================================

const createGameSession = async (req, res) => {
    try {

        const {
            user_id,
            game_id,
            station_id,
            start_time,
            end_time,
            duration_minutes,
            amount,
            status,
            recording_status,
            video_file_id,
            notes
        } = req.body;


        // -------------------------------------------------
        // REQUIRED FIELD VALIDATION
        // -------------------------------------------------

        if (
            user_id === undefined ||
            user_id === null ||
            user_id === ""
        ) {
            return res.status(400).json({
                success: false,
                message: "User ID is required"
            });
        }

        if (
            game_id === undefined ||
            game_id === null ||
            game_id === ""
        ) {
            return res.status(400).json({
                success: false,
                message: "Game ID is required"
            });
        }

        if (
            station_id === undefined ||
            station_id === null ||
            station_id === ""
        ) {
            return res.status(400).json({
                success: false,
                message: "Gaming Station ID is required"
            });
        }

        if (
            start_time === undefined ||
            start_time === null ||
            start_time === ""
        ) {
            return res.status(400).json({
                success: false,
                message: "Start time is required"
            });
        }


        // -------------------------------------------------
        // VALIDATE DATA
        // -------------------------------------------------

        const validationError = await validateGameSession(
            req.body
        );

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError
            });
        }


        // -------------------------------------------------
        // NORMALIZE DATA
        // -------------------------------------------------

        const userId = Number(user_id);
        const gameId = Number(game_id);
        const stationId = Number(station_id);

        const sessionStatus =
            status !== undefined &&
            status !== null &&
            status !== ""
                ? String(status).trim().toLowerCase()
                : "active";

        const sessionRecordingStatus =
            recording_status !== undefined &&
            recording_status !== null &&
            recording_status !== ""
                ? String(recording_status).trim().toLowerCase()
                : "not_recorded";

        const normalizedEndTime =
            end_time === undefined ||
            end_time === ""
                ? null
                : end_time;

        const normalizedVideoFileId =
            video_file_id === undefined ||
            video_file_id === ""
                ? null
                : String(video_file_id).trim();

        const normalizedNotes =
            notes === undefined ||
            notes === ""
                ? null
                : notes;


        // -------------------------------------------------
        // END TIME MUST BE AFTER START TIME
        // -------------------------------------------------

        if (normalizedEndTime) {

            const duration =
                calculateDuration(
                    start_time,
                    normalizedEndTime
                );

            if (duration === null) {
                return res.status(400).json({
                    success: false,
                    message: "End time must be greater than or equal to start time"
                });
            }
        }


        // -------------------------------------------------
        // COMPLETED SESSION MUST HAVE END TIME
        // -------------------------------------------------

        if (
            sessionStatus === "completed" &&
            !normalizedEndTime
        ) {
            return res.status(400).json({
                success: false,
                message: "Completed session must have end time"
            });
        }


        // -------------------------------------------------
        // ACTIVE SESSION SHOULD NOT HAVE END TIME
        // -------------------------------------------------

        if (
            sessionStatus === "active" &&
            normalizedEndTime
        ) {
            return res.status(400).json({
                success: false,
                message: "Active session cannot have end time"
            });
        }


        // -------------------------------------------------
        // AUTO CALCULATE DURATION
        // -------------------------------------------------

        let finalDuration =
            duration_minutes !== undefined &&
            duration_minutes !== null &&
            duration_minutes !== ""
                ? Number(duration_minutes)
                : null;

        if (
            finalDuration === null &&
            normalizedEndTime
        ) {
            finalDuration = calculateDuration(
                start_time,
                normalizedEndTime
            );
        }


        // -------------------------------------------------
        // INSERT GAME SESSION
        // -------------------------------------------------

        const [result] = await db.query(`
            INSERT INTO game_sessions (
                user_id,
                game_id,
                station_id,
                start_time,
                end_time,
                duration_minutes,
                amount,
                status,
                recording_status,
                video_file_id,
                notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            userId,
            gameId,
            stationId,
            start_time,
            normalizedEndTime,
            finalDuration,
            amount !== undefined &&
            amount !== null &&
            amount !== ""
                ? Number(amount)
                : 0,
            sessionStatus,
            sessionRecordingStatus,
            normalizedVideoFileId,
            normalizedNotes
        ]);


        return res.status(201).json({
            success: true,
            message: "Game Session Created Successfully",
            gameSession_id: result.insertId
        });

    } catch (error) {

        console.log("Create Game Session Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server error while creating game session"
        });
    }
};


// =====================================================
// UPDATE GAME SESSION
// =====================================================

const updateGameSession = async (req, res) => {
    try {

        const { id } = req.params;

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Game Session ID"
            });
        }

        const sessionId = Number(id);


        // -------------------------------------------------
        // CHECK SESSION EXISTS
        // -------------------------------------------------

        const [existingSessions] = await db.query(`
            SELECT *
            FROM game_sessions
            WHERE id = ?
        `, [sessionId]);

        if (existingSessions.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Game Session Not Found"
            });
        }

        const existingSession = existingSessions[0];


        // -------------------------------------------------
        // VALIDATE REQUEST DATA
        // -------------------------------------------------

        const validationError = await validateGameSession(
            req.body
        );

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError
            });
        }


        // -------------------------------------------------
        // GET EFFECTIVE VALUES
        // -------------------------------------------------

        const effectiveStartTime =
            req.body.start_time !== undefined
                ? req.body.start_time
                : existingSession.start_time;

        const effectiveEndTime =
            req.body.end_time !== undefined
                ? (
                    req.body.end_time === ""
                        ? null
                        : req.body.end_time
                )
                : existingSession.end_time;

        const effectiveStatus =
            req.body.status !== undefined
                ? String(req.body.status)
                    .trim()
                    .toLowerCase()
                : existingSession.status;


        // -------------------------------------------------
        // VALIDATE EFFECTIVE DATE/TIME
        // -------------------------------------------------

        if (!isValidDateTime(effectiveStartTime)) {
            return res.status(400).json({
                success: false,
                message: "Start time must be in YYYY-MM-DD HH:MM:SS format"
            });
        }

        if (
            effectiveEndTime &&
            !isValidDateTime(effectiveEndTime)
        ) {
            return res.status(400).json({
                success: false,
                message: "End time must be in YYYY-MM-DD HH:MM:SS format"
            });
        }


        // -------------------------------------------------
        // END TIME CHECK
        // -------------------------------------------------

        if (effectiveEndTime) {

            const duration =
                calculateDuration(
                    effectiveStartTime,
                    effectiveEndTime
                );

            if (duration === null) {
                return res.status(400).json({
                    success: false,
                    message: "End time must be greater than or equal to start time"
                });
            }
        }


        // -------------------------------------------------
        // STATUS BUSINESS RULES
        // -------------------------------------------------

        if (
            effectiveStatus === "completed" &&
            !effectiveEndTime
        ) {
            return res.status(400).json({
                success: false,
                message: "Completed session must have end time"
            });
        }

        if (
            effectiveStatus === "active" &&
            effectiveEndTime
        ) {
            return res.status(400).json({
                success: false,
                message: "Active session cannot have end time"
            });
        }


        // -------------------------------------------------
        // ALLOWED FIELDS
        // -------------------------------------------------

        const allowedFields = [
            "user_id",
            "game_id",
            "station_id",
            "start_time",
            "end_time",
            "duration_minutes",
            "amount",
            "status",
            "recording_status",
            "video_file_id",
            "notes"
        ];

        const updateFields = [];
        const updateValues = [];


        // -------------------------------------------------
        // BUILD DYNAMIC UPDATE
        // -------------------------------------------------

        allowedFields.forEach((field) => {

            if (
                Object.prototype.hasOwnProperty.call(
                    req.body,
                    field
                )
            ) {

                let value = req.body[field];

                // NORMALIZE IDs
                if (
                    field === "user_id" ||
                    field === "game_id" ||
                    field === "station_id"
                ) {
                    value = Number(value);
                }

                // NORMALIZE STATUS
                if (
                    field === "status" ||
                    field === "recording_status"
                ) {
                    value = String(value)
                        .trim()
                        .toLowerCase();
                }

                // NORMALIZE VIDEO FILE ID
                if (field === "video_file_id") {

                    value =
                        value === null ||
                        value === ""
                            ? null
                            : String(value).trim();
                }

                // NORMALIZE NOTES
                if (field === "notes") {

                    value =
                        value === ""
                            ? null
                            : value;
                }

                // NORMALIZE END TIME
                if (
                    field === "end_time" &&
                    value === ""
                ) {
                    value = null;
                }

                // NORMALIZE DURATION
                if (
                    field === "duration_minutes" &&
                    value !== null &&
                    value !== ""
                ) {
                    value = Number(value);
                }

                // NORMALIZE AMOUNT
                if (
                    field === "amount" &&
                    value !== null &&
                    value !== ""
                ) {
                    value = Number(value);
                }

                updateFields.push(`${field} = ?`);
                updateValues.push(value);
            }
        });


        // -------------------------------------------------
        // AUTO CALCULATE DURATION
        // -------------------------------------------------

        if (
            effectiveEndTime &&
            (
                req.body.duration_minutes === undefined ||
                req.body.duration_minutes === null ||
                req.body.duration_minutes === ""
            )
        ) {

            const calculatedDuration =
                calculateDuration(
                    effectiveStartTime,
                    effectiveEndTime
                );

            // Only add if start/end were involved
            // and no explicit duration was supplied.
            if (
                req.body.end_time !== undefined ||
                req.body.start_time !== undefined ||
                effectiveStatus === "completed"
            ) {

                updateFields.push(
                    "duration_minutes = ?"
                );

                updateValues.push(
                    calculatedDuration
                );
            }
        }


        // -------------------------------------------------
        // NO VALID FIELDS
        // -------------------------------------------------

        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No valid fields provided for update"
            });
        }


        // -------------------------------------------------
        // UPDATE DATABASE
        // -------------------------------------------------

        updateValues.push(sessionId);

        await db.query(`
            UPDATE game_sessions
            SET ${updateFields.join(", ")}
            WHERE id = ?
        `, updateValues);


        return res.status(200).json({
            success: true,
            message: "Game Session Updated Successfully"
        });

    } catch (error) {

        console.log("Update Game Session Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server error while updating game session"
        });
    }
};


// =====================================================
// DELETE GAME SESSION
// =====================================================

const deleteGameSession = async (req, res) => {
    try {

        const { id } = req.params;

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Game Session ID"
            });
        }

        const sessionId = Number(id);


        // -------------------------------------------------
        // CHECK SESSION EXISTS
        // -------------------------------------------------

        const [existingSessions] = await db.query(`
            SELECT id
            FROM game_sessions
            WHERE id = ?
        `, [sessionId]);

        if (existingSessions.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Game Session Not Found"
            });
        }


        // -------------------------------------------------
        // DELETE GAME SESSION
        // -------------------------------------------------

        await db.query(`
            DELETE FROM game_sessions
            WHERE id = ?
        `, [sessionId]);


        return res.status(200).json({
            success: true,
            message: "Game Session Deleted Successfully"
        });

    } catch (error) {

        console.log("Delete Game Session Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server error while deleting game session"
        });
    }
};


// =====================================================
// EXPORT CONTROLLERS
// =====================================================

module.exports = {
    getAllGameSessions,
    getGameSessionById,
    createGameSession,
    updateGameSession,
    deleteGameSession
};