const express = require("express");

/**
 * Create monitors router
 * @param {object} args Arguments including io (socket.io instance)
 * @returns {express.Router} Express router
 */
function createMonitorsRouter(args) {
    const router = express.Router();

    // TODO: Implement monitor endpoints
    router.get("/", (req, res) => {
        res.json({
            ok: true,
            msg: "Monitors endpoint - not yet implemented",
            monitors: [],
        });
    });

    return router;
}

module.exports = {
    createMonitorsRouter,
};
