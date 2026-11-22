const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const sslCaPath = process.env.DB_SSL_CA_PATH;

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ...(sslCaPath
        ? {
            ssl: {
                ca: fs.readFileSync(
                    path.resolve(sslCaPath),
                    "utf8"
                ),
                rejectUnauthorized: true,
            },
        }
        : {}),
});

module.exports = pool;