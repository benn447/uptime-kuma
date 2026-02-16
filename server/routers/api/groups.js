const express = require("express");
const { R } = require("redbean-node");
const Monitor = require("../../model/monitor");
const { log } = require("../../../src/util");

// Import helper functions from UptimeKumaServer
let startMonitor, pauseMonitor, updateMonitorNotification;

/**
 * Create groups router
 * Groups are monitors with type="group" that can have child monitors
 * @param {object} args Arguments including io (socket.io instance)
 * @returns {express.Router} Express router
 */
function createGroupsRouter(args) {
    const router = express.Router();
    const { io } = args;

    // Get helper functions from UptimeKumaServer
    const { UptimeKumaServer } = require("../../uptime-kuma-server");
    const server = UptimeKumaServer.getInstance();

    // Import helper functions
    startMonitor = server.startMonitor;
    pauseMonitor = server.pauseMonitor;
    updateMonitorNotification = server.updateMonitorNotification;

    /**
     * @api {get} /api/v1/groups List all groups
     * @apiName GetGroups
     * @apiGroup Groups
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiParam {Number} [page=1] Page number for pagination
     * @apiParam {Number} [limit=50] Number of groups per page
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {Object[]} groups List of groups
     * @apiSuccess {Number} total Total number of groups
     * @apiSuccess {Number} page Current page
     * @apiSuccess {Number} limit Groups per page
     */
    router.get("/", async (req, res) => {
        try {
            const userId = req.user.id;
            const page = parseInt(req.query.page) || 1;
            const limit = Math.min(parseInt(req.query.limit) || 50, 100);
            const offset = (page - 1) * limit;

            // Get groups (monitors with type="group")
            const groups = await R.find("monitor", " user_id = ? AND type = ? ORDER BY weight, name LIMIT ? OFFSET ?", [
                userId,
                "group",
                limit,
                offset,
            ]);

            // Get total count
            const total = await R.count("monitor", " user_id = ? AND type = ? ", [ userId, "group" ]);

            // Prepare preload data for all groups
            const groupData = groups.map(g => ({ id: g.id, active: g.active }));
            const preloadData = await Monitor.preparePreloadData(groupData);

            // Convert to JSON and add child count
            const groupsJSON = await Promise.all(
                groups.map(async (group) => {
                    const json = await group.toJSON(preloadData);
                    // Add child count
                    const children = await Monitor.getChildren(group.id);
                    json.childCount = children ? children.length : 0;
                    return json;
                })
            );

            res.json({
                ok: true,
                groups: groupsJSON,
                total: total,
                page: page,
                limit: limit,
            });
        } catch (error) {
            log.error("api", `Error listing groups: ${error.message}`);
            res.status(500).json({
                ok: false,
                msg: error.message,
                error: "LIST_GROUPS_ERROR",
            });
        }
    });

    /**
     * @api {get} /api/v1/groups/:id Get a group
     * @apiName GetGroup
     * @apiGroup Groups
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiParam {Number} id Group ID
     * @apiQuery {Boolean} [includeChildren=false] Include child monitors in response
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {Object} group Group details
     * @apiSuccess {Object[]} [children] Child monitors (if includeChildren=true)
     */
    router.get("/:id", async (req, res) => {
        try {
            const userId = req.user.id;
            const groupId = parseInt(req.params.id);
            const includeChildren = req.query.includeChildren === "true";

            const group = await R.findOne("monitor", " id = ? AND user_id = ? AND type = ? ", [ groupId, userId, "group" ]);

            if (!group) {
                return res.status(404).json({
                    ok: false,
                    msg: "Group not found",
                    error: "GROUP_NOT_FOUND",
                });
            }

            const groupData = [{ id: group.id, active: group.active }];
            const preloadData = await Monitor.preparePreloadData(groupData);

            const groupJSON = await group.toJSON(preloadData);

            // Get children if requested
            if (includeChildren) {
                const children = await Monitor.getChildren(groupId);
                const childData = children.map(c => ({ id: c.id, active: c.active }));
                const childPreloadData = await Monitor.preparePreloadData(childData);

                groupJSON.children = await Promise.all(
                    children.map(child => child.toJSON(childPreloadData))
                );
            } else {
                // Just include child count
                const children = await Monitor.getChildren(groupId);
                groupJSON.childCount = children ? children.length : 0;
            }

            res.json({
                ok: true,
                group: groupJSON,
            });
        } catch (error) {
            log.error("api", `Error getting group: ${error.message}`);
            res.status(500).json({
                ok: false,
                msg: error.message,
                error: "GET_GROUP_ERROR",
            });
        }
    });

    /**
     * @api {post} /api/v1/groups Create a group
     * @apiName CreateGroup
     * @apiGroup Groups
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiBody {String} name Group name
     * @apiBody {String} [description] Group description
     * @apiBody {Number} [weight=1000] Sort weight
     * @apiBody {Number} [parent] Parent group ID (for nested groups)
     * @apiBody {Number[]} [notificationIDList] List of notification IDs
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {Number} groupId Created group ID
     * @apiSuccess {String} msg Success message
     */
    router.post("/", async (req, res) => {
        try {
            const userId = req.user.id;
            let group = req.body;

            // Validate required fields
            if (!group.name) {
                return res.status(400).json({
                    ok: false,
                    msg: "Group name is required",
                    error: "VALIDATION_ERROR",
                });
            }

            // Create new monitor bean with type="group"
            let bean = R.dispense("monitor");

            // Extract notification list
            let notificationIDList = group.notificationIDList || [];
            delete group.notificationIDList;

            // Set basic properties
            bean.name = group.name;
            bean.description = group.description || "";
            bean.type = "group";
            bean.user_id = userId;
            bean.weight = group.weight !== undefined ? group.weight : 1000;
            bean.parent = group.parent || null;
            bean.active = true;

            // Validate parent if specified
            if (bean.parent !== null) {
                const parentGroup = await R.findOne("monitor", " id = ? AND user_id = ? AND type = ? ", [
                    bean.parent,
                    userId,
                    "group",
                ]);

                if (!parentGroup) {
                    return res.status(400).json({
                        ok: false,
                        msg: "Parent group not found",
                        error: "INVALID_PARENT",
                    });
                }
            }

            // Save to database
            await R.store(bean);

            // Update notifications
            if (notificationIDList.length > 0) {
                await updateMonitorNotification(bean.id, notificationIDList);
            }

            // Send update to socket clients
            await server.sendUpdateMonitorIntoList(null, bean.id, userId);

            log.info("api", `Created Group: ${bean.id} User ID: ${userId}`);

            res.status(201).json({
                ok: true,
                groupId: bean.id,
                msg: "Group created successfully",
            });
        } catch (error) {
            log.error("api", `Error creating group: ${error.message}`);
            res.status(400).json({
                ok: false,
                msg: error.message,
                error: "CREATE_GROUP_ERROR",
            });
        }
    });

    /**
     * @api {put} /api/v1/groups/:id Update a group
     * @apiName UpdateGroup
     * @apiGroup Groups
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiParam {Number} id Group ID
     * @apiBody {Object} group Updated group data
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {String} msg Success message
     */
    router.put("/:id", async (req, res) => {
        try {
            const userId = req.user.id;
            const groupId = parseInt(req.params.id);
            let group = req.body;

            // Get existing group
            let bean = await R.findOne("monitor", " id = ? AND type = ? ", [ groupId, "group" ]);

            if (!bean) {
                return res.status(404).json({
                    ok: false,
                    msg: "Group not found",
                    error: "GROUP_NOT_FOUND",
                });
            }

            // Check permission
            if (bean.user_id !== userId) {
                return res.status(403).json({
                    ok: false,
                    msg: "Permission denied",
                    error: "PERMISSION_DENIED",
                });
            }

            // Check for group loop if parent is being changed
            if (group.parent !== undefined && group.parent !== null) {
                const childIDs = await Monitor.getAllChildrenIDs(groupId);
                if (childIDs.includes(group.parent)) {
                    return res.status(400).json({
                        ok: false,
                        msg: "Invalid parent group - would create a loop",
                        error: "INVALID_PARENT",
                    });
                }

                // Validate parent exists
                const parentGroup = await R.findOne("monitor", " id = ? AND user_id = ? AND type = ? ", [
                    group.parent,
                    userId,
                    "group",
                ]);

                if (!parentGroup) {
                    return res.status(400).json({
                        ok: false,
                        msg: "Parent group not found",
                        error: "INVALID_PARENT",
                    });
                }
            }

            // Extract notification list
            let notificationIDList = group.notificationIDList;
            delete group.notificationIDList;

            // Update properties
            if (group.name !== undefined) {
                bean.name = group.name;
            }
            if (group.description !== undefined) {
                bean.description = group.description;
            }
            if (group.weight !== undefined) {
                bean.weight = group.weight;
            }
            if (group.parent !== undefined) {
                bean.parent = group.parent;
            }

            // Save to database
            await R.store(bean);

            // Update notifications
            if (notificationIDList !== undefined) {
                await updateMonitorNotification(bean.id, notificationIDList);
            }

            // Send update to socket clients
            await server.sendUpdateMonitorIntoList(null, bean.id, userId);

            log.info("api", `Updated Group: ${bean.id} User ID: ${userId}`);

            res.json({
                ok: true,
                msg: "Group updated successfully",
            });
        } catch (error) {
            log.error("api", `Error updating group: ${error.message}`);
            res.status(400).json({
                ok: false,
                msg: error.message,
                error: "UPDATE_GROUP_ERROR",
            });
        }
    });

    /**
     * @api {delete} /api/v1/groups/:id Delete a group
     * @apiName DeleteGroup
     * @apiGroup Groups
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiParam {Number} id Group ID
     * @apiQuery {Boolean} [deleteChildren=false] Also delete child monitors recursively
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {String} msg Success message
     */
    router.delete("/:id", async (req, res) => {
        try {
            const userId = req.user.id;
            const groupId = parseInt(req.params.id);
            const deleteChildren = req.query.deleteChildren === "true";

            // Get group
            const group = await R.findOne("monitor", " id = ? AND user_id = ? AND type = ? ", [ groupId, userId, "group" ]);

            if (!group) {
                return res.status(404).json({
                    ok: false,
                    msg: "Group not found",
                    error: "GROUP_NOT_FOUND",
                });
            }

            // Log deletion
            if (deleteChildren) {
                log.info("api", `Delete Group and Children: ${groupId} User ID: ${userId}`);
            } else {
                log.info("api", `Delete Group (unlink children): ${groupId} User ID: ${userId}`);
            }

            // Stop the monitor if it's running
            if (groupId in server.monitorList) {
                await server.monitorList[groupId].stop();
            }

            // Delete group
            await R.exec("DELETE FROM monitor WHERE id = ?", [ groupId ]);

            // Handle children
            if (deleteChildren) {
                // Delete all children recursively
                const childIDs = await Monitor.getAllChildrenIDs(groupId);
                if (childIDs && childIDs.length > 0) {
                    // Stop all child monitors
                    for (const childID of childIDs) {
                        if (childID in server.monitorList) {
                            await server.monitorList[childID].stop();
                        }
                    }
                    // Delete from database
                    await R.exec("DELETE FROM monitor WHERE id IN (" + childIDs.map(() => "?").join(",") + ")", childIDs);
                }
            } else {
                // Unlink children (set parent = null)
                await Monitor.unlinkAllChildren(groupId);
            }

            // Send update to socket clients
            if (io) {
                io.to(userId).emit("deleteMonitor", groupId);
            }

            res.json({
                ok: true,
                msg: "Group deleted successfully",
            });
        } catch (error) {
            log.error("api", `Error deleting group: ${error.message}`);
            res.status(500).json({
                ok: false,
                msg: error.message,
                error: "DELETE_GROUP_ERROR",
            });
        }
    });

    /**
     * @api {get} /api/v1/groups/:id/children Get children of a group
     * @apiName GetGroupChildren
     * @apiGroup Groups
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiParam {Number} id Group ID
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {Object[]} children List of child monitors
     */
    router.get("/:id/children", async (req, res) => {
        try {
            const userId = req.user.id;
            const groupId = parseInt(req.params.id);

            // Verify group exists and belongs to user
            const group = await R.findOne("monitor", " id = ? AND user_id = ? AND type = ? ", [ groupId, userId, "group" ]);

            if (!group) {
                return res.status(404).json({
                    ok: false,
                    msg: "Group not found",
                    error: "GROUP_NOT_FOUND",
                });
            }

            // Get children
            const children = await Monitor.getChildren(groupId);

            // Prepare preload data
            const childData = children.map(c => ({ id: c.id, active: c.active }));
            const preloadData = await Monitor.preparePreloadData(childData);

            // Convert to JSON
            const childrenJSON = await Promise.all(
                children.map(child => child.toJSON(preloadData))
            );

            res.json({
                ok: true,
                children: childrenJSON,
            });
        } catch (error) {
            log.error("api", `Error getting group children: ${error.message}`);
            res.status(500).json({
                ok: false,
                msg: error.message,
                error: "GET_GROUP_CHILDREN_ERROR",
            });
        }
    });

    /**
     * @api {post} /api/v1/groups/:id/children/:childId Add a monitor to a group
     * @apiName AddMonitorToGroup
     * @apiGroup Groups
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiParam {Number} id Group ID
     * @apiParam {Number} childId Monitor ID to add to the group
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {String} msg Success message
     */
    router.post("/:id/children/:childId", async (req, res) => {
        try {
            const userId = req.user.id;
            const groupId = parseInt(req.params.id);
            const childId = parseInt(req.params.childId);

            // Verify group exists and belongs to user
            const group = await R.findOne("monitor", " id = ? AND user_id = ? AND type = ? ", [ groupId, userId, "group" ]);

            if (!group) {
                return res.status(404).json({
                    ok: false,
                    msg: "Group not found",
                    error: "GROUP_NOT_FOUND",
                });
            }

            // Verify child monitor exists and belongs to user
            const child = await R.findOne("monitor", " id = ? AND user_id = ? ", [ childId, userId ]);

            if (!child) {
                return res.status(404).json({
                    ok: false,
                    msg: "Monitor not found",
                    error: "MONITOR_NOT_FOUND",
                });
            }

            // Check for circular reference
            if (child.type === "group") {
                const childIDs = await Monitor.getAllChildrenIDs(childId);
                if (childIDs.includes(groupId)) {
                    return res.status(400).json({
                        ok: false,
                        msg: "Cannot add group - would create a loop",
                        error: "INVALID_PARENT",
                    });
                }
            }

            // Update child's parent
            child.parent = groupId;
            await R.store(child);

            // Send updates to socket clients
            await server.sendUpdateMonitorIntoList(null, childId, userId);
            await server.sendUpdateMonitorIntoList(null, groupId, userId);

            log.info("api", `Added Monitor ${childId} to Group ${groupId} User ID: ${userId}`);

            res.json({
                ok: true,
                msg: "Monitor added to group successfully",
            });
        } catch (error) {
            log.error("api", `Error adding monitor to group: ${error.message}`);
            res.status(400).json({
                ok: false,
                msg: error.message,
                error: "ADD_TO_GROUP_ERROR",
            });
        }
    });

    /**
     * @api {delete} /api/v1/groups/:id/children/:childId Remove a monitor from a group
     * @apiName RemoveMonitorFromGroup
     * @apiGroup Groups
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiParam {Number} id Group ID
     * @apiParam {Number} childId Monitor ID to remove from the group
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {String} msg Success message
     */
    router.delete("/:id/children/:childId", async (req, res) => {
        try {
            const userId = req.user.id;
            const groupId = parseInt(req.params.id);
            const childId = parseInt(req.params.childId);

            // Verify group exists and belongs to user
            const group = await R.findOne("monitor", " id = ? AND user_id = ? AND type = ? ", [ groupId, userId, "group" ]);

            if (!group) {
                return res.status(404).json({
                    ok: false,
                    msg: "Group not found",
                    error: "GROUP_NOT_FOUND",
                });
            }

            // Verify child monitor exists, belongs to user, and is in this group
            const child = await R.findOne("monitor", " id = ? AND user_id = ? AND parent = ? ", [ childId, userId, groupId ]);

            if (!child) {
                return res.status(404).json({
                    ok: false,
                    msg: "Monitor not found in this group",
                    error: "MONITOR_NOT_IN_GROUP",
                });
            }

            // Remove child from group
            child.parent = null;
            await R.store(child);

            // Send updates to socket clients
            await server.sendUpdateMonitorIntoList(null, childId, userId);
            await server.sendUpdateMonitorIntoList(null, groupId, userId);

            log.info("api", `Removed Monitor ${childId} from Group ${groupId} User ID: ${userId}`);

            res.json({
                ok: true,
                msg: "Monitor removed from group successfully",
            });
        } catch (error) {
            log.error("api", `Error removing monitor from group: ${error.message}`);
            res.status(500).json({
                ok: false,
                msg: error.message,
                error: "REMOVE_FROM_GROUP_ERROR",
            });
        }
    });

    return router;
}

module.exports = {
    createGroupsRouter,
};
