# Kangaroo Race — Unity Handoff

This is the contract between the web venue (React) and the Kangaroo Race Unity WebGL build.

Unity does **not** open a Socket.IO connection. Phones and the host talk to the Node server over sockets. The venue page receives those events and forwards what Unity needs through `SendMessage`.

```
Phone / Host  --Socket.IO-->  Node server  --Socket.IO-->  Venue React  --SendMessage-->  Unity
```

Unity object and method (same for every incoming message):

```
SendMessage("Racemanager", "OnMessageFromReact", jsonString)
```

`jsonString` is always:

```json
{
  "type": "MESSAGE_TYPE",
  "payload": "{ ...inner json as a string... }"
}
```

Parse **twice**: outer object first, then `payload` as JSON.

---

## Messages Unity must handle

### 1. `MINIGAME_START` — host starts the race

Fired when the host presses **Start Race**.

```json
{
  "type": "MINIGAME_START",
  "payload": "{\"kangarooNames\":[\"Deep Impact\",\"Eclipse\",\"Exterminator\",\"Rocker\",\"Northern Dancer\",\"Jambalaya Jazz\"],\"triggeredBy\":\"host_start\",\"timestamp\":1710000000000}"
}
```

| Field | Meaning |
|---|---|
| `kangarooNames` | 6 names, lane order, slot 1 → 6 |
| `triggeredBy` | `"host_start"` |
| `timestamp` | Unix ms |

---

### 2. `SELECTION_COUNT` — live team response (betting screen)

This is the counter on the Unity “PLEASE CHOOSE YOUR WINNING KANGAROO” screen (`18/25`).

It is sent every time a team locks a kangaroo on their phone, and again if the venue reloads mid-bet.

```json
{
  "type": "SELECTION_COUNT",
  "payload": "{\"totalSelected\":18,\"totalTeams\":25,\"pickCounts\":{\"1\":2,\"2\":4,\"3\":5,\"4\":1,\"5\":3,\"6\":3},\"timestamp\":1710000000000}"
}
```

| Field | Use on Unity UI |
|---|---|
| `totalSelected` | Teams that have locked a pick (the **18**) |
| `totalTeams` | Teams in the session (the **25**) |
| `pickCounts` | Optional. Teams per lane (`"1"` … `"6"`). Not required for the total badge |
| `timestamp` | Unix ms |

**LIVE TEAM RESPONSE** = `totalSelected` / `totalTeams`.

Rules:

- First pick per team is final. Repeat picks from the same team are ignored.
- After `MINIGAME_START`, new picks are rejected. The last `SELECTION_COUNT` stays valid.
- This message can arrive many times. Always replace the on-screen numbers with the latest payload. Do not increment locally.

---

## Message Unity must send (race finished)

Use the existing JSLib bridge (`SendGameResult` / WebBridge `postMessage`):

```json
{
  "type": "RACE_FINISH",
  "payload": {
    "finishOrderSlots": [3, 1, 4, 2, 5, 6]
  }
}
```

- `finishOrderSlots[0]` = 1st place (slot 1–6)
- `finishOrderSlots[5]` = 6th place

Also accepted: `finishOrder` as `[3,1,4,2,5,6]`, or `[{ "slot": 3 }, ...]`. Legacy `winner_index` still works but full scoring needs the full order.

Server points by finish rank: **+50, +40, +30, +20, +10, +0**. A team scores the rank of the kangaroo they selected.

---

## Socket.IO reference (web / server only)

Unity developers can ignore this section. It is here so the web team and Unity stay aligned.

| Direction | Event | When |
|---|---|---|
| Phone → server | `mini_game_action` | `{ action: "select", value: 1–6 }` |
| Server → venue / host | `mini_game_update` | After a valid pick. Includes `totalSelected` and `pickCounts` |
| Host → server | `mini_game_command` | `{ command: "start_game", kangarooNames: [...] }` |
| Server → venue | `mini_game_command` | Venue forwards this as Unity `MINIGAME_START` |
| Venue → Unity | `SendMessage` `SELECTION_COUNT` | Built from `mini_game_update` |
| Venue → Unity | `SendMessage` `MINIGAME_START` | Built from host start |

Example `mini_game_update` from the server:

```json
{
  "game": "kangaroo_race",
  "action": "select",
  "value": 3,
  "teamId": 12,
  "teamName": "Table 4",
  "totalSelected": 18,
  "pickCounts": { "1": 2, "2": 4, "3": 5, "4": 1, "5": 3, "6": 3 }
}
```

Do **not** add a second Socket.IO event for the counter. `mini_game_update` → `SELECTION_COUNT` is the live path.

---

## C# sketch (`Racemanager`)

```csharp
using UnityEngine;
using System;

[Serializable] class OuterMessage { public string type; public string payload; }
[Serializable] class SelectionCount {
  public int totalSelected;
  public int totalTeams;
}
[Serializable] class MiniGameStart {
  public string[] kangarooNames;
}

public class Racemanager : MonoBehaviour
{
    public void OnMessageFromReact(string jsonString)
    {
        var outer = JsonUtility.FromJson<OuterMessage>(jsonString);
        if (outer == null || string.IsNullOrEmpty(outer.type)) return;

        if (outer.type == "SELECTION_COUNT")
        {
            var data = JsonUtility.FromJson<SelectionCount>(outer.payload);
            // LIVE TEAM RESPONSE: data.totalSelected / data.totalTeams
            return;
        }

        if (outer.type == "MINIGAME_START")
        {
            var data = JsonUtility.FromJson<MiniGameStart>(outer.payload);
            // data.kangarooNames[0] == slot 1
            return;
        }
    }
}
```

`JsonUtility` does not parse `pickCounts` as a dictionary. If Unity needs per-lane counts, use `Newtonsoft.Json` or a small wrapper. The total badge only needs `totalSelected` and `totalTeams`.
