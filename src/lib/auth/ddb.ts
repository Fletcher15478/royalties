import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { requireDdbEnv } from "@/lib/env";

export type UserRecord = {
  email: string; // PK
  passwordHash: string;
  role: "admin";
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

function ddbDoc() {
  const env = requireDdbEnv();
  const client = new DynamoDBClient({ region: env.DDB_REGION });
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const env = requireDdbEnv();
  const ddb = ddbDoc();
  const res = await ddb.send(
    new GetCommand({
      TableName: env.DDB_USERS_TABLE,
      Key: { email: email.toLowerCase() },
    })
  );
  return (res.Item as UserRecord | undefined) ?? null;
}

export async function upsertUser(user: { email: string; passwordHash: string; role: "admin" }) {
  const env = requireDdbEnv();
  const ddb = ddbDoc();
  const now = new Date().toISOString();
  const item: UserRecord = {
    email: user.email.toLowerCase(),
    passwordHash: user.passwordHash,
    role: user.role,
    createdAt: now,
    updatedAt: now,
  };
  await ddb.send(
    new PutCommand({
      TableName: env.DDB_USERS_TABLE,
      Item: item,
    })
  );
  return item;
}

