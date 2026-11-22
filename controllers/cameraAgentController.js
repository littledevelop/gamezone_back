
const cameraAgentService = require("../services/cameraAgentService");

// =====================================================
// CREATE CAMERA AGENT
// POST /api/camera-agents
// Admin only
// =====================================================

const createCameraAgent = async (req, res) => {
    try {
        const { deviceName, siteCode } = req.body;

        if (
            !deviceName ||
            typeof deviceName !== "string" ||
            !deviceName.trim()
        ) {
            return res.status(400).json({
                success: false,
                message: "Device name is required"
            });
        }

        const agent = await cameraAgentService.createCameraAgent({
            deviceName,
            siteCode
        });

        return res.status(201).json({
            success: true,
            message: "Camera Agent created successfully. Save the device token securely; it will not be displayed again.",
            data: agent
        });

    } catch (error) {
        console.error("Create Camera Agent Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to create Camera Agent"
        });
    }
};

// =====================================================
// GET ALL CAMERA AGENTS
// GET /api/camera-agents
// Admin and Staff
// =====================================================

const getAllCameraAgents = async (req, res) => {
    try {
        const agents = await cameraAgentService.getAllCameraAgents();

        return res.status(200).json({
            success: true,
            count: agents.length,
            data: agents
        });

    } catch (error) {
        console.error("Get Camera Agents Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch Camera Agents"
        });
    }
};

// =====================================================
// DISABLE CAMERA AGENT
// PATCH /api/camera-agents/:id/disable
// Admin only
// =====================================================

const disableCameraAgent = async (req, res) => {
    try {
        const agentId = Number(req.params.id);

        if (!Number.isSafeInteger(agentId) || agentId <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid Camera Agent ID"
            });
        }

        const disabled = await cameraAgentService.disableCameraAgent(agentId);

        if (!disabled) {
            return res.status(404).json({
                success: false,
                message: "Camera Agent not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Camera Agent disabled successfully"
        });

    } catch (error) {
        console.error("Disable Camera Agent Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to disable Camera Agent"
        });
    }
};

module.exports = {
    createCameraAgent,
    getAllCameraAgents,
    disableCameraAgent
};
