import fs from 'fs';
import path from 'path';

// 定义日志级别类型
const LogLevels = {
  warning: 'warn',
  error: 'error',
  info: 'info',
} as const;

type LogLevel = keyof typeof LogLevels;
type LogFunction = (file: string, line: number | string, message: string) => void;

interface LogEntry {
  timestamp: string;
  file: string;
  line: number | string;
  message: string;
}

class Logger {
  private static instance: Logger;
  private logDirectory: string;
  // 在这里预先声明所有日志级别的方法
  public warning!: LogFunction;
  public error!: LogFunction;
  public info!: LogFunction;

  private constructor() {
    this.logDirectory = path.join(process.cwd(), 'log');
    this.ensureDirectoryExistence(this.logDirectory);
    this.initializeLogFiles();
    this.createLogMethod();
  }

  /**
   * @description: 获取日志实例
   * 这里保证了全局只有一个日志实例
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * @description: 确保系统中含有 log 目录 ，如果没有则创建
   */
  private ensureDirectoryExistence(directoryPath: string) {
    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath);
    }
  }

  /**
   * @description: 根据日志类别生成对应的类别的日志文件
   */
  private initializeLogFiles() {
    Object.keys(LogLevels).forEach((level) => {
      const logFilePath = path.join(this.logDirectory, `${level}.json`);
      if (!fs.existsSync(logFilePath)) {
        fs.writeFileSync(logFilePath, JSON.stringify([], null, 2));
      }
    });
  }

  /**
   * @description: 根据日志级别动态创建日志入口的方法
   */
  private createLogMethod() {
    // 遍历 LogLevels 的键，也就是各种日志级别
    for (const level of Object.keys(LogLevels) as LogLevel[]) {
      // 根据日志级别，动态创建方法
      this[level] = (file: string, line: number
        | string, message: string) => {
        // 调用对应控制台方法输出日志
        this.log(level, file, line, message);
      };
    }
  }

  /**
* @description: 安全解析JSON 串，对JSON 串做一层过滤判断
* @param str 待解析的JSON 串
* @param defaultValue 默认值 {}
* @return 解析成功之后的值 或者 默认值
*/
  private safeJsonParse = <T>(str: any, defaultValue: T = {} as T): T => {
    let result = defaultValue
    if (typeof str === "string") {
      try {
        result = JSON.parse(str)
      } catch (error) {
        console.error("JSON parse error", error)
      }
      return result
    } else {
      return result
    }
  }

  /**
   * @description: 记录日志的入口方法
   * @param level  日志级别
   * @param file  文件路径
   * @param line  行号
   * @param message 日志信息
   */
  private log(level: LogLevel, file: string, line: number | string, message: string) {
    console.log(`[${level.toUpperCase()}] [${file}:${line}] ${message}`);
    const logFilePath = path.join(this.logDirectory, `${level}.json`);
    const logEntry = {
      timestamp: new Date().toLocaleString(),
      file,
      line,
      message
    };
    const logData = this.safeJsonParse<LogEntry[]>(fs.readFileSync(logFilePath, 'utf8'), []);
    logData.push(logEntry);
    fs.writeFileSync(logFilePath, JSON.stringify(logData, null, 2));
  }
}

const logger = Logger.getInstance();

export default logger;