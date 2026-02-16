const express = require("express");
const Database = require("../../database");

/**
 * Create status/health check router
 * @param {object} args Arguments
 * @returns {express.Router} Express router
 */
function createStatusRouter(args) {
    const router = express.Router();

    /**
     * @api {get} /api/v1/status/health Health check
     * @apiName GetHealth
     * @apiGroup Status
     * @apiDescription Check if the API is running and database is connected
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {String} status Status message
     * @apiSuccess {String} version Application version
     * @apiSuccess {String} database Database status
     */
    router.get("/health", async (req, res) => {
        try {
            const version = require("../../../package.json").version;
            let databaseStatus = "unknown";

            // Check database connection
            try {
                await Database.getDatabaseSize();
                databaseStatus = "connected";
            } catch (error) {
                databaseStatus = "error";
            }

            res.json({
                ok: true,
                status: "healthy",
                version: version,
                database: databaseStatus,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            console.error("Health check error:", error);
            res.status(500).json({
                ok: false,
                status: "error",
                msg: "Health check failed",
                error: error.message,
            });
        }
    });

    /**
     * @api {get} /api/v1/status/info API information
     * @apiName GetInfo
     * @apiGroup Status
     * @apiDescription Get API information and available endpoints
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {String} version Application version
     * @apiSuccess {Object} endpoints Available API endpoints
     */
    router.get("/info", (req, res) => {
        res.json({
            ok: true,
            version: require("../../../package.json").version,
            apiVersion: "v1",
            endpoints: {
                health: "/api/v1/status/health",
                monitors: "/api/v1/monitors",
                groups: "/api/v1/groups",
                tags: "/api/v1/tags",
            },
            documentation: "https://github.com/louislam/uptime-kuma",
        });
    });

    return router;
}

module.exports = {
    createStatusRouter,
};
