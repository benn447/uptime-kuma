const { APIKey } = require("../model/api-key");
const { R } = require("redbean-node");

/**
 * Express middleware for API key authentication
 * Validates the Authorization: Bearer <api-key> header
 * @param {object} req Express request
 * @param {object} res Express response
 * @param {Function} next Express next function
 * @returns {Promise<void>}
 */
async function apiAuth(req, res, next) {
    try {
        // Get authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                ok: false,
                msg: "Missing authorization header",
                error: "UNAUTHORIZED",
            });
        }

        // Check if it's Bearer auth
        const parts = authHeader.split(" ");
        if (parts.length !== 2 || parts[0] !== "Bearer") {
            return res.status(401).json({
                ok: false,
                msg: "Invalid authorization format. Expected: Bearer <api-key>",
                error: "INVALID_AUTH_FORMAT",
            });
        }

        const apiKey = parts[1];

        // Find and validate API key
        const apiKeyBean = await APIKey.findByKey(apiKey);

        if (!apiKeyBean) {
            return res.status(401).json({
                ok: false,
                msg: "Invalid API key",
                error: "INVALID_API_KEY",
            });
        }

        // Check if key is valid (active and not expired)
        if (!apiKeyBean.isValid()) {
            let reason = "inactive";
            if (apiKeyBean.isExpired()) {
                reason = "expired";
            }
            return res.status(401).json({
                ok: false,
                msg: `API key is ${reason}`,
                error: "API_KEY_" + reason.toUpperCase(),
            });
        }

        // Update last used timestamp (async, don't wait)
        apiKeyBean.updateLastUsed().catch(err => {
            console.error("Error updating API key last used:", err);
        });

        // Get user info
        const user = await R.load("user", apiKeyBean.user_id);
        if (!user) {
            return res.status(401).json({
                ok: false,
                msg: "User not found",
                error: "USER_NOT_FOUND",
            });
        }

        // Attach user to request
        req.user = {
            id: user.id,
            username: user.username,
        };

        next();
    } catch (error) {
        console.error("API auth error:", error);
        return res.status(500).json({
            ok: false,
            msg: "Internal server error during authentication",
            error: "AUTH_ERROR",
        });
    }
}

module.exports = {
    apiAuth,
};
