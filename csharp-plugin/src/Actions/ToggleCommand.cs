namespace Loupedeck.GoogleMeetPlugin
{
    using System;

    // Toggles whose key image follows the live Meet state: a red mic when you're
    // muted, a yellow hand while it's raised, and so on. Updates even when you
    // change the state from inside Meet itself.
    public class ToggleCommand : PluginDynamicCommand
    {
        public ToggleCommand()
            : base()
        {
            this.AddParameter("toggle-mic", "Toggle microphone", Groups.Call);
            this.AddParameter("toggle-camera", "Toggle camera", Groups.Call);
            this.AddParameter("toggle-hand", "Raise / lower hand", Groups.Call);
            this.AddParameter("toggle-captions", "Toggle captions", Groups.Panels);
        }

        protected override Boolean OnLoad()
        {
            this.Plugin.Bridge().StateChanged += this.OnStateChanged;
            return base.OnLoad();
        }

        protected override Boolean OnUnload()
        {
            this.Plugin.Bridge().StateChanged -= this.OnStateChanged;
            return base.OnUnload();
        }

        protected override void RunCommand(String actionParameter) => this.Plugin.Bridge().Run(actionParameter);

        protected override BitmapImage GetCommandImage(String actionParameter, PluginImageSize imageSize)
        {
            var state = this.Plugin.Bridge().State;
            var icon = actionParameter switch
            {
                "toggle-mic" => state.MicOn == false ? "mic-off" : "mic",
                "toggle-camera" => state.CamOn == false ? "camera-off" : "camera",
                "toggle-hand" => state.HandRaised == true ? "hand-raised" : "hand",
                "toggle-captions" => state.CaptionsOn == true ? "captions-on" : "captions",
                _ => null,
            };
            return icon == null ? null : Icons.Get(this.Plugin, icon);
        }

        private void OnStateChanged(Object sender, EventArgs e) => this.ActionImageChanged();
    }
}
