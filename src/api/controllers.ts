import { Request, Response } from "express";
import { simulateTransaction } from "../services/simulator";
import { Network } from "../config/stellar";
import metrics from "../middleware/metrics";
import { ResponseEnvelope } from "../types";

export async function simulate(req: Request, res: Response): Promise<void> {
  const { xdr, network } = req.body as { xdr?: string; network?: Network };

  if (!xdr) {
    const envelope: ResponseEnvelope = {
      success: false,
      error: "Missing required field: xdr",
    };
    res.status(400).json(envelope);
    return;
  }

  // Validate network parameter
  if (network && network !== "mainnet" && network !== "testnet") {
    const envelope: ResponseEnvelope = {
      success: false,
      error: "Invalid network. Use 'testnet' or 'mainnet'",
    };
    res.status(400).json(envelope);
    return;
  }

  const net: Network = network === "mainnet" ? "mainnet" : "testnet";

  // Track active simulations
  metrics.incrementActiveSimulations();

  try {
    const result = await simulateTransaction(xdr, net, res.locals.abortSignal);

    // Record simulation metrics
    metrics.recordSimulation(net, result.success);

    const envelope: ResponseEnvelope = result.success
      ? { success: true, data: result }
      : { success: false, error: result.error };

    res.status(result.success ? 200 : 422).json(envelope);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";

    // Record failed simulation
    metrics.recordSimulation(net, false);

    const envelope: ResponseEnvelope = {
      success: false,
      error: message,
    };
    res.status(500).json(envelope);
  } finally {
    // Decrement active simulations
    metrics.decrementActiveSimulations();
  }
}

export async function footprintDiffController(
  req: Request,
  res: Response,
): Promise<void> {
  const { before, after } = req.body as {
    before?: string[];
    after?: string[];
  };

  if (!before || !after) {
    const envelope: ResponseEnvelope = {
      success: false,
      error: "Missing required fields: before, after",
    };
    res.status(400).json(envelope);
    return;
  }

  try {
    // Placeholder implementation
    const added = after.filter((item) => !before.includes(item));
    const removed = before.filter((item) => !after.includes(item));

    const envelope: ResponseEnvelope = {
      success: true,
      data: { added, removed },
    };
    res.status(200).json(envelope);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    const envelope: ResponseEnvelope = {
      success: false,
      error: message,
    };
    res.status(500).json(envelope);
  }
}

export async function validate(req: Request, res: Response): Promise<void> {
  const { xdr, type } = req.body as { xdr?: string; type?: string };

  if (!xdr) {
    const envelope: ResponseEnvelope = {
      success: false,
      error: "Missing required field: xdr",
    };
    res.status(400).json(envelope);
    return;
  }

  try {
    // Placeholder implementation - just validate XDR format
    const isValid = typeof xdr === "string" && xdr.length > 0;

    const envelope: ResponseEnvelope = {
      success: true,
      data: { valid: isValid, type: type || "unknown" },
    };
    res.status(200).json(envelope);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    const envelope: ResponseEnvelope = {
      success: false,
      error: message,
    };
    res.status(500).json(envelope);
  }
}

