import bcrypt from "bcryptjs";
import { cfg } from "../config.js";

export const hashPassword = async (plain: string): Promise<string> => bcrypt.hash(plain, cfg.bcryptRounds);

export const verifyPassword = async (plain: string, hashed: string): Promise<boolean> => bcrypt.compare(plain, hashed);
