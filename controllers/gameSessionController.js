
const db = require("../config/db");

// =====================================================
// VALIDATION HELPERS
// =====================================================

const isPositiveInteger = (value) => {
    if (
        value === null ||
        value === undefined ||
        typeof value === "boolean" ||
        (typeof value === "string" && value.trim() === "")
    ) {
        return false;
    }

    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0;
};

const isNonNegativeInteger = (value) => {
    if (
        value === null ||
        value === undefined ||
        typeof value === "boolean" ||
        (typeof value === "string" && value.trim() === "")
    ) {
        return false;
    }

    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0;
};

const hasField = (object, field) =>
    Object.prototype.hasOwnProperty.call(object, field);

const isEmpty = (value) =>
    value === undefined || value === null || value === "";

const normalizeStatus = (value) =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

const isValidAmount = (value) => {
    if (
        value === null ||
        value === undefined ||
        typeof value === "boolean" ||
        (typeof value === "string" && value.trim() === "")
    ) {
        return false;
    }

    const amount = Number(value);

    return (
        Number.isFinite(amount) &&
        amount >= 0 &&
        amount <= 99999999.99 &&
        Math.round(amount * 100) === amount * 100
    );
};

// =====================================================
// DATE / TIME HELPERS
// =====================================================

const parseDateTime = (value) => {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value !== "string") {
        return null;
    }

    const input = value.trim();

    // MySQL DATETIME: YYYY-MM-DD HH:mm:ss
    const mysqlMatch = input.match(
        /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/
    );

    if (mysqlMatch) {
        const [, y, mo, d, h, mi, s] = mysqlMatch;
        const parts = [y, mo, d, h, mi, s].map(Number);

        const date = new Date(
            Date.UTC(
                parts[0],
                parts[1] - 1,
                parts[2],
                parts[3],
                parts[4],
                parts[5]
            )
        );

        if (
            date.getUTCFullYear() !== parts[0] ||
            date.getUTCMonth() !== parts[1] - 1 ||
            date.getUTCDate() !== parts[2] ||
            date.getUTCHours() !== parts[3] ||
            date.getUTCMinutes() !== parts[4] ||
            date.getUTCSeconds() !== parts[5]
        ) {
            return null;
        }

        return date;
    }

    // ISO timestamp with an explicit UTC marker or offset.
    if (
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
            input
        )
    ) {
        const date = new Date(input);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    // ISO timestamp without timezone: treat consistently as UTC.
    if (
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(
            input
        )
    ) {
        return parseDateTime(input.replace("T", " ").slice(0, 19));
    }

    return null;
};

const isValidDateTime = (value) => parseDateTime(value) !== null;

const normalizeDateTimeForDb = (value) => {
    if (isEmpty(value)) return null;

    const date = parseDateTime(value);
    if (!date) return null;

    const pad = (n) => String(n).padStart(2, "0");

    return (
        `${date.getUTCFullYear()}-` +
        `${pad(date.getUTCMonth() + 1)}-` +
        `${pad(date.getUTCDate())} ` +
        `${pad(date.getUTCHours())}:` +
        `${pad(date.getUTCMinutes())}:` +
        `${pad(date.getUTCSeconds())}`
    );
};

const calculateDuration = (startTime, endTime) => {
    const start = parseDateTime(startTime);
    const end = parseDateTime(endTime);

    if (!start || !end || end.getTime() < start.getTime()) {
        return null;
    }

    return Math.round(
        (end.getTime() - start.getTime()) / 60000
    );
};

const calculateTimeDuration = (startTime, endTime) => {
    if (isEmpty(startTime) || isEmpty(endTime)) return null;

    const parseTime = (value) => {
        const match = String(value).match(
            /^(\d{2}):(\d{2}):(\d{2})$/
        );

        if (!match) return null;

        const [, h, m, s] = match;
        const hours = Number(h);
        const minutes = Number(m);
        const seconds = Number(s);

        if (
            hours > 23 ||
            minutes > 59 ||
            seconds > 59
        ) {
            return null;
        }

        return hours * 60 + minutes + seconds / 60;
    };

    const start = parseTime(startTime);
    const end = parseTime(endTime);

    if (start === null || end === null) return null;

    let duration = end - start;
    if (duration < 0) duration += 24 * 60;

    return Math.round(duration);
};

// =====================================================
// AUTHORIZATION HELPERS
// =====================================================

const isAdminOrStaff = (req) =>
    ["Admin", "Staff"].includes(req.user?.role_name);

const validateStaffAssignment = (req) => {
    if (
        req.user?.role_name === "Staff" &&
        !isPositiveInteger(req.user.assigned_game_id)
    ) {
        return false;
    }

    return true;
};

const staffCanAccessGame = (req, gameId) => {
    if (req.user?.role_name === "Admin") return true;

    return (
        req.user?.role_name === "Staff" &&
        isPositiveInteger(req.user.assigned_game_id) &&
        Number(req.user.assigned_game_id) === Number(gameId)
    );
};

// =====================================================
// BOOKING HELPERS
// game_sessions does not contain a booking_id column.
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
    if (!isValidDateTime(start_time)) return null;

    const normalizedStart = normalizeDateTimeForDb(start_time);
    const bookingDate = normalizedStart.substring(0, 10);
    const bookingTime = normalizedStart.substring(11, 19);

    const selectSql = `
     SELECT
    id,
    user_id,
    membership_id,
    game_id,
    station_id,
    DATE_FORMAT(booking_date, '%Y-%m-%d') AS booking_date,
    TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
    TIME_FORMAT(end_time, '%H:%i:%s') AS end_time,
    status,
    payment_status,
    amount
FROM bookings
    `;

    // Exact booking requested by the frontend.
    if (!isEmpty(booking_id)) {
        if (!isPositiveInteger(booking_id)) return null;

        const [rows] = await connection.query(
            `${selectSql} WHERE id = ? LIMIT 1`,
            [Number(booking_id)]
        );

        if (!rows.length) return null;

        const booking = rows[0];

        if (
            Number(booking.user_id) !== Number(user_id) ||
            Number(booking.game_id) !== Number(game_id) ||
            Number(booking.station_id) !== Number(station_id) ||
            normalizeStatus(booking.status) !== "confirmed" ||
            normalizeStatus(booking.payment_status) !== "paid" ||
            String(booking.booking_date).slice(0, 10) !== bookingDate
        ) {
            return null;
        }

        const start = String(booking.start_time).slice(0, 8);
        const end = String(booking.end_time).slice(0, 8);

        // A session must start inside the booked time slot.
        if (!(start <= bookingTime && end > bookingTime)) {
            return null;
        }

        return booking;
    }

    // Automatic matching when booking_id is not supplied.
    const [rows] = await connection.query(
        `
        ${selectSql}
        WHERE user_id = ?
  AND game_id = ?
  AND station_id = ?
  AND booking_date = ?
  AND status = 'confirmed'
  AND payment_status = 'paid'
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
            bookingTime,
            bookingTime
        ]
    );

    return rows.length ? rows[0] : null;
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

    if (!isEmpty(user_id)) {
        if (!isPositiveInteger(user_id)) {
            return "Invalid User ID";
        }

        const [rows] = await db.query(
            `
            SELECT u.id
            FROM users u
            INNER JOIN roles r ON r.id = u.role_id
            WHERE u.id = ?
              AND r.role_name = 'Player'
            LIMIT 1
            `,
            [Number(user_id)]
        );

        if (!rows.length) {
            return "user_id does not exist or is not a Player";
        }
    }

    if (!isEmpty(game_id)) {
        if (!isPositiveInteger(game_id)) {
            return "Invalid Game ID";
        }

        const [rows] = await db.query(
            "SELECT id, status FROM games WHERE id = ? LIMIT 1",
            [Number(game_id)]
        );

        if (!rows.length) return "Invalid Game";

        if (rows[0].status !== "active") {
            return "Selected game is inactive";
        }
    }

    if (!isEmpty(station_id)) {
        if (!isPositiveInteger(station_id)) {
            return "Invalid Gaming Station ID";
        }

        const [rows] = await db.query(
            "SELECT id, status FROM gaming_stations WHERE id = ? LIMIT 1",
            [Number(station_id)]
        );

        if (!rows.length) return "Invalid Gaming Station";

        if (
            ["maintenance", "inactive"].includes(rows[0].status)
        ) {
            return "Selected gaming station is unavailable";
        }
    }

    if (!isEmpty(start_time) && !isValidDateTime(start_time)) {
        return "Start time must be a valid date and time";
    }

    if (!isEmpty(end_time) && !isValidDateTime(end_time)) {
        return "End time must be a valid date and time";
    }

    if (
        !isEmpty(duration_minutes) &&
        !isNonNegativeInteger(duration_minutes)
    ) {
        return "Duration must be a non-negative integer";
    }

    if (!isEmpty(amount) && !isValidAmount(amount)) {
        return "Amount must be a valid non-negative number with at most 2 decimal places";
    }

    if (
        !isEmpty(status) &&
        !["preparing", "active", "completed", "cancelled"].includes(
            normalizeStatus(status)
        )
    ) {
        return "Status must be preparing, active, completed or cancelled";
    }

    if (
        !isEmpty(recording_status) &&
        !["not_recorded", "recording", "completed"].includes(
            normalizeStatus(recording_status)
        )
    ) {
        return "Invalid recording status";
    }

    if (
        video_file_id !== undefined &&
        video_file_id !== null &&
        (
            typeof video_file_id !== "string" &&
            typeof video_file_id !== "number"
        )
    ) {
        return "Video file ID must be text";
    }

    if (
        video_file_id !== undefined &&
        video_file_id !== null &&
        String(video_file_id).trim().length > 255
    ) {
        return "Video file ID cannot exceed 255 characters";
    }

    if (
        notes !== undefined &&
        notes !== null &&
        typeof notes !== "string"
    ) {
        return "Notes must be text";
    }

    return null;
};

// =====================================================
// GET ALL GAME SESSIONS
// =====================================================

const getAllGameSessions = async (req, res) => {
    try {
        const role = req.user?.role_name;
        // console.log("GAME SESSION ACCESS CHECK:", {
        //     userId: req.user?.id,
        //     role: req.user?.role_name,
        //     assigned_game_id: req.user?.assigned_game_id
        // });
        const params = [];

        let where = "";

        if (role === "Player") {
            if (!isPositiveInteger(req.user.id)) {
                return res.status(403).json({
                    success: false,
                    message: "Invalid player account"
                });
            }

            where = "WHERE gs.user_id = ?";
            params.push(Number(req.user.id));
        } else if (role === "Staff") {
            if (!validateStaffAssignment(req)) {
                return res.status(403).json({
                    success: false,
                    message: "Staff member has no valid assigned game"
                });
            }

            where = "WHERE gs.game_id = ?";
            params.push(Number(req.user.assigned_game_id));
        } else if (role !== "Admin") {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to view game sessions"
            });
        }

        const [rows] = await db.query(
            `
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
            INNER JOIN users u ON u.id = gs.user_id
            INNER JOIN games g ON g.id = gs.game_id
            INNER JOIN gaming_stations st ON st.id = gs.station_id
            ${where}
            ORDER BY gs.id DESC
            `,
            params
        );

        return res.status(200).json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error("Get Game Sessions Error:", error.message);

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

        const role = req.user?.role_name;
        const params = [Number(id)];

        let accessCondition = "";

        if (role === "Player") {
            if (!isPositiveInteger(req.user.id)) {
                return res.status(403).json({
                    success: false,
                    message: "Invalid player account"
                });
            }

            accessCondition = "AND gs.user_id = ?";
            params.push(Number(req.user.id));
        } else if (role === "Staff") {
            if (!validateStaffAssignment(req)) {
                return res.status(403).json({
                    success: false,
                    message: "Staff member has no valid assigned game"
                });
            }

            accessCondition = "AND gs.game_id = ?";
            params.push(Number(req.user.assigned_game_id));
        } else if (role !== "Admin") {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to view game sessions"
            });
        }

        const [rows] = await db.query(
            `
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
                gs.updated_at,
                vr.id AS video_recording_id,
                vr.file_name AS video_file_name,
                vr.cloudinary_url AS video_url,
                vr.cloudinary_public_id,
                vr.file_size AS video_file_size,
                vr.duration_seconds AS video_duration_seconds,
                vr.recording_status AS video_recording_status,
                vr.recorded_at
            FROM game_sessions gs
            INNER JOIN users u ON u.id = gs.user_id
            INNER JOIN games g ON g.id = gs.game_id
            INNER JOIN gaming_stations st ON st.id = gs.station_id
            LEFT JOIN video_recordings vr ON vr.id = (
                SELECT vr2.id
                FROM video_recordings vr2
                WHERE vr2.session_id = gs.id
                  AND vr2.recording_status = 'completed'
                ORDER BY vr2.id DESC
                LIMIT 1
            )
            WHERE gs.id = ?
            ${accessCondition}
            `,
            params
        );

        if (!rows.length) {
            return res.status(404).json({
                success: false,
                message: "Game Session Not Found"
            });
        }

        const session = rows[0];

        const recording = session.video_recording_id
            ? {
                id: session.video_recording_id,
                file_name: session.video_file_name,
                video_url: session.video_url,
                cloudinary_public_id: session.cloudinary_public_id,
                file_size: session.video_file_size,
                duration_seconds: session.video_duration_seconds,
                recording_status: session.video_recording_status,
                recorded_at: session.recorded_at
            }
            : null;

        delete session.video_recording_id;
        delete session.video_file_name;
        delete session.video_url;
        delete session.cloudinary_public_id;
        delete session.video_file_size;
        delete session.video_duration_seconds;
        delete session.video_recording_status;
        delete session.recorded_at;

        return res.status(200).json({
            success: true,
            data: { ...session, recording }
        });
    } catch (error) {
        console.error("Get Game Session By ID Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server error while fetching game session"
        });
    }
};

// =====================================================
// CREATE GAME SESSION
// =====================================================

const createGameSession = async (req, res) => {
    let connection;

    try {
        if (!isAdminOrStaff(req)) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to create game sessions"
            });
        }

        if (!validateStaffAssignment(req)) {
            return res.status(403).json({
                success: false,
                message: "Staff member has no valid assigned game"
            });
        }

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

        for (const [field, value, message] of [
            ["user_id", user_id, "User ID is required"],
            ["game_id", game_id, "Game ID is required"],
            ["station_id", station_id, "Gaming Station ID is required"],
            ["start_time", start_time, "Start time is required"]
        ]) {
            if (isEmpty(value)) {
                return res.status(400).json({
                    success: false,
                    message
                });
            }
        }

        const validationError = await validateGameSession(req.body);

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError
            });
        }

        const userId = Number(user_id);
        const gameId = Number(game_id);
        const stationId = Number(station_id);

        if (!staffCanAccessGame(req, gameId)) {
            return res.status(403).json({
                success: false,
                message: "You can create sessions only for your assigned game"
            });
        }

        if (
            !isEmpty(status) &&
            !["preparing", "active"].includes(
                normalizeStatus(status)
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "New game sessions must start with preparing or active status"
            });
        }

        if (!isEmpty(end_time)) {
            return res.status(400).json({
                success: false,
                message: "Active session cannot have end time"
            });
        }

        const startTime = normalizeDateTimeForDb(start_time);

        if (!startTime) {
            return res.status(400).json({
                success: false,
                message: "Invalid start time"
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        // Lock the station row to serialize attempts to occupy it.
        const [stations] = await connection.query(
            `
            SELECT id, station_name, status, current_player_id
            FROM gaming_stations
            WHERE id = ?
            FOR UPDATE
            `,
            [stationId]
        );

        if (!stations.length) {
            await connection.rollback();

            return res.status(404).json({
                success: false,
                message: "Gaming Station Not Found"
            });
        }

        const station = stations[0];

        if (
            ["maintenance", "inactive"].includes(station.status)
        ) {
            await connection.rollback();

            return res.status(409).json({
                success: false,
                message: "Gaming station is currently unavailable"
            });
        }

        if (station.status === "occupied") {
            await connection.rollback();

            return res.status(409).json({
                success: false,
                message: "Gaming station is already occupied"
            });
        }

        const [activeSessions] = await connection.query(
            `
            SELECT id
            FROM game_sessions
            WHERE station_id = ?
              AND status = 'active'
            LIMIT 1
            `,
            [stationId]
        );

        if (activeSessions.length) {
            await connection.rollback();

            return res.status(409).json({
                success: false,
                message: "Gaming station already has an active game session"
            });
        }

        const booking = await findMatchingBooking(connection, {
            booking_id,
            user_id: userId,
            game_id: gameId,
            station_id: stationId,
            start_time: startTime
        });

        if (!isEmpty(booking_id) && !booking) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: "Selected booking does not match this player, game, station, time slot or confirmed status"
            });
        }


        const sessionDuration = booking
            ? calculateTimeDuration(
                String(booking.start_time).slice(0, 8),
                String(booking.end_time).slice(0, 8)
            )
            : !isEmpty(duration_minutes)
                ? Number(duration_minutes)
                : null;

        const sessionAmount = booking
            ? Number(booking.amount || 0)
            : !isEmpty(amount)
                ? Number(amount)
                : 0;

        const [result] = await connection.query(
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
            VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
            `,
            [
                userId,
                gameId,
                stationId,
                startTime,
                sessionDuration,
                sessionAmount,
                isEmpty(status)
                    ? "preparing"
                    : normalizeStatus(status),
                isEmpty(recording_status)
                    ? "not_recorded"
                    : normalizeStatus(recording_status),
                isEmpty(video_file_id)
                    ? null
                    : String(video_file_id).trim(),
                isEmpty(notes) ? null : notes
            ]
        );

        await connection.query(
            `
            UPDATE gaming_stations
            SET status = 'occupied',
                current_player_id = ?
            WHERE id = ?
            `,
            [userId, stationId]
        );

        await connection.commit();

        return res.status(201).json({
            success: true,
            message: "Game Session Created Successfully",
            gameSession_id: result.insertId,
            booking_id: booking ? booking.id : null
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error("Create session rollback error:", rollbackError.message);
            }
        }

        console.error("Create Game Session Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server error while creating game session"
        });
    } finally {
        if (connection) connection.release();
    }
};

// =====================================================
// UPDATE GAME SESSION
// =====================================================

const updateGameSession = async (req, res) => {
    let connection;

    try {
        const { id } = req.params;

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Game Session ID"
            });
        }

        if (!isAdminOrStaff(req)) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to update game sessions"
            });
        }

        if (!validateStaffAssignment(req)) {
            return res.status(403).json({
                success: false,
                message: "Staff member has no valid assigned game"
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [rows] = await connection.query(
            `
            SELECT
                id, user_id, game_id, station_id,
                start_time, end_time, duration_minutes,
                amount, status, recording_status,
                video_file_id, notes
            FROM game_sessions
            WHERE id = ?
            FOR UPDATE
            `,
            [Number(id)]
        );

        if (!rows.length) {
            await connection.rollback();

            return res.status(404).json({
                success: false,
                message: "Game Session Not Found"
            });
        }

        const existing = rows[0];

        // Enforce ownership before processing submitted changes.
        if (!staffCanAccessGame(req, existing.game_id)) {
            await connection.rollback();

            return res.status(404).json({
                success: false,
                message: "Game Session Not Found"
            });
        }

        // Staff cannot move a session to another game.
        if (
            req.user.role_name === "Staff" &&
            hasField(req.body, "game_id") &&
            (
                !isPositiveInteger(req.body.game_id) ||
                Number(req.body.game_id) !==
                Number(req.user.assigned_game_id)
            )
        ) {
            await connection.rollback();

            return res.status(403).json({
                success: false,
                message: "Staff can update sessions only for their assigned game"
            });
        }

        const validationError = await validateGameSession(req.body);

        if (validationError) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: validationError
            });
        }

        const effectiveStatus = hasField(req.body, "status")
            ? normalizeStatus(req.body.status)
            : existing.status;

        const effectiveStart = normalizeDateTimeForDb(
            hasField(req.body, "start_time")
                ? req.body.start_time
                : existing.start_time
        );

        const effectiveEnd = isEmpty(
            hasField(req.body, "end_time")
                ? req.body.end_time
                : existing.end_time
        )
            ? null
            : normalizeDateTimeForDb(
                hasField(req.body, "end_time")
                    ? req.body.end_time
                    : existing.end_time
            );

        if (!effectiveStart) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: "Invalid start time"
            });
        }

        if (
            !isEmpty(
                hasField(req.body, "end_time")
                    ? req.body.end_time
                    : existing.end_time
            ) &&
            !effectiveEnd
        ) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: "Invalid end time"
            });
        }

        // Completed and cancelled sessions are terminal.
        // A preparing session may move to active when the game starts.
        if (
            ["completed", "cancelled"].includes(existing.status) &&
            effectiveStatus !== existing.status
        ) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: "Completed or cancelled session cannot be changed"
            });
        }

        // Session identity cannot change while preparing or active.
        if (
            ["preparing", "active"].includes(existing.status)
        ) {
            for (const field of ["user_id", "game_id", "station_id"]) {
                if (
                    hasField(req.body, field) &&
                    Number(req.body[field]) !== Number(existing[field])
                ) {
                    await connection.rollback();

                    return res.status(400).json({
                        success: false,
                        message: `${field} cannot be changed while the session is preparing or active`
                    });
                }
            }

            if (
                hasField(req.body, "start_time") &&
                effectiveStart !== normalizeDateTimeForDb(existing.start_time)
            ) {
                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message: "Start time cannot be changed while the session is preparing or active"
                });
            }
        }

        const calculatedDuration = effectiveEnd
            ? calculateDuration(effectiveStart, effectiveEnd)
            : null;

        if (effectiveEnd && calculatedDuration === null) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: "End time must be greater than or equal to start time"
            });
        }

        if (effectiveStatus === "completed" && !effectiveEnd) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: "Completed session must have end time"
            });
        }

        if (effectiveStatus === "active" && effectiveEnd) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: "Active session cannot have end time"
            });
        }

        // Do not allow clients to change recording status to completed
        // while the session is active. Upload completion is a separate
        // recording workflow and must not be assumed here.
        if (
            existing.status === "active" &&
            effectiveStatus === "active" &&
            normalizeStatus(req.body.recording_status) === "completed"
        ) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: "Recording cannot be marked completed while the session is active"
            });
        }

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

        for (const field of allowedFields) {
            if (!hasField(req.body, field)) continue;

            let value = req.body[field];

            if (
                ["user_id", "game_id", "station_id"].includes(field)
            ) {
                value = Number(value);
            } else if (field === "start_time") {
                value = effectiveStart;
            } else if (field === "end_time") {
                value = effectiveEnd;
            } else if (
                ["status", "recording_status"].includes(field)
            ) {
                value = normalizeStatus(value);
            } else if (field === "duration_minutes") {
                value = isEmpty(value) ? null : Number(value);
            } else if (field === "amount") {
                value = isEmpty(value) ? null : Number(value);
            } else if (field === "video_file_id") {
                value = isEmpty(value) ? null : String(value).trim();
            } else if (field === "notes") {
                value = isEmpty(value) ? null : value;
            }

            updateFields.push(`${field} = ?`);
            updateValues.push(value);
        }

        // Recalculate duration when end time is supplied and duration
        // was not explicitly supplied by the client.
        if (
            effectiveEnd &&
            !hasField(req.body, "duration_minutes")
        ) {
            const existingDuration = Number(existing.duration_minutes);

            if (
                existing.end_time !== effectiveEnd ||
                !Number.isFinite(existingDuration)
            ) {
                updateFields.push("duration_minutes = ?");
                updateValues.push(calculatedDuration);
            }
        }

        if (!updateFields.length) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: "No valid fields provided for update"
            });
        }

        // A station row is locked when releasing it to avoid racing
        // with another session attempting to occupy that station.
        if (
            ["preparing", "active"].includes(existing.status) &&
            ["completed", "cancelled"].includes(effectiveStatus)
        ) {
            await connection.query(
                `
                SELECT id
                FROM gaming_stations
                WHERE id = ?
                FOR UPDATE
                `,
                [existing.station_id]
            );
        }

        updateValues.push(Number(id));

        await connection.query(
            `
            UPDATE game_sessions
            SET ${updateFields.join(", ")}
            WHERE id = ?
            `,
            updateValues
        );

        let relatedBooking = null;
        let bookingUpdated = false;
        if (
            existing.status === "active" &&
            ["completed", "cancelled"].includes(effectiveStatus)
        ) {
            // The schema has no game_sessions.booking_id. Match the
            // original session against its confirmed booking.
            relatedBooking = await findMatchingBooking(connection, {
                user_id: existing.user_id,
                game_id: existing.game_id,
                station_id: existing.station_id,
                start_time: existing.start_time
            });

            //     if (relatedBooking) {
            //         // const bookingStatus =
            //         //     effectiveStatus === "completed"
            //         //         ? "completed"
            //         //         : "cancelled";

            //         await connection.query(
            //             `
            //            UPDATE bookings
            // SET status = 'completed'
            // WHERE id = ?
            //   AND status = 'confirmed'
            // `,
            // [relatedBooking.id]
            //         );
            //     }

            if (relatedBooking && effectiveStatus === "completed") {
                const [bookingResult] = await connection.query(
                    `
        UPDATE bookings
        SET status = 'completed'
        WHERE id = ?
          AND status = 'confirmed'
        `,
                    [relatedBooking.id]
                );

                bookingUpdated = bookingResult.affectedRows > 0;
            }

            // Release the station only if it still belongs to this
            // session's player. Preserve maintenance/inactive status.
            await connection.query(
                `
                UPDATE gaming_stations
                SET status = CASE
                    WHEN status IN ('maintenance', 'inactive')
                        THEN status
                    ELSE 'available'
                END,
                current_player_id = NULL
                WHERE id = ?
                  AND current_player_id = ?
                `,
                [existing.station_id, existing.user_id]
            );
        }

        await connection.commit();

        return res.status(200).json({
            success: true,
            message:
                effectiveStatus === "completed"
                    ? "Game Session Ended Successfully"
                    : effectiveStatus === "cancelled"
                        ? "Game Session Cancelled Successfully"
                        : "Game Session Updated Successfully",
            booking_updated: bookingUpdated
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error("Update session rollback error:", rollbackError.message);
            }
        }

        console.error("Update Game Session Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server error while updating game session"
        });
    } finally {
        if (connection) connection.release();
    }
};

// =====================================================
// DELETE GAME SESSION
// ADMIN ONLY
// =====================================================

const deleteGameSession = async (req, res) => {
    let connection;

    try {
        const { id } = req.params;

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Game Session ID"
            });
        }

        if (req.user?.role_name !== "Admin") {
            return res.status(403).json({
                success: false,
                message: "Only Admin can delete game sessions"
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [rows] = await connection.query(
            `
            SELECT id, status, station_id, user_id
            FROM game_sessions
            WHERE id = ?
            FOR UPDATE
            `,
            [Number(id)]
        );

        if (!rows.length) {
            await connection.rollback();

            return res.status(404).json({
                success: false,
                message: "Game Session Not Found"
            });
        }

        if (
            ["preparing", "active"].includes(rows[0].status)
        ) {
            await connection.rollback();

            return res.status(409).json({
                success: false,
                message: "Preparing or active game session cannot be deleted. Complete or cancel the session first."
            });
        }

        await connection.query(
            "DELETE FROM game_sessions WHERE id = ?",
            [Number(id)]
        );

        await connection.commit();

        return res.status(200).json({
            success: true,
            message: "Game Session Deleted Successfully"
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error("Delete session rollback error:", rollbackError.message);
            }
        }

        console.error("Delete Game Session Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server error while deleting game session"
        });
    } finally {
        if (connection) connection.release();
    }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    getAllGameSessions,
    getGameSessionById,
    createGameSession,
    updateGameSession,
    deleteGameSession
};
