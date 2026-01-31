import fs from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type EmbeddingProvider = "openai" | "ollama";

export type MemoryConfig = {
  embedding: {
    provider: EmbeddingProvider;
    model?: string;
    apiKey?: string;
    ollamaUrl?: string;
  };
  dbPath?: string;
  autoCapture?: boolean;
  autoRecall?: boolean;
};

export const MEMORY_CATEGORIES = ["preference", "fact", "decision", "entity", "other"] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

const LEGACY_STATE_DIRS: string[] = [];

function resolveDefaultDbPath(): string {
  const home = homedir();
  const preferred = join(home, ".openclaw", "memory", "lancedb-ollama");
  try {
    if (fs.existsSync(preferred)) return preferred;
  } catch {}
  return preferred;
}

const DEFAULT_DB_PATH = resolveDefaultDbPath();

const EMBEDDING_DIMENSIONS: Record<string, number> = {
  // OpenAI
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  // Ollama / local
  "nomic-embed-text": 768,
  "mxbai-embed-large": 1024,
  "all-minilm": 384,
  "snowflake-arctic-embed": 1024,
};

const DEFAULT_MODELS: Record<EmbeddingProvider, string> = {
  openai: "text-embedding-3-small",
  ollama: "nomic-embed-text",
};

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowed: string[],
  label: string,
) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length === 0) return;
  throw new Error(`${label} has unknown keys: ${unknown.join(", ")}`);
}

export function vectorDimsForModel(model: string): number {
  const dims = EMBEDDING_DIMENSIONS[model];
  if (!dims) {
    console.warn(`Unknown embedding model "${model}", defaulting to 768 dims`);
    return 768;
  }
  return dims;
}

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
    const envValue = process.env[envVar];
    if (!envValue) {
      throw new Error(`Environment variable ${envVar} is not set`);
    }
    return envValue;
  });
}

export const memoryConfigSchema = {
  parse(value: unknown): MemoryConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("memory config required");
    }
    const cfg = value as Record<string, unknown>;
    assertAllowedKeys(cfg, ["embedding", "dbPath", "autoCapture", "autoRecall"], "memory config");

    const embedding = cfg.embedding as Record<string, unknown> | undefined;
    if (!embedding) {
      throw new Error("embedding config is required");
    }
    assertAllowedKeys(embedding, ["provider", "apiKey", "model", "ollamaUrl"], "embedding config");

    const provider = (embedding.provider as EmbeddingProvider) || "ollama";
    const model = (embedding.model as string) || DEFAULT_MODELS[provider];

    if (provider === "openai" && !embedding.apiKey) {
      throw new Error("embedding.apiKey is required for OpenAI provider");
    }

    return {
      embedding: {
        provider,
        model,
        apiKey: embedding.apiKey ? resolveEnvVars(embedding.apiKey as string) : undefined,
        ollamaUrl: (embedding.ollamaUrl as string) || "http://localhost:11434",
      },
      dbPath: typeof cfg.dbPath === "string" ? cfg.dbPath : DEFAULT_DB_PATH,
      autoCapture: cfg.autoCapture !== false,
      autoRecall: cfg.autoRecall !== false,
    };
  },
  uiHints: {
    "embedding.provider": {
      label: "Embedding Provider",
      help: "Choose 'ollama' for local or 'openai' for cloud",
    },
    "embedding.apiKey": {
      label: "OpenAI API Key",
      sensitive: true,
      placeholder: "sk-proj-...",
      help: "Only required if provider=openai",
    },
    "embedding.model": {
      label: "Embedding Model",
      placeholder: "nomic-embed-text",
      help: "nomic-embed-text (Ollama) or text-embedding-3-small (OpenAI)",
    },
    "embedding.ollamaUrl": {
      label: "Ollama URL",
      placeholder: "http://localhost:11434",
      help: "Ollama API endpoint",
    },
    dbPath: {
      label: "Database Path",
      placeholder: "~/.openclaw/memory/lancedb-ollama",
      advanced: true,
    },
    autoCapture: {
      label: "Auto-Capture",
      help: "Automatically capture important information",
    },
    autoRecall: {
      label: "Auto-Recall", 
      help: "Automatically inject relevant memories",
    },
  },
};
