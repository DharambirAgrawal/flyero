# Flyero — Flowcharts

*Visual reference for every flow in the system. Diagrams are Mermaid — they render on GitHub and in most IDE markdown previews.*

Companion docs: [`REQUIREMENTS.md`](./REQUIREMENTS.md) · [`ARCHITECTURE.md`](./ARCHITECTURE.md) · [`API.md`](./API.md)

---

## 1. End-to-end generation (one job)

```mermaid
flowchart TD
    A[User prompt + optional assets] --> B["Stage 1: Brief Builder (LLM)\nfacts vs assumptions vs placeholders"]
    B --> C["Stage 2: Studio Sampler\njob seed → 3 lineages\n(different metaphors; NO LLM, NO memory)"]
    C --> D{"Fan out in parallel:\n3 candidates"}

    D --> E1[Candidate A pipeline]
    D --> E2[Candidate B pipeline]
    D --> E3[Candidate C pipeline]

    subgraph CAND ["Per-candidate pipeline (stages 3–8)"]
        F["Stage 3: Idea Engine (LLM)\none-sentence idea + story arc"] --> G["Stage 4: Composer (LLM)\nDesign Spec JSON (zod-validated)"]
        G --> H["Stage 5: Layout Solver (code)\nsemantics → exact geometry"]
        H --> I["Stage 6: Renderer\nReact → SVG → PNG"]
        I --> J["Stage 7: Critic\nrule checks + vision critique"]
        J --> K{Fixes needed?}
        K -- "yes, loop ≤ MAX_REVISION_LOOPS" --> L["Stage 8: Reviser (LLM)\nedits spec, never regenerates"]
        L --> H
        K -- no --> M[Finished candidate]
    end

    E1 --> CAND
    E2 --> CAND
    E3 --> CAND

    M --> N["Stage 9: Gatekeeper\nSix Gates + banned list + mechanical checks"]
    N --> O{Any candidate passes ALL gates?}
    O -- yes --> P["Ship best passing candidate\nPNG + SVG + spec.json + idea sentence"]
    O -- no --> Q["Honest failure:\nbest candidate flagged below_bar: true\n(never silently ship)"]
    P --> R["Process log stored:\nbrief, lineages, all specs,\ncritiques, gate results, costs"]
    Q --> R
```

## 2. The Studio Sampler — diversity by construction

```mermaid
flowchart TD
    A["New job (fresh session,\nzero shared state)"] --> B["Generate cryptographic job seed"]
    B --> C["Sample LINEAGES_PER_RUN lineages\n(default 3; metaphors forced unique)"]

    C --> D1["Metaphor family (12)"]
    C --> D2["Composition topology (10)"]
    C --> D3["Typography behavior (8)"]
    C --> D4["Material language (6)"]
    C --> D5["Color logic (8)"]
    C --> D6["Signature gesture (10)"]

    D1 & D2 & D3 & D4 & D5 & D6 --> E{"Compatibility matrix OK?\n(hand-written veto list)"}
    E -- "bad pairing" --> C
    E -- ok --> F["3 designer lineages locked\n≈460,000 possible profiles each"]
    F --> G["risk level (safe / studio / experimental)\ncontrols distance from conventional values"]
    G --> H["Each lineage constrains its candidate\nthrough Idea → Composer → Layout → Render"]

    style F fill:#0a4d2e,color:#fff
```

**Why this equals human variance:** 10 humans differ because each arrives with different instincts *before seeing the brief*. Flyero re-rolls its instincts per **job**. Ten same-prompt sessions each get a fresh job seed and ship one winner — they land on different profiles by probability (~460k combinations), with no memory, tracking, or history lookup — exactly like ten independent designers.

## 3. Critique → revise loop (detail)

```mermaid
flowchart TD
    A[Rendered PNG + spec] --> B["Rule critic (code, exact):\noverflow · contrast · margins ·\nCTA presence · element count ·\nbanned-list scan · asset usage"]
    B --> C{Rule violations?}
    C -- yes --> F
    C -- no --> D["Vision critic (multimodal LLM):\ndoes the idea READ? · hierarchy ·\ncollisions · title-slide syndrome"]
    D --> E{Issues found?}
    E -- no --> G[Candidate finished → Gatekeeper]
    E -- yes --> F["Structured fixes:\n{element, problem, action}\n(never vague scores)"]
    F --> H{"Loops < MAX_REVISION_LOOPS?"}
    H -- yes --> I["Reviser edits spec fields only\n(idea & lineage are immutable)"]
    I --> J[Re-solve layout → re-render] --> B
    H -- no --> K[Candidate goes to Gatekeeper as-is\nGatekeeper decides ship / reject]
```

## 4. API request lifecycle (async job pattern)

```mermaid
sequenceDiagram
    participant U as Client (curl / app / MCP)
    participant API as REST API
    participant Core as Flyero Core
    participant S as Store

    U->>API: POST /v1/assets (logo, screenshot)
    API-->>U: { assetId: "ast_…" }
    U->>API: POST /v1/flyers { prompt, assetIds, risk }
    API->>Core: enqueue job
    API-->>U: 202 { jobId, status: "queued" }
    Core->>Core: stages 1–10 (may take up to 3 min)
    Core->>S: renders + spec + process log
    loop poll (or webhook if callbackUrl given)
        U->>API: GET /v1/flyers/{jobId}
        API-->>U: { status: "generating", stage: "critique" }
    end
    API-->>U: { status: "done", idea, urls: {png, svg, spec} }
    U->>API: POST /v1/flyers/{jobId}/revise { instruction }
    API-->>U: 202 { jobId: same, revision: 2 }
    U->>API: GET /v1/flyers/{jobId}/export?format=svg
    API-->>U: SVG file (text editable)
```

## 5. Surfaces: API is the core, MCP is a skin

```mermaid
flowchart LR
    subgraph Clients
        A[curl / scripts / tests]
        B[Claude / Cursor via MCP]
        C[Future web app]
    end

    A -->|HTTP| API[REST API - Fastify]
    B --> MCP["MCP server\n(tool schemas only,\nzero business logic)"]
    MCP -->|internal call| API
    C -->|HTTP| API
    API --> CORE["Flyero Core\n(pipeline, gates, libraries)"]
    CORE --> ST[(Job store + object store)]

    style CORE fill:#0a4d2e,color:#fff
```

Rule: if a capability can't be exercised with `curl`, it doesn't exist yet. MCP tools (`upload_asset`, `prepare_asset`, `create_flyer`, `get_flyer`, `revise_flyer`, `export_flyer`, `create_flyer_batch`) map 1:1 to endpoints in [`API.md`](./API.md).

## 6. Future scaling of the same spec (not v1 — recorded so nothing is designed against it)

```mermaid
flowchart TD
    A["Design Spec\n(idea + lineage + relationships,\nNO coordinates)"] --> B["Flyer compiler (v1)\n1080×1350"]
    A --> C["Story / A4 re-layout\n(same spec, new recipe)"]
    A --> D["Deck compiler\nstory arc → slides"]
    A --> E["Motion compiler (Remotion)\ngesture → animation,\ncomponents carry motion affordances"]
```
