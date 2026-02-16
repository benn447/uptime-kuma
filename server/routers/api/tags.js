const express = require("express");
const { R } = require("redbean-node");
const { log } = require("../../../src/util");

/**
 * Create tags router
 * Tags are key-value labels that can be attached to monitors
 * @param {object} args Arguments
 * @returns {express.Router} Express router
 */
function createTagsRouter(args) {
    const router = express.Router();

    // Get UptimeKumaServer instance
    const { UptimeKumaServer } = require("../../uptime-kuma-server");
    const server = UptimeKumaServer.getInstance();

    /**
     * @api {get} /api/v1/tags List all tags
     * @apiName GetTags
     * @apiGroup Tags
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {Object[]} tags List of tags
     */
    router.get("/", async (req, res) => {
        try {
            // Tags are global, not user-specific in Uptime Kuma
            const tags = await R.findAll("tag", " ORDER BY name ");

            res.json({
                ok: true,
                tags: tags.map(tag => tag.toJSON()),
            });
        } catch (error) {
            log.error("api", `Error listing tags: ${error.message}`);
            res.status(500).json({
                ok: false,
                msg: error.message,
                error: "LIST_TAGS_ERROR",
            });
        }
    });

    /**
     * @api {get} /api/v1/tags/:id Get a tag
     * @apiName GetTag
     * @apiGroup Tags
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiParam {Number} id Tag ID
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {Object} tag Tag details
     */
    router.get("/:id", async (req, res) => {
        try {
            const tagId = parseInt(req.params.id);

            const tag = await R.findOne("tag", " id = ? ", [ tagId ]);

            if (!tag) {
                return res.status(404).json({
                    ok: false,
                    msg: "Tag not found",
                    error: "TAG_NOT_FOUND",
                });
            }

            res.json({
                ok: true,
                tag: tag.toJSON(),
            });
        } catch (error) {
            log.error("api", `Error getting tag: ${error.message}`);
            res.status(500).json({
                ok: false,
                msg: error.message,
                error: "GET_TAG_ERROR",
            });
        }
    });

    /**
     * @api {post} /api/v1/tags Create a tag
     * @apiName CreateTag
     * @apiGroup Tags
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiBody {String} name Tag name (key)
     * @apiBody {String} color Tag color (hex color code)
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {Object} tag Created tag
     * @apiSuccess {Number} tag.id Tag ID
     * @apiSuccess {String} tag.name Tag name
     * @apiSuccess {String} tag.color Tag color
     */
    router.post("/", async (req, res) => {
        try {
            const { name, color } = req.body;

            // Validate required fields
            if (!name) {
                return res.status(400).json({
                    ok: false,
                    msg: "Tag name is required",
                    error: "VALIDATION_ERROR",
                });
            }

            if (!color) {
                return res.status(400).json({
                    ok: false,
                    msg: "Tag color is required",
                    error: "VALIDATION_ERROR",
                });
            }

            // Check if tag with same name already exists
            const existingTag = await R.findOne("tag", " name = ? ", [ name ]);
            if (existingTag) {
                return res.status(400).json({
                    ok: false,
                    msg: "Tag with this name already exists",
                    error: "TAG_EXISTS",
                });
            }

            // Create new tag
            let bean = R.dispense("tag");
            bean.name = name;
            bean.color = color;
            await R.store(bean);

            log.info("api", `Created Tag: ${bean.id} Name: ${name}`);

            res.status(201).json({
                ok: true,
                tag: bean.toJSON(),
            });
        } catch (error) {
            log.error("api", `Error creating tag: ${error.message}`);
            res.status(400).json({
                ok: false,
                msg: error.message,
                error: "CREATE_TAG_ERROR",
            });
        }
    });

    /**
     * @api {put} /api/v1/tags/:id Update a tag
     * @apiName UpdateTag
     * @apiGroup Tags
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiParam {Number} id Tag ID
     * @apiBody {String} [name] Tag name
     * @apiBody {String} [color] Tag color
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {Object} tag Updated tag
     */
    router.put("/:id", async (req, res) => {
        try {
            const tagId = parseInt(req.params.id);
            const { name, color } = req.body;

            // Get existing tag
            let bean = await R.findOne("tag", " id = ? ", [ tagId ]);

            if (!bean) {
                return res.status(404).json({
                    ok: false,
                    msg: "Tag not found",
                    error: "TAG_NOT_FOUND",
                });
            }

            // Check if new name conflicts with existing tag
            if (name && name !== bean.name) {
                const existingTag = await R.findOne("tag", " name = ? AND id != ? ", [ name, tagId ]);
                if (existingTag) {
                    return res.status(400).json({
                        ok: false,
                        msg: "Tag with this name already exists",
                        error: "TAG_EXISTS",
                    });
                }
            }

            // Update properties
            if (name !== undefined) {
                bean.name = name;
            }
            if (color !== undefined) {
                bean.color = color;
            }

            // Save to database
            await R.store(bean);

            log.info("api", `Updated Tag: ${bean.id}`);

            res.json({
                ok: true,
                tag: bean.toJSON(),
            });
        } catch (error) {
            log.error("api", `Error updating tag: ${error.message}`);
            res.status(400).json({
                ok: false,
                msg: error.message,
                error: "UPDATE_TAG_ERROR",
            });
        }
    });

    /**
     * @api {delete} /api/v1/tags/:id Delete a tag
     * @apiName DeleteTag
     * @apiGroup Tags
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiParam {Number} id Tag ID
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {String} msg Success message
     */
    router.delete("/:id", async (req, res) => {
        try {
            const tagId = parseInt(req.params.id);

            // Check if tag exists
            const tag = await R.findOne("tag", " id = ? ", [ tagId ]);

            if (!tag) {
                return res.status(404).json({
                    ok: false,
                    msg: "Tag not found",
                    error: "TAG_NOT_FOUND",
                });
            }

            // Delete tag (monitor_tag entries will be deleted by CASCADE)
            await R.exec("DELETE FROM tag WHERE id = ?", [ tagId ]);

            log.info("api", `Deleted Tag: ${tagId}`);

            res.json({
                ok: true,
                msg: "Tag deleted successfully",
            });
        } catch (error) {
            log.error("api", `Error deleting tag: ${error.message}`);
            res.status(500).json({
                ok: false,
                msg: error.message,
                error: "DELETE_TAG_ERROR",
            });
        }
    });

    /**
     * @api {get} /api/v1/tags/:id/monitors Get monitors with this tag
     * @apiName GetTagMonitors
     * @apiGroup Tags
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiParam {Number} id Tag ID
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {Object[]} monitors List of monitors with this tag
     */
    router.get("/:id/monitors", async (req, res) => {
        try {
            const userId = req.user.id;
            const tagId = parseInt(req.params.id);

            // Check if tag exists
            const tag = await R.findOne("tag", " id = ? ", [ tagId ]);

            if (!tag) {
                return res.status(404).json({
                    ok: false,
                    msg: "Tag not found",
                    error: "TAG_NOT_FOUND",
                });
            }

            // Get monitors with this tag that belong to the user
            const monitors = await R.getAll(
                `
                SELECT m.id, m.name, m.type, mt.value as tag_value
                FROM monitor m
                INNER JOIN monitor_tag mt ON m.id = mt.monitor_id
                WHERE mt.tag_id = ? AND m.user_id = ?
                ORDER BY m.name
            `,
                [ tagId, userId ]
            );

            res.json({
                ok: true,
                monitors: monitors,
            });
        } catch (error) {
            log.error("api", `Error getting tag monitors: ${error.message}`);
            res.status(500).json({
                ok: false,
                msg: error.message,
                error: "GET_TAG_MONITORS_ERROR",
            });
        }
    });

    return router;
}

module.exports = {
    createTagsRouter,
};
