
const db = require("../config/db");

// ==================================================
// GET ALL BOOKINGS
// ==================================================

const getAllBookings = async (req, res) => {
    try {
        let query = `
            SELECT 
                b.id,
                b.user_id,
                u.full_name AS user_name,
                u.mobile,

                b.membership_id,

                b.game_id,
                g.game_name,

                b.station_id,
                gs.station_name,

                b.booking_date,
                b.start_time,
                b.end_time,

                b.status,
                b.payment_status,
                b.amount,
                b.notes,

                b.created_at,
                b.updated_at

            FROM bookings b

            LEFT JOIN users u
                ON b.user_id = u.id

            LEFT JOIN games g
                ON b.game_id = g.id

            LEFT JOIN gaming_stations gs
                ON b.station_id = gs.id
        `;

        let queryParams = [];

        if (req.user.role_name === "Player") {
            query += ` WHERE b.user_id = ?`;
            queryParams = [req.user.id];
        }

        query += ` ORDER BY b.id DESC`;

        const [bookings] = await db.query(query, queryParams);

        return res.status(200).json({
            success: true,
            count: bookings.length,
            bookings
        });

    } catch (error) {
        console.log("Get All Bookings Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server Error While Getting All Bookings"
        });
    }
};


// ==================================================
// GET BOOKING BY ID
// ==================================================

const getBookingById = async (req, res) => {
    try {
        const { id } = req.params;

        let query = `
            SELECT 
                b.id,
                b.user_id,
                u.full_name AS user_name,
                u.mobile,

                b.membership_id,

                b.game_id,
                g.game_name,

                b.station_id,
                gs.station_name,

                b.booking_date,
                b.start_time,
                b.end_time,

                b.status,
                b.payment_status,
                b.amount,
                b.notes,

                b.created_at,
                b.updated_at

            FROM bookings b

            LEFT JOIN users u
                ON b.user_id = u.id

            LEFT JOIN games g
                ON b.game_id = g.id

            LEFT JOIN gaming_stations gs
                ON b.station_id = gs.id
        `;

        let queryParams = [];

        if (req.user.role_name === "Player") {
            query += ` WHERE b.id = ? AND b.user_id = ?`;
            queryParams = [id, req.user.id];
        } else {
            query += ` WHERE b.id = ?`;
            queryParams = [id];
        }

        const [bookings] = await db.query(query, queryParams);

        if (bookings.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Booking Not Found"
            });
        }

        return res.status(200).json({
            success: true,
            booking: bookings[0]
        });

    } catch (error) {
        console.log("Get Booking By ID Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server Error While Getting Booking By ID"
        });
    }
};


// ==================================================
// COMMON BOOKING VALIDATION
// ==================================================

const validateBookingData = async (bookingData) => {

    const {
        user_id,
        game_id,
        station_id,
        membership_id,
        booking_date,
        start_time,
        end_time,
        status,
        payment_status
    } = bookingData;

    // --------------------------------------------------
    // REQUIRED FIELDS
    // --------------------------------------------------

    if (
        !user_id ||
        !membership_id ||
        !game_id ||
        !station_id ||
        !booking_date ||
        !start_time ||
        !end_time
    ) {
        return "All Booking Fields are required";
    }

    // --------------------------------------------------
    // VALIDATE USER
    // --------------------------------------------------

    const [user] = await db.query(
        "SELECT id FROM users WHERE id=?",
        [user_id]
    );

    if (user.length === 0) {
        return "Invalid user";
    }

    // --------------------------------------------------
    // VALIDATE MEMBERSHIP
    // --------------------------------------------------

    const [membership] = await db.query(
        `SELECT id, user_id, status, expiry_date
         FROM memberships
         WHERE id=?`,
        [membership_id]
    );

    if (membership.length === 0) {
        return "Invalid membership";
    }

    // Membership must belong to selected user
    if (
        Number(membership[0].user_id) !==
        Number(user_id)
    ) {
        return "Membership does not belong to this user";
    }

    // Membership status
    if (membership[0].status !== "active") {
        return "Membership is not active";
    }

    // Membership expiry
    const today = new Date();
    const expiryDate = new Date(
        membership[0].expiry_date
    );

    today.setHours(0, 0, 0, 0);
    expiryDate.setHours(0, 0, 0, 0);

    if (expiryDate < today) {
        return "Membership has expired";
    }

    // --------------------------------------------------
    // VALIDATE GAME
    // --------------------------------------------------

    const [game] = await db.query(
        `
        SELECT
            id,
            status,
            price
        FROM games
        WHERE id=?
        `,
        [game_id]
    );

    if (game.length === 0) {
        return "Invalid game";
    }

    if (game[0].status !== "active") {
        return "Selected game is inactive";
    }

    // Validate game price
    if (
        game[0].price === null ||
        game[0].price === undefined ||
        isNaN(game[0].price) ||
        Number(game[0].price) < 0
    ) {
        return "Selected game has an invalid price";
    }

    // --------------------------------------------------
    // VALIDATE GAMING STATION
    // --------------------------------------------------

    const [station] = await db.query(
        `
        SELECT
            id,
            status
        FROM gaming_stations
        WHERE id=?
        `,
        [station_id]
    );

    if (station.length === 0) {
        return "Invalid gaming station";
    }

    if (station[0].status === "maintenance") {
        return "Selected gaming station is under maintenance";
    }

    // --------------------------------------------------
    // VALIDATE TIME
    // --------------------------------------------------

    if (start_time >= end_time) {
        return "End time must be greater than start time";
    }

    // --------------------------------------------------
    // VALIDATE BOOKING DATE
    // --------------------------------------------------

    const selectedDate = new Date(booking_date);

    if (isNaN(selectedDate.getTime())) {
        return "Invalid booking date";
    }

    const todayDate = new Date();

    selectedDate.setHours(0, 0, 0, 0);
    todayDate.setHours(0, 0, 0, 0);

    if (selectedDate < todayDate) {
        return "Booking Date cannot be in the past";
    }

    // --------------------------------------------------
    // VALIDATE BOOKING STATUS
    // --------------------------------------------------

    if (
        status &&
        ![
            "pending",
            "confirmed",
            "cancelled",
            "completed"
        ].includes(status)
    ) {
        return "Invalid Booking Status";
    }

    // --------------------------------------------------
    // VALIDATE PAYMENT STATUS
    // --------------------------------------------------

    if (
        payment_status &&
        ![
            "pending",
            "paid",
            "refunded"
        ].includes(payment_status)
    ) {
        return "Invalid Payment Status";
    }

    return null;
};


// ==================================================
// CREATE BOOKING
// ==================================================

const createBooking = async (req, res) => {
    try {
        let {
            user_id,
            game_id,
            station_id,
            membership_id,
            booking_date,
            start_time,
            end_time,
            status,
            payment_status
        } = req.body;

        // --------------------------------------------------
        // PLAYER CAN ONLY CREATE BOOKING FOR THEMSELVES
        // --------------------------------------------------

        if (req.user.role_name === "Player") {
            user_id = req.user.id;
        }

        // --------------------------------------------------
        // COMMON VALIDATION
        // --------------------------------------------------

        const validationError =
            await validateBookingData({
                user_id,
                game_id,
                station_id,
                membership_id,
                booking_date,
                start_time,
                end_time,
                status,
                payment_status
            });

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError
            });
        }

        // --------------------------------------------------
        // GET GAME PRICE FROM DATABASE
        // --------------------------------------------------

        const [gameResult] = await db.query(
            `
            SELECT
                id,
                game_name,
                price,
                status
            FROM games
            WHERE id=?
            `,
            [game_id]
        );

        if (gameResult.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Game Not Found"
            });
        }

        if (gameResult[0].status !== "active") {
            return res.status(400).json({
                success: false,
                message: "Selected game is inactive"
            });
        }

        // IMPORTANT:
        // Booking amount always comes from games.price.
        // Do NOT trust amount sent from frontend.
        const bookingAmount =
            Number(gameResult[0].price);

        // --------------------------------------------------
        // CHECK STATION BOOKING CONFLICT
        // --------------------------------------------------

        const [conflictBooking] = await db.query(
            `
            SELECT id
            FROM bookings
            WHERE station_id = ?
            AND booking_date = ?
            AND status IN ('pending', 'confirmed')
            AND start_time < ?
            AND end_time > ?
            `,
            [
                station_id,
                booking_date,
                end_time,
                start_time
            ]
        );

        if (conflictBooking.length > 0) {
            return res.status(409).json({
                success: false,
                message:
                    "Gaming station is already booked for this time"
            });
        }

        // --------------------------------------------------
        // DEFAULT VALUES
        // --------------------------------------------------

        const bookingStatus =
            status ?? "pending";

        const paymentStatus =
            payment_status ?? "pending";

        // --------------------------------------------------
        // IMPORTANT PAYMENT RULE
        // --------------------------------------------------
        //
        // A new booking should not be automatically
        // marked as paid/confirmed.
        //
        // Player pays at counter.
        // Staff/Admin records payment.
        // Payment completion then confirms booking.
        //

        if (
            req.user.role_name === "Player" &&
            paymentStatus !== "pending"
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Player booking must start with pending payment"
            });
        }

        // --------------------------------------------------
        // INSERT BOOKING
        // --------------------------------------------------

        const [result] = await db.query(
            `
            INSERT INTO bookings(
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
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                user_id,
                membership_id,
                game_id,
                station_id,
                booking_date,
                start_time,
                end_time,
                bookingStatus,
                paymentStatus,
                bookingAmount
            ]
        );

        return res.status(201).json({
            success: true,
            message: "Booking Created Successfully",

            booking_id: result.insertId,

            booking: {
                id: result.insertId,
                game_id,
                amount: bookingAmount,
                status: bookingStatus,
                payment_status: paymentStatus
            }
        });

    } catch (error) {
        console.log(
            "Create Booking Error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message:
                "Server Error While Creating Booking"
        });
    }
};


// ==================================================
// UPDATE BOOKING
// ==================================================

const updateBooking = async (req, res) => {
    try {
        const { id } = req.params;

        const {
            user_id,
            game_id,
            station_id,
            membership_id,
            booking_date,
            start_time,
            end_time,
            status,
            payment_status
        } = req.body;

        // --------------------------------------------------
        // CHECK EXISTING BOOKING
        // --------------------------------------------------

        const [existingBooking] = await db.query(
            `
            SELECT
                id,
                status,
                payment_status
            FROM bookings
            WHERE id=?
            `,
            [id]
        );

        if (existingBooking.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Booking Not Found"
            });
        }

        // --------------------------------------------------
        // COMMON VALIDATION
        // --------------------------------------------------

        const validationError =
            await validateBookingData({
                user_id,
                game_id,
                station_id,
                membership_id,
                booking_date,
                start_time,
                end_time,
                status,
                payment_status
            });

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError
            });
        }

        // --------------------------------------------------
        // GET GAME PRICE FROM DATABASE
        // --------------------------------------------------

        const [gameResult] = await db.query(
            `
            SELECT
                id,
                price,
                status
            FROM games
            WHERE id=?
            `,
            [game_id]
        );

        if (gameResult.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Game Not Found"
            });
        }

        if (gameResult[0].status !== "active") {
            return res.status(400).json({
                success: false,
                message: "Selected game is inactive"
            });
        }

        // IMPORTANT:
        // Never trust amount from frontend.
        const bookingAmount =
            Number(gameResult[0].price);

        // --------------------------------------------------
        // CHECK STATION BOOKING CONFLICT
        // --------------------------------------------------

        const [conflictBooking] = await db.query(
            `
            SELECT id
            FROM bookings
            WHERE station_id=?
            AND booking_date=?
            AND status IN ('pending','confirmed')
            AND start_time < ?
            AND end_time > ?
            AND id != ?
            `,
            [
                station_id,
                booking_date,
                end_time,
                start_time,
                id
            ]
        );

        if (conflictBooking.length > 0) {
            return res.status(409).json({
                success: false,
                message:
                    "Gaming station is already booked for this time"
            });
        }

        // --------------------------------------------------
        // DEFAULT VALUES
        // --------------------------------------------------

        const bookingStatus =
            status ?? "pending";

        const paymentStatus =
            payment_status ?? "pending";

        // --------------------------------------------------
        // UPDATE BOOKING
        // --------------------------------------------------

        await db.query(
            `
            UPDATE bookings
            SET
                user_id=?,
                membership_id=?,
                game_id=?,
                station_id=?,
                booking_date=?,
                start_time=?,
                end_time=?,
                status=?,
                payment_status=?,
                amount=?
            WHERE id=?
            `,
            [
                user_id,
                membership_id,
                game_id,
                station_id,
                booking_date,
                start_time,
                end_time,
                bookingStatus,
                paymentStatus,
                bookingAmount,
                id
            ]
        );

        return res.status(200).json({
            success: true,
            message: "Booking updated Successfully",
            booking: {
                id,
                amount: bookingAmount,
                status: bookingStatus,
                payment_status: paymentStatus
            }
        });

    } catch (error) {

        console.log(
            "Update Booking Error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message:
                "Server Error While Updating Booking"
        });
    }
};


// ==================================================
// UPDATE BOOKING STATUS
// ==================================================

const updateBookingStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        // --------------------------------------------------
        // VALIDATE STATUS
        // --------------------------------------------------

        if (
            ![
                "pending",
                "confirmed",
                "cancelled",
                "completed"
            ].includes(status)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid Booking Status"
            });
        }

        // --------------------------------------------------
        // GET BOOKING
        // --------------------------------------------------

        const [existingBooking] = await db.query(
            `
            SELECT
                id,
                user_id,
                status,
                payment_status
            FROM bookings
            WHERE id=?
            `,
            [id]
        );

        if (existingBooking.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Booking Not Found"
            });
        }

        const booking =
            existingBooking[0];

        // --------------------------------------------------
        // PLAYER PERMISSION
        // --------------------------------------------------

        if (req.user.role_name === "Player") {

            // Player can only update own booking
            if (
                Number(booking.user_id) !==
                Number(req.user.id)
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "You can only manage your own bookings"
                });
            }

            // Player can ONLY cancel
            if (status !== "cancelled") {
                return res.status(403).json({
                    success: false,
                    message:
                        "Player can only cancel their booking"
                });
            }

            // Cannot cancel completed booking
            if (booking.status === "completed") {
                return res.status(400).json({
                    success: false,
                    message:
                        "Completed booking cannot be cancelled"
                });
            }

            // Already cancelled
            if (booking.status === "cancelled") {
                return res.status(400).json({
                    success: false,
                    message:
                        "Booking is already cancelled"
                });
            }
        }

        // --------------------------------------------------
        // ADMIN / STAFF CONFIRMATION
        // --------------------------------------------------

        if (
            ["Admin", "Staff"].includes(
                req.user.role_name
            ) &&
            status === "confirmed"
        ) {

            // Payment must be completed
            if (
                booking.payment_status !== "paid"
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Payment must be completed before confirming the booking"
                });
            }
        }

        // --------------------------------------------------
        // PREVENT INVALID STATUS CHANGES
        // --------------------------------------------------

        if (booking.status === "cancelled") {
            return res.status(400).json({
                success: false,
                message:
                    "Cancelled booking cannot be changed"
            });
        }

        if (
            booking.status === "completed" &&
            status !== "completed"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Completed booking cannot be changed"
            });
        }

        // --------------------------------------------------
        // UPDATE STATUS
        // --------------------------------------------------

        await db.query(
            `
            UPDATE bookings
            SET status=?
            WHERE id=?
            `,
            [status, id]
        );

        return res.status(200).json({
            success: true,
            message:
                `Booking ${status} successfully`
        });

    } catch (error) {

        console.log(
            "Update Booking Status Error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message:
                "Server Error While Updating Booking Status"
        });
    }
};


// ==================================================
// DELETE BOOKING
// ==================================================

const deleteBooking = async (req, res) => {
    try {
        const { id } = req.params;

        // Check booking exists
        const [existingBooking] = await db.query(
            "SELECT id FROM bookings WHERE id=?",
            [id]
        );

        if (existingBooking.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Booking Not Found"
            });
        }

        await db.query(
            "DELETE FROM bookings WHERE id=?",
            [id]
        );

        return res.status(200).json({
            success: true,
            message:
                "Booking Deleted Successfully"
        });

    } catch (error) {

        console.log(
            "Delete Booking Error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message:
                "Server Error While Deleting Booking"
        });
    }
};


// ==================================================
// EXPORT
// ==================================================

module.exports = {
    getAllBookings,
    getBookingById,
    createBooking,
    updateBooking,
    updateBookingStatus,
    deleteBooking
};
