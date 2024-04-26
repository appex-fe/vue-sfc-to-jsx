import { logger } from "@/utils/logger";

process.on("uncaughtException", (err) => {
  logger.error(err.message);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  // TODO: implement better error2string
  logger.error(err);
  process.exit(1);
});
