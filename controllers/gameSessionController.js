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

// =====================================================
// DATE / TIME HELPERS
// =====================================================

// Supports:
// YYYY-MM-DD HH:MM:SS
// YYYY-MM-DDTHH:MM:SS
// YYYY-MM-DDTHH:MM:SS.000Z
// JavaScript Date object
const parseDateTime = (value) => {

    if (value instanceof Date) {
        return Number.isNaN(value.getTime())
            ? null
            : value;
    }

    if (typeof value !== "string") {
        return null;
    }

    const valueString = value.trim();

    // MySQL DATETIME
    const mysqlMatch = valueString.match(
        /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/
    );

    if (mysqlMatch) {

        const year = Number(mysqlMatch[1]);
        const month = Number(mysqlMatch[2]);
        const day = Number(mysqlMatch[3]);
        const hour = Number(mysqlMatch[4]);
        const minute = Number(mysqlMatch[5]);
        const second = Number(mysqlMatch[6]);

        const date = new Date(
            Date.UTC(
                year,
                month - 1,
                day,
                hour,
                minute,
                second
            )
        );

        if (Number.isNaN(date.getTime())) {
            return null;
        }

        if (
            date.getUTCFullYear() !== year ||
            date.getUTCMonth() !== month - 1 ||
            date.getUTCDate() !== day ||
            date.getUTCHours() !== hour ||
            date.getUTCMinutes() !== minute ||
            date.getUTCSeconds() !== second
        ) {
            return null;
        }

        return date;
    }

    // ISO format
    if (
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(valueString) ||
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(valueString)
    ) {

        const date = new Date(valueString);

        if (Number.isNaN(date.getTime())) {
            return null;
        }

        return date;
    }

    return null;
};

// VALIDATE DATE/TIME
const isValidDateTime = (value) => {
    return parseDateTime(value) !== null;
};

// NORMALIZE DATE/TIME FOR MYSQL
const normalizeDateTimeForDb = (value) => {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    // Already MySQL DATETIME
    if (
        typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(
            value.trim()
        )
    ) {
        return value.trim();
    }

    const date = parseDateTime(value);

    if (!date) {
        return null;
    }

    const pad = (number) =>
        String(number).padStart(2, "0");

    return (
        `${date.getUTCFullYear()}-` +
        `${pad(date.getUTCMonth() + 1)}-` +
        `${pad(date.getUTCDate())} ` +
        `${pad(date.getUTCHours())}:` +
        `${pad(date.getUTCMinutes())}:` +
        `${pad(date.getUTCSeconds())}`
    );
};

// CALCULATE DURATION
const calculateDuration = (
    startTime,
    endTime
) => {

    const start = parseDateTime(startTime);
    const end = parseDateTime(endTime);

    if (!start || !end) {
        return null;
    }

    const difference =
        end.getTime() - start.getTime();

    if (difference < 0) {
        return null;
    }

    return Math.round(
        difference / (1000 * 60)
    );
};

// =====================================================
// BOOKING HELPERS
// =====================================================

// FIND MATCHING BOOKING
//
// This allows the current database structure to work
// without adding booking_id to game_sessions.
//
// Priority:
// 1. Exact booking_id when supplied.
// 2. Otherwise match by:
//    user + game + station + booking date + time
// =====================================================

const findMatchingBooking = async (
    connection,
    {
        booking_id,
        user_id,
        game_id,
        station_id,
        start_time
    }
) => {

    const bookingDate =
        String(start_time).substring(0, 10);

    const bookingStartTime =
        String(start_time).substring(11, 19);

    // -------------------------------------------------
    // EXACT BOOKING
    // -------------------------------------------------

    if (
        booking_id !== undefined &&
        booking_id !== null &&
        booking_id !== ""
    ) {

        const [bookings] =
            await connection.query(
                `
                SELECT
                    id,
                    user_id,
                    membership_id,
                    game_id,
                    station_id,
                    booking_date,
                    start_time,
                    end_time,
                    status,
                    payment_status,
                    amount
                FROM bookings
                WHERE id = ?
                LIMIT 1
                `,
                [Number(booking_id)]
            );

        if (bookings.length === 0) {
            return null;
        }

        const booking = bookings[0];

        if (
            Number(booking.user_id) !== Number(user_id) ||
            Number(booking.game_id) !== Number(game_id) ||
            Number(booking.station_id) !== Number(station_id)
        ) {
            return null;
        }

        if (booking.status !== "confirmed") {
            return null;
        }

        return booking;
    }

    // -------------------------------------------------
    // AUTOMATIC BOOKING MATCH
    // -------------------------------------------------

    const [bookings] =
        await connection.query(
            `
            SELECT
                id,
                user_id,
                membership_id,
                game_id,
                station_id,
                booking_date,
                start_time,
                end_time,
                status,
                payment_status,
                amount
            FROM bookings
            WHERE user_id = ?
              AND game_id = ?
              AND station_id = ?
              AND booking_date = ?
              AND status = 'confirmed'
              AND start_time <= ?
              AND end_time > ?
            ORDER BY id DESC
            LIMIT 1
            `,
            [
                Number(user_id),
                Number(game_id),
                Number(station_id),
                bookingDate,
                bookingStartTime,
                bookingStartTime
            ]
        );

    return bookings.length > 0
        ? bookings[0]
        : null;
};

// =====================================================
// GET ALL GAME SESSIONS
// =====================================================

const getAllGameSessions = async (
    req,
    res
) => {

    try {

        let query = `
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
        `;

        const queryParams = [];

        // Player sees only own sessions
        if (
            req.user &&
            req.user.role_name === "Player"
        ) {

            query += `
                WHERE gs.user_id = ?
            `;

            queryParams.push(req.user.id);
        }

        query += `
            ORDER BY gs.id DESC
        `;

        const [gameSessions] =
            await db.query(
                query,
                queryParams
            );

        return res.status(200).json({
            success: true,
            data: gameSessions
        });

    } catch (error) {

        console.log(
            "Get Game Sessions Error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message:
                "Server error while fetching game sessions"
        });
    }
};

// =====================================================
// GET GAME SESSION BY ID
// =====================================================

const getGameSessionById = async (
    req,
    res
) => {

    try {

        const { id } = req.params;

        if (!isPositiveInteger(id)) {

            return res.status(400).json({
                success: false,
                message:
                    "Invalid Game Session ID"
            });
        }

        let query = `
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
        `;

        const queryParams = [Number(id)];

        // Player can view only own session
        if (
            req.user &&
            req.user.role_name === "Player"
        ) {

            query += `
                AND gs.user_id = ?
            `;

            queryParams.push(req.user.id);
        }

        const [gameSessions] =
            await db.query(
                query,
                queryParams
            );

        if (gameSessions.length === 0) {

            return res.status(404).json({
                success: false,
                message:
                    "Game Session Not Found"
            });
        }

        return res.status(200).json({
            success: true,
            data: gameSessions[0]
        });

    } catch (error) {

        console.log(
            "Get Game Session By ID Error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message:
                "Server error while fetching game session"
        });
    }
};

// =====================================================
// VALIDATE GAME SESSION DATA
// =====================================================

const validateGameSession = async (
    data
) => {

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
    // USER
    // -------------------------------------------------

    if (
        user_id !== undefined &&
        user_id !== null &&
        user_id !== ""
    ) {

        const userId = Number(user_id);

        if (!isPositiveInteger(userId)) {
            return "Invalid User ID";
        }

        const [users] =
            await db.query(
                `
                SELECT u.id
                FROM users u
                INNER JOIN roles r
                    ON u.role_id = r.id
                WHERE u.id = ?
                  AND r.role_name = 'Player'
                `,
                [userId]
            );

        if (users.length === 0) {
            return "user_id does not exist or is not a Player";
        }
    }

    // -------------------------------------------------
    // GAME
    // -------------------------------------------------

    if (
        game_id !== undefined &&
        game_id !== null &&
        game_id !== ""
    ) {

        const gameId = Number(game_id);

        if (!isPositiveInteger(gameId)) {
            return "Invalid Game ID";
        }

        const [games] =
            await db.query(
                `
                SELECT id, status
                FROM games
                WHERE id = ?
                `,
                [gameId]
            );

        if (games.length === 0) {
            return "Invalid Game";
        }

        if (games[0].status !== "active") {
            return "Selected game is inactive";
        }
    }

    // -------------------------------------------------
    // STATION
    // -------------------------------------------------

    if (
        station_id !== undefined &&
        station_id !== null &&
        station_id !== ""
    ) {

        const stationId =
            Number(station_id);

        if (!isPositiveInteger(stationId)) {
            return "Invalid Gaming Station ID";
        }

        const [stations] =
            await db.query(
                `
                SELECT
                    id,
                    status
                FROM gaming_stations
                WHERE id = ?
                `,
                [stationId]
            );

        if (stations.length === 0) {
            return "Invalid Gaming Station";
        }

        if (
            ["maintenance", "inactive"]
                .includes(stations[0].status)
        ) {
            return "Selected gaming station is unavailable";
        }
    }

    // -------------------------------------------------
    // START TIME
    // -------------------------------------------------

    if (
        start_time !== undefined &&
        start_time !== null &&
        start_time !== ""
    ) {

        if (!isValidDateTime(start_time)) {
            return "Start time must be a valid date and time";
        }
    }

    // -------------------------------------------------
    // END TIME
    // -------------------------------------------------

    if (
        end_time !== undefined &&
        end_time !== null &&
        end_time !== ""
    ) {

        if (!isValidDateTime(end_time)) {
            return "End time must be a valid date and time";
        }
    }

    // -------------------------------------------------
    // DURATION
    // -------------------------------------------------

    if (
        duration_minutes !== undefined &&
        duration_minutes !== null &&
        duration_minutes !== ""
    ) {

        if (
            !isNonNegativeInteger(
                duration_minutes
            )
        ) {
            return "Duration must be a non-negative integer";
        }
    }

    // -------------------------------------------------
    // AMOUNT
    // -------------------------------------------------

    if (
        amount !== undefined &&
        amount !== null &&
        amount !== ""
    ) {

        const numericAmount =
            Number(amount);

        if (
            !Number.isFinite(numericAmount) ||
            numericAmount < 0
        ) {
            return "Amount must be a valid non-negative number";
        }

        if (
            numericAmount > 99999999.99
        ) {
            return "Amount is too large";
        }

        if (
            Math.round(
                numericAmount * 100
            ) !== numericAmount * 100
        ) {
            return "Amount can have maximum 2 decimal places";
        }
    }

    // -------------------------------------------------
    // STATUS
    // -------------------------------------------------

    if (
        status !== undefined &&
        status !== null &&
        status !== ""
    ) {

        const normalizedStatus =
            String(status)
                .trim()
                .toLowerCase();

        if (
            ![
                "active",
                "completed",
                "cancelled"
            ].includes(normalizedStatus)
        ) {
            return "Status must be active, completed or cancelled";
        }
    }

    // -------------------------------------------------
    // RECORDING STATUS
    // -------------------------------------------------

    if (
        recording_status !== undefined &&
        recording_status !== null &&
        recording_status !== ""
    ) {

        const normalizedRecordingStatus =
            String(recording_status)
                .trim()
                .toLowerCase();

        const validRecordingStatuses = [
            "not_recorded",
            "recording",
            "completed"
        ];

        if (
            !validRecordingStatuses.includes(
                normalizedRecordingStatus
            )
        ) {
            return "Invalid recording status";
        }
    }

    // -------------------------------------------------
    // VIDEO FILE ID
    // -------------------------------------------------

    if (
        video_file_id !== undefined &&
        video_file_id !== null
    ) {

        if (
            String(video_file_id)
                .trim()
                .length > 255
        ) {
            return "Video file ID cannot exceed 255 characters";
        }
    }

    // -------------------------------------------------
    // NOTES
    // -------------------------------------------------

    if (
        notes !== undefined &&
        notes !== null
    ) {

        if (typeof notes !== "string") {
            return "Notes must be text";
        }
    }

    return null;
};

// =====================================================
// CREATE GAME SESSION
// =====================================================

const createGameSession = async (
    req,
    res
) => {

    let connection;

    try {

        const {
            user_id,
            game_id,
            station_id,
            booking_id,
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
        // REQUIRED
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
                message:
                    "Gaming Station ID is required"
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
        // VALIDATE
        // -------------------------------------------------

        const validationError =
            await validateGameSession(req.body);

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError
            });
        }

        const userId = Number(user_id);
        const gameId = Number(game_id);
        const stationId = Number(station_id);

        const sessionStatus =
            status !== undefined &&
                status !== null &&
                status !== ""
                ? String(status)
                    .trim()
                    .toLowerCase()
                : "active";

        // We only allow new sessions to start active.
        if (sessionStatus !== "active") {
            return res.status(400).json({
                success: false,
                message:
                    "New game sessions must start with active status"
            });
        }

        const sessionRecordingStatus =
            recording_status !== undefined &&
                recording_status !== null &&
                recording_status !== ""
                ? String(recording_status)
                    .trim()
                    .toLowerCase()
                : "not_recorded";

        const normalizedStartTime =
            normalizeDateTimeForDb(
                start_time
            );

        const normalizedEndTime =
            end_time === undefined ||
                end_time === null ||
                end_time === ""
                ? null
                : normalizeDateTimeForDb(
                    end_time
                );

        if (!normalizedStartTime) {
            return res.status(400).json({
                success: false,
                message: "Invalid start time"
            });
        }

        if (normalizedEndTime) {
            return res.status(400).json({
                success: false,
                message:
                    "Active session cannot have end time"
            });
        }

        // -------------------------------------------------
        // TRANSACTION
        // -------------------------------------------------

        connection = await db.getConnection();

        await connection.beginTransaction();

        // -------------------------------------------------
        // LOCK STATION
        // -------------------------------------------------

        const [stations] =
            await connection.query(
                `
                SELECT
                    id,
                    station_name,
                    status,
                    current_player_id
                FROM gaming_stations
                WHERE id = ?
                FOR UPDATE
                `,
                [stationId]
            );

        if (stations.length === 0) {

            await connection.rollback();

            return res.status(404).json({
                success: false,
                message:
                    "Gaming Station Not Found"
            });
        }

        const station = stations[0];

        if (
            station.status === "maintenance" ||
            station.status === "inactive"
        ) {

            await connection.rollback();

            return res.status(409).json({
                success: false,
                message:
                    "Gaming station is currently unavailable"
            });
        }

        if (station.status === "occupied") {

            await connection.rollback();

            return res.status(409).json({
                success: false,
                message:
                    "Gaming station is already occupied"
            });
        }

        // -------------------------------------------------
        // CHECK ACTIVE SESSION ON STATION
        // -------------------------------------------------

        const [activeSessions] =
            await connection.query(
                `
                SELECT id
                FROM game_sessions
                WHERE station_id = ?
                  AND status = 'active'
                LIMIT 1
                FOR UPDATE
                `,
                [stationId]
            );

        if (activeSessions.length > 0) {

            await connection.rollback();

            return res.status(409).json({
                success: false,
                message:
                    "Gaming station already has an active game session"
            });
        }

        // -------------------------------------------------
        // FIND BOOKING
        // -------------------------------------------------

        const booking =
            await findMatchingBooking(
                connection,
                {
                    booking_id,
                    user_id: userId,
                    game_id: gameId,
                    station_id: stationId,
                    start_time:
                        normalizedStartTime
                }
            );

        // If booking_id was explicitly provided,
        // it must be valid.
        if (
            booking_id !== undefined &&
            booking_id !== null &&
            booking_id !== ""
        ) {

            if (!booking) {

                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message:
                        "Selected booking does not match this player, game or gaming station"
                });
            }
        }

        // -------------------------------------------------
        // INSERT SESSION
        // -------------------------------------------------

        const [result] =
            await connection.query(
                `
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
                `,
                [
                    userId,
                    gameId,
                    stationId,
                    normalizedStartTime,
                    null,
                    duration_minutes !== undefined &&
                        duration_minutes !== null &&
                        duration_minutes !== ""
                        ? Number(duration_minutes)
                        : booking
                            ? calculateDuration(
                                booking.start_time,
                                booking.end_time
                            )
                            : null,
                    amount !== undefined &&
                        amount !== null &&
                        amount !== ""
                        ? Number(amount)
                        : booking
                            ? Number(booking.amount || 0)
                            : 0,
                    "active",
                    sessionRecordingStatus,
                    video_file_id !== undefined &&
                        video_file_id !== null &&
                        video_file_id !== ""
                        ? String(video_file_id).trim()
                        : null,
                    notes !== undefined &&
                        notes !== null &&
                        notes !== ""
                        ? notes
                        : null
                ]
            );

        // -------------------------------------------------
        // OCCUPY STATION
        // -------------------------------------------------

        await connection.query(
            `
            UPDATE gaming_stations
            SET
                status = 'occupied',
                current_player_id = ?
            WHERE id = ?
            `,
            [userId, stationId]
        );


        await connection.commit();

        return res.status(201).json({
            success: true,
            message:
                "Game Session Created Successfully",
            gameSession_id: result.insertId,
            booking_id:
                booking ? booking.id : null
        });

    } catch (error) {

        if (connection) {
            await connection.rollback();
        }

        console.log(
            "Create Game Session Error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message:
                "Server error while creating game session"
        });

    } finally {

        if (connection) {
            connection.release();
        }
    }
};

// =====================================================
// UPDATE GAME SESSION
// =====================================================

const updateGameSession = async (
    req,
    res
) => {

    let connection;

    try {

        const { id } = req.params;

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid Game Session ID"
            });
        }

        // -------------------------------------------------
        // ONLY ADMIN / STAFF MAY MODIFY
        // -------------------------------------------------

        if (
            req.user &&
            req.user.role_name === "Player"
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Players cannot update game sessions"
            });
        }

        const sessionId = Number(id);

        connection = await db.getConnection();

        await connection.beginTransaction();

        // -------------------------------------------------
        // GET EXISTING SESSION
        // DATE_FORMAT prevents MySQL Date object
        // problems during validation.
        // -------------------------------------------------

        const [existingSessions] =
            await connection.query(
                `
                SELECT
                    id,
                    user_id,
                    game_id,
                    station_id,

                    DATE_FORMAT(
                        start_time,
                        '%Y-%m-%d %H:%i:%s'
                    ) AS start_time,

                    DATE_FORMAT(
                        end_time,
                        '%Y-%m-%d %H:%i:%s'
                    ) AS end_time,

                    duration_minutes,
                    amount,
                    status,
                    recording_status,
                    video_file_id,
                    notes

                FROM game_sessions

                WHERE id = ?

                FOR UPDATE
                `,
                [sessionId]
            );

        if (existingSessions.length === 0) {

            await connection.rollback();

            return res.status(404).json({
                success: false,
                message:
                    "Game Session Not Found"
            });
        }

        const existingSession =
            existingSessions[0];

        // -------------------------------------------------
        // VALIDATE ONLY REQUEST DATA
        // -------------------------------------------------

        const validationError =
            await validateGameSession(req.body);

        if (validationError) {

            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: validationError
            });
        }

        // -------------------------------------------------
        // EFFECTIVE VALUES
        // -------------------------------------------------

        const rawStartTime =
            req.body.start_time !== undefined
                ? req.body.start_time
                : existingSession.start_time;

        const rawEndTime =
            req.body.end_time !== undefined
                ? req.body.end_time
                : existingSession.end_time;

        const effectiveStartTime =
            normalizeDateTimeForDb(
                rawStartTime
            );

        const effectiveEndTime =
            rawEndTime === null ||
                rawEndTime === undefined ||
                rawEndTime === ""
                ? null
                : normalizeDateTimeForDb(
                    rawEndTime
                );

        const effectiveStatus =
            req.body.status !== undefined
                ? String(req.body.status)
                    .trim()
                    .toLowerCase()
                : existingSession.status;

        // -------------------------------------------------
        // VALIDATE EFFECTIVE VALUES
        // -------------------------------------------------

        if (!effectiveStartTime) {

            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: "Invalid start time"
            });
        }

        if (
            effectiveEndTime !== null &&
            !effectiveEndTime
        ) {

            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: "Invalid end time"
            });
        }

        // -------------------------------------------------
        // COMPLETED/CANCELLED SESSIONS
        // CANNOT BE REACTIVATED
        // -------------------------------------------------

        if (
            existingSession.status !== "active" &&
            effectiveStatus === "active"
        ) {

            await connection.rollback();

            return res.status(400).json({
                success: false,
                message:
                    "Completed or cancelled session cannot be reactivated"
            });
        }

        // -------------------------------------------------
        // ACTIVE SESSION
        // PLAYER/GAME/STATION SHOULD NOT CHANGE
        // -------------------------------------------------

        if (existingSession.status === "active") {

            if (
                req.body.user_id !== undefined &&
                Number(req.body.user_id) !==
                Number(existingSession.user_id)
            ) {

                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message:
                        "Player cannot be changed while session is active"
                });
            }

            if (
                req.body.game_id !== undefined &&
                Number(req.body.game_id) !==
                Number(existingSession.game_id)
            ) {

                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message:
                        "Game cannot be changed while session is active"
                });
            }

            if (
                req.body.station_id !== undefined &&
                Number(req.body.station_id) !==
                Number(existingSession.station_id)
            ) {

                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message:
                        "Gaming station cannot be changed while session is active"
                });
            }
        }

        // -------------------------------------------------
        // END TIME / DURATION
        // -------------------------------------------------

        let calculatedDuration = null;

        if (effectiveEndTime) {

            calculatedDuration =
                calculateDuration(
                    effectiveStartTime,
                    effectiveEndTime
                );

            if (calculatedDuration === null) {

                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message:
                        "End time must be greater than or equal to start time"
                });
            }
        }

        // -------------------------------------------------
        // STATUS RULES
        // -------------------------------------------------

        if (
            effectiveStatus === "completed" &&
            !effectiveEndTime
        ) {

            await connection.rollback();

            return res.status(400).json({
                success: false,
                message:
                    "Completed session must have end time"
            });
        }

        if (
            effectiveStatus === "active" &&
            effectiveEndTime
        ) {

            await connection.rollback();

            return res.status(400).json({
                success: false,
                message:
                    "Active session cannot have end time"
            });
        }

        // -------------------------------------------------
        // BUILD UPDATE
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

        for (
            const field of allowedFields
        ) {

            if (
                !Object.prototype.hasOwnProperty.call(
                    req.body,
                    field
                )
            ) {
                continue;
            }

            let value = req.body[field];

            // IDs
            if (
                field === "user_id" ||
                field === "game_id" ||
                field === "station_id"
            ) {
                value = Number(value);
            }

            // START TIME
            if (field === "start_time") {
                value = effectiveStartTime;
            }

            // END TIME
            if (field === "end_time") {
                value = effectiveEndTime;
            }

            // STATUS
            if (
                field === "status" ||
                field === "recording_status"
            ) {
                value = String(value)
                    .trim()
                    .toLowerCase();
            }

            // DURATION
            if (
                field === "duration_minutes"
            ) {
                value =
                    value === null ||
                        value === ""
                        ? null
                        : Number(value);
            }

            // AMOUNT
            if (field === "amount") {
                value =
                    value === null ||
                        value === ""
                        ? null
                        : Number(value);
            }

            // VIDEO
            if (
                field === "video_file_id"
            ) {
                value =
                    value === null ||
                        value === ""
                        ? null
                        : String(value).trim();
            }

            // NOTES
            if (field === "notes") {
                value =
                    value === ""
                        ? null
                        : value;
            }

            updateFields.push(
                `${field} = ?`
            );

            updateValues.push(value);
        }

        // -------------------------------------------------
        // AUTO DURATION
        // -------------------------------------------------

        const durationWasProvided =
            req.body.duration_minutes !== undefined &&
            req.body.duration_minutes !== null &&
            req.body.duration_minutes !== "";

        if (
            calculatedDuration !== null &&
            !durationWasProvided
        ) {

            updateFields.push(
                "duration_minutes = ?"
            );

            updateValues.push(
                calculatedDuration
            );
        }

        // -------------------------------------------------
        // END SESSION BUSINESS LOGIC
        // -------------------------------------------------

        let relatedBooking = null;

        if (
            existingSession.status === "active" &&
            (
                effectiveStatus === "completed" ||
                effectiveStatus === "cancelled"
            )
        ) {

            // Find booking related to this session.
            relatedBooking =
                await findMatchingBooking(
                    connection,
                    {
                        user_id:
                            existingSession.user_id,
                        game_id:
                            existingSession.game_id,
                        station_id:
                            existingSession.station_id,
                        start_time:
                            effectiveStartTime
                    }
                );
        }

        // -------------------------------------------------
        // NO UPDATE FIELDS
        // -------------------------------------------------

        if (updateFields.length === 0) {

            await connection.rollback();

            return res.status(400).json({
                success: false,
                message:
                    "No valid fields provided for update"
            });
        }

        // -------------------------------------------------
        // UPDATE GAME SESSION
        // -------------------------------------------------

        updateValues.push(sessionId);

        await connection.query(
            `
            UPDATE game_sessions
            SET ${updateFields.join(", ")}
            WHERE id = ?
            `,
            updateValues
        );

        // -------------------------------------------------
        // SESSION COMPLETED
        // -------------------------------------------------

        if (
            existingSession.status === "active" &&
            effectiveStatus === "completed"
        ) {

            // Complete booking
            if (relatedBooking) {

                await connection.query(
                    `
                    UPDATE bookings
                    SET status = 'completed'
                    WHERE id = ?
                      AND status IN (
                          'pending',
                          'confirmed'
                      )
                    `,
                    [relatedBooking.id]
                );
            }

            // Release station.
            // If station was changed to maintenance,
            // preserve maintenance status.
            await connection.query(
                `
                UPDATE gaming_stations
                SET
                    status =
                        CASE
                            WHEN status = 'maintenance'
                                THEN 'maintenance'
                            WHEN status = 'inactive'
                                THEN 'inactive'
                            ELSE 'available'
                        END,
                    current_player_id = NULL
                WHERE id = ?
                  AND (
                      current_player_id = ?
                      OR current_player_id IS NULL
                  )
                `,
                [
                    existingSession.station_id,
                    existingSession.user_id
                ]
            );
        }

        // -------------------------------------------------
        // SESSION CANCELLED
        // -------------------------------------------------

        if (
            existingSession.status === "active" &&
            effectiveStatus === "cancelled"
        ) {

            // Cancel booking
            if (relatedBooking) {

                await connection.query(
                    `
                    UPDATE bookings
                    SET status = 'cancelled'
                    WHERE id = ?
                      AND status IN (
                          'pending',
                          'confirmed'
                      )
                    `,
                    [relatedBooking.id]
                );
            }

            // Release station
            await connection.query(
                `
                UPDATE gaming_stations
                SET
                    status =
                        CASE
                            WHEN status = 'maintenance'
                                THEN 'maintenance'
                            WHEN status = 'inactive'
                                THEN 'inactive'
                            ELSE 'available'
                        END,
                    current_player_id = NULL
                WHERE id = ?
                  AND (
                      current_player_id = ?
                      OR current_player_id IS NULL
                  )
                `,
                [
                    existingSession.station_id,
                    existingSession.user_id
                ]
            );
        }

        await connection.commit();

        return res.status(200).json({
            success: true,
            message:
                effectiveStatus === "completed"
                    ? "Game Session Ended Successfully"
                    : "Game Session Updated Successfully",
            booking_updated:
                relatedBooking !== null
        });

    } catch (error) {

        if (connection) {
            await connection.rollback();
        }

        console.log(
            "Update Game Session Error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message:
                "Server error while updating game session"
        });

    } finally {

        if (connection) {
            connection.release();
        }
    }
};

// =====================================================
// DELETE GAME SESSION
// =====================================================

const deleteGameSession = async (
    req,
    res
) => {

    let connection;

    try {

        const { id } = req.params;

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid Game Session ID"
            });
        }

        if (
            req.user &&
            req.user.role_name === "Player"
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Players cannot delete game sessions"
            });
        }

        const sessionId = Number(id);

        connection = await db.getConnection();

        await connection.beginTransaction();

        // -------------------------------------------------
        // CHECK SESSION
        // -------------------------------------------------

        const [sessions] =
            await connection.query(
                `
                SELECT
                    id,
                    status,
                    station_id,
                    user_id
                FROM game_sessions
                WHERE id = ?
                FOR UPDATE
                `,
                [sessionId]
            );

        if (sessions.length === 0) {

            await connection.rollback();

            return res.status(404).json({
                success: false,
                message:
                    "Game Session Not Found"
            });
        }

        const session = sessions[0];

        // Don't delete active session.
        // It could leave the station occupied.
        if (session.status === "active") {

            await connection.rollback();

            return res.status(409).json({
                success: false,
                message:
                    "Active game session cannot be deleted. End or cancel the session first."
            });
        }

        await connection.query(
            `
            DELETE FROM game_sessions
            WHERE id = ?
            `,
            [sessionId]
        );

        await connection.commit();

        return res.status(200).json({
            success: true,
            message:
                "Game Session Deleted Successfully"
        });

    } catch (error) {

        if (connection) {
            await connection.rollback();
        }

        console.log(
            "Delete Game Session Error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message:
                "Server error while deleting game session"
        });

    } finally {

        if (connection) {
            connection.release();
        }
    }
};

// =====================================================
// EXPORT
// =====================================================

module.exports = {
    getAllGameSessions,
    getGameSessionById,
    createGameSession,
    updateGameSession,
    deleteGameSession
};