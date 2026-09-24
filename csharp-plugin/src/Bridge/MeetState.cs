namespace Loupedeck.GoogleMeetPlugin
{
    using System;

    // Call state reported by the Chrome extension. null means "unknown"
    // (for example, the control isn't on screen).
    public sealed record MeetState
    {
        public static readonly MeetState Empty = new();

        public Boolean InCall { get; init; }
        public Boolean? MicOn { get; init; }
        public Boolean? CamOn { get; init; }
        public Boolean? HandRaised { get; init; }
        public Boolean? CaptionsOn { get; init; }
    }
}
