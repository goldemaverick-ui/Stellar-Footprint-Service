import { createHash } from "crypto";
import { Request, Response } from "express";
import { simulateTransaction } from "../services/simulator";
import { Network } from "../config/stellar";
import { footprintDiff } from "../services/footprintDiff";
import metrics from "../middleware/metrics";
import { validateXdr, type XdrInputType } from "../services/validator";
import { recordFailure } from "../middleware/bruteForce";
import * as StellarSdk from "@stellar/stellar-sdk";

export async function simulate(req: Request, res: Response): Promise<void> {
  const { xdr, network, dryRun } = req.body as {
    xdr?: string;
    network?: Network;
    dryRun?: boolean;
  };

  if (!xdr) {
    recordFailure(req.ip || req.socket.remoteAddress || "unknown");
    res.status(400).json({ error: "Missing required field: xdr" });
    return;
  }

  // Validate network parameter
  if (network && network !== "mainnet" && network !== "testnet") {
    recordFailure(req.ip || req.socket.remoteAddress || "unknown");
    res
      .status(400)
      .json({ error: "Invalid network. Use 'testnet' or 'mainnet'" });
    return;
  }

  const net: Network = network === "mainnet" ? "mainnet" : "testnet";

  // Dry-run: parse XDR locally, skip RPC
  if (dryRun) {
    try {
      const passphrase =
        net === "mainnet"
          ? StellarSdk.Networks.PUBLIC
          : StellarSdk.Networks.TESTNET;
      const tx = StellarSdk.TransactionBuilder.fromXDR(xdr, passphrase);
      const ops =
        tx instanceof StellarSdk.FeeBumpTransaction
          ? tx.innerTransaction.operations
          : tx.operations;
      res.status(200).json({
        valid: true,
        operationCount: ops.length,
        operationType: ops[0]?.type ?? "unknown",
        network: net,
      });
    } catch (err: unknown) {
      res.status(400).json({
        valid: false,
        error: err instanceof Error ? err.message : "Failed to parse XDR",
      });
    }
    return;
  }

  // Track active simulations
  metrics.incrementActiveSimulations();

  try {
    const result = await simulateTransaction(xdr, net, res.locals.abortSignal);

    // Record simulation metrics
    metrics.recordSimulation(net, result.success);

    if (!result.success) {
      recordFailure(req.ip || req.socket.remoteAddress || "unknown");
    }

    if (result.success) {
      const body = JSON.stringify(result);
      const etag = `"${createHash("sha256").update(body).digest("hex")}"`;

      if (req.headers["if-none-match"] === etag) {
        res.status(304).end();
        return;
      }

      res
        .status(200)
        .set("ETag", etag)
        .set("Cache-Control", "public, max-age=60")
        .json(result);
    } else {
      res.status(422).json(result);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";

    // Record failed simulation
    metrics.recordSimulation(net, false);
    recordFailure(req.ip || req.socket.remoteAddress || "unknown");

    res.status(500).json({ error: message });
  } finally {
    // Decrement active simulations
    metrics.decrementActiveSimulations();
  }
}

export async function footprintDiffController(req: Request, res: Response): Promise<void> {
  const { before, after } = req.body as {
    before?: {
      footprint?: {
        readOnly: any[];
        readWrite: any[];
      } | null;
    };
    after?: {
      footprint?: {
        readOnly: any[];
        readWrite: any[];
      } | null;
    };
  };

  if (!before || !after) {
    res.status(400).json({ error: "Missing required fields: before and after" });
    return;
  }

  try {
    const beforeFootprint = before.footprint ?? { readOnly: [], readWrite: [] };
    const afterFootprint = after.footprint ?? { readOnly: [], readWrite: [] };

    const typedBefore = {
      footprint: {
        readOnly: beforeFootprint.readOnly as any[],
        readWrite: beforeFootprint.readWrite as any[],
      },
    };

    const typedAfter = {
      footprint: {
        readOnly: afterFootprint.readOnly as any[],
        readWrite: afterFootprint.readWrite as any[],
      },
    };

    const result = footprintDiff(typedBefore, typedAfter);
    res.status(200).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    res.status(500).json({ error: message });
  }
}

export function validate(req: Request, res: Response): void {
  const { xdr, type } = req.body as { xdr?: string; type?: string };

  if (!xdr) {
    res.status(400).json({ error: "Missing required field: xdr" });
    return;
  }

  if (type && type !== "transaction" && type !== "operation") {
    res.status(400).json({ error: "Invalid type. Use 'transaction' or 'operation'" });
    return;
  }

  const result = validateXdr(xdr, (type as XdrInputType) ?? "transaction");
  res.status(result.valid ? 200 : 400).json(result);
}
