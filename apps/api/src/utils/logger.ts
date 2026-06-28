import { env } from "../env.js";

export const loggerOptions =
  env.NODE_ENV === "development"
    ? {
        level: "debug",
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard"
          }
        }
      }
    : {
        level: "info"
      };
