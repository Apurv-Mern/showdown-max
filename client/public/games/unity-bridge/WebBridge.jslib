/*
 * Unity JSLib bridge — placed in Assets/Plugins/WebGL/ inside each Unity project.
 * Exposes C#-callable functions that relay data to the React host via
 * react-unity-webgl's event system (window.dispatchReactUnityEvent).
 */
mergeInto(LibraryManager.library, {
  /**
   * Called from C# when a player makes a choice inside the mini-game.
   * @param {string} jsonPayload - JSON string: { action: string, value: any }
   */
  SendPlayerAction: function (jsonPayloadPtr) {
    var payload = UTF8ToString(jsonPayloadPtr);
    try {
      window.dispatchReactUnityEvent('SendPlayerAction', payload);
    } catch (e) {
      console.warn('[WebBridge] SendPlayerAction dispatch failed', e);
    }
  },

  /**
   * Called from C# when the mini-game round completes.
   * @param {string} jsonPayload - JSON string: { winner: number, results: object[] }
   */
  SendGameResult: function (jsonPayloadPtr) {
    var payload = UTF8ToString(jsonPayloadPtr);
    try {
      window.dispatchReactUnityEvent('SendGameResult', payload);
    } catch (e) {
      console.warn('[WebBridge] SendGameResult dispatch failed', e);
    }
  },
});
