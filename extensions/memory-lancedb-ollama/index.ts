/**
 * OpenClaw Memory (LanceDB + Ollama) Plugin
 *
 * Long-term memory with vector search for AI conversations.
 * Uses LanceDB for storage and Ollama OR OpenAI for embeddings.
 */

import { Type } from "@sinclair/typebox";
import * as lancedb from "@lancedb/lancedb";
import { randomUUID } from "node:crypto";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { stringEnum } from "openclaw/plugin-sdk";

import {
  MEMORY_CATEGORIES,
  type MemoryCategory,
  type MemoryConfig,
  memoryConfigSchema,
  vectorDimsForModel,
} from "./config.js";

// ============================================================================
// Types
// ============================================================================

type MemoryEntry = {
  id: string;
  text: string;
  vector: number[];
  importance: number;
  category: MemoryCategory;
  createdAt: number;
};

type MemorySearchResult = {
  entry: MemoryEntry;
  score: number;
};

interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

// ============================================================================
// Ollama Embeddings
// ============================================================================

class OllamaEmbeddings implements EmbeddingProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, prompt: text }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama embedding failed: ${response.status} ${error}`);
    }

    const data = await response.json() as { embedding: number[] };
    return data.embedding;
  }
}

// ============================================================================
// OpenAI Embeddings
// ============================================================================

class OpenAIEmbeddings implements EmbeddingProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async embed(text: string): Promise<number[]> {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: text }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding failed: ${response.status} ${error}`);
    }

    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    return data.data[0].embedding;
  }
}

// ============================================================================
// Embedding Factory
// ============================================================================

function createEmbeddingProvider(config: MemoryConfig["embedding"]): EmbeddingProvider {
  if (config.provider === "ollama") {
    return new OllamaEmbeddings(
      config.ollamaUrl || "http://localhost:11434",
      config.model || "nomic-embed-text",
    );
  }
  if (!config.apiKey) {
    throw new Error("OpenAI API key required");
  }
  return new OpenAIEmbeddings(config.apiKey, config.model || "text-embedding-3-small");
}

// ============================================================================
// LanceDB Provider
// ============================================================================

const TABLE_NAME = "memories";

class MemoryDB {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(
    private readonly dbPath: string,
    private readonly vectorDim: number,
  ) {}

  private async ensureInitialized(): Promise<void> {
    if (this.table) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    this.db = await lancedb.connect(this.dbPath);
    const tables = await this.db.tableNames();

    if (tables.includes(TABLE_NAME)) {
      this.table = await this.db.openTable(TABLE_NAME);
    } else {
      this.table = await this.db.createTable(TABLE_NAME, [
        { id: "__schema__", text: "", vector: new Array(this.vectorDim).fill(0), importance: 0, category: "other", createdAt: 0 },
      ]);
      await this.table.delete('id = "__schema__"');
    }
  }

  async store(entry: Omit<MemoryEntry, "id" | "createdAt">): Promise<MemoryEntry> {
    await this.ensureInitialized();
    const fullEntry: MemoryEntry = { ...entry, id: randomUUID(), createdAt: Date.now() };
    await this.table!.add([fullEntry]);
    return fullEntry;
  }

  async search(vector: number[], limit = 5, minScore = 0.5): Promise<MemorySearchResult[]> {
    await this.ensureInitialized();
    const results = await this.table!.vectorSearch(vector).limit(limit).toArray();
    return results
      .map((row) => ({
        entry: {
          id: row.id as string,
          text: row.text as string,
          vector: row.vector as number[],
          importance: row.importance as number,
          category: row.category as MemoryCategory,
          createdAt: row.createdAt as number,
        },
        score: 1 / (1 + (row._distance ?? 0)),
      }))
      .filter((r) => r.score >= minScore);
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureInitialized();
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error(`Invalid ID: ${id}`);
    await this.table!.delete(`id = '${id}'`);
    return true;
  }

  async count(): Promise<number> {
    await this.ensureInitialized();
    return this.table!.countRows();
  }
}

// ============================================================================
// Capture Logic
// ============================================================================

const MEMORY_TRIGGERS = [
  /remember|merk dir|zapamatuj/i,
  /prefer|bevorzuge|radši/i,
  /\+\d{10,}/,
  /[\w.-]+@[\w.-]+\.\w+/,
  /my\s+\w+\s+is|mein\s+\w+\s+ist/i,
  /always|never|important|immer|wichtig/i,
];

function shouldCapture(text: string): boolean {
  if (text.length < 10 || text.length > 500) return false;
  if (text.includes("<relevant-memories>")) return false;
  if (text.startsWith("<") && text.includes("</")) return false;
  return MEMORY_TRIGGERS.some((r) => r.test(text));
}

function detectCategory(text: string): MemoryCategory {
  const l = text.toLowerCase();
  if (/prefer|like|love|hate|want/i.test(l)) return "preference";
  if (/decided|will use|entschieden/i.test(l)) return "decision";
  if (/\+\d{10,}|@[\w.-]+\.\w+|called|heißt/i.test(l)) return "entity";
  if (/is|are|has|ist|hat/i.test(l)) return "fact";
  return "other";
}

// ============================================================================
// Plugin
// ============================================================================

const memoryPlugin = {
  id: "memory-lancedb-ollama",
  name: "Memory (LanceDB + Ollama)",
  description: "Long-term memory with local Ollama embeddings",
  kind: "memory" as const,
  configSchema: memoryConfigSchema,

  register(api: OpenClawPluginApi) {
    const cfg = memoryConfigSchema.parse(api.pluginConfig);
    const resolvedDbPath = api.resolvePath(cfg.dbPath!);
    const vectorDim = vectorDimsForModel(cfg.embedding.model || "nomic-embed-text");
    const db = new MemoryDB(resolvedDbPath, vectorDim);
    const embeddings = createEmbeddingProvider(cfg.embedding);

    api.logger.info(`memory-lancedb-ollama: ${cfg.embedding.provider}/${cfg.embedding.model} @ ${resolvedDbPath}`);

    // Tools
    api.registerTool({
      name: "memory_recall",
      label: "Memory Recall",
      description: "Search long-term memories",
      parameters: Type.Object({
        query: Type.String({ description: "Search query" }),
        limit: Type.Optional(Type.Number({ description: "Max results" })),
      }),
      async execute(_id, params) {
        const { query, limit = 5 } = params as { query: string; limit?: number };
        const vector = await embeddings.embed(query);
        const results = await db.search(vector, limit, 0.1);
        if (results.length === 0) {
          return { content: [{ type: "text", text: "No memories found." }], details: { count: 0 } };
        }
        const text = results.map((r, i) => `${i + 1}. [${r.entry.category}] ${r.entry.text} (${(r.score * 100).toFixed(0)}%)`).join("\n");
        return {
          content: [{ type: "text", text: `Found ${results.length} memories:\n\n${text}` }],
          details: { count: results.length, memories: results.map((r) => ({ id: r.entry.id, text: r.entry.text, score: r.score })) },
        };
      },
    }, { name: "memory_recall" });

    api.registerTool({
      name: "memory_store",
      label: "Memory Store",
      description: "Save to long-term memory",
      parameters: Type.Object({
        text: Type.String({ description: "Info to remember" }),
        importance: Type.Optional(Type.Number({ description: "0-1" })),
        category: Type.Optional(stringEnum(MEMORY_CATEGORIES)),
      }),
      async execute(_id, params) {
        const { text, importance = 0.7, category = "other" } = params as { text: string; importance?: number; category?: MemoryCategory };
        const vector = await embeddings.embed(text);
        const existing = await db.search(vector, 1, 0.95);
        if (existing.length > 0) {
          return { content: [{ type: "text", text: `Already exists: "${existing[0].entry.text}"` }], details: { action: "duplicate" } };
        }
        const entry = await db.store({ text, vector, importance, category });
        return { content: [{ type: "text", text: `Stored: "${text.slice(0, 80)}..."` }], details: { action: "created", id: entry.id } };
      },
    }, { name: "memory_store" });

    api.registerTool({
      name: "memory_forget",
      label: "Memory Forget",
      description: "Delete memories",
      parameters: Type.Object({
        query: Type.Optional(Type.String()),
        memoryId: Type.Optional(Type.String()),
      }),
      async execute(_id, params) {
        const { query, memoryId } = params as { query?: string; memoryId?: string };
        if (memoryId) {
          await db.delete(memoryId);
          return { content: [{ type: "text", text: `Deleted ${memoryId}` }], details: { action: "deleted" } };
        }
        if (query) {
          const vector = await embeddings.embed(query);
          const results = await db.search(vector, 5, 0.7);
          if (results.length === 0) return { content: [{ type: "text", text: "No matches." }], details: { found: 0 } };
          if (results.length === 1 && results[0].score > 0.9) {
            await db.delete(results[0].entry.id);
            return { content: [{ type: "text", text: `Deleted: "${results[0].entry.text}"` }], details: { action: "deleted" } };
          }
          return { content: [{ type: "text", text: `Found ${results.length} candidates. Specify memoryId.` }], details: { candidates: results.map((r) => ({ id: r.entry.id, text: r.entry.text })) } };
        }
        return { content: [{ type: "text", text: "Provide query or memoryId." }], details: { error: "missing_param" } };
      },
    }, { name: "memory_forget" });

    // Auto-recall
    if (cfg.autoRecall) {
      api.on("before_agent_start", async (event) => {
        if (!event.prompt || event.prompt.length < 5) return;
        try {
          const vector = await embeddings.embed(event.prompt);
          const results = await db.search(vector, 3, 0.3);
          if (results.length === 0) return;
          const ctx = results.map((r) => `- [${r.entry.category}] ${r.entry.text}`).join("\n");
          api.logger.info?.(`memory-lancedb-ollama: injecting ${results.length} memories`);
          return { prependContext: `<relevant-memories>\n${ctx}\n</relevant-memories>` };
        } catch (err) {
          api.logger.warn(`memory recall failed: ${err}`);
        }
      });
    }

    // Auto-capture
    if (cfg.autoCapture) {
      api.on("agent_end", async (event) => {
        if (!event.success || !event.messages?.length) return;
        try {
          const texts: string[] = [];
          for (const msg of event.messages) {
            if (!msg || typeof msg !== "object") continue;
            const m = msg as Record<string, unknown>;
            if (m.role !== "user" && m.role !== "assistant") continue;
            if (typeof m.content === "string") texts.push(m.content);
            else if (Array.isArray(m.content)) {
              for (const b of m.content) if ((b as any)?.type === "text") texts.push((b as any).text);
            }
          }
          const toCapture = texts.filter(shouldCapture).slice(0, 3);
          let stored = 0;
          for (const text of toCapture) {
            const vector = await embeddings.embed(text);
            const existing = await db.search(vector, 1, 0.95);
            if (existing.length > 0) continue;
            await db.store({ text, vector, importance: 0.7, category: detectCategory(text) });
            stored++;
          }
          if (stored > 0) api.logger.info(`memory-lancedb-ollama: captured ${stored} memories`);
        } catch (err) {
          api.logger.warn(`memory capture failed: ${err}`);
        }
      });
    }

    api.registerService({
      id: "memory-lancedb-ollama",
      start: () => api.logger.info(`memory-lancedb-ollama: started`),
      stop: () => api.logger.info(`memory-lancedb-ollama: stopped`),
    });
  },
};

export default memoryPlugin;
