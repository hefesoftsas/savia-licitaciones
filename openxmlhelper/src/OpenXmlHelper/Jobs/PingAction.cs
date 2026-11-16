namespace Savia.OpenXmlHelper.Jobs;

/// <summary>Loopback probe: write only a successful result.</summary>
static class PingAction
{
    public const string Name = "ping";

    public static JobResult Execute()
    {
        return JobResult.Success(Name);
    }
}
