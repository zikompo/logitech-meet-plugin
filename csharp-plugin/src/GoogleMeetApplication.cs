namespace Loupedeck.GoogleMeetPlugin
{
    using System;

    // Required by the plugin framework. Not linked to any app: Meet runs in a browser tab,
    // and the plugin reaches it through the Chrome extension instead.
    public class GoogleMeetApplication : ClientApplication
    {
        protected override String GetProcessName() => "";

        protected override String GetBundleName() => "";
    }
}
