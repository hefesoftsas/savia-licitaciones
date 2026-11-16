using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;
using Wp = DocumentFormat.OpenXml.Wordprocessing;

namespace Savia.OpenXmlHelper.Jobs;

static class FillOfficialFormAction
{
    public const string Name = "fill-official-form";

    public static JobResult Execute(string workspace, string jobId)
    {
        string? temporary = null;
        try
        {
            var request = JsonSerializer.Deserialize<FillOfficialFormRequest>(File.ReadAllText(
                Path.Combine(JobFolder.GetJobDirectory(workspace, jobId), JobFolder.RequestFileName), Encoding.UTF8), JsonOptions.File)
                ?? throw new InvalidOperationException("Falta la solicitud del formulario");
            var input = WordWorkspace.ResolveWorkspacePath(workspace, request.Input);
            var output = WordWorkspace.ResolveWorkspacePath(workspace, request.Output);
            if (WordWorkspace.PathsEqual(input, output)) throw new InvalidOperationException("La copia debe guardarse en otro archivo");
            var bytes = File.ReadAllBytes(input);
            var hash = Convert.ToHexString(SHA256.HashData(bytes));
            if (!string.Equals(hash, request.Sha256, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("El documento cambió; vuelve a examinarlo");
            if (request.Values.Count == 0 || request.Values.Any(v => string.IsNullOrWhiteSpace(v.CandidateId)
                || string.IsNullOrWhiteSpace(v.Value) || v.Value.Contains('\n') || v.Value.Contains('\r')))
                throw new InvalidOperationException("Selecciona al menos un campo con un valor de una línea");
            if (request.Values.Select(v => v.CandidateId).Distinct(StringComparer.Ordinal).Count() != request.Values.Count)
                throw new InvalidOperationException("Hay campos repetidos");
            Directory.CreateDirectory(Path.GetDirectoryName(output)!);
            temporary = $"{output}.{Guid.NewGuid():N}.tmp.docx";
            File.WriteAllBytes(temporary, bytes);
            using (var document = WordprocessingDocument.Open(temporary, true))
            {
                var scan = TemplateFieldScanner.Scan(document, officialForm: true);
                var candidates = scan.Candidates.ToDictionary(item => item.CandidateId, StringComparer.Ordinal);
                var selections = request.Values.Select(value =>
                {
                    if (!candidates.TryGetValue(value.CandidateId, out var candidate) || candidate.Target is not Wp.Paragraph)
                        throw new InvalidOperationException("Un campo ya no está disponible para rellenar");
                    return (Candidate: candidate, value.Value);
                }).ToList();
                var main = document.MainDocumentPart ?? throw new InvalidOperationException("El documento no tiene contenido");
                var nextId = main.Document.Descendants<Wp.SdtId>().Select(id => id.Val?.Value ?? 0).DefaultIfEmpty(0).Max() + 1;
                foreach (var item in selections.OrderByDescending(item => item.Candidate.Start).ThenByDescending(item => item.Candidate.Order))
                    TemplateFieldSdtWriter.ApplyValue(item.Candidate, item.Value, nextId++);
                main.Document.Save();
                var errors = new OpenXmlValidator(FileFormatVersions.Microsoft365).Validate(document).Take(1).ToList();
                if (errors.Count > 0) throw new InvalidOperationException($"No se pudo validar la copia de Word: {errors[0].Description}");
            }
            File.Move(temporary, output, overwrite: true);
            temporary = null;
            return JobResult.Success(Name, WordWorkspace.ToRelativePath(workspace, output), request.Values.Count);
        }
        catch (Exception error) { return JobResult.Fail(error.Message); }
        finally { if (temporary is not null && File.Exists(temporary)) File.Delete(temporary); }
    }
}

sealed class FillOfficialFormRequest
{
    public string Input { get; set; } = "";
    public string Output { get; set; } = "";
    public string Sha256 { get; set; } = "";
    public List<OfficialFormValue> Values { get; set; } = [];
}

sealed class OfficialFormValue
{
    [JsonPropertyName("candidate_id")]
    public string CandidateId { get; set; } = "";
    public string Value { get; set; } = "";
}
