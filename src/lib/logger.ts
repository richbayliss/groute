import { LOG_LEVEL } from "./config";
import * as winston from "winston";
const format = winston.format;

export const logger = winston.createLogger({
  level: LOG_LEVEL,
  transports: [
    new winston.transports.Console({
      format: format.combine(format.colorize(), format.simple())
    })
  ]
});
