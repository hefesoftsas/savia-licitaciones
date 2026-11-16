using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;
using Wp = DocumentFormat.OpenXml.Wordprocessing;
using DW = DocumentFormat.OpenXml.Drawing.Wordprocessing;

namespace Savia.OpenXmlHelper.Jobs;

sealed class MergeTemplateChaptersRequest
{
    public string Input { get; set; } = "";
    public string Template { get; set; } = "";
    public string Output { get; set; } = "";
    [JsonPropertyName("chapter_ids")]
    public List<string> ChapterIds { get; set; } = [];
}

/// <summary>Place user-edited template chapters at explicit markers without modifying either source.</summary>
static class MergeTemplateChaptersAction
{
    public const string Name = "merge-template-chapters";
    const string MarkerPrefix = "SAVIA_TEMPLATE:";
    const string BookmarkPrefix = "savia_c_";

    public static JobResult Execute(string workspace, string jobId)
    {
        string? temporary = null;
        try
        {
            var requestPath = Path.Combine(JobFolder.GetJobDirectory(workspace, jobId), JobFolder.RequestFileName);
            var request = JsonSerializer.Deserialize<MergeTemplateChaptersRequest>(File.ReadAllText(requestPath, Encoding.UTF8), JsonOptions.File)
                ?? throw new InvalidOperationException("Solicitud de integración inválida");
            var input = WordWorkspace.ResolveWorkspacePath(workspace, request.Input);
            var template = WordWorkspace.ResolveWorkspacePath(workspace, request.Template);
            var output = WordWorkspace.ResolveWorkspacePath(workspace, request.Output);
            if (WordWorkspace.PathsEqual(input, output) || WordWorkspace.PathsEqual(template, output)) throw new InvalidOperationException("La salida debe ser distinta de los documentos originales");
            var ids = request.ChapterIds.Select(value => Guid.TryParse(value, out var id) ? id : throw new InvalidOperationException("Identificador de capítulo inválido")).ToList();
            if (ids.Count == 0 || ids.Distinct().Count() != ids.Count) throw new InvalidOperationException("Los capítulos solicitados deben ser únicos");
            Directory.CreateDirectory(Path.GetDirectoryName(output)!);
            temporary = $"{output}.{Guid.NewGuid():N}.tmp.docx";
            File.Copy(input, temporary);
            using (var source = WordprocessingDocument.Open(template, false))
            using (var destination = WordprocessingDocument.Open(temporary, true))
            {
                var sourcePart = source.MainDocumentPart ?? throw new InvalidOperationException("La plantilla no contiene documento principal");
                var targetPart = destination.MainDocumentPart ?? throw new InvalidOperationException("El documento final no contiene documento principal");
                var sourceDocument = sourcePart.Document ?? throw new InvalidOperationException("La plantilla no contiene documento");
                var targetDocument = targetPart.Document ?? throw new InvalidOperationException("El documento final no contiene documento");
                var sourceBody = sourceDocument.Body ?? throw new InvalidOperationException("La plantilla no contiene cuerpo");
                var targetBody = targetDocument.Body ?? throw new InvalidOperationException("El documento final no contiene cuerpo");
                var blocks = sourceBody.ChildElements.Where(item => item is not Wp.SectionProperties).ToList();
                var boundaries = new List<(int Index, Guid Id)>();
                for (var index = 0; index < blocks.Count; index++)
                {
                    foreach (var start in blocks[index].Descendants<Wp.BookmarkStart>())
                    {
                        var name = start.Name?.Value ?? "";
                        if (name.StartsWith(BookmarkPrefix, StringComparison.Ordinal) && Guid.TryParseExact(name[BookmarkPrefix.Length..], "N", out var id)) boundaries.Add((index, id));
                    }
                }
                if (boundaries.GroupBy(item => item.Id).Any(group => group.Count() != 1) || boundaries.GroupBy(item => item.Index).Any(group => group.Count() != 1))
                    throw new InvalidOperationException("La plantilla contiene marcadores de capítulo duplicados");
                var chapters = new Dictionary<Guid, List<OpenXmlElement>>();
                for (var index = 0; index < boundaries.Count; index++)
                {
                    var boundary = boundaries[index];
                    var end = index + 1 < boundaries.Count ? boundaries[index + 1].Index : blocks.Count;
                    chapters.Add(boundary.Id, blocks.GetRange(boundary.Index, end - boundary.Index));
                }
                var markers = targetBody.Elements<Wp.Paragraph>().Where(p => p.InnerText.StartsWith(MarkerPrefix, StringComparison.Ordinal)).ToList();
                var targets = new Dictionary<Guid, Wp.Paragraph>();
                foreach (var marker in markers)
                {
                    if (!Guid.TryParse(marker.InnerText[MarkerPrefix.Length..], out var id) || !targets.TryAdd(id, marker))
                        throw new InvalidOperationException("El documento contiene marcadores de destino inválidos o duplicados");
                }
                foreach (var bookmark in targetBody.Descendants<Wp.BookmarkStart>().Where(item => (item.Name?.Value ?? "").StartsWith("st_", StringComparison.Ordinal)))
                {
                    var name = bookmark.Name?.Value ?? "";
                    var paragraph = bookmark.Ancestors<Wp.Paragraph>().FirstOrDefault();
                    if (!Guid.TryParseExact(name[3..], "N", out var id) || paragraph?.Parent != targetBody || !targets.TryAdd(id, paragraph))
                        throw new InvalidOperationException("El documento contiene marcadores de destino inválidos o duplicados");
                }
                if (targets.Count != ids.Count || ids.Any(id => !targets.ContainsKey(id) || !chapters.ContainsKey(id)))
                    throw new InvalidOperationException("Falta un capítulo o marcador de la plantilla; vuelve a extraerla y verifica su contenido");
                var context = ImportStyles(sourcePart, targetPart);
                foreach (var id in ids)
                {
                    var marker = targets[id];
                    var layoutBookmarks = marker.Descendants<Wp.BookmarkStart>()
                        .Where(item => (item.Name?.Value ?? "").StartsWith("yb_layout_", StringComparison.Ordinal))
                        .Select(item => (Name: item.Name!.Value!, Id: item.Id!.Value!)).ToList();
                    Wp.Paragraph? firstParagraph = null;
                    foreach (var block in chapters[id])
                    {
                        var clone = block.CloneNode(true);
                        RemoveChapterBookmarks(clone);
                        ExtractChaptersAction.NormalizeStyleReferences(clone, context.StyleIds);
                        ExtractChaptersAction.RemapNumbering(clone, sourcePart, targetPart, context);
                        ExtractChaptersAction.RemapRelationships(clone, sourcePart, targetPart, context.RelationshipIds);
                        firstParagraph ??= clone as Wp.Paragraph ?? clone.Descendants<Wp.Paragraph>().FirstOrDefault();
                        marker.InsertBeforeSelf(clone);
                    }
                    if (layoutBookmarks.Count > 0 && firstParagraph is null) throw new InvalidOperationException("El capítulo no contiene un párrafo para la ubicación de revisión");
                    foreach (var location in layoutBookmarks)
                    {
                        var start = new Wp.BookmarkStart { Id = location.Id, Name = location.Name };
                        if (firstParagraph!.ParagraphProperties is { } properties) firstParagraph.InsertAfter(start, properties);
                        else firstParagraph.PrependChild(start);
                        firstParagraph.InsertAfter(new Wp.BookmarkEnd { Id = location.Id }, start);
                    }
                    marker.Remove();
                }
                RenumberIds(targetPart, targetDocument);
                targetDocument.Save();
                var errors = new OpenXmlValidator(FileFormatVersions.Microsoft365).Validate(destination).Take(5).ToList();
                if (errors.Count > 0) throw new InvalidOperationException("No se pudo integrar la plantilla: " + string.Join("; ", errors.Select(error => error.Description)));
            }
            File.Move(temporary, output, overwrite: true); temporary = null;
            return JobResult.Success(Name, WordWorkspace.ToRelativePath(workspace, output), ids.Count);
        }
        catch (Exception exception) { return JobResult.Fail(exception.Message); }
        finally { if (temporary is not null && File.Exists(temporary)) File.Delete(temporary); }
    }

    // Keep source styles under fresh IDs: matching style names or IDs in the generated document can carry different formatting.
    static ExtractChaptersAction.CrossDocumentImportContext ImportStyles(MainDocumentPart source, MainDocumentPart target)
    {
        var sourceStyles = source.StyleDefinitionsPart?.Styles?.Elements<Wp.Style>().Where(item => !string.IsNullOrWhiteSpace(item.StyleId?.Value)).ToList() ?? [];
        var targetPart = target.StyleDefinitionsPart ?? target.AddNewPart<StyleDefinitionsPart>();
        targetPart.Styles ??= new Wp.Styles();
        var occupied = targetPart.Styles.Elements<Wp.Style>().Select(item => item.StyleId?.Value).Where(item => item is not null).ToHashSet(StringComparer.Ordinal);
        var map = new Dictionary<string, string?>(StringComparer.Ordinal);
        var next = 1;
        foreach (var style in sourceStyles)
        {
            var sourceId = style.StyleId!.Value!;
            if (map.ContainsKey(sourceId)) throw new InvalidOperationException("La plantilla contiene estilos con identificadores duplicados");
            string id;
            do { id = $"savia_import_{next++}"; } while (!occupied.Add(id));
            map.Add(sourceId, id);
        }
        var context = new ExtractChaptersAction.CrossDocumentImportContext(map);
        foreach (var style in sourceStyles)
        {
            var copy = (Wp.Style)style.CloneNode(true);
            copy.StyleId = map[style.StyleId!.Value!]!;
            copy.Default = null;
            if (copy.StyleName is { Val.Value: { } name }) copy.StyleName.Val = $"Savia {name} ({copy.StyleId.Value})";
            RemapStyleLink(copy.BasedOn, map);
            RemapStyleLink(copy.NextParagraphStyle, map);
            RemapStyleLink(copy.LinkedStyle, map);
            ExtractChaptersAction.NormalizeStyleReferences(copy, map);
            ExtractChaptersAction.RemapNumbering(copy, source, target, context);
            targetPart.Styles.AppendChild(copy);
        }
        targetPart.Styles.Save();
        return context;
    }

    static void RemapStyleLink(OpenXmlElement? link, Dictionary<string, string?> map)
    {
        if (link is null) return;
        var value = link.GetAttribute("val", "http://schemas.openxmlformats.org/wordprocessingml/2006/main").Value;
        if (string.IsNullOrWhiteSpace(value) || !map.TryGetValue(value, out var replacement) || string.IsNullOrWhiteSpace(replacement)) { link.Remove(); return; }
        link.SetAttribute(new OpenXmlAttribute("w", "val", "http://schemas.openxmlformats.org/wordprocessingml/2006/main", replacement));
    }

    static void RemoveChapterBookmarks(OpenXmlElement element)
    {
        foreach (var start in element.Descendants<Wp.BookmarkStart>().Where(item => (item.Name?.Value ?? "").StartsWith(BookmarkPrefix, StringComparison.Ordinal)).ToList())
        {
            var id = start.Id?.Value;
            var end = element.Descendants<Wp.BookmarkEnd>().FirstOrDefault(item => item.Id?.Value == id);
            end?.Remove(); start.Remove();
        }
    }

    static void RenumberIds(MainDocumentPart part, Wp.Document document)
    {
        uint drawing = 1;
        var roots = new OpenXmlElement[] { document }
            .Concat(part.HeaderParts.Select(item => item.Header).OfType<OpenXmlElement>())
            .Concat(part.FooterParts.Select(item => item.Footer).OfType<OpenXmlElement>());
        foreach (var root in roots) foreach (var item in root.Descendants<DW.DocProperties>()) item.Id = drawing++;
        foreach (var header in part.HeaderParts) header.Header?.Save();
        foreach (var footer in part.FooterParts) footer.Footer?.Save();
        var control = 1;
        foreach (var item in document.Descendants<Wp.SdtId>()) item.Val = control++;
        var bookmark = 1;
        var active = new Dictionary<string, int>();
        foreach (var element in document.Descendants())
        {
            if (element is Wp.BookmarkStart start)
            {
                var old = start.Id?.Value ?? "";
                if (!active.TryAdd(old, bookmark)) throw new InvalidOperationException("La plantilla contiene marcadores de Word superpuestos con el mismo identificador");
                start.Id = (bookmark++).ToString(System.Globalization.CultureInfo.InvariantCulture);
            }
            else if (element is Wp.BookmarkEnd end)
            {
                var old = end.Id?.Value ?? "";
                if (!active.Remove(old, out var next)) throw new InvalidOperationException("La plantilla contiene un marcador de Word incompleto");
                end.Id = next.ToString(System.Globalization.CultureInfo.InvariantCulture);
            }
        }
        if (active.Count != 0) throw new InvalidOperationException("La plantilla contiene un marcador de Word incompleto");
    }
}
