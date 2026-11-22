
const db = require("../config/db");
const WebSocket = require("ws");
const crypto = require("crypto");
const { EventEmitter } = require("events");

const connectedAgents = new Map();
const agentEvents = new EventEmitter();

const AGENT_WS_PATH = "/camera-agent";
const MAX_MESSAGE_SIZE = 16 * 1024;
const HEARTBEAT_INTERVAL = 30000;

// =====================================================
// TOKEN UTILITIES
// =====================================================

const generateDeviceToken = () => {
    return crypto.randomBytes(32).toString("hex");
};

const hashDeviceToken = (token) => {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
};

const safeCompare = (value1, value2) => {
    if (
        typeof value1 !== "string" ||
        typeof value2 !== "string"
    ) {
        return false;
    }

    const buffer1 = Buffer.from(value1);
    const buffer2 = Buffer.from(value2);

    if (buffer1.length !== buffer2.length) {
        return false;
    }

    return crypto.timingSafeEqual(buffer1, buffer2);
};

// =====================================================
// CREATE CAMERA AGENT
// Called later by an Admin-only API
// =====================================================

const createCameraAgent = async ({
    deviceName,
    siteCode = "ZESTOPIA-SURAT"
}) => {
    if (
        !deviceName ||
        typeof deviceName !== "string" ||
        !deviceName.trim()
    ) {
        throw new Error("Device name is required");
    }

    const deviceUuid = crypto.randomUUID();
    const deviceToken = generateDeviceToken();
    const deviceTokenHash = hashDeviceToken(deviceToken);

    const [result] = await db.query(
        `INSERT INTO camera_agents
        (
            device_uuid,
            device_name,
            site_code,
            device_token_hash,
            status
        )
        VALUES (?, ?, ?, ?, 'active')`,
        [
            deviceUuid,
            deviceName.trim(),
            siteCode,
            deviceTokenHash
        ]
    );

    return {
        id: result.insertId,
        deviceUuid,
        deviceName: deviceName.trim(),
        siteCode,
        deviceToken
    };
};

// =====================================================
// GET ALL CAMERA AGENTS
// Never return stored token hashes
// =====================================================

const getAllCameraAgents = async () => {
    const [rows] = await db.query(
        `SELECT
            id,
            device_uuid,
            device_name,
            site_code,
            status,
            last_seen_at,
            created_at,
            updated_at
         FROM camera_agents
         ORDER BY id DESC`
    );

    return rows.map((agent) => ({
        ...agent,
        isOnline: connectedAgents.has(agent.id)
    }));
};

// =====================================================
// DISABLE CAMERA AGENT
// =====================================================

const disableCameraAgent = async (agentId) => {
    const [result] = await db.query(
        `UPDATE camera_agents
         SET status = 'disabled'
         WHERE id = ?`,
        [agentId]
    );

    const socket = connectedAgents.get(Number(agentId));

    if (socket) {
        socket.close(1008, "Agent disabled");
        connectedAgents.delete(Number(agentId));
    }

    return result.affectedRows > 0;
};

// =====================================================
// AUTHENTICATE CONNECTED WINDOWS AGENT
// =====================================================

const authenticateAgent = async (deviceUuid, deviceToken) => {
    if (
        typeof deviceUuid !== "string" ||
        typeof deviceToken !== "string"
    ) {
        return null;
    }

    const [rows] = await db.query(
        `SELECT
            id,
            device_uuid,
            device_name,
            site_code,
            device_token_hash,
            status
         FROM camera_agents
         WHERE device_uuid = ?
         LIMIT 1`,
        [deviceUuid]
    );

    if (!rows.length) {
        return null;
    }

    const agent = rows[0];

    if (agent.status !== "active") {
        return null;
    }

    const suppliedHash = hashDeviceToken(deviceToken);

    if (!safeCompare(suppliedHash, agent.device_token_hash)) {
        return null;
    }

    return {
        id: agent.id,
        deviceUuid: agent.device_uuid,
        deviceName: agent.device_name,
        siteCode: agent.site_code
    };
};

// =====================================================
// UPDATE AGENT LAST SEEN
// =====================================================

const updateAgentLastSeen = async (agentId) => {
    await db.query(
        `UPDATE camera_agents
         SET last_seen_at = NOW()
         WHERE id = ? AND status = 'active'`,
        [agentId]
    );
};

// =====================================================
// SEND MESSAGE TO A CONNECTED AGENT
// =====================================================

const sendCommandToAgent = (agentId, command) => {
    const socket = connectedAgents.get(Number(agentId));

    if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
    }

    socket.send(JSON.stringify(command));

    return true;
};

// =====================================================
// GET ONLINE AGENT IDs
// =====================================================

const getOnlineAgentIds = () => {
    return Array.from(connectedAgents.keys());
};

// =====================================================
// INITIALIZE WEBSOCKET SERVER
// Attach this to the existing HTTP server in a later step
// =====================================================

const initializeCameraAgentWebSocket = (httpServer) => {
    const wss = new WebSocket.Server({
        noServer: true,
        maxPayload: MAX_MESSAGE_SIZE
    });

    httpServer.on("upgrade", (request, socket, head) => {
        let pathname;

        try {
            pathname = new URL(
                request.url,
                `http://${request.headers.host}`
            ).pathname;
        } catch (error) {
            socket.destroy();
            return;
        }

        if (pathname !== AGENT_WS_PATH) {
            return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit("connection", ws, request);
        });
    });

    wss.on("connection", (ws) => {
        let authenticatedAgent = null;

        const authenticationTimeout = setTimeout(() => {
            if (!authenticatedAgent) {
                ws.close(1008, "Authentication timeout");
            }
        }, 10000);

        ws.on("message", async (rawMessage) => {
            let message;

            try {
                message = JSON.parse(rawMessage.toString());
            } catch (error) {
                ws.close(1007, "Invalid JSON message");
                return;
            }

            // First message must authenticate the device.
            if (!authenticatedAgent) {
                if (message.type !== "authenticate") {
                    ws.close(1008, "Authentication required");
                    return;
                }

                try {
                    const agent = await authenticateAgent(
                        message.deviceUuid,
                        message.deviceToken
                    );

                    if (!agent) {
                        ws.close(1008, "Invalid device credentials");
                        return;
                    }

                    authenticatedAgent = agent;

                    clearTimeout(authenticationTimeout);

                    const previousSocket = connectedAgents.get(agent.id);

                    connectedAgents.set(agent.id, ws);

                    if (
                        previousSocket &&
                        previousSocket !== ws
                    ) {
                        previousSocket.close(
                            1000,
                            "Replaced by a newer connection"
                        );
                    }

                    await updateAgentLastSeen(agent.id);

                    ws.send(JSON.stringify({
                        type: "authenticated",
                        success: true,
                        agentId: agent.id,
                        deviceName: agent.deviceName
                    }));

                    console.log(
                        `Camera Agent connected: ${agent.deviceName} (ID: ${agent.id})`
                    );
                } catch (error) {
                    console.error(
                        "Camera Agent authentication error:",
                        error.message
                    );

                    ws.close(1011, "Authentication failed");
                }

                return;
            }

            // Only accept supported message types.
            if (message.type === "heartbeat") {
                try {
                    await updateAgentLastSeen(authenticatedAgent.id);

                    ws.send(JSON.stringify({
                        type: "heartbeat_ack"
                    }));
                } catch (error) {
                    console.error(
                        "Camera Agent heartbeat error:",
                        error.message
                    );
                }

                return;
            }

            if (message.type === "command_result") {
                agentEvents.emit("command_result", {
                    agentId: authenticatedAgent.id,
                    message
                });

                return;
            }

            console.warn(
                `Unsupported message from Camera Agent ${authenticatedAgent.id}`
            );
        });

        ws.on("close", () => {
            clearTimeout(authenticationTimeout);

            if (
                authenticatedAgent &&
                connectedAgents.get(authenticatedAgent.id) === ws
            ) {
                connectedAgents.delete(authenticatedAgent.id);

                console.log(
                    `Camera Agent disconnected: ${authenticatedAgent.deviceName}`
                );
            }
        });

        ws.on("error", (error) => {
            console.error(
                "Camera Agent WebSocket error:",
                error.message
            );
        });
    });

    // Check WebSocket connections periodically.
    const heartbeatTimer = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) {
                ws.terminate();
                return;
            }

            ws.isAlive = false;
            ws.ping();
        });
    }, HEARTBEAT_INTERVAL);

    wss.on("connection", (ws) => {
        ws.isAlive = true;

        ws.on("pong", () => {
            ws.isAlive = true;
        });
    });

    wss.on("close", () => {
        clearInterval(heartbeatTimer);
    });

    console.log("Camera Agent WebSocket service initialized");

    return wss;
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    createCameraAgent,
    getAllCameraAgents,
    disableCameraAgent,
    initializeCameraAgentWebSocket,
    sendCommandToAgent,
    getOnlineAgentIds,
    agentEvents
};
