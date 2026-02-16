const express = require("express");

/**
 * Create tags router
 * @param {object} args Arguments
 * @returns {express.Router} Express router
 */
function createTagsRouter(args) {
    const router = express.Router();

    // TODO: Implement tag endpoints
    router.get("/", (req, res) => {
        res.json({
            ok: true,
            msg: "Tags endpoint - not yet implemented",
            tags: [],
        });
    });

    return router;
}

module.exports = {
    createTagsRouter,
};
