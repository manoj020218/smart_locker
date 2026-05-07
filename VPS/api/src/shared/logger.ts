/* eslint-disable no-console */
type Level = "info" | "warn" | "error";

const fmt = (level: Level, message: string, extra?: unknown): string => {
  const base = {
    ts: new Date().toISOString(),
    level,
    message
  };
  return JSON.stringify(extra === undefined ? base : { ...base, extra });
};

export const log = {
  info: (message: string, extra?: unknown): void => {
    console.log(fmt("info", message, extra));
  },
  warn: (message: string, extra?: unknown): void => {
    console.warn(fmt("warn", message, extra));
  },
  error: (message: string, extra?: unknown): void => {
    console.error(fmt("error", message, extra));
  }
};
