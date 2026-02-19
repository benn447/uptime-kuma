const express = require("express");
const { R } = require("redbean-node");
const Monitor = require("../../model/monitor");
const { log } = require("../../../src/util");

// Import UptimeCalculator
const { UptimeCalculator } = require("../../uptime-calculator");
const Database = require("../../database");

/**
 * Process monitor data before saving (converts fields to JSON strings, removes frontend-only props)
 * @param {object} monitor Monitor data
 * @returns {object} Processed monitor data
 */
function processMonitorData(monitor) {
    const processed = { ...monitor };

    // Ensure status code ranges are strings
    if (processed.accepted_statuscodes && !processed.accepted_statuscodes.every((code) => typeof code === "string")) {
        throw new Error("Accepted status codes are not all strings");
    }
    if (processed.accepted_statuscodes) {
        processed.accepted_statuscodes_json = JSON.stringify(processed.accepted_statuscodes);
        delete processed.accepted_statuscodes;
    }

    // Convert objects to JSON strings
    if (processed.kafkaProducerBrokers) {
        processed.kafkaProducerBrokers = JSON.stringify(processed.kafkaProducerBrokers);
    }
    if (processed.kafkaProducerSaslOptions) {
        processed.kafkaProducerSaslOptions = JSON.stringify(processed.kafkaProducerSaslOptions);
    }
    if (processed.conditions) {
        processed.conditions = JSON.stringify(processed.conditions);
    }
    if (processed.rabbitmqNodes) {
        processed.rabbitmqNodes = JSON.stringify(processed.rabbitmqNodes);
    }

    // Remove frontend-only properties
    const frontendOnlyProperties = ["humanReadableInterval", "responsecheck"];
    for (const prop of frontendOnlyProperties) {
        if (prop in processed) {
            delete processed[prop];
        }
    }

    return processed;
}

/**
 * Create monitors router
 * @param {object} args Arguments including io (socket.io instance)
 * @returns {express.Router} Express router
 */
function createMonitorsRouter(args) {
    const router = express.Router();
    const { io } = args;

    // Get UptimeKumaServer instance for calling server methods
    const { UptimeKumaServer } = require("../../uptime-kuma-server");
    const server = UptimeKumaServer.getInstance();

    /**
     * Start a monitor by adding it to the monitorList and starting it
     * @param {number} userId - User ID (for ownership check)
     * @param {number} monitorId - Monitor ID to start
     * @returns {Promise<void>}
     */
    async function startMonitor(userId, monitorId) {
        await R.exec("UPDATE monitor SET active = 1 WHERE id = ? AND user_id = ? ", [monitorId, userId]);
        let monitorBean = await R.findOne("monitor", " id = ? ", [monitorId]);
        if (monitorBean.id in server.monitorList) {
            await server.monitorList[monitorBean.id].stop();
        }
        server.monitorList[monitorBean.id] = monitorBean;
        await monitorBean.start(io);
    }

    /**
     * Pause a monitor by stopping it and updating the database
     * @param {number} userId - User ID (for ownership check)
     * @param {number} monitorId - Monitor ID to pause
     * @returns {Promise<void>}
     */
    async function pauseMonitor(userId, monitorId) {
        await R.exec("UPDATE monitor SET active = 0 WHERE id = ? AND user_id = ? ", [monitorId, userId]);
        if (monitorId in server.monitorList) {
            await server.monitorList[monitorId].stop();
            server.monitorList[monitorId].active = 0;
        }
    }

    /**
     * @api {get} /api/v1/monitors List all monitors
     * @apiName GetMonitors
     * @apiGroup Monitors
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiParam {Number} [page=1] Page number for pagination
     * @apiParam {Number} [limit=50] Number of monitors per page
     * @apiParam {Number} [group] Filter by group ID
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {Object[]} monitors List of monitors
     * @apiSuccess {Number} total Total number of monitors
     * @apiSuccess {Number} page Current page
     * @apiSuccess {Number} limit Monitors per page
     */
    router.get("/", async (req, res) => {
        try {
            const userId = req.user.id;
            const page = parseInt(req.query.page) || 1;
            const limit = Math.min(parseInt(req.query.limit) || 50, 100);
            const offset = (page - 1) * limit;
            const groupId = req.query.group;

            let whereClause = " user_id = ? ";
            let params = [ userId ];

            // Filter by group if specified
            if (groupId) {
                whereClause += " AND parent = ? ";
                params.push(groupId);
            }

            // Get monitors
            const monitors = await R.find("monitor", `${whereClause} ORDER BY weight, name LIMIT ? OFFSET ?`, [
                ...params,
                limit,
                offset,
            ]);

            // Get total count
            const total = await R.count("monitor", whereClause, params);

            // Prepare preload data for all monitors
            const monitorData = monitors.map(m => ({ id: m.id, active: m.active }));
            const preloadData = await Monitor.preparePreloadData(monitorData);

            // Convert to JSON
            const monitorsJSON = await Promise.all(
                monitors.map(monitor => monitor.toJSON(preloadData))
            );

            res.json({
                ok: true,
                monitors: monitorsJSON,
                total: total,
                page: page,
                limit: limit,
            });
        } catch (error) {
            log.error("api", `Error listing monitors: ${error.message}`);
            res.status(500).json({
                ok: false,
                msg: error.message,
                error: "LIST_MONITORS_ERROR",
            });
        }
    });

    /**
     * @api {get} /api/v1/monitors/:id Get a monitor
     * @apiName GetMonitor
     * @apiGroup Monitors
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiParam {Number} id Monitor ID
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {Object} monitor Monitor details
     */
    router.get("/:id", async (req, res) => {
        try {
            const userId = req.user.id;
            const monitorId = parseInt(req.params.id);

            const monitor = await R.findOne("monitor", " id = ? AND user_id = ? ", [ monitorId, userId ]);

            if (!monitor) {
                return res.status(404).json({
                    ok: false,
                    msg: "Monitor not found",
                    error: "MONITOR_NOT_FOUND",
                });
            }

            const monitorData = [{ id: monitor.id, active: monitor.active }];
            const preloadData = await Monitor.preparePreloadData(monitorData);

            res.json({
                ok: true,
                monitor: await monitor.toJSON(preloadData),
            });
        } catch (error) {
            log.error("api", `Error getting monitor: ${error.message}`);
            res.status(500).json({
                ok: false,
                msg: error.message,
                error: "GET_MONITOR_ERROR",
            });
        }
    });

    /**
     * @api {post} /api/v1/monitors Create a monitor
     * @apiName CreateMonitor
     * @apiGroup Monitors
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiBody {String} name Monitor name
     * @apiBody {String} type Monitor type (http, port, ping, etc.)
     * @apiBody {Number} interval Check interval in seconds
     * @apiBody {Number} [retryInterval=60] Retry interval in seconds
     * @apiBody {Number} [maxretries=0] Max retries before marking as down
     * @apiBody {Boolean} [active=true] Whether monitor is active
     * @apiBody {String} [url] URL to monitor (for http/keyword monitors)
     * @apiBody {String} [hostname] Hostname (for port/ping monitors)
     * @apiBody {Number} [port] Port number (for port monitors)
     * @apiBody {Number[]} [notificationIDList] List of notification IDs
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {Number} monitorId Created monitor ID
     * @apiSuccess {String} msg Success message
     */
    router.post("/", async (req, res) => {
        try {
            const userId = req.user.id;
            let monitor = req.body;

            // Create new monitor bean
            let bean = R.dispense("monitor");

            // Extract notification list
            let notificationIDList = monitor.notificationIDList || [];
            delete monitor.notificationIDList;

            // Process monitor data
            const processed = processMonitorData(monitor);

            // Import processed data
            bean.import(processed);

            // Map camelCase to snake_case
            if (monitor.retryOnlyOnStatusCodeFailure !== undefined) {
                bean.retry_only_on_status_code_failure = monitor.retryOnlyOnStatusCodeFailure;
            }

            bean.user_id = userId;

            // Validate
            bean.validate();

            // Save to database
            await R.store(bean);

            // Update notifications
            if (notificationIDList.length > 0) {
                await R.exec("DELETE FROM monitor_notification WHERE monitor_id = ? ", [bean.id]);
                for (let notificationID of notificationIDList) {
                    let notificationBean = R.dispense("monitor_notification");
                    notificationBean.monitor_id = bean.id;
                    notificationBean.notification_id = notificationID;
                    await R.store(notificationBean);
                }
            }

            // Send update to socket clients (create fake socket for REST API)
            const fakeSocket = { userID: userId };
            await server.sendUpdateMonitorIntoList(fakeSocket, bean.id);

            // Start monitor if active - add to monitorList and start
            if (monitor.active !== false) {
                let monitorBean = await R.findOne("monitor", " id = ? ", [bean.id]);
                if (monitorBean.id in server.monitorList) {
                    await server.monitorList[monitorBean.id].stop();
                }
                server.monitorList[monitorBean.id] = monitorBean;
                await monitorBean.start(io);
            }

            log.info("api", `Created Monitor: ${bean.id} User ID: ${userId}`);

            res.status(201).json({
                ok: true,
                monitorId: bean.id,
                msg: "Monitor created successfully",
            });
        } catch (error) {
            log.error("api", `Error creating monitor: ${error.message}`);
            res.status(400).json({
                ok: false,
                msg: error.message,
                error: "CREATE_MONITOR_ERROR",
            });
        }
    });

    /**
     * @api {put} /api/v1/monitors/:id Update a monitor
     * @apiName UpdateMonitor
     * @apiGroup Monitors
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiParam {Number} id Monitor ID
     * @apiBody {Object} monitor Updated monitor data
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {String} msg Success message
     */
    router.put("/:id", async (req, res) => {
        try {
            const userId = req.user.id;
            const monitorId = parseInt(req.params.id);
            let monitor = { ...req.body, id: monitorId };

            // Get existing monitor
            let bean = await R.findOne("monitor", " id = ? ", [ monitorId ]);

            if (!bean) {
                return res.status(404).json({
                    ok: false,
                    msg: "Monitor not found",
                    error: "MONITOR_NOT_FOUND",
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

            // Check for group loop
            if (monitor.parent !== null) {
                const childIDs = await Monitor.getAllChildrenIDs(monitor.id);
                if (childIDs.includes(monitor.parent)) {
                    return res.status(400).json({
                        ok: false,
                        msg: "Invalid Monitor Group - would create a loop",
                        error: "INVALID_GROUP",
                    });
                }
            }

            // Remove children if type changed from group
            let removeGroupChildren = false;
            if (bean.type === "group" && monitor.type !== bean.type) {
                removeGroupChildren = true;
            }

            // Extract notification list
            let notificationIDList = monitor.notificationIDList;
            delete monitor.notificationIDList;

            // Process monitor data
            const processed = processMonitorData(monitor);

            // Import processed data
            bean.import(processed);

            // Map camelCase to snake_case
            if (monitor.retryOnlyOnStatusCodeFailure !== undefined) {
                bean.retry_only_on_status_code_failure = monitor.retryOnlyOnStatusCodeFailure;
            }

            // Validate
            bean.validate();

            // Save to database
            await R.store(bean);

            // Update notifications
            if (notificationIDList !== undefined) {
                await server.updateMonitorNotification(bean.id, notificationIDList);
            }

            // Remove children if needed
            if (removeGroupChildren) {
                await Monitor.unlinkAllChildren(bean.id);
            }

            // Send update to socket clients
            await server.sendUpdateMonitorIntoList({ userID: userId }, bean.id);

            // Restart monitor
            if (monitor.active !== false) {
                await startMonitor(userId, bean.id);
            } else {
                await pauseMonitor(userId, bean.id);
            }


            log.info("api", `Updated Monitor: ${bean.id} User ID: ${userId}`);

            res.json({
                ok: true,
                msg: "Monitor updated successfully",
            });
        } catch (error) {
            log.error("api", `Error updating monitor: ${error.message}`);
            res.status(400).json({
                ok: false,
                msg: error.message,
                error: "UPDATE_MONITOR_ERROR",
            });
        }
    });

    /**
     * @api {delete} /api/v1/monitors/:id Delete a monitor
     * @apiName DeleteMonitor
     * @apiGroup Monitors
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiParam {Number} id Monitor ID
     * @apiQuery {Boolean} [deleteChildren=false] Also delete child monitors (for groups)
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {String} msg Success message
     */
    router.delete("/:id", async (req, res) => {
        try {
            const userId = req.user.id;
            const monitorId = parseInt(req.params.id);
            const deleteChildren = req.query.deleteChildren === "true";

            // Get monitor
            const monitor = await R.findOne("monitor", " id = ? AND user_id = ? ", [ monitorId, userId ]);

            if (!monitor) {
                return res.status(404).json({
                    ok: false,
                    msg: "Monitor not found",
                    error: "MONITOR_NOT_FOUND",
                });
            }

            // Log deletion
            if (monitor.type === "group") {
                if (deleteChildren) {
                    log.info("api", `Delete Group and Children: ${monitorId} User ID: ${userId}`);
                } else {
                    log.info("api", `Delete Group (unlink children): ${monitorId} User ID: ${userId}`);
                }
            } else {
                log.info("api", `Delete Monitor: ${monitorId} User ID: ${userId}`);
            }

            // Delete monitor and optionally children
            await R.exec("DELETE FROM monitor WHERE id = ?", [ monitorId ]);

            // Unlink children if not deleting them
            if (monitor.type === "group" && !deleteChildren) {
                await Monitor.unlinkAllChildren(monitorId);
            } else if (monitor.type === "group" && deleteChildren) {
                // Delete all children recursively
                const childIDs = await Monitor.getAllChildrenIDs(monitorId);
                if (childIDs && childIDs.length > 0) {
                    await R.exec("DELETE FROM monitor WHERE id IN (" + childIDs.map(() => "?").join(",") + ")", childIDs);
                }
            }

            // Send update to socket clients
            if (io) {
                io.to(userId).emit("deleteMonitor", monitorId);
            }

            res.json({
                ok: true,
                msg: "Monitor deleted successfully",
            });
        } catch (error) {
            log.error("api", `Error deleting monitor: ${error.message}`);
            res.status(500).json({
                ok: false,
                msg: error.message,
                error: "DELETE_MONITOR_ERROR",
            });
        }
    });

    /**
     * @api {post} /api/v1/monitors/:id/pause Pause a monitor
     * @apiName PauseMonitor
     * @apiGroup Monitors
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiParam {Number} id Monitor ID
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {String} msg Success message
     */
    router.post("/:id/pause", async (req, res) => {
        try {
            const userId = req.user.id;
            const monitorId = parseInt(req.params.id);

            // Verify monitor exists and belongs to user
            const monitor = await R.findOne("monitor", " id = ? AND user_id = ? ", [ monitorId, userId ]);
            if (!monitor) {
                return res.status(404).json({
                    ok: false,
                    msg: "Monitor not found",
                    error: "MONITOR_NOT_FOUND",
                });
            }

            await pauseMonitor(userId, monitorId);
            await server.sendUpdateMonitorIntoList({ userID: userId }, monitorId);

            log.info("api", `Paused Monitor: ${monitorId} User ID: ${userId}`);

            res.json({
                ok: true,
                msg: "Monitor paused successfully",
            });
        } catch (error) {
            log.error("api", `Error pausing monitor: ${error.message}`);
            res.status(500).json({
                ok: false,
                msg: error.message,
                error: "PAUSE_MONITOR_ERROR",
            });
        }
    });

    /**
     * @api {post} /api/v1/monitors/:id/resume Resume a monitor
     * @apiName ResumeMonitor
     * @apiGroup Monitors
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiParam {Number} id Monitor ID
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {String} msg Success message
     */
    router.post("/:id/resume", async (req, res) => {
        try {
            const userId = req.user.id;
            const monitorId = parseInt(req.params.id);

            // Verify monitor exists and belongs to user
            const monitor = await R.findOne("monitor", " id = ? AND user_id = ? ", [ monitorId, userId ]);
            if (!monitor) {
                return res.status(404).json({
                    ok: false,
                    msg: "Monitor not found",
                    error: "MONITOR_NOT_FOUND",
                });
            }

            await startMonitor(userId, monitorId);
            await server.sendUpdateMonitorIntoList({ userID: userId }, monitorId);

            log.info("api", `Resumed Monitor: ${monitorId} User ID: ${userId}`);

            res.json({
                ok: true,
                msg: "Monitor resumed successfully",
            });
        } catch (error) {
            log.error("api", `Error resuming monitor: ${error.message}`);
            res.status(500).json({
                ok: false,
                msg: error.message,
                error: "RESUME_MONITOR_ERROR",
            });
        }
    });

    /**
     * @api {post} /api/v1/monitors/:id/tags Add a tag to a monitor
     * @apiName AddMonitorTag
     * @apiGroup Monitors
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiParam {Number} id Monitor ID
     * @apiBody {Number} tagId Tag ID
     * @apiBody {String} [value] Tag value (optional, defaults to empty string)
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {String} msg Success message
     */
    router.post("/:id/tags", async (req, res) => {
        try {
            const userId = req.user.id;
            const monitorId = parseInt(req.params.id);
            const { tagId, value } = req.body;

            // Validate tagId
            if (!tagId) {
                return res.status(400).json({
                    ok: false,
                    msg: "Tag ID is required",
                    error: "VALIDATION_ERROR",
                });
            }

            // Verify monitor exists and belongs to user
            const monitor = await R.findOne("monitor", " id = ? AND user_id = ? ", [ monitorId, userId ]);
            if (!monitor) {
                return res.status(404).json({
                    ok: false,
                    msg: "Monitor not found",
                    error: "MONITOR_NOT_FOUND",
                });
            }

            // Verify tag exists
            const tag = await R.findOne("tag", " id = ? ", [ tagId ]);
            if (!tag) {
                return res.status(404).json({
                    ok: false,
                    msg: "Tag not found",
                    error: "TAG_NOT_FOUND",
                });
            }

            // Check if tag is already assigned to monitor
            const existing = await R.findOne("monitor_tag", " monitor_id = ? AND tag_id = ? ", [ monitorId, tagId ]);
            if (existing) {
                return res.status(400).json({
                    ok: false,
                    msg: "Tag is already assigned to this monitor",
                    error: "TAG_ALREADY_ASSIGNED",
                });
            }

            // Add tag to monitor
            await R.exec("INSERT INTO monitor_tag (tag_id, monitor_id, value) VALUES (?, ?, ?)", [
                tagId,
                monitorId,
                value || "",
            ]);

            // Send update to socket clients
            await server.sendUpdateMonitorIntoList({ userID: userId }, monitorId);

            log.info("api", `Added Tag ${tagId} to Monitor ${monitorId} User ID: ${userId}`);

            res.json({
                ok: true,
                msg: "Tag added to monitor successfully",
            });
        } catch (error) {
            log.error("api", `Error adding tag to monitor: ${error.message}`);
            res.status(500).json({
                ok: false,
                msg: error.message,
                error: "ADD_TAG_ERROR",
            });
        }
    });

    /**
     * @api {put} /api/v1/monitors/:id/tags/:tagId Update a monitor tag value
     * @apiName UpdateMonitorTag
     * @apiGroup Monitors
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiParam {Number} id Monitor ID
     * @apiParam {Number} tagId Tag ID
     * @apiBody {String} value New tag value
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {String} msg Success message
     */
    router.put("/:id/tags/:tagId", async (req, res) => {
        try {
            const userId = req.user.id;
            const monitorId = parseInt(req.params.id);
            const tagId = parseInt(req.params.tagId);
            const { value } = req.body;

            if (value === undefined) {
                return res.status(400).json({
                    ok: false,
                    msg: "Tag value is required",
                    error: "VALIDATION_ERROR",
                });
            }

            // Verify monitor exists and belongs to user
            const monitor = await R.findOne("monitor", " id = ? AND user_id = ? ", [ monitorId, userId ]);
            if (!monitor) {
                return res.status(404).json({
                    ok: false,
                    msg: "Monitor not found",
                    error: "MONITOR_NOT_FOUND",
                });
            }

            // Verify tag exists on monitor
            const monitorTag = await R.findOne("monitor_tag", " monitor_id = ? AND tag_id = ? ", [ monitorId, tagId ]);
            if (!monitorTag) {
                return res.status(404).json({
                    ok: false,
                    msg: "Tag not found on this monitor",
                    error: "TAG_NOT_ON_MONITOR",
                });
            }

            // Update tag value
            await R.exec("UPDATE monitor_tag SET value = ? WHERE tag_id = ? AND monitor_id = ?", [
                value,
                tagId,
                monitorId,
            ]);

            // Send update to socket clients
            await server.sendUpdateMonitorIntoList({ userID: userId }, monitorId);

            log.info("api", `Updated Tag ${tagId} on Monitor ${monitorId} User ID: ${userId}`);

            res.json({
                ok: true,
                msg: "Tag value updated successfully",
            });
        } catch (error) {
            log.error("api", `Error updating monitor tag: ${error.message}`);
            res.status(500).json({
                ok: false,
                msg: error.message,
                error: "UPDATE_TAG_ERROR",
            });
        }
    });

    /**
     * @api {delete} /api/v1/monitors/:id/tags/:tagId Remove a tag from a monitor
     * @apiName DeleteMonitorTag
     * @apiGroup Monitors
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiParam {Number} id Monitor ID
     * @apiParam {Number} tagId Tag ID
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {String} msg Success message
     */
    router.delete("/:id/tags/:tagId", async (req, res) => {
        try {
            const userId = req.user.id;
            const monitorId = parseInt(req.params.id);
            const tagId = parseInt(req.params.tagId);

            // Verify monitor exists and belongs to user
            const monitor = await R.findOne("monitor", " id = ? AND user_id = ? ", [ monitorId, userId ]);
            if (!monitor) {
                return res.status(404).json({
                    ok: false,
                    msg: "Monitor not found",
                    error: "MONITOR_NOT_FOUND",
                });
            }

            // Verify tag exists on monitor
            const monitorTag = await R.findOne("monitor_tag", " monitor_id = ? AND tag_id = ? ", [ monitorId, tagId ]);
            if (!monitorTag) {
                return res.status(404).json({
                    ok: false,
                    msg: "Tag not found on this monitor",
                    error: "TAG_NOT_ON_MONITOR",
                });
            }

            // Remove tag from monitor
            await R.exec("DELETE FROM monitor_tag WHERE tag_id = ? AND monitor_id = ?", [
                tagId,
                monitorId,
            ]);

            // Send update to socket clients
            await server.sendUpdateMonitorIntoList({ userID: userId }, monitorId);

            log.info("api", `Removed Tag ${tagId} from Monitor ${monitorId} User ID: ${userId}`);

            res.json({
                ok: true,
                msg: "Tag removed from monitor successfully",
            });
        } catch (error) {
            log.error("api", `Error removing tag from monitor: ${error.message}`);
            res.status(500).json({
                ok: false,
                msg: error.message,
                error: "REMOVE_TAG_ERROR",
            });
        }
    });

    /**
     * @api {get} /api/v1/monitors/:id/status Get monitor status
     * @apiName GetMonitorStatus
     * @apiGroup Monitors
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiParam {Number} id Monitor ID
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {Object} status Monitor status information
     * @apiSuccess {String} status.status Current status (up/down/pending/maintenance)
     * @apiSuccess {Number} status.uptime24h 24-hour uptime percentage
     * @apiSuccess {Number} status.uptime30d 30-day uptime percentage
     * @apiSuccess {Number} status.uptime1y 1-year uptime percentage
     * @apiSuccess {Number} status.avgPing24h Average ping over 24 hours
     * @apiSuccess {Object} status.latestHeartbeat Latest heartbeat data
     */
    router.get("/:id/status", async (req, res) => {
        try {
            const userId = req.user.id;
            const monitorId = parseInt(req.params.id);

            // Verify monitor exists and belongs to user
            const monitor = await R.findOne("monitor", " id = ? AND user_id = ? ", [ monitorId, userId ]);
            if (!monitor) {
                return res.status(404).json({
                    ok: false,
                    msg: "Monitor not found",
                    error: "MONITOR_NOT_FOUND",
                });
            }

            // Get uptime calculator
            let uptimeCalculator = await UptimeCalculator.getUptimeCalculator(monitorId);

            // Get 24-hour stats
            let data24h = await uptimeCalculator.get24Hour();

            // Get 30-day stats
            let data30d = await uptimeCalculator.get30Day();

            // Get 1-year stats
            let data1y = await uptimeCalculator.get1Year();

            // Get latest heartbeat
            const latestHeartbeat = await R.findOne("heartbeat", " monitor_id = ? ORDER BY time DESC LIMIT 1 ", [ monitorId ]);

            // Map status code to string
            const statusMap = {
                0: "down",
                1: "up",
                2: "pending",
                3: "maintenance",
            };

            const status = {
                status: latestHeartbeat ? statusMap[latestHeartbeat.status] || "unknown" : "pending",
                uptime24h: data24h.uptime || null,
                uptime30d: data30d.uptime || null,
                uptime1y: data1y.uptime || null,
                avgPing24h: data24h.avgPing ? Number(data24h.avgPing.toFixed(2)) : null,
                latestHeartbeat: latestHeartbeat ? {
                    time: latestHeartbeat.time,
                    status: latestHeartbeat.status,
                    msg: latestHeartbeat.msg,
                    ping: latestHeartbeat.ping,
                } : null,
            };

            res.json({
                ok: true,
                status: status,
            });
        } catch (error) {
            log.error("api", `Error getting monitor status: ${error.message}`);
            res.status(500).json({
                ok: false,
                msg: error.message,
                error: "GET_STATUS_ERROR",
            });
        }
    });

    /**
     * @api {get} /api/v1/monitors/:id/heartbeats Get monitor heartbeats
     * @apiName GetMonitorHeartbeats
     * @apiGroup Monitors
     * @apiHeader {String} Authorization Bearer token (API key)
     *
     * @apiParam {Number} id Monitor ID
     * @apiQuery {Number} [hours=24] Number of hours of heartbeats to retrieve (max 720 = 30 days)
     *
     * @apiSuccess {Boolean} ok Success status
     * @apiSuccess {Object[]} heartbeats List of heartbeat data
     * @apiSuccess {String} heartbeats.time Heartbeat timestamp
     * @apiSuccess {Number} heartbeats.status Status code (0=down, 1=up, 2=pending, 3=maintenance)
     * @apiSuccess {String} heartbeats.msg Status message
     * @apiSuccess {Number} heartbeats.ping Response time in ms
     */
    router.get("/:id/heartbeats", async (req, res) => {
        try {
            const userId = req.user.id;
            const monitorId = parseInt(req.params.id);
            const hours = Math.min(parseInt(req.query.hours) || 24, 720); // Max 30 days

            // Verify monitor exists and belongs to user
            const monitor = await R.findOne("monitor", " id = ? AND user_id = ? ", [ monitorId, userId ]);
            if (!monitor) {
                return res.status(404).json({
                    ok: false,
                    msg: "Monitor not found",
                    error: "MONITOR_NOT_FOUND",
                });
            }

            // Get heartbeats for the specified period
            const sqlHourOffset = Database.sqlHourOffset();

            const heartbeats = await R.getAll(
                `
                SELECT time, status, msg, ping, important, duration
                FROM heartbeat
                WHERE monitor_id = ?
                  AND time > ${sqlHourOffset}
                ORDER BY time ASC
            `,
                [ monitorId, -hours ]
            );

            res.json({
                ok: true,
                heartbeats: heartbeats,
            });
        } catch (error) {
            log.error("api", `Error getting monitor heartbeats: ${error.message}`);
            res.status(500).json({
                ok: false,
                msg: error.message,
                error: "GET_HEARTBEATS_ERROR",
            });
        }
    });

    return router;
}

module.exports = {
    createMonitorsRouter,
};
