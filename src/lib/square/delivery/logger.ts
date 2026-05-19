const PREFIX = "[delivery-royalty]";

export const deliveryLog = {
  info(message: string, meta?: Record<string, unknown>) {
    console.log(PREFIX, message, meta ?? "");
  },
  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(PREFIX, message, meta ?? "");
  },
  error(message: string, err?: unknown, meta?: Record<string, unknown>) {
    console.error(PREFIX, message, { err, ...meta });
  },
};
