const express = require("express");

/**
 * Create groups router
 * @param {object} args Arguments
 * @returns {express.Router} Express router
 */
function createGroupsRouter(args) {
    const router = express.Router();

    // TODO: Implement group endpoints
    router.get("/", (req, res) => {
        res.json({
            ok: true,
            msg: "Groups endpoint - not yet implemented",
            groups: [],
        });
    });

    return router;
}

module.exports = {
    createGroupsRouter,
};
