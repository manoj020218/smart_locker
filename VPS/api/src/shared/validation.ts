import { ZodError, type ZodSchema } from "zod";
import { badRequest } from "./errors.js";

export const parseBody = <T>(schema: ZodSchema<T>, input: unknown): T => {
  try {
    return schema.parse(input);
  } catch (err) {
    if (err instanceof ZodError) {
      throw badRequest("Invalid request body", err.issues);
    }
    throw err;
  }
};

export const parseQuery = <T>(schema: ZodSchema<T>, input: unknown): T => {
  try {
    return schema.parse(input);
  } catch (err) {
    if (err instanceof ZodError) {
      throw badRequest("Invalid query string", err.issues);
    }
    throw err;
  }
};
