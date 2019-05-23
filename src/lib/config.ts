import { env } from "process";

export const LOG_LEVEL = (env.LOG_LEVEL || "info").toLowerCase();
export const SSH_PORT = parseInt(env.SSH_PORT || "22");
export const HTTP_PORT = parseInt(env.HTTP_PORT || "80");
