/*
 * Reference C# script for Unity mini-games.
 * Attach to a "GameManager" GameObject in the scene root.
 *
 * Web → Unity communication via SendMessage:
 *   SendMessage("GameManager", "StartGame", jsonConfig)
 *   SendMessage("GameManager", "ResetGame", "")
 *
 * Unity → Web communication via JSLib (WebBridge.jslib):
 *   SendPlayerAction(jsonPayload)
 *   SendGameResult(jsonPayload)
 */

using System.Runtime.InteropServices;
using UnityEngine;

public class GameManager : MonoBehaviour
{
    [DllImport("__Internal")]
    private static extern void SendPlayerAction(string jsonPayload);

    [DllImport("__Internal")]
    private static extern void SendGameResult(string jsonPayload);

    /// <summary>
    /// Called from web via SendMessage. Receives JSON config to initialize the game.
    /// Example config: { "gameType": "horse_race", "timestamp": 1234567890 }
    /// </summary>
    public void StartGame(string jsonConfig)
    {
        Debug.Log("[GameManager] StartGame: " + jsonConfig);
        // Parse jsonConfig and initialise game state here
    }

    /// <summary>
    /// Called from web via SendMessage. Resets the game for a new round.
    /// </summary>
    public void ResetGame(string _unused)
    {
        Debug.Log("[GameManager] ResetGame");
        // Reset game state here
    }

    /// <summary>
    /// Call this from Unity game logic when a player makes an in-game choice.
    /// </summary>
    protected void EmitPlayerAction(string action, object value)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        string payload = JsonUtility.ToJson(new ActionPayload { action = action, value = value.ToString() });
        SendPlayerAction(payload);
#endif
    }

    /// <summary>
    /// Call this from Unity game logic when the game round is complete.
    /// </summary>
    protected void EmitGameResult(string resultJson)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        SendGameResult(resultJson);
#endif
    }

    [System.Serializable]
    private class ActionPayload
    {
        public string action;
        public string value;
    }
}
