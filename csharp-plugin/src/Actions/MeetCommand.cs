namespace Loupedeck.GoogleMeetPlugin
{
    using System;
    using System.Collections.Generic;

    // One-shot Meet commands with fixed key images.
    public class MeetCommand : PluginDynamicCommand
    {
        private static readonly (String Command, String Name, String Group, String Icon)[] Commands =
        {
            ("mic-off", "Mute microphone", Groups.Call, "mic-off"),
            ("mic-on", "Unmute microphone", Groups.Call, "mic"),
            ("camera-off", "Camera off", Groups.Call, "camera-off"),
            ("camera-on", "Camera on", Groups.Call, "camera"),
            ("share-screen", "Share screen", Groups.Call, "share"),
            ("leave-call", "Leave call", Groups.Call, "leave"),
            ("focus-meet", "Show Meet tab", Groups.Call, "focus"),
            ("toggle-chat", "Toggle chat", Groups.Panels, "chat"),
            ("toggle-people", "Toggle people", Groups.Panels, "people"),
        };

        private readonly Dictionary<String, String> _icons = new();

        public MeetCommand()
            : base()
        {
            foreach (var (command, name, group, icon) in Commands)
            {
                this.AddParameter(command, name, group);
                this._icons[command] = icon;
            }
        }

        protected override void RunCommand(String actionParameter) => this.Plugin.Bridge().Run(actionParameter);

        protected override BitmapImage GetCommandImage(String actionParameter, PluginImageSize imageSize) =>
            this._icons.TryGetValue(actionParameter, out var icon) ? Icons.Get(this.Plugin, icon) : null;
    }
}
