using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace Savia.OpenXmlHelper.BlindCheck.Ooxml;

sealed class StyleInfo
{
    static readonly Regex HeadingName = new(@"^\s*(?:heading|标题|標題)\s*([1-9１-９])\s*$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    public required string Id { get; init; }
    public required string Type { get; init; }
    public string Name { get; init; } = "";
    public List<string> Aliases { get; init; } = [];
    public string? BasedOn { get; init; }
    public bool IsDefault { get; init; }
    public XElement? PPr { get; init; }
    public XElement? RPr { get; init; }
    public int? HeadingLevel { get; init; }

    public string DisplayName => Name.Length > 0 ? Name : Id;

    public static StyleInfo From(XElement element)
    {
        var type = W.Attr(element, "type") ?? "paragraph";
        var name = W.ValOf(element.Element(W.Name)) ?? "";
        var pPr = element.Element(W.PPr);
        var headingLevel = HeadingLevelFromName(name);
        var outline = W.IntAttr(pPr?.Element(W.OutlineLvl), "val");
        var qFormat = W.OnOff(element.Element(W.QFormat)) ?? false;
        // Treat outlineLvl 0-8 as headings only on actual heading styles, avoiding custom body styles.
        if (headingLevel is null && outline is >= 0 and <= 8 && type == "paragraph" && (qFormat || outline <= 5))
        {
            headingLevel = outline + 1;
        }

        return new StyleInfo
        {
            Id = W.Attr(element, "styleId") ?? "",
            Type = type,
            Name = name,
            Aliases = (W.ValOf(element.Element(W.Aliases)) ?? "")
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .ToList(),
            BasedOn = W.ValOf(element.Element(W.BasedOn)),
            // w:default is an ST_OnOff attribute on w:style, not a child element.
            IsDefault = W.Attr(element, "default") is "1" or "true" or "on",
            PPr = pPr,
            RPr = element.Element(W.RPr),
            HeadingLevel = headingLevel,
        };
    }

    static int? HeadingLevelFromName(string name)
    {
        var match = HeadingName.Match(name ?? "");
        if (!match.Success) return null;
        var digit = match.Groups[1].Value[0];
        return digit >= '１' && digit <= '９' ? digit - '１' + 1 : digit - '0';
    }
}

/// <summary>Parsed styles.xml and basedOn inheritance chains with cycle detection.</summary>
sealed class StyleSheet
{
    readonly Dictionary<string, List<StyleInfo>> _chainCache = new(StringComparer.Ordinal);

    public XElement? DocDefaultRPr { get; private set; }
    public XElement? DocDefaultPPr { get; private set; }
    public Dictionary<string, StyleInfo> ById { get; } = new(StringComparer.Ordinal);
    public StyleInfo? DefaultParagraphStyle { get; private set; }

    public static StyleSheet Parse(XDocument? document)
    {
        var sheet = new StyleSheet();
        var root = document?.Root;
        if (root is null) return sheet;

        var defaults = root.Element(W.DocDefaults);
        sheet.DocDefaultRPr = defaults?.Element(W.RPrDefault)?.Element(W.RPr);
        sheet.DocDefaultPPr = defaults?.Element(W.PPrDefault)?.Element(W.PPr);

        var byName = new Dictionary<string, StyleInfo>(StringComparer.OrdinalIgnoreCase);
        foreach (var element in root.Elements(W.Style))
        {
            var style = StyleInfo.From(element);
            if (style.Id.Length == 0) continue;
            sheet.ById[style.Id] = style;
            foreach (var name in style.Aliases.Prepend(style.Name).Where(item => item.Length > 0))
            {
                byName[name] = style;
            }

            if (style.IsDefault && style.Type == "paragraph") sheet.DefaultParagraphStyle = style;
        }

        if (sheet.DefaultParagraphStyle is null)
        {
            foreach (var name in new[] { "Normal", "正文" })
            {
                if (byName.TryGetValue(name, out var style))
                {
                    sheet.DefaultParagraphStyle = style;
                    break;
                }
            }
        }

        return sheet;
    }

    /// <summary>Return self followed by basedOn ancestors from derived to base, skipping ancestors of incompatible types.</summary>
    public List<StyleInfo> Chain(StyleInfo? style, string expectType)
    {
        if (style is null) return [];
        var key = style.Id + "|" + expectType;
        if (_chainCache.TryGetValue(key, out var cached)) return cached;
        var chain = new List<StyleInfo>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var current = style;
        while (current is not null && seen.Add(current.Id))
        {
            if (current == style || current.Type == expectType) chain.Add(current);
            if (string.IsNullOrEmpty(current.BasedOn)) break;
            current = ById.GetValueOrDefault(current.BasedOn);
        }

        _chainCache[key] = chain;
        return chain;
    }

    public StyleInfo? ResolveParagraphStyle(string? styleId)
    {
        return string.IsNullOrEmpty(styleId) ? DefaultParagraphStyle : ById.GetValueOrDefault(styleId);
    }

    public string DisplayName(string? styleId)
    {
        return styleId is not null && ById.TryGetValue(styleId, out var style) ? style.DisplayName : styleId ?? "";
    }
}
