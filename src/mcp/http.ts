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
import { buildMcpServer } from "./server.js";
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

    const server = buildMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    reply.raw.on("close", () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
  };

  app.post("/mcp", handle);
  // GET and DELETE are part of the transport contract; without them a client
  // that opens a stream or tears a session down gets a 404 instead of an answer.
  app.get("/mcp", handle);
  app.delete("/mcp", handle);
}
