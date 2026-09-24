const db = require("../config/db");

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

//Get Booking By ID
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

        if(req.user.role_name === "Player"){
            query += ` WHERE b.id = ? AND b.user_id = ?`;
            queryParams = [id, req.user.id]; 
        }else{
            query += ` WHERE b.id = ?`;
            queryParams = [id];
        }

        query += ` ORDER BY b.id DESC`;

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

//Common Booking Validation
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
        payment_status,
        amount
    } = bookingData;

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

    // Validate user
    const [user] = await db.query(
        "SELECT id FROM users WHERE id=?",
        [user_id]
    );

    if (user.length === 0) {
        return "Invalid user";
    }

    // Validate membership
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
    if (Number(membership[0].user_id) !== Number(user_id)) {
        return "Membership does not belong to this user";
    }

    // Membership status
    if (membership[0].status !== "active") {
        return "Membership is not active";
    }

    // Membership expiry
    const today = new Date();
    const expiryDate = new Date(membership[0].expiry_date);

    today.setHours(0, 0, 0, 0);
    expiryDate.setHours(0, 0, 0, 0);

    if (expiryDate < today) {
        return "Membership has expired";
    }

    // Validate game
    const [game] = await db.query(
        "SELECT id, status FROM games WHERE id=?",
        [game_id]
    );

    if (game.length === 0) {
        return "Invalid game";
    }

    if (game[0].status !== "active") {
        return "Selected game is inactive";
    }

    // Validate gaming station
    const [station] = await db.query(
        "SELECT id, status FROM gaming_stations WHERE id=?",
        [station_id]
    );

    if (station.length === 0) {
        return "Invalid gaming station";
    }

    if (station[0].status === "maintenance") {
        return "Selected gaming station is under maintenance";
    }

    // Validate time
    if (start_time >= end_time) {
        return "End time must be greater than start time";
    }

    // Validate booking date
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

    // Validate booking status
    if (
        status &&
        !["pending", "confirmed", "cancelled", "completed"].includes(status)
    ) {
        return "Invalid Booking Status";
    }

    // Validate payment status
    if (
        payment_status &&
        !["pending", "paid", "refunded"].includes(payment_status)
    ) {
        return "Invalid Payment Status";
    }

    // Validate amount
    if (
        amount !== undefined &&
        amount !== null &&
        (isNaN(amount) || Number(amount) < 0)
    ) {
        return "Amount must be a valid positive number";
    }

    return null;
};

//create booking
const createBooking = async (req, res) => {
    try {
        const {
            user_id,
            game_id,
            station_id,
            membership_id,
            booking_date,
            start_time,
            end_time,
            status,
            payment_status,
            amount,
        } = req.body;

        //common validation
        const validationError = await validateBookingData(req.body);

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError,
            });
        }

        //check station booking conflict
        const [conflictBooking] = await db.query(
            `SELECT id 
            FROM bookings 
            WHERE station_id=?
            AND booking_date=? 
            AND status IN ('pending','confirmed')
            AND start_time < ? 
            AND end_time > ? 
            `,
            [station_id, booking_date, end_time, start_time],
        );

        if (conflictBooking.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Gaming station is already booked for this time",
            });
        }

        //default values
        const bookingStatus = status ?? "pending";
        const paymentStatus = payment_status ?? "pending";
        const bookingAmount = amount ?? 0;

        //insert booking
        const [result] = await db.query(
            `INSERT INTO bookings(    
                user_id,
                membership_id,
                game_id,
                station_id,
                booking_date,
                start_time,
                end_time,
                status,
                payment_status,
                amount) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            ],
        );

        return res.status(200).json({
            success: true,
            message: "Booking Created Successfully",
            booking_id: result.insertId,
        });

    } catch (error) {
        
        console.log("Create Booking Error:", error.message);
        
        return res.status(500).json({
            success: false,
            message: "Server Error While Creating Booking",
        });
    }
};

//Update booking
const updateBooking = async (req, res) => {
    try {
        const {id} = req.params;
        const {
            user_id,
            game_id,
            station_id,
            membership_id,
            booking_date,
            start_time,
            end_time,
            status,
            payment_status,
            amount,
        } = req.body;

        const [existingBooking] = await db.query("SELECT id FROM bookings WHERE id =?",[id]);

        if(existingBooking.length === 0){
            return res.status(404).json({
                success:false,
                message:"Booking Not Found"
            });
        }

        //common validation
        const validationError = await validateBookingData(req.body);

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError,
            });
        }

        //check station booking conflict
        const [conflictBooking] = await db.query(
            `SELECT id 
            FROM bookings 
            WHERE station_id=?
            AND booking_date=? 
            AND status IN ('pending','confirmed')
            AND start_time < ? 
            AND end_time > ?
            AND id != ? 
            `,
            [station_id, booking_date, end_time, start_time,id],
        );

        if (conflictBooking.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Gaming station is already booked for this time",
            });
        }

        //default values
        const bookingStatus = status ?? "pending";
        const paymentStatus = payment_status ?? "pending";
        const bookingAmount = amount ?? 0;

        //update booking
         await db.query(
            `UPDATE bookings SET
                user_id=?,
                membership_id=?,
                game_id=?,
                station_id=?,
                booking_date=?,
                start_time=?,
                end_time=?,
                status=?,
                payment_status=?,
                amount=? WHERE id=?`,
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
            ],
        );

        return res.status(200).json({
            success: true,
            message: "Booking updated Successfully",
        });
    } catch (error) {
      
        console.log("Update Booking Error:", error.message);
      
        return res.status(500).json({
            success: false,
            message: "Server Error While Updating Booking"
        });
    }
};

// Update Booking Status
const updateBookingStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        // Validate status
        if (!["pending", "confirmed", "cancelled", "completed"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Booking Status"
            });
        }

        // Check booking exists
        const [existingBooking] = await db.query(
            "SELECT id, status FROM bookings WHERE id=?",
            [id]
        );

        if (existingBooking.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Booking Not Found"
            });
        }

        // Update status
        await db.query(
            "UPDATE bookings SET status=? WHERE id=?",
            [status, id]
        );

        return res.status(200).json({
            success: true,
            message: `Booking ${status} successfully`
        });

    } catch (error) {
        console.log("Update Booking Status Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server Error While Updating Booking Status"
        });
    }
};

//Delete Booking
const deleteBooking = async(req,res)=>{
    try{
        const {id} = req.params;

        //check booking exists
        const [existingBooking] = await db.query("SELECT id FROM bookings WHERE id=?",[id]);

        if(existingBooking.length === 0){
            return res.status(404).json({
                success: false,
                message: "Booking Not Found"
            });
        }

        await db.query(`DELETE FROM bookings WHERE id=?`,[id]);

          return res.status(200).json({
            success: true,
            message: "Booking Deleted Successfully"
        });

    }catch(error){
      console.log("Delete Booking Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Server Error While Deleting Booking"
        });   
    }
};

module.exports = {
    getAllBookings,
    getBookingById,
    createBooking,
    updateBooking,
    updateBookingStatus,
    deleteBooking
};