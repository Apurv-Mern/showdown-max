# Mini-Game 1: 3D Kangaroo Race API

Contract between the web venue (React) and the Kangaroo Race Unity WebGL build.

Unity does **not** open a Socket.IO connection. Phones and the host talk to the Node server. The venue page forwards Unity traffic through `SendMessage` / WebBridge.

```
Phone / Host  --Socket.IO-->  Node  --Socket.IO-->  Venue React  --SendMessage-->  Unity
Unity  --postMessage / JSLib-->  Venue React  --Socket.IO-->  Node
```

Unity object and method (every incoming message):

```
SendMessage("Racemanager", "OnMessageFromReact", jsonString)
```

`jsonString` is always double-encoded:

```json
{
  "type": "MESSAGE_TYPE",
  "payload": "{ ...inner json as a string... }"
}
```

Parse **twice**: outer object first, then `payload` as JSON.

---

## A. React / Web Backend → Unity

### Event: `MINIGAME_START`

Sent when the host presses **Start Race**.

```json
{
  "type": "MINIGAME_START",
  "payload": "{\"kangarooNames\":[\"Team Alpha\",\"Team Beta\",\"Team Gamma\",\"Team Delta\",\"Team Epsilon\",\"Team Zeta\"],\"teamResponse\":\"18/25\",\"winnerKangaroo\":3}"
}
```

| Field | Type | Meaning |
|---|---|---|
| `kangarooNames` | string[6] | Team / kangaroo names edited by the host. Shown on the starting lineup bars. Index 0 = bib 1. |
| `teamResponse` | string | Response count at start, e.g. `"18/25"` or `"18 Teams"`. Shown on the lineup screen. |
| `winnerKangaroo` | integer 1–6, optional | Force that bib to win. `0` or omit = random winner. |

Live betting still happens **before** Start Race. Until start, the venue may also send `SELECTION_COUNT` (same envelope) with `teamResponse` plus `totalSelected` / `totalTeams` so the lineup badge can update. After `MINIGAME_START`, new phone picks are rejected.

---

## B. Unity → React / Web Backend

### 1. Event: `MINIGAME_READY`

Sent automatically by Unity as soon as the WebGL canvas finishes loading.

```json
{
  "type": "MINIGAME_READY",
  "payload": "{}"
}
```

Venue treats this as Unity ready (host **Start Race** unlocks). The React wrapper also reports ready after the canvas loads, as a fallback.

### 2. Event: `RACE_FINISH`

Sent automatically by Unity when the 30-second race finishes and the winning kangaroo crosses the line.

```json
{
  "type": "RACE_FINISH",
  "payload": "{\"finishOrderSlots\":[2,0,4,1,3,5]}"
}
```

| Field | Meaning |
|---|---|
| `finishOrderSlots` | Final rank order of all 6 kangaroos, 1st → 6th. **0-based slot index.** |

Example `[2,0,4,1,3,5]`: slot 2 (index 0) is the winner → bib **3**.

Web converts that array to 1-based lanes internally (`[3,1,5,2,4,6]`) for scoring. Rank points: **+50, +40, +30, +20, +10, +0**. A team scores the rank of the kangaroo they selected.

Also accepted for older builds: `finishOrder` as 1-based `[3,1,4,2,5,6]`, or `[{ "slot": 3 }, ...]`.

---

## Socket.IO reference (web / server only)

Unity developers can ignore this section.

| Direction | Event | When |
|---|---|---|
| Phone → server | `mini_game_action` | `{ action: "select", value: 1–6 }` |
| Server → venue / host | `mini_game_update` | After a valid pick. Includes `totalSelected` and `pickCounts` |
| Host → server | `mini_game_command` | `{ command: "start_game", kangarooNames, teamResponse, winnerKangaroo }` |
| Server → venue | `mini_game_command` | Venue forwards this as Unity `MINIGAME_START` |
| Venue → server | `mini_game_ready` | After Unity `MINIGAME_READY` or canvas load |
| Venue → Unity | `SendMessage` `SELECTION_COUNT` | Live lineup count before start |
| Venue → Unity | `SendMessage` `MINIGAME_START` | Host Start Race |
| Unity → venue | `MINIGAME_READY` / `RACE_FINISH` | WebBridge or JSLib |

---

## C# sketch (`Racemanager`)

```csharp
using UnityEngine;
using System;

[Serializable] class OuterMessage { public string type; public string payload; }
[Serializable] class MiniGameStart {
    public string[] kangarooNames;
    public string teamResponse;
    public int winnerKangaroo;
}
[Serializable] class RaceFinish {
    public int[] finishOrderSlots;
}

public class Racemanager : MonoBehaviour
{
    public void OnMessageFromReact(string jsonString)
    {
        var outer = JsonUtility.FromJson<OuterMessage>(jsonString);
        if (outer == null || string.IsNullOrEmpty(outer.type)) return;

        if (outer.type == "MINIGAME_START")
        {
            var data = JsonUtility.FromJson<MiniGameStart>(outer.payload);
            // data.kangarooNames[0] == bib 1
            // data.teamResponse == "18/25"
            // data.winnerKangaroo 1–6 forces a winner; 0 = random
            return;
        }
    }
}
```
