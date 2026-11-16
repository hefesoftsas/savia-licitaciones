using System.Text;
using System.Text.Json;
using DocumentFormat.OpenXml.Packaging;

namespace Savia.OpenXmlHelper.Jobs;

/// <summary>Identify possible fields in an independent Word form without modifying it.</summary>
static class ScanOfficialFormAction
{
    public const string Name = "scan-official-form";

    public static JobResult Execute(string workspace, string jobId)
    {
        try
        {
            var jobDir = JobFolder.GetJobDirectory(workspace, jobId);
            var request = JsonSerializer.Deserialize<ScanTemplateFieldsRequest>(
                File.ReadAllText(Path.Combine(jobDir, JobFolder.RequestFileName), Encoding.UTF8), JsonOptions.File);
            if (string.IsNullOrWhiteSpace(request?.Input)) return JobResult.Fail("Falta el documento del formulario");
            var input = WordWorkspace.ResolveWorkspacePath(workspace, request.Input.Trim());
            if (!File.Exists(input)) return JobResult.Fail("No se encontró el documento del formulario");
            using var document = WordprocessingDocument.Open(input, false);
            var scan = TemplateFieldScanner.Scan(document, officialForm: true);
            File.WriteAllText(Path.Combine(jobDir, ScanTemplateFieldsAction.OutputFileName),
                JsonSerializer.Serialize(scan, JsonOptions.Signal) + "\n", new UTF8Encoding(false));
            return JobResult.Success(Name, ScanTemplateFieldsAction.OutputFileName, scan.Candidates.Count);
        }
        catch (Exception error)
        {
            return JobResult.Fail(error.Message);
        }
    }
}
