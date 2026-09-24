const db = require("../config/db");

//constants
const PAYMENT_METHODS=[
    "cash",
    "card",
    "upi",
    "wallet",
    "online"
];

const PAYMENT_STATUS=[
    "pending",
    "completed",
    "failed",
    "refunded"
];

const MAX_AMOUNT  =  99999999.99;
const MAX_TRANSACTION_ID_LENGTH = 150;

//HELPER FUNCTIONS
//check positive integer

const isPositiveInteger = (value)=>{
    const number=Number(value);
    return Number.isInteger(number) && number > 0;
};  

//check payment amount
const isValidAmount = (value) => {
    if(value === undefined || value === null || value === ""){
        return false;
    }
    const amount = Number(value);
    if(!Number.isFinite(amount) || amount < 0){
        return false;
    }

    //Decimal(10,2)
    if(amount > MAX_AMOUNT){
        return false;
    }

    //maximum 2 decimal places
    if(Math.round(amount * 100) !== amount * 100){
        return false;
    }
    return true;
};

//Normalize String
const normalizeString = (value)=>{
    if(value === undefined || value === null){
        return null;
    }
    return String(value).trim().toLowerCase();
};

//validate payment data
const validatePayment = async(data,isCreate = false, paymentId=null) =>{
    const {
        user_id, 
        booking_id,     
        membership_id,
        amount,
        payment_method,
        transaction_id,
        payment_status,
        notes
    }=data;

    //user validation
    if(isCreate || user_id !== undefined){
        if(user_id === undefined ||
            user_id === null ||
            user_id === ""){
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

    //Booking ID validation
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
            SELECT id
            FROM bookings
            WHERE id = ?
            `,
            [Number(booking_id)]
        );

        if (bookings.length === 0) {
            return "Invalid Booking ID";
        }
    }

    // MEMBERSHIP ID VALIDATION
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

    // AMOUNT VALIDATION
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
            if (Number(amount) > MAX_AMOUNT) {
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

    // PAYMENT METHOD VALIDATION
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

        if (!PAYMENT_METHODS.includes(normalizedMethod)) {
            return `Payment method must be one of: ${PAYMENT_METHODS.join(", ")}`;
        }
    }

    // TRANSACTION ID VALIDATION
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

        // Check unique transaction ID
        let query=`SELECT id FROM payments WHERE transaction_id=?`;
        
        const queryParams = [transactionId];
        
        //during update ignore the current payment itself
        if(paymentId !== null){
            query += ` And id !=?`;
            queryParams.push(paymentId);
        }

        const [existingTransactions] =
            await db.query(
                query,
                queryParams
            );

        if (existingTransactions.length > 0) {
            return "Transaction ID already exists";
        }
    }

    // PAYMENT STATUS VALIDATION   
    if (
        payment_status !== undefined &&
        payment_status !== null &&
        payment_status !== ""
    ) {
        const normalizedStatus =
            normalizeString(payment_status);

        if (!PAYMENT_STATUS.includes(normalizedStatus)) {
            return `Payment status must be one of: ${PAYMENT_STATUS.join(", ")}`;
        }
    }

    // NOTES VALIDATION
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

//GET ALL PAYMENTS
const getAllPayments = async(req,res)=>{
    try{
          const [payments] = await db.query(`
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
            ORDER BY p.id DESC
        `);

        return res.status(200).json({
            success: true,
            count: payments.length,
            data: payments
        });
    }catch(error){
        console.log("Get Payments Error:",error.message);
        return res.status(500).json({
            success:false,
            message:"Server error while fetching payments"
        });
    }
};

//Get Payment By ID
const getPaymentById = async(req,res)=>{
    try{
        const {id} = req.params;
        if(!isPositiveInteger(id)){
            return res.status(400).json({
                success:false,
                message:"Invalid Payment ID"
            });
        }

        const [payment] = await db.query(`
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
            `,
            [Number(id)]
            );

            if(payment.length === 0){
                return res.status(404).json({
                    success:false,
                    message:"Payment Not Found"
                });
            }
            
            return res.status(200).json({
                success:true,
                data:payment[0]
            });
    }catch(error){
        console.log("Get Payments By ID Error:",error.message);
        return res.status(500).json({
            success:false,
            message:"Server error while fetching payments BY ID"
        });
    }
};

//create payment
const createPayment = async(req,res)=>{
    try{
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

        // VALIDATE PAYMENT DATA
        const validationError =
            await validatePayment(
                req.body,
                true
            );

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError
            });
        }

        // NORMALIZE DATA
        const userId = Number(user_id);

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

        const paymentAmount = Number(amount);

        const paymentMethod =
            normalizeString(payment_method);

        const paymentStatus =
            payment_status === undefined ||
            payment_status === null ||
            payment_status === ""
                ? "pending"
                : normalizeString(payment_status);

        const transactionId =
            transaction_id === undefined ||
            transaction_id === null ||
            transaction_id === ""
                ? null
                : String(transaction_id).trim();

        const paymentNotes =
            notes === undefined ||
            notes === null ||
            notes === ""
                ? null
                : notes;

        // INSERT PAYMENT
        const [result] = await db.query(
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

        return res.status(201).json({
            success: true,
            message: "Payment Created Successfully",
            payment_id: result.insertId
        });

    }catch(error){
          console.error(
            "Create Payment Error:",
            error.message
        );

        // MySQL duplicate unique transaction_id
        if (error.code === "ER_DUP_ENTRY") {
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

//update payment
const updatePayment = async (req, res) => {
    try {

        const { id } = req.params;
        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Payment ID"
            });
        }

        const paymentId = Number(id);

        // CHECK PAYMENT EXISTS
        const [existingPayments] =
            await db.query(
                `
                SELECT *
                FROM payments
                WHERE id = ?
                `,
                [paymentId]
            );

        if (existingPayments.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Payment Not Found"
            });
        }

        // VALIDATE REQUEST DATA
        const validationError =
            await validatePayment(
                req.body,
                false,
                paymentId
            );

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError
            });
        }

        // ALLOWED FIELDS
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

        // BUILD DYNAMIC UPDATE
        allowedFields.forEach((field) => {
            if (
                Object.prototype.hasOwnProperty.call(
                    req.body,
                    field
                )
            ) 
            {
                let value = req.body[field];
                // NORMALIZE USER ID
                if (field === "user_id") {
                    value = Number(value);
                }

                // NORMALIZE BOOKING ID
                if (field === "booking_id") {
                    value =
                        value === null ||
                        value === ""
                            ? null
                            : Number(value);
                }

                // NORMALIZE MEMBERSHIP ID
                if (field === "membership_id") {
                    value =
                        value === null ||
                        value === ""
                            ? null
                            : Number(value);
                }

                // NORMALIZE AMOUNT
                if (field === "amount") {
                    value =
                        value === null ||
                        value === ""
                            ? null
                            : Number(value);
                }

                // NORMALIZE PAYMENT METHOD
                if (field === "payment_method") {
                    value =
                        normalizeString(value);
                }

                // NORMALIZE TRANSACTION ID
                if (field === "transaction_id") {
                    value =
                        value === null ||
                        value === ""
                            ? null
                            : String(value).trim();
                }

                // NORMALIZE PAYMENT STATUS
                if (field === "payment_status") {
                    value =
                        normalizeString(value);
                }

                // NORMALIZE NOTES
                if (field === "notes") {
                    value =
                        value === null ||
                        value === ""
                            ? null
                            : value;
                }

                updateFields.push(
                    `${field} = ?`
                );
                updateValues.push(value);
            }
        });

        // NO VALID FIELDS
        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message:
                    "No valid fields provided for update"
            });
        }

        // UPDATE DATABASE
        updateValues.push(paymentId);

        await db.query(
            `
            UPDATE payments
            SET ${updateFields.join(", ")}
            WHERE id = ?
            `,
            updateValues
        );

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

        if (error.code === "ER_DUP_ENTRY") {
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

//Delete Payment
const deletePayment = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Payment ID"
            });
        }

        const paymentId = Number(id);

        // CHECK PAYMENT EXISTS
        const [existingPayments] =
            await db.query(
                `
                SELECT id
                FROM payments
                WHERE id = ?
                `,
                [paymentId]
            );

        if (existingPayments.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Payment Not Found"
            });
        }

        // DELETE PAYMENT
        await db.query(
            `
            DELETE FROM payments
            WHERE id = ?
            `,
            [paymentId]
        );

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

module.exports = {
    getAllPayments,
    getPaymentById,
    createPayment,
    updatePayment,
    deletePayment
};
