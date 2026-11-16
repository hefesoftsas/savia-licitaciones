using System.Xml.Linq;
using Savia.OpenXmlHelper.BlindCheck.Ooxml;

namespace Savia.OpenXmlHelper.BlindCheck.Model;

/// <summary>Document image deduplicated by media part: format, dimensions, first location, metadata, and vector text.</summary>
sealed class ImageInfo
{
    public required string Part { get; init; }
    public string Format { get; set; } = "未知";
    public int? Width { get; set; }
    public int? Height { get; set; }
    public bool IsVector { get; set; }
    public long Bytes { get; set; }
    public int Uses { get; set; }
    /// <summary>First containing paragraph; null when attached to a nonparagraph object such as a graphic.</summary>
    public ParaRecord? FirstRecord { get; set; }
    public string FirstSourcePart { get; set; } = "";
    /// <summary>Metadata fields such as author, copyright, and description that may reveal identity.</summary>
    public List<(string Label, string Value)> Metadata { get; } = [];
    public bool HasGps { get; set; }
    /// <summary>Extractable EMF/WMF/SVG text concatenated in record order.</summary>
    public string VectorText { get; set; } = "";

    public string FileName => Part[(Part.LastIndexOf('/') + 1)..];

    public string Describe()
    {
        var size = Width is { } w && Height is { } h ? $"，{w}×{h}" : "";
        return $"{FileName}（{Format}{size}）";
    }
}

/// <summary>Collect images referenced by body, headers/footers, and notes through DrawingML r:embed/r:link or VML imagedata.</summary>
static class ImageCatalog
{
    const string ImageRelationship = "/image";
    static readonly XName Embed = W.R + "embed";
    static readonly XName Link = W.R + "link";
    static readonly XName Id = W.R + "id";

    public static List<ImageInfo> Collect(DocumentModel model)
    {
        var images = new Dictionary<string, ImageInfo>(StringComparer.OrdinalIgnoreCase);
        foreach (var (part, document) in model.Parts)
        {
            if (part == model.CommentsPart || document.Root is null) continue;
            var targets = model.Package.Relationships(part)
                .Where(item => !item.External && item.Type.EndsWith(ImageRelationship, StringComparison.Ordinal))
                .ToDictionary(item => item.Id, item => DocxPackage.ResolveTarget(part, item.Target), StringComparer.Ordinal);
            if (targets.Count == 0) continue;

            foreach (var element in document.Root.Descendants())
            {
                var id = element.Attribute(Embed)?.Value
                    ?? element.Attribute(Link)?.Value
                    ?? (element.Name.Namespace == W.V ? element.Attribute(Id)?.Value : null);
                if (id is null || !targets.TryGetValue(id, out var target)) continue;
                // AlternateContent VML fallback and DrawingML primary represent one image; count it once.
                if (element.Ancestors(W.McFallback).Any()) continue;
                if (!images.TryGetValue(target, out var info))
                {
                    var paragraph = element.Ancestors(W.P).FirstOrDefault();
                    info = new ImageInfo
                    {
                        Part = target,
                        FirstSourcePart = part,
                        FirstRecord = paragraph is null ? null : model.Records.GetValueOrDefault(paragraph),
                    };
                    images[target] = info;
                }

                info.Uses += 1;
            }
        }

        foreach (var info in images.Values)
        {
            var data = model.Package.ReadBytes(info.Part);
            if (data is null) continue;
            info.Bytes = data.Length;
            ImageFormats.Describe(data, info);
        }

        return images.Values.ToList();
    }
}
