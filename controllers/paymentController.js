
const db = require("../config/db");

// ==================================================
// CONSTANTS
// ==================================================

const PAYMENT_METHODS = [
    "cash",
    "card",
    "upi",
    "wallet",
    "online"
];

const PAYMENT_STATUS = [
    "pending",
    "completed",
    "failed",
    "refunded"
];

const MAX_AMOUNT = 99999999.99;
const MAX_TRANSACTION_ID_LENGTH = 150;


// ==================================================
// HELPER FUNCTIONS
// ==================================================

const isPositiveInteger = (value) => {
    const number = Number(value);

    return Number.isInteger(number) && number > 0;
};


const isValidAmount = (value) => {

    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return false;
    }

    const amount = Number(value);

    if (
        !Number.isFinite(amount) ||
        amount < 0
    ) {
        return false;
    }

    if (amount > MAX_AMOUNT) {
        return false;
    }

    // Maximum 2 decimal places
    if (
        Math.round(amount * 100) !==
        amount * 100
    ) {
        return false;
    }

    return true;
};


const normalizeString = (value) => {

    if (
        value === undefined ||
        value === null
    ) {
        return null;
    }

    return String(value)
        .trim()
        .toLowerCase();
};


// ==================================================
// VALIDATE PAYMENT
// ==================================================

const validatePayment = async (
    data,
    isCreate = false,
    paymentId = null
) => {

    const {
        user_id,
        booking_id,
        membership_id,
        amount,
        payment_method,
        transaction_id,
        payment_status,
        notes
    } = data;


    // ----------------------------------------------
    // USER VALIDATION
    // ----------------------------------------------

    if (
        isCreate ||
        user_id !== undefined
    ) {

        if (
            user_id === undefined ||
            user_id === null ||
            user_id === ""
        ) {
            return "User ID is required";
        }

        if (!isPositiveInteger(user_id)) {
            return "Invalid User ID";
        }

        const [users] = await db.query(
            `
            SELECT u.id
            FROM users u
            INNER JOIN roles r
                ON u.role_id = r.id
            WHERE u.id = ?
            AND r.role_name = 'Player'
            `,
            [Number(user_id)]
        );

        if (users.length === 0) {
            return "user_id does not exist or is not a Player";
        }
    }


    // ----------------------------------------------
    // BOOKING VALIDATION
    // ----------------------------------------------

    if (
        booking_id !== undefined &&
        booking_id !== null &&
        booking_id !== ""
    ) {

        if (!isPositiveInteger(booking_id)) {
            return "Invalid Booking ID";
        }

        const [bookings] = await db.query(
            `
            SELECT
                id,
                user_id,
                amount,
                payment_status,
                status
            FROM bookings
            WHERE id = ?
            `,
            [Number(booking_id)]
        );

        if (bookings.length === 0) {
            return "Invalid Booking ID";
        }

        // If user_id is also provided, make sure
        // booking belongs to that player.
        if (
            user_id !== undefined &&
            user_id !== null &&
            user_id !== ""
        ) {

            if (
                Number(bookings[0].user_id) !==
                Number(user_id)
            ) {
                return "Booking does not belong to this user";
            }
        }
    }


    // ----------------------------------------------
    // MEMBERSHIP VALIDATION
    // ----------------------------------------------

    if (
        membership_id !== undefined &&
        membership_id !== null &&
        membership_id !== ""
    ) {

        if (!isPositiveInteger(membership_id)) {
            return "Invalid Membership ID";
        }

        const [memberships] = await db.query(
            `
            SELECT id
            FROM memberships
            WHERE id = ?
            `,
            [Number(membership_id)]
        );

        if (memberships.length === 0) {
            return "Invalid Membership ID";
        }
    }


    // ----------------------------------------------
    // AMOUNT VALIDATION
    // ----------------------------------------------

    if (
        isCreate ||
        amount !== undefined
    ) {

        if (
            amount === undefined ||
            amount === null ||
            amount === ""
        ) {
            return "Amount is required";
        }

        if (!isValidAmount(amount)) {

            if (
                Number(amount) >
                MAX_AMOUNT
            ) {
                return "Amount is too large";
            }

            if (
                Number.isFinite(Number(amount)) &&
                Math.round(Number(amount) * 100) !==
                Number(amount) * 100
            ) {
                return "Amount can have maximum 2 decimal places";
            }

            return "Amount must be a valid non-negative number";
        }
    }


    // ----------------------------------------------
    // PAYMENT METHOD VALIDATION
    // ----------------------------------------------

    if (
        isCreate ||
        payment_method !== undefined
    ) {

        if (
            payment_method === undefined ||
            payment_method === null ||
            payment_method === ""
        ) {
            return "Payment method is required";
        }

        const normalizedMethod =
            normalizeString(payment_method);

        if (
            !PAYMENT_METHODS.includes(
                normalizedMethod
            )
        ) {
            return `Payment method must be one of: ${PAYMENT_METHODS.join(", ")}`;
        }
    }


    // ----------------------------------------------
    // TRANSACTION ID VALIDATION
    // ----------------------------------------------

    if (
        transaction_id !== undefined &&
        transaction_id !== null &&
        transaction_id !== ""
    ) {

        const transactionId =
            String(transaction_id).trim();

        if (
            transactionId.length >
            MAX_TRANSACTION_ID_LENGTH
        ) {
            return "Transaction ID cannot exceed 150 characters";
        }

        let query = `
            SELECT id
            FROM payments
            WHERE transaction_id = ?
        `;

        const queryParams = [
            transactionId
        ];

        if (paymentId !== null) {

            query += ` AND id != ?`;

            queryParams.push(paymentId);
        }

        const [existingTransactions] =
            await db.query(
                query,
                queryParams
            );

        if (
            existingTransactions.length > 0
        ) {
            return "Transaction ID already exists";
        }
    }


    // ----------------------------------------------
    // PAYMENT STATUS VALIDATION
    // ----------------------------------------------

    if (
        payment_status !== undefined &&
        payment_status !== null &&
        payment_status !== ""
    ) {

        const normalizedStatus =
            normalizeString(payment_status);

        if (
            !PAYMENT_STATUS.includes(
                normalizedStatus
            )
        ) {
            return `Payment status must be one of: ${PAYMENT_STATUS.join(", ")}`;
        }
    }


    // ----------------------------------------------
    // NOTES VALIDATION
    // ----------------------------------------------

    if (
        notes !== undefined &&
        notes !== null
    ) {

        if (
            typeof notes !== "string"
        ) {
            return "Notes must be text";
        }
    }


    return null;
};


// ==================================================
// GET ALL PAYMENTS
// ==================================================

const getAllPayments = async (req, res) => {

    try {

        const role =
            req.user?.role_name;

        const userId =
            req.user?.id;

        let query = `
            SELECT
                p.id,
                p.user_id,
                u.full_name AS user_name,
                p.booking_id,
                p.membership_id,
                p.amount,
                p.payment_method,
                p.transaction_id,
                p.payment_status,
                p.payment_date,
                p.notes,
                p.created_at,
                p.updated_at
            FROM payments p
            INNER JOIN users u
                ON p.user_id = u.id
        `;

        const queryParams = [];


        // PLAYER → OWN PAYMENTS ONLY

        if (role === "Player") {

            query += `
                WHERE p.user_id = ?
            `;

            queryParams.push(
                Number(userId)
            );
        }


        query += `
            ORDER BY p.id DESC
        `;


        const [payments] =
            await db.query(
                query,
                queryParams
            );


        return res.status(200).json({

            success: true,

            count: payments.length,

            data: payments

        });

    } catch (error) {

        console.log(
            "Get Payments Error:",
            error.message
        );

        return res.status(500).json({

            success: false,

            message:
                "Server error while fetching payments"

        });
    }
};


// ==================================================
// GET PAYMENT BY ID
// ==================================================

const getPaymentById = async (
    req,
    res
) => {

    try {

        const { id } =
            req.params;


        if (!isPositiveInteger(id)) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid Payment ID"

            });
        }


        let query = `
            SELECT
                p.id,
                p.user_id,
                u.full_name AS user_name,
                p.booking_id,
                p.membership_id,
                p.amount,
                p.payment_method,
                p.transaction_id,
                p.payment_status,
                p.payment_date,
                p.notes,
                p.created_at,
                p.updated_at
            FROM payments p
            INNER JOIN users u
                ON p.user_id = u.id
            WHERE p.id = ?
        `;

        const queryParams = [
            Number(id)
        ];


        // PLAYER → OWN PAYMENT ONLY

        if (
            req.user?.role_name ===
            "Player"
        ) {

            query += `
                AND p.user_id = ?
            `;

            queryParams.push(
                Number(req.user.id)
            );
        }


        const [payment] =
            await db.query(
                query,
                queryParams
            );


        if (
            payment.length === 0
        ) {

            return res.status(404).json({

                success: false,

                message:
                    "Payment Not Found"

            });
        }


        return res.status(200).json({

            success: true,

            data: payment[0]

        });

    } catch (error) {

        console.log(
            "Get Payment By ID Error:",
            error.message
        );

        return res.status(500).json({

            success: false,

            message:
                "Server error while fetching payment by ID"

        });
    }
};


// ==================================================
// CREATE PAYMENT
// ADMIN + STAFF
// ==================================================

const createPayment = async (
    req,
    res
) => {

    try {

        const {
            user_id,
            booking_id,
            membership_id,
            amount,
            payment_method,
            transaction_id,
            payment_status,
            notes
        } = req.body;


        // ------------------------------------------
        // VALIDATE
        // ------------------------------------------

        const validationError =
            await validatePayment(
                req.body,
                true
            );


        if (validationError) {

            return res.status(400).json({

                success: false,

                message:
                    validationError

            });
        }


        // ------------------------------------------
        // NORMALIZE
        // ------------------------------------------

        const userId =
            Number(user_id);


        const bookingId =
            booking_id === undefined ||
            booking_id === null ||
            booking_id === ""
                ? null
                : Number(booking_id);


        const membershipId =
            membership_id === undefined ||
            membership_id === null ||
            membership_id === ""
                ? null
                : Number(membership_id);


        const paymentAmount =
            Number(amount);


        const paymentMethod =
            normalizeString(
                payment_method
            );


        const paymentStatus =
            payment_status === undefined ||
            payment_status === null ||
            payment_status === ""
                ? "pending"
                : normalizeString(
                    payment_status
                );


        const transactionId =
            transaction_id === undefined ||
            transaction_id === null ||
            transaction_id === ""
                ? null
                : String(
                    transaction_id
                ).trim();


        const paymentNotes =
            notes === undefined ||
            notes === null ||
            notes === ""
                ? null
                : notes;


        // ------------------------------------------
        // EXTRA BOOKING CHECK
        // ------------------------------------------

        if (bookingId) {

            const [booking] =
                await db.query(
                    `
                    SELECT
                        id,
                        user_id,
                        amount,
                        status,
                        payment_status
                    FROM bookings
                    WHERE id = ?
                    `,
                    [bookingId]
                );


            if (
                booking.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Booking Not Found"

                });
            }


            if (
                Number(booking[0].user_id) !==
                userId
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Booking does not belong to selected player"

                });
            }


            // Prevent payment amount mismatch

            if (
                Number(booking[0].amount) !==
                paymentAmount
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        `Payment amount must match booking amount of ₹${booking[0].amount}`

                });
            }
        }


        // ------------------------------------------
        // INSERT PAYMENT
        // ------------------------------------------

        const [result] =
            await db.query(
                `
                INSERT INTO payments (
                    user_id,
                    booking_id,
                    membership_id,
                    amount,
                    payment_method,
                    transaction_id,
                    payment_status,
                    notes
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    userId,
                    bookingId,
                    membershipId,
                    paymentAmount,
                    paymentMethod,
                    transactionId,
                    paymentStatus,
                    paymentNotes
                ]
            );


        // ------------------------------------------
        // COMPLETED PAYMENT
        // → BOOKING PAID + CONFIRMED
        // ------------------------------------------

        if (
            bookingId &&
            paymentStatus ===
                "completed"
        ) {

            await db.query(
                `
                UPDATE bookings
                SET
                    payment_status = 'paid',
                    status = 'confirmed'
                WHERE id = ?
                `,
                [bookingId]
            );
        }


        return res.status(201).json({

            success: true,

            message:
                "Payment Created Successfully",

            payment_id:
                result.insertId

        });

    } catch (error) {

        console.error(
            "Create Payment Error:",
            error.message
        );


        if (
            error.code ===
            "ER_DUP_ENTRY"
        ) {

            return res.status(409).json({

                success: false,

                message:
                    "Transaction ID already exists"

            });
        }


        return res.status(500).json({

            success: false,

            message:
                "Server error while creating payment"

        });
    }
};


// ==================================================
// UPDATE PAYMENT
// ADMIN + STAFF
// ==================================================

const updatePayment = async (
    req,
    res
) => {

    try {

        const { id } =
            req.params;


        if (!isPositiveInteger(id)) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid Payment ID"

            });
        }


        const paymentId =
            Number(id);


        // ------------------------------------------
        // GET EXISTING PAYMENT
        // ------------------------------------------

        const [
            existingPayments
        ] = await db.query(
            `
            SELECT *
            FROM payments
            WHERE id = ?
            `,
            [paymentId]
        );


        if (
            existingPayments.length === 0
        ) {

            return res.status(404).json({

                success: false,

                message:
                    "Payment Not Found"

            });
        }


        const existingPayment =
            existingPayments[0];


        // ------------------------------------------
        // VALIDATE
        // ------------------------------------------

        const validationError =
            await validatePayment(
                req.body,
                false,
                paymentId
            );


        if (validationError) {

            return res.status(400).json({

                success: false,

                message:
                    validationError

            });
        }


        // ------------------------------------------
        // DETERMINE FINAL VALUES
        // ------------------------------------------

        const finalUserId =
            req.body.user_id !== undefined
                ? Number(req.body.user_id)
                : Number(
                    existingPayment.user_id
                );


        const finalBookingId =
            req.body.booking_id !== undefined
                ? (
                    req.body.booking_id === null ||
                    req.body.booking_id === ""
                        ? null
                        : Number(
                            req.body.booking_id
                        )
                )
                : existingPayment.booking_id;


        const finalAmount =
            req.body.amount !== undefined
                ? Number(req.body.amount)
                : Number(
                    existingPayment.amount
                );


        const finalPaymentStatus =
            req.body.payment_status !== undefined
                ? normalizeString(
                    req.body.payment_status
                )
                : normalizeString(
                    existingPayment.payment_status
                );


        // ------------------------------------------
        // CHECK FINAL BOOKING
        // ------------------------------------------

        if (finalBookingId) {

            const [booking] =
                await db.query(
                    `
                    SELECT
                        id,
                        user_id,
                        amount,
                        status
                    FROM bookings
                    WHERE id = ?
                    `,
                    [finalBookingId]
                );


            if (
                booking.length === 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid Booking ID"

                });
            }


            if (
                Number(
                    booking[0].user_id
                ) !== finalUserId
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Booking does not belong to selected player"

                });
            }


            if (
                Number(booking[0].amount) !==
                finalAmount
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        `Payment amount must match booking amount of ₹${booking[0].amount}`

                });
            }
        }


        // ------------------------------------------
        // ALLOWED FIELDS
        // ------------------------------------------

        const allowedFields = [
            "user_id",
            "booking_id",
            "membership_id",
            "amount",
            "payment_method",
            "transaction_id",
            "payment_status",
            "notes"
        ];


        const updateFields = [];
        const updateValues = [];


        allowedFields.forEach(
            (field) => {

                if (
                    Object.prototype.hasOwnProperty.call(
                        req.body,
                        field
                    )
                ) {

                    let value =
                        req.body[field];


                    if (
                        field ===
                        "user_id"
                    ) {

                        value =
                            Number(value);
                    }


                    if (
                        field ===
                        "booking_id"
                    ) {

                        value =
                            value === null ||
                            value === ""
                                ? null
                                : Number(value);
                    }


                    if (
                        field ===
                        "membership_id"
                    ) {

                        value =
                            value === null ||
                            value === ""
                                ? null
                                : Number(value);
                    }


                    if (
                        field ===
                        "amount"
                    ) {

                        value =
                            value === null ||
                            value === ""
                                ? null
                                : Number(value);
                    }


                    if (
                        field ===
                        "payment_method"
                    ) {

                        value =
                            normalizeString(
                                value
                            );
                    }


                    if (
                        field ===
                        "transaction_id"
                    ) {

                        value =
                            value === null ||
                            value === ""
                                ? null
                                : String(
                                    value
                                ).trim();
                    }


                    if (
                        field ===
                        "payment_status"
                    ) {

                        value =
                            normalizeString(
                                value
                            );
                    }


                    if (
                        field ===
                        "notes"
                    ) {

                        value =
                            value === null ||
                            value === ""
                                ? null
                                : value;
                    }


                    updateFields.push(
                        `${field} = ?`
                    );

                    updateValues.push(
                        value
                    );
                }
            }
        );


        if (
            updateFields.length === 0
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "No valid fields provided for update"

            });
        }


        // ------------------------------------------
        // UPDATE PAYMENT
        // ------------------------------------------

        updateValues.push(
            paymentId
        );


        await db.query(
            `
            UPDATE payments
            SET ${updateFields.join(", ")}
            WHERE id = ?
            `,
            updateValues
        );


        // ------------------------------------------
        // OLD BOOKING
        // ------------------------------------------

        const oldBookingId =
            existingPayment.booking_id;


        // If booking changed, reset old booking
        // only if no completed payment remains.
        if (
            oldBookingId &&
            Number(oldBookingId) !==
            Number(finalBookingId)
        ) {

            const [
                oldCompletedPayments
            ] = await db.query(
                `
                SELECT id
                FROM payments
                WHERE booking_id = ?
                AND payment_status = 'completed'
                AND id != ?
                `,
                [
                    oldBookingId,
                    paymentId
                ]
            );


            if (
                oldCompletedPayments.length === 0
            ) {

                await db.query(
                    `
                    UPDATE bookings
                    SET
                        payment_status = 'pending',
                        status = 'pending'
                    WHERE id = ?
                    `,
                    [oldBookingId]
                );
            }
        }


        // ------------------------------------------
        // SYNC CURRENT BOOKING
        // ------------------------------------------

        if (finalBookingId) {

            if (
                finalPaymentStatus ===
                "completed"
            ) {

                await db.query(
                    `
                    UPDATE bookings
                    SET
                        payment_status = 'paid',
                        status = 'confirmed'
                    WHERE id = ?
                    `,
                    [finalBookingId]
                );

            } else if (
                finalPaymentStatus ===
                "refunded"
            ) {

                await db.query(
                    `
                    UPDATE bookings
                    SET
                        payment_status = 'refunded',
                        status = 'pending'
                    WHERE id = ?
                    `,
                    [finalBookingId]
                );

            } else if (
                finalPaymentStatus ===
                    "pending" ||
                finalPaymentStatus ===
                    "failed"
            ) {

                await db.query(
                    `
                    UPDATE bookings
                    SET
                        payment_status = 'pending'
                    WHERE id = ?
                    `,
                    [finalBookingId]
                );
            }
        }


        return res.status(200).json({

            success: true,

            message:
                "Payment Updated Successfully"

        });

    } catch (error) {

        console.error(
            "Update Payment Error:",
            error.message
        );


        if (
            error.code ===
            "ER_DUP_ENTRY"
        ) {

            return res.status(409).json({

                success: false,

                message:
                    "Transaction ID already exists"

            });
        }


        return res.status(500).json({

            success: false,

            message:
                "Server error while updating payment"

        });
    }
};


// ==================================================
// DELETE PAYMENT
// ADMIN ONLY
// ==================================================

const deletePayment = async (
    req,
    res
) => {

    try {

        const { id } =
            req.params;


        if (!isPositiveInteger(id)) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid Payment ID"

            });
        }


        const paymentId =
            Number(id);


        // ------------------------------------------
        // GET PAYMENT BEFORE DELETE
        // ------------------------------------------

        const [
            existingPayments
        ] = await db.query(
            `
            SELECT
                id,
                booking_id,
                payment_status
            FROM payments
            WHERE id = ?
            `,
            [paymentId]
        );


        if (
            existingPayments.length === 0
        ) {

            return res.status(404).json({

                success: false,

                message:
                    "Payment Not Found"

            });
        }


        const payment =
            existingPayments[0];


        // ------------------------------------------
        // DELETE PAYMENT
        // ------------------------------------------

        await db.query(
            `
            DELETE FROM payments
            WHERE id = ?
            `,
            [paymentId]
        );


        // ------------------------------------------
        // RESET BOOKING IF NO COMPLETED
        // PAYMENT REMAINS
        // ------------------------------------------

        if (payment.booking_id) {

            const [
                completedPayments
            ] = await db.query(
                `
                SELECT id
                FROM payments
                WHERE booking_id = ?
                AND payment_status = 'completed'
                `,
                [payment.booking_id]
            );


            if (
                completedPayments.length === 0
            ) {

                await db.query(
                    `
                    UPDATE bookings
                    SET
                        payment_status = 'pending',
                        status = 'pending'
                    WHERE id = ?
                    `,
                    [payment.booking_id]
                );
            }
        }


        return res.status(200).json({

            success: true,

            message:
                "Payment Deleted Successfully"

        });

    } catch (error) {

        console.error(
            "Delete Payment Error:",
            error.message
        );


        return res.status(500).json({

            success: false,

            message:
                "Server error while deleting payment"

        });
    }
};


// ==================================================
// EXPORT
// ==================================================

module.exports = {

    getAllPayments,

    getPaymentById,

    createPayment,

    updatePayment,

    deletePayment

};
