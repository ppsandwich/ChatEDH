import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  applyRuling,
  perspective,
  rulingSchema,
  validateGame,
  type Game,
} from "../src/lib/game.ts";
import { OPPONENT, REFEREE, PRIORITY_CHECK } from "./prompts.ts";
if (!process.env.VITEST) {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
export const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "3mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.path.startsWith("/api")) {
    res.setHeader("Cache-Control", "no-store");
    const origin = req.get("origin");
    if (origin && new URL(origin).host !== req.get("host")) {
      res
        .status(403)
        .json({ error: "Cross-origin API requests are not allowed." });
      return;
    }
  }
  next();
});
const limits = new Map<string, { start: number; count: number }>();
app.use("/api", (req, res, next) => {
  const ip = req.ip ?? "local";
  const now = Date.now();
  const x = limits.get(ip);
  if (!x || now - x.start > 60_000) limits.set(ip, { start: now, count: 1 });
  else if (++x.count > 40) {
    res
      .status(429)
      .json({ error: "Too many requests. Wait a minute before continuing." });
    return;
  }
  if (limits.size > 10000)
    for (const [k, v] of limits) if (now - v.start > 60_000) limits.delete(k);
  next();
});
app.get("/api/status", (_req, res) =>
  res.json({
    serverKey: !!process.env.OPENROUTER_API_KEY,
    accessTokenRequired: !!process.env.CHATEDH_ACCESS_TOKEN,
  }),
);
const reqSchema = z.object({
  key: z.string().max(500).optional(),
  accessToken: z.string().max(500).optional(),
  model: z.string().min(3).max(160),
  game: z.unknown(),
  action: z.string().min(1).max(4000).optional(),
  actor: z.enum(["you", "ai", "system"]).default("you"),
  autoPass: z.boolean().default(false),
});
async function completion(
  key: string,
  model: string,
  system: string,
  context: unknown,
  signal: AbortSignal,
) {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "ChatEDH",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(context) },
        ],
        response_format: { type: "json_object" },
        max_tokens: 6000,
        temperature: 0.2,
      }),
    },
  );
  if (!response.ok) {
    await response.text();
    throw new Error(
      response.status === 401
        ? "OpenRouter rejected the API key."
        : response.status === 402
          ? "OpenRouter credits are exhausted."
          : response.status === 429
            ? "OpenRouter rate limit reached. Try again shortly."
            : `OpenRouter returned ${response.status}. Check the model supports JSON output and is available.`,
    );
  }
  const body = await response.json();
  if (body.error)
    throw new Error(
      "OpenRouter could not complete this request. Try a different model.",
    );
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string")
    throw new Error("The model returned no usable response.");
  try {
    return JSON.parse(
      content.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""),
    );
  } catch {
    throw new Error(
      "The model returned invalid JSON. Your game has not changed.",
    );
  }
}
app.post("/api/play", async (req, res) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    const input = reqSchema.parse(req.body);
    const key = input.key || process.env.OPENROUTER_API_KEY;
    if (
      process.env.CHATEDH_ACCESS_TOKEN &&
      input.accessToken !== process.env.CHATEDH_ACCESS_TOKEN
    ) {
      res.status(401).json({
        error: "Enter the server access token in connection settings.",
      });
      return;
    }
    if (!key) {
      res.status(400).json({ error: "Connect an OpenRouter API key to play." });
      return;
    }
    let game = validateGame(input.game);
    if (game.status !== "playing")
      throw new Error("Keep your opening hand before taking an action.");
    if (input.actor !== "system" && game.priority !== input.actor)
      throw new Error("That player does not have priority.");
    let action = input.action;
    let announcement = "";
    if (input.autoPass) {
      if (input.actor !== "you" || game.priority !== "you")
        throw new Error("Automatic passing requires human priority.");
      const check = z
        .object({
          canAct: z.boolean(),
          pendingChoice: z.boolean(),
          uncertain: z.boolean(),
        })
        .parse(
          await completion(
            key,
            input.model,
            PRIORITY_CHECK,
            { state: perspective(game, "referee") },
            controller.signal,
          ),
        );
      if (check.canAct || check.pendingChoice || check.uncertain) {
        // A read-only check must not add a log entry (which would alter pass tracking).
        res.json({ game, autoPassed: false, steps: 0, baseId: game.id });
        return;
      }
      action =
        "Pass priority. The referee confirmed I have no legal action and no pending choice. This is one ordinary pass only: resolve only the top stack item or advance one step if both players have passed.";
    }
    if (input.actor === "ai") {
      const decision = z
        .object({
          action: z.string().min(1).max(4000),
          announcement: z.string().max(1000),
        })
        .parse(
          await completion(
            key,
            input.model,
            OPPONENT,
            perspective(game, "opponent"),
            controller.signal,
          ),
        );
      action = decision.action;
      announcement = decision.announcement;
    }
    if (!action) throw new Error("An action is required.");
    // All adjudication stages commit together. A timeout/error never partially changes a game.
    const original = game;
    const summaries: string[] = [];
    let continuing = false;
    for (let i = 0; i < 5; i++) {
      const result = rulingSchema.parse(
        await completion(
          key,
          input.model,
          REFEREE,
          {
            state: perspective(game, "referee"),
            actor: input.actor,
            action,
            continuing,
            outputSchema: z.toJSONSchema(rulingSchema),
          },
          controller.signal,
        ),
      );
      if (input.autoPass && i === 0 && result.operations.length === 0)
        throw new Error(
          "The referee could not confirm a priority pass. Act or pass manually.",
        );
      if (input.autoPass && i === 0)
        result.summary = `Automatically passed priority (no legal actions). ${result.summary}`;
      game = applyRuling(game, result, input.actor);
      summaries.push(result.summary);
      if (!result.continueResolution || game.status === "finished") {
        res.json({
          game,
          announcement,
          steps: summaries.length,
          baseId: original.id,
          autoPassed: input.autoPass,
        });
        return;
      }
      continuing = true;
    }
    throw new Error(
      "This resolution exceeded five AI steps. No changes were applied. Split the action or use the state editor.",
    );
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "The AI response or game data failed validation. No changes were applied."
        : error instanceof Error
          ? error.name === "AbortError"
            ? "The AI request timed out or was cancelled. No changes were applied."
            : error.message
          : "Unable to complete this action.";
    res.status(400).json({ error: message });
  } finally {
    clearTimeout(timeout);
  }
});
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
app.use(express.static(path.join(root, "dist")));
app.get("/{*path}", (_req, res) =>
  res.sendFile(path.join(root, "dist/index.html")),
);
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res.status(400).json({
      error:
        error instanceof SyntaxError
          ? "Invalid JSON request."
          : "The request could not be processed.",
    });
  },
);
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT) || 3001;
  app.listen(port, "127.0.0.1", () =>
    console.log(`ChatEDH server: http://localhost:${port}`),
  );
}
