# Kangaroo Race Unity Contract

This document is the handoff contract for the Unity developer.

## Live selection count (web → Unity)

Players pick on phones. The server broadcasts Socket.IO event:

- Event name: `mini_game_update`
- Typical payload:

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

Unity does **not** connect to Socket.IO. The venue page listens to `mini_game_update` and forwards the live total through the same React → Unity path as start:

- `SendMessage("Racemanager", "OnMessageFromReact", jsonString)`

```json
{
  "type": "SELECTION_COUNT",
  "payload": "{\"totalSelected\":18,\"totalTeams\":24,\"pickCounts\":{\"1\":2,\"2\":4,\"3\":5,\"4\":1,\"5\":3,\"6\":6},\"timestamp\":1710000000000}"
}
```

Notes:

- Parse twice (outer then inner), same as `MINIGAME_START`.
- `totalSelected` is the number of teams that have locked a kangaroo. Use this for the on-screen total.
- `pickCounts` is optional per-lane detail. The venue overlay only shows the total.
- This message can fire many times while betting is open. After the host starts the race, new picks are rejected.

## Incoming message from web (host start)

Unity receives the host start payload through:

- `SendMessage("Racemanager", "OnMessageFromReact", jsonString)`

The `jsonString` shape is:

```json
{
  "type": "MINIGAME_START",
  "payload": "{\"kangarooNames\":[\"Superman\",\"Batman\",\"Flash\",\"Hulk\",\"Thor\",\"Ironman\"],\"triggeredBy\":\"host_start\",\"timestamp\":1710000000000}"
}
```

Notes:

- `payload` is itself a JSON string, so Unity should parse twice (outer then inner).
- `kangarooNames` is always an array of 6 names in lane order (slot 1..6).

## Outgoing result to web/server (race complete)

Unity should send a finish result via existing bridge (`SendGameResult` or WebBridge `postMessage`) with this preferred shape:

```json
{
  "type": "RACE_FINISH",
  "payload": {
    "finishOrderSlots": [3, 1, 4, 2, 5, 6]
  }
}
```

Where:

- `finishOrderSlots[0]` is the 1st place slot.
- `finishOrderSlots[5]` is the 6th place slot.

Alternative accepted payloads:

- `finishOrder: [3, 1, 4, 2, 5, 6]`
- `finishOrder: [{ "slot": 3 }, { "slot": 1 }, ...]`
- Legacy `winner_index` still works as fallback (but full scoring requires finish order).

## Scoring on server

Server awards points by finish rank:

- Rank 1: +50
- Rank 2: +40
- Rank 3: +30
- Rank 4: +20
- Rank 5: +10
- Rank 6: +0

Players score based on the kangaroo slot they selected.
