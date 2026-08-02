/**
 * Remote MCP over Streamable HTTP.
 *
 * `src/mcp/server.ts` speaks stdio, which is what a locally-spawned MCP server
 * uses. A **hosted connector** — the thing you paste a URL into in Claude or
 * ChatGPT — cannot spawn a process; it makes HTTP requests. So the same tools
 * are exposed here over the transport a remote client can actually reach,
 * mounted on the existing Fastify app so one deployment serves both surfaces.
 *
 * The tools themselves are not redefined: `buildMcpServer()` is shared, so REST
 * and MCP can never drift apart. That is AGENTS.md law 6 — every capability is
 * a REST endpoint first, and MCP is a thin surface over it.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildMcpServer, setPublicOrigin } from "./server.js";
import { config } from "../config.js";

/**
 * Whether a request may use the MCP surface.
 *
 * A hosted connector often cannot set arbitrary headers, so a key in the query
 * string is accepted as well. That is a real trade-off and worth stating: a URL
 * containing a key leaks through browser history, logs and screen shares, so it
 * is convenience for a personal deployment, not a pattern for a shared one.
 */
function authorised(request: FastifyRequest): boolean {
  const header = request.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  const query = (request.query as { key?: string } | undefined)?.key;
  const presented = bearer ?? query;
  return Boolean(presented && config.apiKeys.includes(presented));
}

export function registerMcpHttp(app: FastifyInstance): void {
  /**
   * Stateless: a fresh server and transport per request.
   *
   * MCP supports long-lived sessions, but flyer generation is already
   * request/response against a persistent job store — there is no conversation
   * state to keep in memory. Stateless means a restart or a second instance
   * cannot strand a session, which matters on a platform that sleeps and
   * restarts free services.
   */
  const handle = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!authorised(request)) {
      reply.status(401).send({
        error: {
          code: "unauthorized",
          message: "Provide a valid key as a Bearer token or ?key=… on the connector URL",
        },
      });
      return;
    }

    /*
     * Record where the client reached us, so links handed back are ones they
     * can actually open. Forwarded headers first: behind Render's proxy the
     * socket sees plain HTTP on an internal port.
     */
    const proto = String(request.headers["x-forwarded-proto"] ?? request.protocol ?? "https")
      .split(",")[0]!
      .trim();
    const host = String(request.headers["x-forwarded-host"] ?? request.headers.host ?? "").split(
      ",",
    )[0]!.trim();
    setPublicOrigin(host ? `${proto}://${host}` : null);

    const server = buildMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    reply.raw.on("close", () => {
      void transport.close();
      void server.close();
    });

    /**
     * Normalise Accept before the transport sees it.
     *
     * StreamableHTTP insists the client accept *both* application/json and
     * text/event-stream, and returns 406 otherwise. Plenty of clients send only
     * application/json — a spec-legal request that a connector cannot recover
     * from, and which looks to the user exactly like "cannot connect". We reply
     * with JSON anyway (enableJsonResponse), so demanding the stream type is a
     * handshake detail the caller should not have to care about.
     */
    const accept = String(request.headers.accept ?? "");
    if (!accept.includes("text/event-stream") || !accept.includes("application/json")) {
      const both = "application/json, text/event-stream";
      request.raw.headers.accept = both;
      /*
       * `rawHeaders` too, and that is the one that actually matters: the
       * transport converts the Node request into a web-standard Request and
       * reads Accept from *that*, so mutating only the parsed `headers` object
       * changed nothing and the 406 persisted. Node keeps rawHeaders as a flat
       * [name, value, name, value] array.
       */
      const raw = request.raw.rawHeaders;
      let found = false;
      for (let i = 0; i < raw.length; i += 2) {
        if (raw[i]?.toLowerCase() === "accept") {
          raw[i + 1] = both;
          found = true;
        }
      }
      if (!found) raw.push("accept", both);
    }

    await server.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
  };

  app.post("/mcp", handle);
  // GET and DELETE are part of the transport contract; without them a client
  // that opens a stream or tears a session down gets a 404 instead of an answer.
  app.get("/mcp", handle);
  app.delete("/mcp", handle);
}
