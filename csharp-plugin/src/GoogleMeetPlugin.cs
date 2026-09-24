namespace Loupedeck.GoogleMeetPlugin
{
    using System;

    public class GoogleMeetPlugin : Plugin
    {
        private Loupedeck.PluginStatus? _lastStatus;

        // Meet runs in the browser, so this is a universal plugin with no linked application.
        public override Boolean UsesApplicationApiOnly => true;

        public override Boolean HasNoApplication => true;

        public MeetBridge Bridge { get; } = new MeetBridge();

        public GoogleMeetPlugin()
        {
            PluginLog.Init(this.Log);
            PluginResources.Init(this.Assembly);
        }

        public override void Load()
        {
            this.Bridge.ConnectionChanged += this.OnConnectionChanged;
            try
            {
                this.Bridge.Start();
            }
            catch (Exception ex)
            {
                PluginLog.Error(ex, $"Couldn't listen on port {MeetBridge.Port}");
                this.OnPluginStatusChanged(
                    Loupedeck.PluginStatus.Error,
                    $"Couldn't open local port {MeetBridge.Port}. Another app may be using it; restart Logi Plugin Service.");
                return;
            }
            this.UpdateStatus();
        }

        public override void Unload()
        {
            this.Bridge.ConnectionChanged -= this.OnConnectionChanged;
            this.Bridge.Dispose();
        }

        private void OnConnectionChanged(Object sender, EventArgs e) => this.UpdateStatus();

        private void UpdateStatus()
        {
            var status = this.Bridge.IsExtensionConnected ? Loupedeck.PluginStatus.Normal : Loupedeck.PluginStatus.Warning;
            if (status == this._lastStatus)
            {
                return;
            }
            this._lastStatus = status;
            this.OnPluginStatusChanged(
                status,
                status == Loupedeck.PluginStatus.Normal ? null : "Open Chrome with the \"Meet Control for Logitech\" extension loaded.");
        }
    }
}
