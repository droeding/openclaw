# Session: Memory Flush Configuration

**Datum:** 2026-01-31  
**Session ID:** 84708ef7-f377-4195-bf05-902b6947ef85  
**Teilnehmer:** Daniel (User), BERT (Agent)

## Zusammenfassung

Diese Session dokumentiert die Entdeckung und Konfiguration des OpenClaw Memory Flush Features.

### Problem
Nach einer Kontext-Komprimierung hatte der Agent wichtige Informationen verloren (z.B. dass `faster-whisper` installiert ist). Die automatische Zusammenfassung war "unavailable due to context limits".

### Erkenntnisse

1. **Memory Flush existiert bereits** in OpenClaw
   - Dokumentiert in `/docs/concepts/memory.md`
   - Code in `/dist/auto-reply/reply/memory-flush.js`
   - Standardmäßig **aktiv** (`enabled: true`)

2. **Das Problem:** Der Default-Prompt ist zu passiv
   - Sagt "NO_REPLY is usually correct"
   - Agent speichert nichts, obwohl wichtige Arbeit passiert ist

3. **Die Lösung:** Aggressiverer Prompt
   - `softThresholdTokens: 6000` (früher triggern)
   - Deutscher Prompt: "KRITISCH: Session nähert sich Komprimierung..."
   - Explizit: "NICHT mit NO_REPLY antworten wenn substanzielle Arbeit passiert ist"

### Ergebnisse

- Config in `openclaw.json` angepasst
- AGENTS.md mit Dokumentations-Regeln ergänzt
- Setup-Guide erstellt: `docs/guides/memory-flush-setup.md`
- PR eingereicht: https://github.com/openclaw/openclaw/pull/5528

## Dateien

- `memory-flush-session.jsonl` — Vollständige Session-History (JSONL-Format)

## Wie man die Session liest

```bash
# Alle User-Nachrichten extrahieren
cat memory-flush-session.jsonl | jq 'select(.type == "human") | .message.content'

# Alle Assistant-Antworten
cat memory-flush-session.jsonl | jq 'select(.type == "assistant") | .message.content'

# Tool-Calls anzeigen
cat memory-flush-session.jsonl | jq 'select(.type == "tool_use") | {tool: .name, input: .input}'
```
