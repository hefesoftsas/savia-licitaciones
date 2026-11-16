using System.Globalization;
using System.Xml.Linq;
using Savia.OpenXmlHelper.BlindCheck.Ooxml;

namespace Savia.OpenXmlHelper.BlindCheck.Model;

/// <summary>Formatting sources ordered from highest to lowest priority.</summary>
static class FormatSource
{
    public const string Direct = "direct";
    public const string CharStyle = "char_style";
    public const string ParaStyle = "para_style";
    public const string TableStyle = "table_style";
    public const string DocDefault = "doc_default";
}

/// <summary>Flatten rPr/pPr into property-name/child-element mappings, including only the w namespace.</summary>
sealed class PropMap : Dictionary<string, XElement>
{
    public PropMap() : base(StringComparer.Ordinal)
    {
    }

    public static PropMap Of(XElement? container, string? exclude = null)
    {
        var map = new PropMap();
        if (container is null) return map;
        foreach (var child in container.Elements())
        {
            if (child.Name.Namespace != W.Ns) continue;
            var name = child.Name.LocalName;
            if (name == exclude) continue;
            map[name] = child;
        }

        return map;
    }
}

/// <summary>Priority-ordered property layers: first matching element wins, with per-attribute merging for multi-attribute elements.</summary>
sealed class PropLevels
{
    readonly List<(string Source, PropMap Props)> _items = [];

    public void Add(string source, PropMap? props)
    {
        if (props is { Count: > 0 }) _items.Add((source, props));
    }

    /// <summary>Append style-chain layers child first, parent last so matching elements and font slots inherit layer by layer.</summary>
    public void AddRange(string source, IEnumerable<PropMap> layers)
    {
        foreach (var props in layers) Add(source, props);
    }

    public IReadOnlyList<(string Source, PropMap Props)> Items => _items;

    public XElement? Get(string name)
    {
        foreach (var (_, props) in _items)
        {
            if (props.TryGetValue(name, out var element)) return element;
        }

        return null;
    }

    public string? SourceOf(string name)
    {
        foreach (var (source, props) in _items)
        {
            if (props.ContainsKey(name)) return source;
        }

        return null;
    }

    /// <summary>Merge the named element per attribute, choosing each attribute's highest-priority value.</summary>
    public Dictionary<string, (string Value, string Source, int Rank)> MergedAttrs(string name)
    {
        var result = new Dictionary<string, (string, string, int)>(StringComparer.Ordinal);
        for (var rank = 0; rank < _items.Count; rank += 1)
        {
            var (source, props) = _items[rank];
            if (!props.TryGetValue(name, out var element)) continue;
            foreach (var attribute in element.Attributes())
            {
                if (attribute.IsNamespaceDeclaration) continue;
                if (attribute.Name.Namespace != W.Ns && attribute.Name.Namespace != XNamespace.None) continue;
                result.TryAdd(attribute.Name.LocalName, (attribute.Value, source, rank));
            }
        }

        return result;
    }
}

sealed class RunFormat
{
    public string? FontEastAsia { get; set; }
    public string? FontAscii { get; set; }
    public string? FontHAnsi { get; set; }
    public string? FontSource { get; set; }
    public double? SizePt { get; set; }
    public bool? Bold { get; set; }
    public bool? Italic { get; set; }
    public string? Underline { get; set; }
    public bool? Strike { get; set; }
    public bool? DoubleStrike { get; set; }
    public bool? Caps { get; set; }
    public bool? SmallCaps { get; set; }
    public bool? Emboss { get; set; }
    public bool? Imprint { get; set; }
    public bool? Outline { get; set; }
    public bool? Shadow { get; set; }
    public bool? Vanish { get; set; }
    /// <summary>No direct hidden setting but at least two hidden style layers may cancel through toggle semantics, leaving actual visibility uncertain.</summary>
    public bool VanishStacked { get; set; }
    public bool? SpecVanish { get; set; }
    public string? ColorRgb { get; set; }
    public string? ColorTheme { get; set; }
    public string? Highlight { get; set; }
    /// <summary>Visible w:rPr/w:shd color in RRGGBB; null for absent, white, or automatic shading.</summary>
    public string? Shading { get; set; }
    /// <summary>superscript / subscript / baseline.</summary>
    public string? VertAlign { get; set; }
    public double? CharSpacingPt { get; set; }
    public int? ScalePct { get; set; }
    public Dictionary<string, string> Sources { get; } = new(StringComparer.Ordinal);
}

sealed class ParaFormat
{
    public string? StyleId { get; set; }
    public string? StyleName { get; set; }
    public int? HeadingLevel { get; set; }
    public string? Alignment { get; set; }
    public string? LineRule { get; set; }
    public double? LinePt { get; set; }
    public double? LineMultiple { get; set; }
    public double? SpaceBeforePt { get; set; }
    public double? SpaceAfterPt { get; set; }
    public double? SpaceBeforeLines { get; set; }
    public double? SpaceAfterLines { get; set; }
    public bool BeforeAutoSpacing { get; set; }
    public bool AfterAutoSpacing { get; set; }
    public int? FirstLineTwips { get; set; }
    public int? FirstLineChars { get; set; }
    public int? HangingTwips { get; set; }
    public int? HangingChars { get; set; }
    public bool HangingWins { get; set; }
    public bool PageBreakBefore { get; set; }
    /// <summary>Align to document grid when defined; Word enables this by default when unset.</summary>
    public bool SnapToGrid { get; set; } = true;
    public double? MarkSizePt { get; set; }
    /// <summary>Point value of a character unit from the paragraph's first run size, then paragraph-mark size, finally 12pt.</summary>
    public double CharUnitPt { get; set; } = 12.0;
    public Dictionary<string, string> Sources { get; } = new(StringComparer.Ordinal);

    /// <summary>
    /// Effective first-line indent in characters, negative for hanging; nonzero Chars variants take precedence.
    /// Word writes firstLineChars="0" to override inherited character indentation when switching to centimeters, so treat zero as unset.
    /// </summary>
    public double? EffectiveFirstLineChars()
    {
        double? Resolve(int? chars, int? twips)
        {
            if (chars is { } c && c != 0) return c / 100.0;
            if (twips is { } t) return t / (CharUnitPt * Units.TwipsPerPt);
            if (chars is not null) return 0;
            return null;
        }

        if (HangingWins)
        {
            var hanging = Resolve(HangingChars, HangingTwips);
            return hanging is null ? null : -hanging;
        }

        var first = Resolve(FirstLineChars, FirstLineTwips);
        if (first is not null) return first;
        var fallback = Resolve(HangingChars, HangingTwips);
        return fallback is null ? null : -fallback;
    }

    /// <summary>Spacing before in points; beforeLines takes precedence over before, matching Word.</summary>
    public double EffectiveSpaceBeforePt()
    {
        if (SpaceBeforeLines is { } lines) return lines * Units.PtPerSpacingLine;
        return SpaceBeforePt ?? 0;
    }

    public double EffectiveSpaceAfterPt()
    {
        if (SpaceAfterLines is { } lines) return lines * Units.PtPerSpacingLine;
        return SpaceAfterPt ?? 0;
    }
}

/// <summary>
/// Resolve formatting through docDefaults -> table style -> paragraph basedOn chain -> character style -> direct formatting.
/// Paragraph-mark formatting w:pPr/w:rPr affects only the mark (ECMA-376 17.3.1.29), not runs.
/// </summary>
sealed class FormatResolver
{
    readonly StyleSheet _sheet;
    readonly ThemeInfo _theme;
    readonly PropMap _docDefaultRPr;
    readonly PropMap _docDefaultPPr;
    readonly Dictionary<string, List<PropMap>> _paraStyleRPr = new(StringComparer.Ordinal);
    readonly Dictionary<string, List<PropMap>> _paraStylePPr = new(StringComparer.Ordinal);
    readonly Dictionary<string, List<PropMap>> _charStyleRPr = new(StringComparer.Ordinal);
    readonly Dictionary<string, List<PropMap>> _tableStyleRPr = new(StringComparer.Ordinal);
    readonly Dictionary<string, List<PropMap>> _tableStylePPr = new(StringComparer.Ordinal);

    static readonly (string Slot, string Name, string Theme)[] FontSlots =
    [
        ("ascii", "ascii", "asciiTheme"),
        ("hAnsi", "hAnsi", "hAnsiTheme"),
        ("eastAsia", "eastAsia", "eastAsiaTheme"),
    ];

    public FormatResolver(StyleSheet sheet, ThemeInfo theme)
    {
        _sheet = sheet;
        _theme = theme;
        _docDefaultRPr = PropMap.Of(sheet.DocDefaultRPr);
        _docDefaultPPr = PropMap.Of(sheet.DocDefaultPPr);
    }

    public StyleSheet Sheet => _sheet;

    public ThemeInfo Theme => _theme;

    /// <summary>
    /// Keep each style-chain layer child-first without premerging; if a child sets only Western fonts or after-spacing,
    /// parent East Asian fonts and line spacing must still inherit per slot and attribute.
    /// </summary>
    List<PropMap> StyleProps(Dictionary<string, List<PropMap>> cache, string? styleId, string type, Func<StyleInfo, XElement?> select, string? exclude = null)
    {
        var key = styleId ?? "";
        if (cache.TryGetValue(key, out var cached)) return cached;
        var style = type == "paragraph" ? _sheet.ResolveParagraphStyle(styleId) : styleId is null ? null : _sheet.ById.GetValueOrDefault(styleId);
        var layers = _sheet.Chain(style, type).Select(item => PropMap.Of(select(item), exclude)).Where(item => item.Count > 0).ToList();
        cache[key] = layers;
        return layers;
    }

    List<PropMap> ParaStyleRPr(string? styleId) => StyleProps(_paraStyleRPr, styleId, "paragraph", style => style.RPr);
    List<PropMap> ParaStylePPr(string? styleId) => StyleProps(_paraStylePPr, styleId, "paragraph", style => style.PPr, "rPr");
    List<PropMap> CharStyleRPr(string? styleId) => styleId is null ? [] : StyleProps(_charStyleRPr, styleId, "character", style => style.RPr);
    List<PropMap> TableStyleRPr(string? styleId) => styleId is null ? [] : StyleProps(_tableStyleRPr, styleId, "table", style => style.RPr);
    List<PropMap> TableStylePPr(string? styleId) => styleId is null ? [] : StyleProps(_tableStylePPr, styleId, "table", style => style.PPr, "rPr");

    public ParaFormat ResolveParagraph(XElement paragraph, string? tableStyleId)
    {
        var pPr = paragraph.Element(W.PPr);
        var direct = PropMap.Of(pPr);
        var styleId = W.ValOf(direct.GetValueOrDefault("pStyle"));
        if (styleId is not null && !_sheet.ById.ContainsKey(styleId)) styleId = null;

        var levels = new PropLevels();
        var directWithoutMark = PropMap.Of(pPr, "rPr");
        levels.Add(FormatSource.Direct, directWithoutMark);
        levels.AddRange(FormatSource.ParaStyle, ParaStylePPr(styleId));
        levels.AddRange(FormatSource.TableStyle, TableStylePPr(tableStyleId));
        levels.Add(FormatSource.DocDefault, _docDefaultPPr);

        var style = _sheet.ResolveParagraphStyle(styleId);
        var format = new ParaFormat
        {
            StyleId = styleId ?? style?.Id,
            StyleName = style?.DisplayName,
            HeadingLevel = style?.HeadingLevel,
        };

        var outline = W.IntAttr(levels.Get("outlineLvl"), "val");
        if (format.HeadingLevel is null && outline is >= 0 and <= 8) format.HeadingLevel = outline + 1;

        var jc = levels.Get("jc");
        format.Alignment = W.ValOf(jc);
        if (levels.SourceOf("jc") is { } jcSource) format.Sources["jc"] = jcSource;

        var spacing = levels.MergedAttrs("spacing");
        if (spacing.Count > 0)
        {
            var line = IntOf(spacing, "line");
            if (line is not null)
            {
                format.LineRule = spacing.TryGetValue("lineRule", out var rule) ? rule.Value : "auto";
                if (format.LineRule == "auto") format.LineMultiple = line.Value / 240.0;
                else format.LinePt = Units.TwipsToPt(line.Value);
                format.Sources["spacing.line"] = spacing["line"].Source;
            }

            if (IntOf(spacing, "before") is { } before) format.SpaceBeforePt = Units.TwipsToPt(before);
            if (IntOf(spacing, "after") is { } after) format.SpaceAfterPt = Units.TwipsToPt(after);
            if (IntOf(spacing, "beforeLines") is { } beforeLines) format.SpaceBeforeLines = beforeLines / 100.0;
            if (IntOf(spacing, "afterLines") is { } afterLines) format.SpaceAfterLines = afterLines / 100.0;
            format.BeforeAutoSpacing = IsOn(spacing, "beforeAutospacing");
            format.AfterAutoSpacing = IsOn(spacing, "afterAutospacing");
        }

        var indent = levels.MergedAttrs("ind");
        if (indent.Count > 0)
        {
            format.FirstLineTwips = IntOf(indent, "firstLine");
            format.FirstLineChars = IntOf(indent, "firstLineChars");
            format.HangingTwips = IntOf(indent, "hanging");
            format.HangingChars = IntOf(indent, "hangingChars");
            // First-line and hanging indentation are one setting; choose the group from the highest-priority layer.
            var firstRank = MinRank(indent, "firstLine", "firstLineChars");
            var hangingRank = MinRank(indent, "hanging", "hangingChars");
            format.HangingWins = hangingRank < firstRank;
            var source = format.HangingWins ? SourceOf(indent, "hanging", "hangingChars") : SourceOf(indent, "firstLine", "firstLineChars");
            if (source is not null) format.Sources["ind"] = source;
        }

        format.PageBreakBefore = W.OnOff(levels.Get("pageBreakBefore")) ?? false;
        format.SnapToGrid = W.OnOff(levels.Get("snapToGrid")) ?? true;
        var markSize = W.IntAttr(pPr?.Element(W.RPr)?.Element(W.Ns + "sz"), "val");
        if (markSize is not null) format.MarkSizePt = Units.HalfPtToPt(markSize.Value);
        format.CharUnitPt = format.MarkSizePt ?? 12.0;
        return format;
    }

    public RunFormat ResolveRun(XElement run, ParaFormat paragraph, string? tableStyleId)
    {
        var direct = PropMap.Of(run.Element(W.RPr));
        var charStyleId = W.ValOf(direct.GetValueOrDefault("rStyle"));
        if (charStyleId is not null && !_sheet.ById.ContainsKey(charStyleId)) charStyleId = null;

        var levels = new PropLevels();
        levels.Add(FormatSource.Direct, direct);
        levels.AddRange(FormatSource.CharStyle, CharStyleRPr(charStyleId));
        levels.AddRange(FormatSource.ParaStyle, ParaStyleRPr(paragraph.StyleId));
        levels.AddRange(FormatSource.TableStyle, TableStyleRPr(tableStyleId));
        levels.Add(FormatSource.DocDefault, _docDefaultRPr);

        var format = new RunFormat();
        ResolveFonts(format, levels);

        var size = W.IntAttr(levels.Get("sz"), "val");
        if (size is not null)
        {
            format.SizePt = Units.HalfPtToPt(size.Value);
            format.Sources["sz"] = levels.SourceOf("sz")!;
        }

        format.Bold = W.OnOff(levels.Get("b"));
        format.Italic = W.OnOff(levels.Get("i"));
        format.Underline = W.ValOf(levels.Get("u")) ?? (levels.Get("u") is null ? null : "single");
        format.Strike = W.OnOff(levels.Get("strike"));
        format.DoubleStrike = W.OnOff(levels.Get("dstrike"));
        format.Caps = W.OnOff(levels.Get("caps"));
        format.SmallCaps = W.OnOff(levels.Get("smallCaps"));
        format.Emboss = W.OnOff(levels.Get("emboss"));
        format.Imprint = W.OnOff(levels.Get("imprint"));
        format.Outline = W.OnOff(levels.Get("outline"));
        format.Shadow = W.OnOff(levels.Get("shadow"));
        format.Vanish = W.OnOff(levels.Get("vanish"));
        // Style booleans toggle, but evaluation uses the highest layer here; flag stacking separately and avoid deleting potentially visible hidden text.
        format.VanishStacked = !direct.ContainsKey("vanish") && levels.Items.Count(item => W.OnOff(item.Props.GetValueOrDefault("vanish")) == true) >= 2;
        format.SpecVanish = W.OnOff(levels.Get("specVanish"));
        format.Highlight = W.ValOf(levels.Get("highlight"));
        format.VertAlign = W.ValOf(levels.Get("vertAlign"));

        var color = levels.Get("color");
        if (color is not null)
        {
            var value = W.ValOf(color);
            var theme = W.Attr(color, "themeColor");
            format.ColorTheme = theme;
            // For themeTint/themeShade, Word stores the modified color in w:val (for example, 50% lighter black as 7F7F7F); use it directly.
            var tinted = W.Attr(color, "themeTint") is not null || W.Attr(color, "themeShade") is not null;
            if (theme is not null && tinted && !IsAuto(value)) format.ColorRgb = value!.ToUpperInvariant();
            else if (theme is not null) format.ColorRgb = _theme.ResolveColor(theme) ?? (IsAuto(value) ? null : value?.ToUpperInvariant());
            else format.ColorRgb = IsAuto(value) ? "000000" : value?.ToUpperInvariant();
            format.Sources["color"] = levels.SourceOf("color")!;
        }

        format.Shading = ShadingColor(levels.Get("shd"));

        var spacing = W.IntAttr(levels.Get("spacing"), "val");
        if (spacing is not null) format.CharSpacingPt = Units.TwipsToPt(spacing.Value);
        format.ScalePct = W.IntAttr(levels.Get("w"), "val");
        foreach (var name in new[] { "b", "i", "u", "highlight", "shd", "vanish", "spacing", "w", "vertAlign" })
        {
            if (levels.SourceOf(name) is { } source) format.Sources[name] = source;
        }

        return format;
    }

    /// <summary>
    /// Resolve fonts per slot from highest priority downward, resolving theme references where present,
    /// otherwise using explicit names; layers containing only w:hint do not hide inherited fonts.
    /// </summary>
    void ResolveFonts(RunFormat format, PropLevels levels)
    {
        foreach (var (slot, name, themeName) in FontSlots)
        {
            foreach (var (source, props) in levels.Items)
            {
                if (!props.TryGetValue("rFonts", out var fonts)) continue;
                var themeKey = W.Attr(fonts, themeName);
                var resolved = themeKey is null ? null : _theme.ResolveFont(themeKey);
                var value = resolved ?? W.Attr(fonts, name);
                if (string.IsNullOrWhiteSpace(value)) continue;
                switch (slot)
                {
                    case "ascii": format.FontAscii = value; break;
                    case "hAnsi": format.FontHAnsi = value; break;
                    default:
                        format.FontEastAsia = value;
                        format.FontSource = source;
                        break;
                }

                break;
            }
        }

        format.FontSource ??= levels.SourceOf("rFonts");
    }

    static bool IsAuto(string? value) => string.IsNullOrEmpty(value) || string.Equals(value, "auto", StringComparison.OrdinalIgnoreCase);

    static bool Visible(string? color) => !IsAuto(color) && !string.Equals(color, "FFFFFF", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Visible text shading prefers fill including theme fill, then pattern color when the pattern is not clear;
    /// white, automatic, and nil mean no shading.
    /// </summary>
    string? ShadingColor(XElement? shd)
    {
        if (shd is null) return null;
        var pattern = W.ValOf(shd);
        if (pattern == "nil") return null;
        var fill = W.Attr(shd, "fill");
        if (IsAuto(fill) && W.Attr(shd, "themeFill") is { } themeFill) fill = _theme.ResolveColor(themeFill);
        if (Visible(fill)) return fill!.ToUpperInvariant();
        var color = W.Attr(shd, "color");
        return pattern is not null and not "clear" && Visible(color) ? color!.ToUpperInvariant() : null;
    }

    static int? IntOf(Dictionary<string, (string Value, string Source, int Rank)> attrs, string name)
    {
        if (!attrs.TryGetValue(name, out var item)) return null;
        if (int.TryParse(item.Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var value)) return value;
        return double.TryParse(item.Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var number) ? (int)number : null;
    }

    static bool IsOn(Dictionary<string, (string Value, string Source, int Rank)> attrs, string name)
    {
        return attrs.TryGetValue(name, out var item) && item.Value is not ("0" or "false" or "off");
    }

    static int MinRank(Dictionary<string, (string Value, string Source, int Rank)> attrs, params string[] names)
    {
        var rank = int.MaxValue;
        foreach (var name in names)
        {
            if (attrs.TryGetValue(name, out var item)) rank = Math.Min(rank, item.Rank);
        }

        return rank;
    }

    static string? SourceOf(Dictionary<string, (string Value, string Source, int Rank)> attrs, params string[] names)
    {
        string? source = null;
        var best = int.MaxValue;
        foreach (var name in names)
        {
            if (attrs.TryGetValue(name, out var item) && item.Rank < best)
            {
                best = item.Rank;
                source = item.Source;
            }
        }

        return source;
    }
}
