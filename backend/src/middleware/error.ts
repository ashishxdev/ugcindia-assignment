import type { ErrorRequestHandler } from "express";
import { MongoServerError } from "mongodb";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { AppError } from "../lib/errors";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  if (error instanceof ZodError) {
    res
      .status(400)
      .json({ message: error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  if (error instanceof MongoServerError && error.code === 11000) {
    res.status(409).json({ message: "That record already exists" });
    return;
  }

  if (error instanceof mongoose.Error.CastError) {
    res.status(400).json({ message: "Invalid record id" });
    return;
  }

  console.error(error);
  res.status(500).json({ message: "Something went wrong" });
};
