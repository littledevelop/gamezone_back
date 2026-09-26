const db = require("../config/db");


// =====================================================
// GET ALL CAMERAS
// =====================================================

const getAllCameras = async (req, res) => {

    try {

        const [cameras] = await db.query(`
            SELECT
                c.id,
                c.camera_name,
                c.camera_code,
                c.gaming_station_id,
                gs.station_name,
                c.ip_address,
                c.camera_type,
                c.status,
                c.location,
                c.notes,
                c.created_at,
                c.updated_at
            FROM cameras c
            INNER JOIN gaming_stations gs
                ON c.gaming_station_id = gs.id
            ORDER BY c.id DESC
        `);

        return res.status(200).json({
            success: true,
            data: cameras
        });

    } catch (error) {

        console.log(
            "Getting ALL Cameras Error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};



// =====================================================
// GET CAMERA BY ID
// =====================================================

const getCameraById = async (req, res) => {

    try {

        const { id } = req.params;

        const [camera] = await db.query(`
            SELECT
                c.id,
                c.camera_name,
                c.camera_code,
                c.gaming_station_id,
                gs.station_name,
                c.ip_address,
                c.camera_type,
                c.status,
                c.location,
                c.notes,
                c.created_at,
                c.updated_at
            FROM cameras c
            INNER JOIN gaming_stations gs
                ON c.gaming_station_id = gs.id
            WHERE c.id = ?
        `, [id]);

        if (camera.length === 0) {

            return res.status(404).json({
                success: false,
                message: "Camera Not Found"
            });
        }

        return res.status(200).json({
            success: true,
            data: camera[0]
        });

    } catch (error) {

        console.log(
            "Getting Camera By ID Error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};



// =====================================================
// COMMON VALIDATION
// =====================================================

const validateCamera = async (data, cameraId = null) => {

    const {
        camera_name,
        camera_code,
        gaming_station_id,
        camera_type,
        status
    } = data;


    // CAMERA NAME VALIDATION
    if (camera_name !== undefined) {

        const cameraName =
            String(camera_name).trim();

        if (cameraName === "") {
            return "camera_name cannot be empty";
        }
    }


    // CAMERA CODE VALIDATION
    if (
        camera_code !== undefined &&
        camera_code !== null &&
        camera_code !== ""
    ) {

        const cameraCode =
            String(camera_code).trim();

        const [existingCamera] = await db.query(
            `
            SELECT id
            FROM cameras
            WHERE camera_code = ?
            AND id != ?
            `,
            [
                cameraCode,
                cameraId || 0
            ]
        );

        if (existingCamera.length > 0) {

            return "Camera with this code already exists";
        }
    }


    // GAMING STATION VALIDATION
    if (gaming_station_id !== undefined) {

        const stationId =
            Number(gaming_station_id);

        if (
            !Number.isInteger(stationId) ||
            stationId <= 0
        ) {

            return "gaming_station_id must be a valid positive integer";
        }

        const [station] = await db.query(
            `
            SELECT id
            FROM gaming_stations
            WHERE id = ?
            `,
            [stationId]
        );

        if (station.length === 0) {

            return "gaming_station_id does not exist";
        }
    }


    // CAMERA TYPE VALIDATION
    if (camera_type !== undefined) {

        const cameraType =
            String(camera_type).trim().toLowerCase();

        const validTypes = [
            "fixed",
            "ptz",
            "webcam"
        ];

        if (!validTypes.includes(cameraType)) {

            return "camera_type must be one of the following: fixed, ptz, webcam";
        }
    }


    // STATUS VALIDATION
    if (status !== undefined) {

        const cameraStatus =
            String(status).trim().toLowerCase();

        const validStatuses = [
            "active",
            "inactive",
            "maintenance"
        ];

        if (!validStatuses.includes(cameraStatus)) {

            return "status must be one of the following: active, inactive, maintenance";
        }
    }


    return null;
};



// =====================================================
// CREATE CAMERA
// =====================================================

const createCamera = async (req, res) => {

    try {

        const {
            camera_name,
            camera_code,
            gaming_station_id,
            ip_address,
            camera_type,
            status,
            location,
            notes
        } = req.body;


        // REQUIRED FIELDS
        if (
            camera_name === undefined ||
            gaming_station_id === undefined
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "camera_name and gaming_station_id are required fields"
            });
        }


        // COMMON VALIDATION
        const error =
            await validateCamera(req.body);

        if (error) {

            return res.status(400).json({
                success: false,
                message: error
            });
        }


        // PREPARE VALUES
        const cameraName =
            String(camera_name).trim();

        const cameraCode =
            camera_code !== undefined &&
            camera_code !== null &&
            camera_code !== ""
                ? String(camera_code).trim()
                : null;

        const stationId =
            Number(gaming_station_id);

        const cameraType =
            camera_type !== undefined
                ? String(camera_type).trim().toLowerCase()
                : "fixed";

        const cameraStatus =
            status !== undefined
                ? String(status).trim().toLowerCase()
                : "active";


        // INSERT CAMERA
        const [result] = await db.query(
            `
            INSERT INTO cameras
            (
                camera_name,
                camera_code,
                gaming_station_id,
                ip_address,
                camera_type,
                status,
                location,
                notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                cameraName,
                cameraCode,
                stationId,
                ip_address || null,
                cameraType,
                cameraStatus,
                location || null,
                notes || null
            ]
        );


        return res.status(201).json({
            success: true,
            message: "Camera Created Successfully",
            camera_id: result.insertId
        });

    } catch (error) {

        console.log(
            "Creating Camera Error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};



// =====================================================
// UPDATE CAMERA
// =====================================================

const updateCamera = async (req, res) => {

    try {

        const { id } = req.params;


        // CHECK CAMERA EXISTS
        const [existingCamera] = await db.query(
            `
            SELECT *
            FROM cameras
            WHERE id = ?
            `,
            [id]
        );


        if (existingCamera.length === 0) {

            return res.status(404).json({
                success: false,
                message: "Camera Not Found"
            });
        }


        const currentCamera =
            existingCamera[0];


        // COMMON VALIDATION
        const error =
            await validateCamera(
                req.body,
                currentCamera.id
            );


        if (error) {

            return res.status(400).json({
                success: false,
                message: error
            });
        }


        // ALLOWED FIELDS
        const allowedFields = [
            "camera_name",
            "camera_code",
            "gaming_station_id",
            "ip_address",
            "camera_type",
            "status",
            "location",
            "notes"
        ];


        const fields = [];
        const values = [];


        for (const field of allowedFields) {

            if (req.body[field] !== undefined) {

                fields.push(
                    `${field} = ?`
                );

                let value =
                    req.body[field];


                // NORMALIZE VALUES
                if (field === "camera_name") {

                    value =
                        String(value).trim();

                } else if (
                    field === "camera_code"
                ) {

                    value =
                        value === null ||
                        value === ""
                            ? null
                            : String(value).trim();

                } else if (
                    field === "gaming_station_id"
                ) {

                    value =
                        Number(value);

                } else if (
                    field === "camera_type"
                ) {

                    value =
                        String(value)
                            .trim()
                            .toLowerCase();

                } else if (
                    field === "status"
                ) {

                    value =
                        String(value)
                            .trim()
                            .toLowerCase();

                } else if (
                    field === "ip_address" ||
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
                message:
                    "No valid fields provided for update"
            });
        }


        values.push(id);


        // UPDATE CAMERA
        await db.query(
            `
            UPDATE cameras
            SET ${fields.join(", ")}
            WHERE id = ?
            `,
            values
        );


        return res.status(200).json({
            success: true,
            message: "Camera Updated Successfully"
        });

    } catch (error) {

        console.log(
            "Updating Camera Error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};



// =====================================================
// DELETE CAMERA
// =====================================================

const deleteCamera = async (req, res) => {

    try {

        const { id } = req.params;


        // CHECK CAMERA EXISTS
        const [existingCamera] = await db.query(
            `
            SELECT id
            FROM cameras
            WHERE id = ?
            `,
            [id]
        );


        if (existingCamera.length === 0) {

            return res.status(404).json({
                success: false,
                message: "Camera Not Found"
            });
        }


        // CHECK VIDEO RECORDINGS
        const [recordings] = await db.query(
            `
            SELECT id
            FROM video_recordings
            WHERE camera_id = ?
            LIMIT 1
            `,
            [id]
        );


        if (recordings.length > 0) {

            return res.status(409).json({
                success: false,
                message:
                    "Cannot delete camera because it is being used by existing video recordings"
            });
        }


        // DELETE CAMERA
        await db.query(
            `
            DELETE FROM cameras
            WHERE id = ?
            `,
            [id]
        );


        return res.status(200).json({
            success: true,
            message: "Camera Deleted Successfully"
        });

    } catch (error) {

        console.log(
            "Camera Deletion Error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message:
                "Server Error while Deleting the Camera"
        });
    }
};



module.exports = {
    getAllCameras,
    getCameraById,
    createCamera,
    updateCamera,
    deleteCamera
};