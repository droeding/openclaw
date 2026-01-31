# Memory LanceDB + Ollama Plugin

Long-term memory for OpenClaw with **local embeddings** via Ollama.

## Features

- 🧠 **Local Embeddings** — No API costs, full privacy
- 💾 **LanceDB Storage** — Fast vector search
- 🔄 **Auto-Recall** — Relevant memories injected into context
- 📝 **Auto-Capture** — Important info saved automatically
- 🛠️ **Tools** — `memory_recall`, `memory_store`, `memory_forget`

## Requirements

- Ollama running locally (`http://localhost:11434`)
- Embedding model: `ollama pull nomic-embed-text`

## Configuration

```json
{
  "plugins": {
    "load": {
      "paths": ["/path/to/memory-lancedb-ollama"]
    },
    "slots": {
      "memory": "memory-lancedb-ollama"
    },
    "entries": {
      "memory-lancedb-ollama": {
        "enabled": true,
        "config": {
          "embedding": {
            "provider": "ollama",
            "model": "nomic-embed-text",
            "ollamaUrl": "http://localhost:11434"
          },
          "autoRecall": true,
          "autoCapture": true
        }
      }
    }
  }
}
```

## Supported Models

| Model | Dimensions | Size |
|-------|-----------|------|
| nomic-embed-text | 768 | 274MB |
| mxbai-embed-large | 1024 | ~670MB |
| all-minilm | 384 | ~45MB |

## OpenAI Fallback

Can also use OpenAI embeddings:

```json
"embedding": {
  "provider": "openai",
  "model": "text-embedding-3-small",
  "apiKey": "${OPENAI_API_KEY}"
}
```

## Author

BERT @ Labor BERTA, Bremen
