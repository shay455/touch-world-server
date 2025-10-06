// Simple console logger with colors
const colors = {
    info: '\x1b[36m',    // Cyan
    success: '\x1b[32m', // Green
    error: '\x1b[31m',   // Red
    warn: '\x1b[33m',    // Yellow
    chat: '\x1b[35m',    // Magenta
    reset: '\x1b[0m'
};

export const Logger = {
    info(message) {
        console.log(`${colors.info}[INFO]${colors.reset} ${message}`);
    },
    success(message) {
        console.log(`${colors.success}[SUCCESS]${colors.reset} ${message}`);
    },
    error(message) {
        console.error(`${colors.error}[ERROR]${colors.reset} ${message}`);
    },
    warn(message) {
        console.log(`${colors.warn}[WARN]${colors.reset} ${message}`);
    },
    connection(message) {
        console.log(`[CONN] ${message}`);
    },
    chat(message) {
         console.log(`${colors.chat}[CHAT]${colors.reset} ${message}`);
    }
};
