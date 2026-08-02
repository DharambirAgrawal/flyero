import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../src/api/server.js";
import { config } from "../../src/config.js";

/**
 * The published composition examples must actually compose.
 *
 * These were never tested. That is a worse gap than it sounds: the MCP
 * instructions tell an agent to fetch an example and copy it, so the example is
 * the single most influential text in the system — more so than the guide,
 * because an agent copies structure far more faithfully than it follows prose.
 * An example that does not compose sends every caller into a retry loop against
 * a shape we published ourselves.
 *
 * These tests run the real route, not a hand-built object, so an example can
 * never drift away from the schema it is meant to demonstrate.
 */

let app: FastifyInstance;
const auth = { authorization: `Bearer ${config.apiKeys[0]}` };

beforeAll(async () => {
  app = buildServer();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

/**
 * A lineage this example can actually be sent as-is.
 *
 * Deliberately mirrors what a caller must do rather than papering over it. Two
 * things vary per assignment and both will reject a composition that ignores
 * them: `direction.density` narrows the element budget (quiet 4-5, balanced
 * 5-6, rich 6-7), and `direction.gesture.requiresComponent` can demand a
 * specific component be present. An example is only honestly "copyable" if a
 * caller who reads those two fields can paste it and have it work.
 */
async function lineageFor(
  fitsDensity: readonly string[],
  elementCount: number,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/studio/assignments",
      headers: auth,
      payload: { brief: `A community planting day in a small park ${attempt}`, runs: 3 },
    });
    expect(res.statusCode).toBe(200);
    for (const assignment of res.json().assignments) {
      const density = assignment.direction.artDirection.density;
      const requires = assignment.direction.gesture.requiresComponent ?? null;
      const budget = { quiet: [4, 5], balanced: [5, 6], rich: [6, 7] }[
        density as "quiet" | "balanced" | "rich"
      ]!;
      const fits =
        fitsDensity.includes(density) &&
        elementCount >= budget[0]! &&
        elementCount <= budget[1]! &&
        !requires;
      if (fits) return assignment.lineage;
    }
  }
  throw new Error(`no assignment found that this ${elementCount}-element example fits`);
}

describe("the published composition examples", () => {
  it("serves two, so neither reads as the only answer", async () => {
    // One example is copied as a template; two are compared as a range. Real
    // output collapsed onto "photograph, paragraph, button, lots of paper"
    // because that was the only shape ever shown.
    const res = await app.inject({ method: "GET", url: "/v1/schema/composition", headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.examples).toHaveLength(2);
    const names = body.examples.map((e: { name: string }) => e.name);
    expect(names).toContain("photo-led");
    expect(names).toContain("assembled");
    for (const example of body.examples) {
      expect(example.useWhen.length).toBeGreaterThan(20);
    }
  });

  it("shows an assembled evidence element, not only a photograph", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/schema/composition", headers: auth });
    const assembled = res
      .json()
      .examples.find((e: { name: string }) => e.name === "assembled").composition;
    const evidence = assembled.elements.find(
      (e: { role: string }) => e.role === "evidence",
    );
    expect(evidence.component).toBe("composed-figure");
    // Density: one element carrying several marks is the whole point.
    expect(evidence.props.parts.length).toBeGreaterThanOrEqual(4);
    // And every part must be placed by relationship, never by coordinate.
    for (const part of evidence.props.parts) {
      expect(Object.keys(part.at).every((k) => ["at", "of", "side", "gap"].includes(k))).toBe(true);
    }
  });

  for (const name of ["photo-led", "assembled"] as const) {
    it(`composes the ${name} example through the real route`, async () => {
      const schema = await app.inject({
        method: "GET",
        url: "/v1/schema/composition",
        headers: auth,
      });
      const entry = schema.json().examples.find((e: { name: string }) => e.name === name);
      const example = entry.composition;

      // The examples carry `<<paste ...>>` placeholders where a caller supplies
      // real values. Substitute exactly what a caller would and nothing else.
      const composition = {
        ...example,
        lineage: await lineageFor(entry.fitsDensity, entry.elementCount),
        elements: example.elements.map((el: Record<string, unknown>) => {
          const { assets, ...rest } = el;
          return assets ? rest : el;
        }),
        assetIds: [],
      };

      const res = await app.inject({
        method: "POST",
        url: "/v1/flyers/compose",
        headers: auth,
        payload: composition,
      });

      // A 4xx here means we published a composition that our own schema
      // rejects, which is the failure this file exists to catch.
      expect(res.statusCode, JSON.stringify(res.json(), null, 2).slice(0, 1200)).toBe(201);
      const body = res.json();
      expect(body.flyerId).toBeTruthy();
      expect(body.status).toBeTruthy();

      /*
       * And it must pass every gate code can decide.
       *
       * The assembled example composed happily while failing G6, because it
       * showed a date and a meeting point without the `sourceStatements` that
       * back them. A published example that quietly fails a gate is worse than
       * no example at all: it teaches the shape *and* the mistake, and the
       * agent that copied it has no idea why its flyer was rejected.
       */
      const gates = body.codeCheckedGates;
      for (const [gate, passed] of Object.entries(gates)) {
        if (gate === "mechanical") continue;
        expect(passed, `${name} example fails ${gate}`).toBe(true);
      }
      for (const [check, passed] of Object.entries(gates.mechanical)) {
        expect(passed, `${name} example fails mechanical check ${check}`).toBe(true);
      }
    });
  }
});
