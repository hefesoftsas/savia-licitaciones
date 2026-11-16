namespace Savia.OpenXmlHelper.Jobs;

/// <summary>Execute one action from its task directory, one task at a time.</summary>
sealed class JobRunner
{
    readonly string _workspace;
    int _busy;

    public JobRunner(string workspace)
    {
        _workspace = workspace;
    }

    /// <summary>Execute the task, write result.json, and return success status.</summary>
    public bool Run(string jobId)
    {
        if (Interlocked.CompareExchange(ref _busy, 1, 0) != 0)
        {
            JobFolder.TryWriteResult(_workspace, jobId, JobResult.Fail("Helper is busy"));
            return false;
        }

        try
        {
            return Execute(jobId);
        }
        finally
        {
            Volatile.Write(ref _busy, 0);
        }
    }

    bool Execute(string jobId)
    {
        if (!JobFolder.TryReadRequest(_workspace, jobId, out var request, out var error))
        {
            JobFolder.TryWriteResult(_workspace, jobId, JobResult.Fail(error));
            return false;
        }

        JobResult result = request.Action switch
        {
            PingAction.Name => PingAction.Execute(),
            ListBlocksAction.Name => ListBlocksAction.Execute(_workspace, jobId),
            ExtractChaptersAction.Name => ExtractChaptersAction.Execute(_workspace, jobId),
            ScanTemplateFieldsAction.Name => ScanTemplateFieldsAction.Execute(_workspace, jobId),
            ScanOfficialFormAction.Name => ScanOfficialFormAction.Execute(_workspace, jobId),
            FillOfficialFormAction.Name => FillOfficialFormAction.Execute(_workspace, jobId),
            ApplyTemplateFieldsAction.Name => ApplyTemplateFieldsAction.Execute(_workspace, jobId),
            MergeTemplateChaptersAction.Name => MergeTemplateChaptersAction.Execute(_workspace, jobId),
            InsertBodyHtmlAction.Name => InsertBodyHtmlAction.Execute(_workspace, jobId),
            RenderRestrictedHtmlDocxAction.Name => RenderRestrictedHtmlDocxAction.Execute(_workspace, jobId),
            BlindCheck.BlindCheckInspectAction.Name => BlindCheck.BlindCheckInspectAction.Execute(_workspace, jobId),
            BlindCheck.Fix.BlindCheckFixAction.Name => BlindCheck.Fix.BlindCheckFixAction.Execute(_workspace, jobId),
            BlindCheck.Review.BlindCheckDumpAction.Name => BlindCheck.Review.BlindCheckDumpAction.Execute(_workspace, jobId),
            BlindCheck.Review.BlindCheckEditAction.Name => BlindCheck.Review.BlindCheckEditAction.Execute(_workspace, jobId),
            _ => JobResult.Fail($"Unknown action: {request.Action}"),
        };

        if (!JobFolder.TryWriteResult(_workspace, jobId, result))
        {
            return false;
        }

        return result.Ok;
    }
}
