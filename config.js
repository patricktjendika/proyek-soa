const dotenv = require('dotenv');
dotenv.config();
const config = {
    database: {
        host: process.env.DB_HOST_LOCAL,
        user: process.env.DB_USER_LOCAL,
        password: process.env.DB_PASS_LOCAL,
        port: process.env.DB_PORT_LOCAL,
        database: process.env.DB_NAME_LOCAL
    }
}

module.exports = config;