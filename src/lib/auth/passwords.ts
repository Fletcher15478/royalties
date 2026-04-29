import bcrypt from "bcryptjs";

export async function hashPassword(password: string) {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return await bcrypt.compare(password, passwordHash);
}

