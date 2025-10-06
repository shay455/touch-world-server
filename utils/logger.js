const colors = {
  reset: "\x1b[0m",
  success: "\x1b[32m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  trade: "\x1b[35m",
  chat: "\x1b[90m",
};

function log(color, type, message, data) {
  const timestamp = new Date().toLocaleTimeString();
  let logMessage = `${colors.chat}[${timestamp}]${color}[${type}] ${message}${colors.reset}`;
  if (data && Object.keys(data).length > 0) {
    logMessage += ` ${JSON.stringify(data)}`;
  }
  console.log(logMessage);
}

export const Logger = {
  success: (message, data) => log(colors.success, 'SUCCESS', message, data),
  info: (message, data) => log(colors.info, 'INFO', message, data),
  warn: (message, data) => log(colors.warn, 'WARN', message, data),
  error: (message, data) => log(colors.error, 'ERROR', message, data),
  connection: (message, data) => log(colors.info, 'CONNECT', message, data),
  trade: (message, data) => log(colors.trade, 'TRADE', message, data),
  chat: (message, data) => log(colors.chat, 'CHAT', message, data),
  stats: (message, data) => log(colors.info, 'STATS', message, data),
};
