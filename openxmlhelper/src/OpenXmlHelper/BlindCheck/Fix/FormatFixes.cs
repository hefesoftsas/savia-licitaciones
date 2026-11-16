using Savia.OpenXmlHelper.BlindCheck.Model;
using Savia.OpenXmlHelper.BlindCheck.Ooxml;
using static Savia.OpenXmlHelper.BlindCheck.Fix.PropertyWriter;

namespace Savia.OpenXmlHelper.BlindCheck.Fix;

/// <summary>
/// Paragraph/run formatting repair writes only faulty properties, taking targets from the same TargetFor entry point as checks.
/// Write explicit off values so inherited bold, italic, and similar formatting is actually disabled.
/// </summary>
static class FormatFixes
{
    public static readonly Dictionary<string, Action<FixContext, ParaRecord>> Paragraph = new(StringComparer.Ordinal)
    {
        ["para.alignment"] = FixAlignment,
        ["para.line_spacing"] = FixLineSpacing,
        ["para.first_line_indent"] = (fix, record) => SetFirstLine(record, fix.Rules.TargetFor(record).Target.FirstLineIndentChars),
        ["para.space_before_after"] = FixSpacing,
        ["para.page_break_before"] = (_, record) => SetParagraphToggle(record.Element, "pageBreakBefore", false),
        ["para.snap_to_grid"] = (_, record) => SetParagraphToggle(record.Element, "snapToGrid", false),
        ["table.indent"] = (fix, record) => SetFirstLine(record, fix.Rules.Profile.Table.FirstLineIndentChars),
    };

    public static readonly Dictionary<string, Action<FixContext, ParaRecord, RunRecord>> Run = new(StringComparer.Ordinal)
    {
        ["font.chinese"] = (fix, record, run) => SetRunFonts(run.Element, eastAsia: fix.Rules.TargetFor(record).Target.FontCn),
        ["font.western"] = (fix, record, run) => SetRunFonts(run.Element, latin: fix.Rules.TargetFor(record).Target.FontEn),
        ["font.size"] = (fix, record, run) => SetSize(run, fix.Rules.TargetFor(record).Target.SizePt),
        ["font.bold"] = FixBold,
        ["font.italic"] = (_, _, run) => SetToggles(run, false, "i", "iCs"),
        ["font.underline"] = (_, _, run) => SetRunValue(run.Element, "u", "none"),
        ["font.color"] = (_, _, run) => SetRunColorBlack(run.Element),
        ["font.highlight"] = (_, _, run) => ClearHighlight(run),
        ["font.effects"] = FixEffects,
        ["font.char_spacing"] = (_, _, run) => SetRunValue(run.Element, "spacing", "0"),
        ["font.scaling"] = (_, _, run) => SetRunValue(run.Element, "w", "100"),
        ["text.hidden"] = (_, _, run) => DeleteHiddenContent(run),
        ["table.font"] = (fix, _, run) => SetRunFonts(run.Element, eastAsia: fix.Rules.Profile.Table.FontCn),
        ["table.size"] = (fix, _, run) => SetSize(run, fix.Rules.Profile.Table.SizePt),
    };

    /// <summary>
    /// Exclude reported runs that cannot be repaired before counting; stacked hidden styles may make text visible,
    /// so deletion could lose body content. Other repairs write explicit formatting and are safe despite approximate evaluation.
    /// </summary>
    public static bool CanFixRun(string ruleId, RunRecord run) => ruleId != "text.hidden" || !run.Format.VanishStacked;

    static void FixAlignment(FixContext fix, ParaRecord record)
    {
        var target = fix.Rules.TargetFor(record).Target.Alignment;
        if (string.IsNullOrEmpty(target)) return;
        SetVal(ParagraphChild(record.Element, "jc"), target);
    }

    static void FixLineSpacing(FixContext fix, ParaRecord record)
    {
        var target = fix.Rules.TargetFor(record).Target;
        if (target.LineRule == "multiple")
        {
            if (target.LineMultiple is not { } multiple) return;
            var spacing = ParagraphChild(record.Element, "spacing");
            SetAttr(spacing, "line", Number(multiple * 240));
            SetAttr(spacing, "lineRule", "auto");
            return;
        }

        if (target.LinePt is not { } pt) return;
        var element = ParagraphChild(record.Element, "spacing");
        SetAttr(element, "line", Number(pt * Units.TwipsPerPt));
        SetAttr(element, "lineRule", target.LineRule);
    }

    /// <summary>Write first-line indentation in characters and twips, removing direct hanging indentation; write zero in both units to override inherited indentation.</summary>
    static void SetFirstLine(ParaRecord record, double? want)
    {
        if (want is not { } chars) return;
        var indent = ParagraphChild(record.Element, "ind");
        SetAttr(indent, "hanging", null);
        SetAttr(indent, "hangingChars", null);
        if (chars <= 0.001)
        {
            SetAttr(indent, "firstLineChars", "0");
            SetAttr(indent, "firstLine", "0");
            return;
        }

        SetAttr(indent, "firstLineChars", Number(chars * 100));
        SetAttr(indent, "firstLine", Number(chars * record.Format.CharUnitPt * Units.TwipsPerPt));
    }

    /// <summary>Paragraph spacing in lines takes precedence over points; rewrite line-based spacing when originally present.</summary>
    static void FixSpacing(FixContext fix, ParaRecord record)
    {
        var target = fix.Rules.TargetFor(record).Target;
        var format = record.Format;
        if (target.SpaceBeforePt is { } before && (format.BeforeAutoSpacing || Math.Abs(format.EffectiveSpaceBeforePt() - before) > 0.5))
        {
            var spacing = ParagraphChild(record.Element, "spacing");
            if (format.BeforeAutoSpacing) SetAttr(spacing, "beforeAutospacing", "0");
            SetAttr(spacing, "before", Number(before * Units.TwipsPerPt));
            if (format.SpaceBeforeLines is not null) SetAttr(spacing, "beforeLines", Number(before / Units.PtPerSpacingLine * 100));
        }

        if (target.SpaceAfterPt is { } after && (format.AfterAutoSpacing || Math.Abs(format.EffectiveSpaceAfterPt() - after) > 0.5))
        {
            var spacing = ParagraphChild(record.Element, "spacing");
            if (format.AfterAutoSpacing) SetAttr(spacing, "afterAutospacing", "0");
            SetAttr(spacing, "after", Number(after * Units.TwipsPerPt));
            if (format.SpaceAfterLines is not null) SetAttr(spacing, "afterLines", Number(after / Units.PtPerSpacingLine * 100));
        }
    }

    static void SetSize(RunRecord run, double? pt)
    {
        if (pt is { } value) SetRunSize(run.Element, value);
    }

    static void SetToggles(RunRecord run, bool on, params string[] names)
    {
        foreach (var name in names) SetRunToggle(run.Element, name, on);
    }

    /// <summary>Enable or disable heading bold according to heading targets; disable body bold when prohibited.</summary>
    static void FixBold(FixContext fix, ParaRecord record, RunRecord run)
    {
        var (target, role, _) = fix.Rules.TargetFor(record);
        SetToggles(run, role == "heading" && target.Bold == true, "b", "bCs");
    }

    /// <summary>Remove highlighting and write explicit clear/automatic shading to override inherited text backgrounds.</summary>
    static void ClearHighlight(RunRecord run)
    {
        if (run.Format.Highlight is not null and not "none") SetRunValue(run.Element, "highlight", "none");
        if (run.Format.Shading is null) return;
        var shading = RunChild(run.Element, "shd");
        SetVal(shading, "clear");
        SetAttr(shading, "color", "auto");
        SetAttr(shading, "fill", "auto");
        foreach (var name in new[] { "themeColor", "themeTint", "themeShade", "themeFill", "themeFillTint", "themeFillShade" }) SetAttr(shading, name, null);
    }

    static void FixEffects(FixContext fix, ParaRecord record, RunRecord run)
    {
        var format = run.Format;
        var effects = new (string Name, bool? On)[]
        {
            ("strike", format.Strike), ("dstrike", format.DoubleStrike), ("caps", format.Caps), ("smallCaps", format.SmallCaps),
            ("emboss", format.Emboss), ("imprint", format.Imprint), ("outline", format.Outline), ("shadow", format.Shadow),
        };
        foreach (var (name, on) in effects)
        {
            if (on == true) SetRunToggle(run.Element, name, false);
        }
    }

    /// <summary>
    /// Delete hidden text rather than revealing it: it often contains residual company information that would otherwise be printed.
    /// Preserve fldChar/instrText markers to avoid breaking field structure.
    /// </summary>
    static void DeleteHiddenContent(RunRecord run)
    {
        foreach (var child in run.Element.Elements().ToList())
        {
            if (child.Name == W.RPr || child.Name == W.FldChar || child.Name == W.InstrText) continue;
            child.Remove();
        }

        RemoveIfEmptyRun(run.Element);
    }
}
