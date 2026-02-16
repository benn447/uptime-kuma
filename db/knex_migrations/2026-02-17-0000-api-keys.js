exports.up = function (knex) {
    return knex.schema.hasTable("api_key").then(function (exists) {
        if (!exists) {
            return knex.schema.createTable("api_key", function (table) {
                table.increments("id");
                table.comment("API keys for REST API authentication");
                table.string("name", 200).notNullable().comment("Human-readable name for the API key");
                table.string("key", 200).notNullable().unique().comment("The API key value");
                table
                    .integer("user_id")
                    .unsigned()
                    .notNullable()
                    .references("id")
                    .inTable("user")
                    .onDelete("CASCADE")
                    .onUpdate("CASCADE")
                    .comment("User who owns this API key");
                table.boolean("active").defaultTo(true).notNullable().comment("Whether the key is active");
                table.datetime("created_date").defaultTo(knex.fn.now()).comment("When the key was created");
                table.datetime("expiry_date").nullable().comment("When the key expires (null = no expiry)");
                table.datetime("last_used").nullable().comment("When the key was last used");
            });
        }
    });
};

exports.down = function (knex) {
    return knex.schema.hasTable("api_key").then(function (exists) {
        if (exists) {
            return knex.schema.dropTable("api_key");
        }
    });
};
