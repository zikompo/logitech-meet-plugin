namespace Loupedeck.GoogleMeetPlugin
{
    using System;

    // One button per Meet reaction.
    public class ReactionCommand : PluginDynamicCommand
    {
        public ReactionCommand()
            : base()
        {
            foreach (var (key, name) in Reactions.All)
            {
                this.AddParameter(key, name, Groups.Reactions);
            }
        }

        protected override void RunCommand(String actionParameter) => this.Plugin.Bridge().Run($"react:{actionParameter}");

        protected override BitmapImage GetCommandImage(String actionParameter, PluginImageSize imageSize) =>
            String.IsNullOrEmpty(actionParameter) ? null : Icons.Get(this.Plugin, actionParameter);
    }
}
