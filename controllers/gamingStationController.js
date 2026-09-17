const db = require("../config/db");


// GET ALL GAMING STATIONS
const getAllGamingStations = async (req, res) => {

    try {

        const [gamingStations] = await db.query(`
            SELECT
                gs.id,
                gs.station_name,
                gs.platform_id,
                p.name AS platform_name,
                gs.status,
                gs.current_player_id,
                u.full_name AS current_player_name,
                gs.ip_address,
                gs.maintenance_date,
                gs.location,
                gs.notes,
                gs.created_at,
                gs.updated_at
            FROM gaming_stations gs
            INNER JOIN platforms p
                ON gs.platform_id = p.id
            LEFT JOIN users u
                ON gs.current_player_id = u.id
            ORDER BY gs.id DESC
        `);

        return res.status(200).json({
            success: true,
            data: gamingStations
        });

    } catch (error) {

        console.log(
            "Getting ALL Gaming Stations Error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};



// GET GAMING STATION BY ID
const getGamingStationById = async (req, res) => {

    try {

        const { id } = req.params;

        const [gamingStation] = await db.query(`
            SELECT
                gs.id,
                gs.station_name,
                gs.platform_id,
                p.name AS platform_name,
                gs.status,
                gs.current_player_id,
                u.full_name AS current_player_name,
                gs.ip_address,
                gs.maintenance_date,
                gs.location,
                gs.notes,
                gs.created_at,
                gs.updated_at
            FROM gaming_stations gs
            INNER JOIN platforms p
                ON gs.platform_id = p.id
            LEFT JOIN users u
                ON gs.current_player_id = u.id
            WHERE gs.id = ?
        `, [id]);

        if (gamingStation.length === 0) {

            return res.status(404).json({
                success: false,
                message: "Gaming Station Not Found"
            });
        }

        return res.status(200).json({
            success: true,
            data: gamingStation[0]
        });

    } catch (error) {

        console.log(
            "Getting Gaming Station By ID Error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};



// COMMON VALIDATION
const validateGamingStation = async (data, stationId = null) => {

    const {
        station_name,
        platform_id,
        status,
        current_player_id,
        maintenance_date
    } = data;


    // STATION NAME VALIDATION
    if (station_name !== undefined) {

        const stationName = String(station_name).trim();

        if (stationName === "") {
            return "station_name cannot be empty";
        }


        // DUPLICATE STATION NAME
        const [existingStation] = await db.query(
            `
            SELECT id
            FROM gaming_stations
            WHERE station_name = ?
            AND id != ?
            `,
            [stationName, stationId || 0]
        );

        if (existingStation.length > 0) {
            return "Gaming Station with this name already exists";
        }
    }


    // PLATFORM VALIDATION
    if (platform_id !== undefined) {

        const platformId = Number(platform_id);

        if (!Number.isInteger(platformId) || platformId <= 0) {
            return "platform_id must be a valid positive integer";
        }


        const [platform] = await db.query(
            `SELECT id FROM platforms WHERE id = ?`,
            [platformId]
        );

        if (platform.length === 0) {
            return "platform_id does not exist";
        }
    }


    // STATUS VALIDATION
    if (status !== undefined) {

        const stationStatus =
            String(status).trim().toLowerCase();

        const validStatuses = [
            "available",
            "occupied",
            "maintenance",
            "inactive"
        ];

        if (!validStatuses.includes(stationStatus)) {

            return "status must be one of the following: available, occupied, maintenance, inactive";
        }
    }


    // CURRENT PLAYER VALIDATION
    if (
        current_player_id !== undefined &&
        current_player_id !== null &&
        current_player_id !== ""
    ) {

        const playerId = Number(current_player_id);

        if (!Number.isInteger(playerId) || playerId <= 0) {

            return "current_player_id must be a valid positive integer";
        }


        // Check player exists and has Player role
        const [player] = await db.query(
            `
            SELECT u.id
            FROM users u
            INNER JOIN roles r
                ON u.role_id = r.id
            WHERE u.id = ?
            AND r.role_name = 'Player'
            `,
            [playerId]
        );

        if (player.length === 0) {
            return "current_player_id does not exist or is not a Player";
        }
    }


    // MAINTENANCE DATE VALIDATION
    if (
        maintenance_date !== undefined &&
        maintenance_date !== null &&
        maintenance_date !== ""
    ) {

        if (!/^\d{4}-\d{2}-\d{2}$/.test(maintenance_date)) {

            return "maintenance_date must be in YYYY-MM-DD format";
        }

        const date = new Date(`${maintenance_date}T00:00:00`);

        if (
            Number.isNaN(date.getTime()) ||
            date.toISOString().slice(0, 10) !== maintenance_date
        ) {

            return "maintenance_date is not a valid date";
        }
    }


    return null;
};



// CREATE GAMING STATION
const createGamingStation = async (req, res) => {

    try {

        const {
            station_name,
            platform_id,
            status,
            current_player_id,
            ip_address,
            maintenance_date,
            location,
            notes
        } = req.body;


        // REQUIRED FIELDS
        if (
            station_name === undefined ||
            platform_id === undefined
        ) {

            return res.status(400).json({
                success: false,
                message: "station_name and platform_id are required fields"
            });
        }


        // COMMON VALIDATION
        const error = await validateGamingStation(req.body);

        if (error) {

            return res.status(400).json({
                success: false,
                message: error
            });
        }


        // PREPARE VALUES
        const stationName =
            String(station_name).trim();

        const platformId =
            Number(platform_id);

        const stationStatus =
            status !== undefined
                ? String(status).trim().toLowerCase()
                : "available";

        const currentPlayerId =
            current_player_id !== undefined &&
            current_player_id !== null &&
            current_player_id !== ""
                ? Number(current_player_id)
                : null;


        // BUSINESS RULE
        // Occupied station must have a player
        if (
            stationStatus === "occupied" &&
            currentPlayerId === null
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "current_player_id is required for occupied stations"
            });
        }


        // Non-occupied station must not have a player
        if (
            stationStatus !== "occupied" &&
            currentPlayerId !== null
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "current_player_id should be empty when station is not occupied"
            });
        }


        // INSERT
        const [result] = await db.query(
            `
            INSERT INTO gaming_stations
            (
                station_name,
                platform_id,
                status,
                current_player_id,
                ip_address,
                maintenance_date,
                location,
                notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                stationName,
                platformId,
                stationStatus,
                currentPlayerId,
                ip_address || null,
                maintenance_date || null,
                location || null,
                notes || null
            ]
        );


        return res.status(201).json({
            success: true,
            message: "Gaming Station Created Successfully",
            gamingStation_id: result.insertId
        });

    } catch (error) {

        console.log(
            "Creating Gaming Station Error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};



// UPDATE GAMING STATION
const updateGamingStation = async (req, res) => {

    try {

        const { id } = req.params;


        // CHECK GAMING STATION EXISTS
        const [existingStation] = await db.query(
            `
            SELECT *
            FROM gaming_stations
            WHERE id = ?
            `,
            [id]
        );


        if (existingStation.length === 0) {

            return res.status(404).json({
                success: false,
                message: "Gaming Station Not Found"
            });
        }


        const currentStation = existingStation[0];


        // COMMON VALIDATION
        const error = await validateGamingStation(
            req.body,
            currentStation.id
        );


        if (error) {

            return res.status(400).json({
                success: false,
                message: error
            });
        }


        // EFFECTIVE STATUS
        const newStatus =
            req.body.status !== undefined
                ? String(req.body.status).trim().toLowerCase()
                : currentStation.status;


        // EFFECTIVE PLAYER
        let newPlayerId;

        if (req.body.current_player_id !== undefined) {

            newPlayerId =
                req.body.current_player_id === null ||
                req.body.current_player_id === ""
                    ? null
                    : Number(req.body.current_player_id);

        } else {

            newPlayerId =
                currentStation.current_player_id;
        }


        // BUSINESS RULE
        // Occupied → player required
        if (
            newStatus === "occupied" &&
            newPlayerId === null
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "current_player_id is required when station is occupied"
            });
        }


        // Non-occupied → player must be empty
        if (
            newStatus !== "occupied" &&
            newPlayerId !== null
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "current_player_id should be empty when station is not occupied"
            });
        }


        // ALLOWED FIELDS
        const allowedFields = [
            "station_name",
            "platform_id",
            "status",
            "current_player_id",
            "ip_address",
            "maintenance_date",
            "location",
            "notes"
        ];


        const fields = [];
        const values = [];


        for (const field of allowedFields) {

            if (req.body[field] !== undefined) {

                fields.push(`${field} = ?`);


                let value = req.body[field];


                // Normalize values
                if (field === "station_name") {

                    value = String(value).trim();

                } else if (field === "platform_id") {

                    value = Number(value);

                } else if (field === "status") {

                    value = String(value).trim().toLowerCase();

                } else if (field === "current_player_id") {

                    value =
                        value === null || value === ""
                            ? null
                            : Number(value);

                } else if (
                    field === "ip_address" ||
                    field === "maintenance_date" ||
                    field === "location" ||
                    field === "notes"
                ) {

                    value =
                        value === ""
                            ? null
                            : value;
                }


                values.push(value);
            }
        }


        // NO VALID FIELDS
        if (fields.length === 0) {

            return res.status(400).json({
                success: false,
                message: "No valid fields provided for update"
            });
        }


        values.push(id);


        // UPDATE
        await db.query(
            `
            UPDATE gaming_stations
            SET ${fields.join(", ")}
            WHERE id = ?
            `,
            values
        );


        return res.status(200).json({
            success: true,
            message: "Gaming Station Updated Successfully"
        });

    } catch (error) {

        console.log(
            "Updating Gaming Station Error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};



// DELETE GAMING STATION
const deleteGamingStation = async (req, res) => {

    try {

        const { id } = req.params;


        // CHECK GAMING STATION EXISTS
        const [existingStation] = await db.query(
            `
            SELECT id
            FROM gaming_stations
            WHERE id = ?
            `,
            [id]
        );


        if (existingStation.length === 0) {

            return res.status(404).json({
                success: false,
                message: "Gaming Station Not Found"
            });
        }


        // CHECK BOOKINGS
        const [bookings] = await db.query(
            `
            SELECT id
            FROM bookings
            WHERE station_id = ?
            LIMIT 1
            `,
            [id]
        );


        if (bookings.length > 0) {

            return res.status(409).json({
                success: false,
                message:
                    "Cannot delete gaming station because it is being used by existing bookings"
            });
        }


        // CHECK GAME SESSIONS
        const [sessions] = await db.query(
            `
            SELECT id
            FROM game_sessions
            WHERE station_id = ?
            LIMIT 1
            `,
            [id]
        );


        if (sessions.length > 0) {

            return res.status(409).json({
                success: false,
                message:
                    "Cannot delete gaming station because it is being used by existing game sessions"
            });
        }


        // DELETE GAMING STATION
        await db.query(
            `
            DELETE FROM gaming_stations
            WHERE id = ?
            `,
            [id]
        );


        return res.status(200).json({
            success: true,
            message: "Gaming Station Deleted Successfully"
        });

    } catch (error) {

        console.log(
            "Gaming Station Deletion Error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message:
                "Server Error while Deleting the Gaming Station"
        });
    }
};



module.exports = {
    getAllGamingStations,
    getGamingStationById,
    createGamingStation,
    updateGamingStation,
    deleteGamingStation
};