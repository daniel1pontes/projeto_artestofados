const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '../../logs');
    this.logFile = path.join(this.logDir, `app_${this.getDateString()}.log`);
    this.ensureLogDir();
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  getDateString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  getTimestamp() {
    return new Date().toISOString();
  }

  formatMessage(level, message, data = null) {
    const timestamp = this.getTimestamp();
    let logMessage = `[${timestamp}] [${level}] ${message}`;
    
    if (data) {
      logMessage += ` | Data: ${JSON.stringify(data)}`;
    }
    
    return logMessage;
  }

  writeToFile(message) {
    try {
      fs.appendFileSync(this.logFile, message + '\n', 'utf8');
    } catch (error) {
      console.error('Erro ao escrever no arquivo de log:', error);
    }
  }

  info(message, data = null) {
    const formattedMessage = this.formatMessage('INFO', message, data);
    console.log('\x1b[36m%s\x1b[0m', formattedMessage); // Cyan
    this.writeToFile(formattedMessage);
  }

  warn(message, data = null) {
    const formattedMessage = this.formatMessage('WARN', message, data);
    console.warn('\x1b[33m%s\x1b[0m', formattedMessage); // Yellow
    this.writeToFile(formattedMessage);
  }

  error(message, error = null) {
    const errorData = error ? {
      message: error.message,
      stack: error.stack
    } : null;
    
    const formattedMessage = this.formatMessage('ERROR', message, errorData);
    console.error('\x1b[31m%s\x1b[0m', formattedMessage); // Red
    this.writeToFile(formattedMessage);
  }

  success(message, data = null) {
    const formattedMessage = this.formatMessage('SUCCESS', message, data);
    console.log('\x1b[32m%s\x1b[0m', formattedMessage); // Green
    this.writeToFile(formattedMessage);
  }

  debug(message, data = null) {
    if (process.env.NODE_ENV === 'development') {
      const formattedMessage = this.formatMessage('DEBUG', message, data);
      console.log('\x1b[35m%s\x1b[0m', formattedMessage); // Magenta
      this.writeToFile(formattedMessage);
    }
  }
}

module.exports = new Logger();