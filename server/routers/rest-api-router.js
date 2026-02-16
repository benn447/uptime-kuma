const express = require("express");
const { apiAuth } = require("../middleware/api-auth");

/**
 * Create and configure the REST API router
 * All routes under /api/v1/* are handled here
 * @param {object} args Arguments including io (socket.io instance)
 * @returns {express.Router} Configured Express router
 */
function createRESTAPIRouter(args) {
    const router = express.Router();

    // Middleware for JSON parsing (if not already applied globally)
    router.use(express.json());

    // Import sub-routers
    const monitorsRouter = require("./api/monitors");
    const groupsRouter = require("./api/groups");
    const tagsRouter = require("./api/tags");
    const statusRouter = require("./api/status");

    // Mount sub-routers (all require authentication except status)
    router.use("/monitors", apiAuth, monitorsRouter.createMonitorsRouter(args));
    router.use("/groups", apiAuth, groupsRouter.createGroupsRouter(args));
    router.use("/tags", apiAuth, tagsRouter.createTagsRouter(args));
    router.use("/status", statusRouter.createStatusRouter(args)); // Health check doesn't require auth

    // API root endpoint
    router.get("/", (req, res) => {
        res.json({
            ok: true,
            msg: "Uptime Kuma REST API",
            version: require("../../package.json").version,
            endpoints: {
                monitors: "/api/v1/monitors",
                groups: "/api/v1/groups",
                tags: "/api/v1/tags",
                status: "/api/v1/status",
            },
        });
    });

    return router;
}

module.exports = {
    createRESTAPIRouter,
};
