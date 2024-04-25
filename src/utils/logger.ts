import winston from "winston";
import { LEVEL } from "triple-beam";
import path from "node:path";

const logDir = path.resolve(process.cwd(), "logs");

// 创建自定义格式，包括时间戳、颜色编码和日志级别
const createLogFormat = (flag: "console" | "file", onlyLevel?: string) => {
  const logFormat = winston.format.combine(
    winston.format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss"
    }),
    flag !== "file" &&process.stdout.isTTY ? winston.format.colorize({ all: true }) : winston.format.uncolorize(),
    winston.format.printf(
      info => {
        const pattern = `${info.timestamp} [${info.level}]: ${info.message}`;
        if (onlyLevel) {
          // 上了色之后，level会被污染，所以需要从info[LEVEL]中取原始的level，这个看不懂就打一次断点自己看看
          return (info[LEVEL] === onlyLevel || info.level === onlyLevel) ? pattern : "";
        }
        return pattern;
      }
    )
  );
  return logFormat;
}

const winstonLogger = winston.createLogger({
  level: "silly",
  format: createLogFormat("console"),
  transports: [
    // 控制台输出配置
    new winston.transports.Console({
      // 控制台记录所有级别的日志
      level: "silly",
      format: createLogFormat("console"),
    }),
    // 错误日志文件输出配置
    new winston.transports.File({
      filename: "error.log",
      dirname: logDir,
      level: "error",
      format: createLogFormat("file", "error"),
      // 日志文件最大5MB
      maxsize: 5120000,
      // 最多保留5个日志文件
      maxFiles: 5,
    }),
    // 警告日志文件输出配置（仅记录 "warn" 级别）
    new winston.transports.File({
      filename: "warn.log",
      dirname: logDir,
      level: "warn",
      format: createLogFormat("file", "warn"),
      maxsize: 5120000,
      maxFiles: 5,
    }),
    // 所有级别的日志均输出到all.log文件
    new winston.transports.File({
      filename: "all.log",
      dirname: logDir,
      format: createLogFormat("file"),
      // 日志文件最大20MB
      maxsize: 20480000,
      maxFiles: 5,
    }),
  ]
});

// 封装自己的logger以支持可以传入任意多个参数
export const logger = {
  error: (...args: unknown[]) => {
    // 避免对象被打印成[object Object]
    if (args.length === 1) {
      return winstonLogger.error(args[0]);
    }
    return winstonLogger.error(args.join(" "));
  },
  warn: (...args: unknown[]) => {
    if (args.length === 1) {
      return winstonLogger.warn(args[0]);
    }
    return winstonLogger.warn(args.join(" "));
  },
  log: (...args: unknown[]) => {
    if (args.length === 1) {
      return winstonLogger.info(args[0]);
    }
    return winstonLogger.info(args.join(" "));
  },
  info: (...args: unknown[]) => {
    if (args.length === 1) {
      return winstonLogger.info(args[0]);
    }
    return winstonLogger.info(args.join(" "));
  },
  verbose: (...args: unknown[]) => {
    if (args.length === 1) {
      return winstonLogger.verbose(args[0]);
    }
    return winstonLogger.verbose(args.join(" "));
  },
  debug: (...args: unknown[]) => {
    if (args.length === 1) {
      return winstonLogger.debug(args[0]);
    }
    return winstonLogger.debug(args.join(" "));
  },
  silly: (...args: unknown[]) => {
    if (args.length === 1) {
      return winstonLogger.silly(args[0]);
    }
    return winstonLogger.silly(args.join(" "));
  },
};
