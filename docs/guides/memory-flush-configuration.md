# Implementierungsanweisung: Proaktive Memory-Zusammenfassung vor Gateway-Kompression

## Ziel

Vor jeder Gateway-Kompression soll automatisch eine ausführliche Zusammenfassung der Konversation in persistente Memory-Dateien geschrieben werden, um Informationsverlust zu vermeiden.

## Hintergrund

Das OpenClaw Gateway komprimiert Sessions automatisch, wenn das Token-Limit erreicht wird. Dabei gehen ältere Nachrichten verloren. Das bestehende **Memory Flush**-Feature ermöglicht es, vor der Kompression wichtige Informationen dauerhaft zu speichern.

---

## Schritt 1: Konfigurationsdatei identifizieren

Finde oder erstelle die OpenClaw-Konfigurationsdatei. Mögliche Speicherorte:

1. **Workspace-spezifisch**: `openclaw.json` im Projektverzeichnis
2. **Global**: `~/.openclaw/config.json`
3. **Per Agent**: In der Agent-spezifischen Konfiguration

Prüfe mit:

```bash
openclaw config get agents.defaults.compaction
```

---

## Schritt 2: Memory Flush Konfiguration hinzufügen

Füge folgende Konfiguration in die `openclaw.json` ein (oder ergänze bestehende):

```json
{
  "agents": {
    "defaults": {
      "compaction": {
        "mode": "safeguard",
        "reserveTokensFloor": 12000,
        "maxHistoryShare": 0.5,
        "memoryFlush": {
          "enabled": true,
          "softThresholdTokens": 8000,
          "prompt": "WICHTIG: Die Session nähert sich dem Kompressionsthreshold. Erstelle JETZT eine vollständige Zusammenfassung und speichere sie in memory/summaries.md.\n\nErfasse folgende Kategorien:\n\n## Benutzer-Kontext\n- Persönliche Informationen und Präferenzen\n- Arbeitskontext und Projekte\n- Kommunikationsstil und Sprache\n\n## Besprochene Themen\n- Hauptthemen dieser Session mit Details\n- Getroffene Entscheidungen und deren Begründungen\n- Technische Diskussionen und Lösungen\n\n## Offene Aufgaben\n- Noch nicht erledigte Anfragen\n- Geplante nächste Schritte\n- Wartende Fragen oder Klärungen\n\n## Wichtige Fakten\n- Konfigurationen und Einstellungen\n- Credentials/Zugänge (nur Referenzen, keine Secrets)\n- Dateipfade und Ressourcen\n\n## Session-Verlauf\n- Chronologische Zusammenfassung der wichtigsten Interaktionen\n- Fehler und deren Lösungen\n- Erkenntnisse und Learnings\n\nVerwende Markdown-Format. Füge neue Einträge am Ende der Datei hinzu mit Datum/Zeitstempel.",
          "systemPrompt": "Du befindest dich im Pre-Compaction Memory Flush Modus. Nach diesem Turn wird die Session komprimiert und ältere Nachrichten gehen UNWIDERRUFLICH verloren. Deine Aufgabe ist es, ALLE wichtigen Informationen aus der bisherigen Konversation dauerhaft in Memory-Dateien zu speichern. Sei SEHR detailliert und vollständig. Nutze das memory_get und memory_search Tool um bestehende Memories zu lesen, und schreibe dann die aktualisierte/ergänzte Version zurück. Antworte dem Benutzer NICHT direkt - fokussiere dich ausschließlich auf das Speichern der Informationen."
        }
      },
      "memorySearch": {
        "enabled": true,
        "sources": ["memory", "sessions"],
        "sync": {
          "onSessionStart": true,
          "onSearch": true,
          "intervalMinutes": 30
        }
      }
    }
  }
}
```

---

## Schritt 3: Memory-Verzeichnisstruktur erstellen

Erstelle im Workspace folgende Struktur:

```
workspace/
├── MEMORY.md                    # Haupt-Memory-Datei
└── memory/
    ├── summaries.md             # Session-Zusammenfassungen
    ├── user-profile.md          # Benutzer-spezifische Informationen
    ├── projects.md              # Projekt-bezogene Notizen
    └── decisions.md             # Wichtige Entscheidungen
```

Erstelle die initialen Dateien mit Basis-Struktur:

### memory/summaries.md

```markdown
# Session-Zusammenfassungen

Dieses Dokument enthält chronologische Zusammenfassungen der Konversationen.

---
```

### memory/user-profile.md

```markdown
# Benutzer-Profil

## Persönliche Informationen


## Präferenzen


## Kommunikationsstil


---
```

### MEMORY.md

```markdown
# Persistenter Memory

## Wichtige Referenzen

- Session-Zusammenfassungen: siehe `memory/summaries.md`
- Benutzer-Profil: siehe `memory/user-profile.md`
- Projekte: siehe `memory/projects.md`
- Entscheidungen: siehe `memory/decisions.md`

## Aktuelle Prioritäten


## Schnellnotizen


---
```

---

## Schritt 4: Konfiguration anwenden

```bash
# Konfiguration validieren
openclaw config validate

# Gateway neu starten um Änderungen zu übernehmen
openclaw gateway restart

# Oder bei laufendem Gateway:
pkill -HUP -f openclaw-gateway
```

---

## Schritt 5: Funktionalität testen

1. Starte eine neue Session über Telegram
2. Führe eine längere Konversation (viele Nachrichten)
3. Beobachte die Logs auf Memory Flush Aktivität:
   ```bash
   tail -f /tmp/openclaw-gateway.log | grep -i "memory\|flush\|compact"
   ```
4. Prüfe nach einiger Zeit die Memory-Dateien auf Einträge

---

## Konfigurationsparameter Referenz

| Parameter | Typ | Standard | Empfehlung | Beschreibung |
|-----------|-----|----------|------------|--------------|
| `enabled` | boolean | `true` | `true` | Memory Flush aktivieren |
| `softThresholdTokens` | number | `4000` | `6000-10000` | Tokens vor Kompression, bei denen Flush startet. Höher = früher = mehr Zeit für Zusammenfassung |
| `prompt` | string | (kurz) | (detailliert) | Anweisung an den Agenten, WAS gespeichert werden soll |
| `systemPrompt` | string | (leer) | (dringend) | System-Kontext für den Flush-Turn |
| `mode` | string | `"default"` | `"safeguard"` | Safeguard = intelligentere Kompression mit Datei-Tracking |
| `reserveTokensFloor` | number | `12000` | `12000-16000` | Minimum-Tokens die für Antwort reserviert bleiben |
| `maxHistoryShare` | number | `0.5` | `0.4-0.6` | Max. Anteil des Kontexts für alte History |

---

## Erweiterte Optionen

### Option A: Agenten-spezifische Konfiguration

Falls verschiedene Agenten unterschiedliche Memory-Strategien brauchen:

```json
{
  "agents": {
    "telegram-assistant": {
      "compaction": {
        "memoryFlush": {
          "softThresholdTokens": 10000,
          "prompt": "Spezifische Anweisung für Telegram..."
        }
      }
    },
    "coding-agent": {
      "compaction": {
        "memoryFlush": {
          "softThresholdTokens": 6000,
          "prompt": "Fokus auf Code-Entscheidungen..."
        }
      }
    }
  }
}
```

### Option B: Plugin-Hook für zusätzliche Logik

Falls noch mehr Kontrolle benötigt wird, kann ein Plugin-Hook verwendet werden:

```typescript
// In einem Plugin: plugins/memory-enhancer/index.ts
import type { PluginAPI } from "openclaw/plugin-sdk";

export default function memoryEnhancer(api: PluginAPI) {
  api.on("before_compaction", async (event, ctx) => {
    console.log(`Compaction imminent: ${event.tokenCount} tokens, ${event.messageCount} messages`);
    // Zusätzliche Logik hier, z.B. externe Benachrichtigung
  });

  api.on("after_compaction", async (event, ctx) => {
    console.log(`Compacted: ${event.compactedCount} messages removed`);
  });
}
```

---

## Fehlerbehebung

| Problem | Mögliche Ursache | Lösung |
|---------|------------------|--------|
| Memory Flush läuft nicht | `enabled: false` oder CLI-Provider | Konfiguration prüfen, nur Gateway-Sessions unterstützt |
| Leere Memory-Dateien | Agent ignoriert Prompt | Prompt expliziter formulieren, Dateinamen vorgeben |
| Flush zu spät | `softThresholdTokens` zu niedrig | Wert auf 8000-10000 erhöhen |
| Duplikate in Memory | Kein Deduplizierungs-Hinweis | Prompt ergänzen: "Aktualisiere bestehende Einträge statt neue zu erstellen" |

---

## Erfolgskriterien

Die Implementierung ist erfolgreich, wenn:

- [ ] Memory Flush wird vor jeder Kompression ausgelöst
- [ ] `memory/summaries.md` enthält datierte Zusammenfassungen
- [ ] Nach Kompression kann der Agent via `memory_search` auf alte Informationen zugreifen
- [ ] Wichtige Fakten und Kontexte bleiben über Sessions hinweg erhalten

---

## Relevante Quelldateien

| Zweck | Dateipfad |
|-------|-----------|
| Kompressionslogik | `src/agents/pi-embedded-runner/compact.ts` |
| Memory Flush Einstellungen | `src/auto-reply/reply/memory-flush.ts` |
| Memory Flush Ausführung | `src/auto-reply/reply/agent-runner-memory.ts` |
| Kompressionsalgorithmus | `src/agents/compaction.ts` |
| Memory Storage Schema | `src/memory/memory-schema.ts` |
| Memory Search/Get Tools | `src/agents/tools/memory-tool.ts` |
| Plugin Hook System | `src/plugins/hooks.ts` |
| Safeguard Extension | `src/agents/pi-extensions/compaction-safeguard.ts` |
| Konfigurationstypen | `src/config/types.agent-defaults.ts` |
