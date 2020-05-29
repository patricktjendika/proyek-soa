const dotenv = require('dotenv');
dotenv.config();
const config = {
    database: {
        host: process.env.DB_HOST_HOSTED,
        user: process.env.DB_USER_HOSTED,
        password: process.env.DB_PASS_HOSTED,
        port: process.env.DB_PORT_HOSTED,
        database: process.env.DB_NAME_HOSTED
    }
}

module.exports = config;