import { SquareClient, SquareEnvironment } from "square";
import { env } from "@/lib/env";

function getSquareEnvironment() {
  return env.SQUARE_ENVIRONMENT === "sandbox"
    ? SquareEnvironment.Sandbox
    : SquareEnvironment.Production;
}

export function getSquareClient() {
  return new SquareClient({
    token: env.SQUARE_ACCESS_TOKEN,
    environment: getSquareEnvironment(),
  });
}

