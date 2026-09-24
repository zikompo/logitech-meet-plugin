namespace Loupedeck.GoogleMeetPlugin
{
    using System;

    // Turn the dial to pick a reaction, press it to send.
    public class ReactionDialAdjustment : PluginDynamicAdjustment
    {
        private Int32 _index = 0;

        public ReactionDialAdjustment()
            : base(displayName: "Reaction picker", description: "Turn to pick a reaction, press to send it", groupName: Groups.Reactions, hasReset: true)
        {
        }

        private (String Key, String Name) Current => Reactions.All[this._index];

        protected override void ApplyAdjustment(String actionParameter, Int32 diff)
        {
            var count = Reactions.All.Length;
            this._index = (((this._index + diff) % count) + count) % count;
            this.AdjustmentValueChanged();
            this.ActionImageChanged();
        }

        // Pressing the dial sends the selected reaction.
        protected override void RunCommand(String actionParameter) => this.Plugin.Bridge().Run($"react:{this.Current.Key}");

        protected override String GetAdjustmentValue(String actionParameter) => this.Current.Name;

        protected override BitmapImage GetAdjustmentImage(String actionParameter, PluginImageSize imageSize) =>
            Icons.Get(this.Plugin, this.Current.Key);
    }
}
