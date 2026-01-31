# Memory Flush Setup Guide

**Datum:** 2026-01-31  
**Zweck:** Proaktive Speicherung vor Gateway-Komprimierung verhindern Informationsverlust

---

## Problem

OpenClaw komprimiert automatisch Session-History wenn das Token-Limit erreicht wird. Dabei gehen ältere Nachrichten **unwiderruflich** verloren. Der Agent "vergisst" wichtige Informationen.

**Symptome:**
- Agent behauptet, Fähigkeiten nicht zu haben (obwohl vorher besprochen)
- Projektkontexte gehen verloren
- Entscheidungen müssen wiederholt werden

---

## Lösung: Memory Flush

OpenClaw hat ein **eingebautes Feature** namens "Memory Flush":
- Vor Komprimierung bekommt der Agent einen **silent turn**
- Prompt fordert zum Speichern wichtiger Infos auf
- Agent schreibt in `memory/YYYY-MM-DD.md` und `MEMORY.md`

**Das Feature ist standardmäßig aktiv**, aber der Default-Prompt ist zu passiv ("NO_REPLY is usually correct").

---

## Konfiguration

### 1. openclaw.json anpassen

Pfad: `~/.openclaw/openclaw.json`

```json
{
  "agents": {
    "defaults": {
      "compaction": {
        "mode": "safeguard",
        "memoryFlush": {
          "enabled": true,
          "softThresholdTokens": 6000,
          "prompt": "KRITISCH: Session nähert sich Komprimierung. Speichere JETZT alles Wichtige in memory/YYYY-MM-DD.md (erstelle memory/ falls nötig).\n\nDokumetiere:\n- Konkrete Dateipfade und Projekte\n- Getroffene Entscheidungen\n- Offene Tasks\n- Neue Erkenntnisse/Tools\n\nNICHT mit NO_REPLY antworten wenn heute substanzielle Arbeit passiert ist!",
          "systemPrompt": "Pre-Compaction Memory Flush. Nach diesem Turn wird der Kontext komprimiert — ältere Nachrichten gehen UNWIDERRUFLICH verloren. Speichere ALLE wichtigen Informationen in Memory-Dateien. Sei detailliert. Bei Unsicherheit: lieber zu viel speichern als zu wenig."
        }
      }
    }
  }
}
```

**Parameter erklärt:**
- `softThresholdTokens: 6000` — Flush triggert 6000 Tokens vor Komprimierung (früher = mehr Zeit)
- `prompt` — User-Prompt für den Flush-Turn (aggressiv formuliert)
- `systemPrompt` — System-Kontext der die Dringlichkeit betont

### 2. Config anwenden

```bash
openclaw gateway restart
```

Oder via Tool: `gateway.config.patch` mit dem JSON-Patch.

---

## AGENTS.md Ergänzung

Füge diesen Block nach "Write It Down" ein:

```markdown
### 🚨 Konkret dokumentieren — nicht oberflächlich!
Oberflächliche Notizen wie "Konzept erhalten" sind wertlos nach Komprimierung.

**Sofort dokumentieren:**
- Konkrete Pfade: `/home/demo/projects/pact-core/` statt "PACT-Projekt"
- Was genau gebaut wurde: "Setup-Wizard, 450 Zeilen, Templates" statt "Prototyp"
- Entscheidungen mit Begründung

**MEMORY.md aktiv pflegen:**
- Status-Updates direkt reinschreiben, nicht nur in Tagesnotizen
- Bei wichtiger Arbeit: MEMORY.md sofort aktualisieren, nicht "später"

**Git nutzen:**
- `git log --oneline -10` zeigt was passiert ist
- Commits sind Beweis — nicht ignorieren!

**Vor Session-Ende / bei langer Session:**
Quick-Check: "Was haben wir gemacht? Steht das drin?"
- [ ] Neue Pfade in MEMORY.md?
- [ ] Neue Tools/Fähigkeiten dokumentiert?
- [ ] Offene Tasks notiert?
```

---

## Verzeichnisstruktur

```
~/.openclaw/workspace/
├── MEMORY.md              # Langzeit-Gedächtnis (kuratiert)
├── AGENTS.md              # Verhaltensregeln
├── memory/
│   ├── 2026-01-31.md      # Tagesnotizen
│   └── ...
```

**memory/ erstellen falls nicht vorhanden:**
```bash
mkdir -p ~/.openclaw/workspace/memory
```

---

## Relevante Dokumentation

- OpenClaw Memory Docs: `/usr/lib/node_modules/openclaw/docs/concepts/memory.md`
- Compaction Docs: `/usr/lib/node_modules/openclaw/docs/concepts/compaction.md`
- Memory Flush Code: `/usr/lib/node_modules/openclaw/dist/auto-reply/reply/memory-flush.js`

---

## Validierung

Prüfen ob Config aktiv:
```bash
openclaw config get agents.defaults.compaction
```

Sollte `memoryFlush.enabled: true` zeigen.

---

## Changelog

| Datum | Änderung |
|-------|----------|
| 2026-01-31 | Initiale Dokumentation, Config angepasst, AGENTS.md ergänzt |
