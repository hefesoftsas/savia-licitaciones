using System.Xml.Linq;
using Savia.OpenXmlHelper.BlindCheck.Model;
using Savia.OpenXmlHelper.BlindCheck.Ooxml;

namespace Savia.OpenXmlHelper.BlindCheck.Rules;

/// <summary>
/// Tables: technical bids often place substantial body text in tables, with separately configured fonts and font sizes.
/// Cell content is normally unindented; assess table paragraphs with table settings instead of body settings.
/// </summary>
static class TableRules
{
    static readonly HashSet<string> PlainTableStyles = new(StringComparer.OrdinalIgnoreCase)
    {
        "tablenormal", "normal table", "table normal", "普通表格", "无格式表格", "table grid", "tablegrid", "网格型",
    };

    public static IEnumerable<RuleSpec> All()
    {
        yield return new RuleSpec { Id = "table.font", Title = "表格字体", Category = "table", Severity = Severity.Medium, InBody = false, PerRun = CheckFont };
        yield return new RuleSpec { Id = "table.size", Title = "表格字号", Category = "table", Severity = Severity.Medium, InBody = false, PerRun = CheckSize };
        yield return new RuleSpec { Id = "table.indent", Title = "表格首行缩进", Category = "table", Severity = Severity.Low, InBody = false, SkipObjectOnly = true, PerParagraph = CheckIndent };
        yield return new RuleSpec { Id = "table.style", Title = "表格样式", Category = "table", Severity = Severity.Low, Whole = CheckStyle };
        yield return new RuleSpec { Id = "table.shading", Title = "单元格底纹", Category = "table", Severity = Severity.Medium, Whole = CheckShading };
        yield return new RuleSpec { Id = "table.nested", Title = "嵌套表格", Category = "table", Severity = Severity.Low, Whole = CheckNested };
        yield return new RuleSpec { Id = "table.alignment", Title = "表格对齐方式", Category = "table", Severity = Severity.Low, Whole = CheckAlignment };
        yield return new RuleSpec { Id = "table.merge", Title = "合并单元格", Category = "table", Severity = Severity.Low, Whole = CheckMerge };
    }

    /// <summary>Top-level body tables, numbered consistently with "Table N" result locations.</summary>
    static IEnumerable<(int Index, XElement Table)> TopTables(RuleContext context)
    {
        var index = 0;
        foreach (var block in context.Model.BodyBlocks.Where(item => item.IsTable))
        {
            index += 1;
            yield return (index, block.Element);
        }
    }

    static IEnumerable<Finding> CheckFont(RuleContext context, RuleSpec rule, ParaRecord record, RunRecord run)
    {
        if (!context.Profile.Bool("table.check_font", true) || !TextKinds.HasCjk(run.Text)) yield break;
        var target = context.Profile.Table.FontCn;
        var current = run.Format.FontEastAsia;
        if (string.IsNullOrEmpty(target) || current is null || FontNames.Same(current, target)) yield break;
        yield return context.At(rule, record, $"表格内中文字体不是{target}",
            $"当前「{current}」，要求「{target}」",
            $"选中表格文字，把中文字体设为「{target}」",
            context.Origin(run.Format.FontSource, record));
    }

    static IEnumerable<Finding> CheckSize(RuleContext context, RuleSpec rule, ParaRecord record, RunRecord run)
    {
        if (!context.Profile.Bool("table.check_size", true) || string.IsNullOrWhiteSpace(run.Text) || !FontRules.LatinSizeChecked(context, run)) yield break;
        var table = context.Profile.Table;
        if (table.SizePt is not { } want || run.Format.SizePt is not { } current) yield break;
        if (Math.Abs(current - want) <= context.Profile.Body.TolerancePt) yield break;
        yield return context.At(rule, record, $"表格内字号不是{Units.FormatPt(want)}",
            $"当前{Units.FormatPt(current)}，要求{Units.FormatPt(want)}",
            $"选中表格文字，把字号设为{Units.FormatPt(want)}",
            context.Origin(run.Format.Sources.GetValueOrDefault("sz"), record));
    }

    static IEnumerable<Finding> CheckIndent(RuleContext context, RuleSpec rule, ParaRecord record)
    {
        if (!context.Profile.Bool("table.check_first_line_indent", true)) yield break;
        var want = context.Profile.Table.FirstLineIndentChars;
        if (want is null) yield break;
        var current = record.Format.EffectiveFirstLineChars() ?? 0;
        if (Math.Abs(current - want.Value) <= 0.1) yield break;
        yield return context.At(rule, record, "表格内段落首行缩进不符合要求",
            $"当前 {Units.Number(current)} 字符，要求 {Units.Number(want.Value)} 字符",
            "选中表格 → 段落 → 特殊 → 无",
            context.Origin(record.Format.Sources.GetValueOrDefault("ind"), record));
    }

    static IEnumerable<Finding> CheckStyle(RuleContext context, RuleSpec rule)
    {
        if (!context.Profile.Bool("table.check_tblStyle", true)) yield break;
        var counts = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var table in context.Model.BodyElement.Descendants(W.Tbl))
        {
            var styleId = W.ValOf(table.Element(W.TblPr)?.Element(W.TblStyle));
            if (string.IsNullOrEmpty(styleId) || PlainTableStyles.Contains(styleId)) continue;
            var name = context.Model.Sheet.DisplayName(styleId);
            if (PlainTableStyles.Contains(name)) continue;
            counts[name] = counts.GetValueOrDefault(name) + 1;
        }

        if (counts.Count == 0) yield break;
        var detail = string.Join("、", counts.OrderByDescending(item => item.Value).Take(8).Select(item => $"{item.Key}（{item.Value} 个表）"));
        yield return context.Global(rule, "表格套用了带格式的表格样式", "表格",
            $"样式：{detail}。内置表格样式常带彩色表头或隔行底纹，暗标通常要求表格黑白无底纹",
            "选中表格 → 表设计 → 表格样式选择「网格型」或清除样式");
    }

    /// <summary>Colored shading belongs to the no-color rule: check only when body text color is forbidden; do not report when requirements allow color.</summary>
    static IEnumerable<Finding> CheckShading(RuleContext context, RuleSpec rule)
    {
        if (!context.Profile.Bool("table.check_shading", true) || context.Profile.Body.AllowColor) yield break;
        var count = 0;
        var samples = new List<string>();
        foreach (var cell in context.Model.BodyElement.Descendants(W.Tc))
        {
            var fill = W.Attr(cell.Element(W.TcPr)?.Element(W.Shd), "fill")?.ToUpperInvariant();
            if (string.IsNullOrEmpty(fill) || fill is "AUTO" or "000000" or "FFFFFF") continue;
            count += 1;
            if (samples.Count < 5 && !samples.Contains(fill)) samples.Add(fill);
        }

        if (count == 0) yield break;
        yield return context.Global(rule, "单元格存在彩色底纹", "表格",
            $"共 {count} 个单元格，底纹色示例：{string.Join("、", samples.Select(item => "#" + item))}。格式要求不允许使用彩色",
            "选中单元格 → 表设计 → 底纹 → 无颜色");
    }

    static IEnumerable<Finding> CheckNested(RuleContext context, RuleSpec rule)
    {
        if (!context.Profile.Bool("table.check_nested", true)) yield break;
        var count = context.Model.BodyElement.Descendants(W.Tbl).Count(table => table.Ancestors(W.Tc).Any());
        if (count == 0) yield break;
        yield return context.Global(rule, "存在嵌套表格", "表格",
            $"共 {count} 个单元格内嵌套了表格，评审系统解析文字时容易错乱",
            "把嵌套表格拆出或合并到外层表格");
    }

    /// <summary>Horizontal table alignment on the page (Table Properties > Alignment), using only table settings and defaulting to left alignment.</summary>
    static IEnumerable<Finding> CheckAlignment(RuleContext context, RuleSpec rule)
    {
        var target = context.Profile.Text("table.alignment");
        if (string.IsNullOrEmpty(target)) yield break;
        foreach (var (index, table) in TopTables(context))
        {
            var current = W.ValOf(table.Element(W.TblPr)?.Element(W.Ns + "jc"));
            if (ParagraphRules.AlignMatches(target, current)) continue;
            yield return context.Global(rule, "表格对齐方式不符合要求", $"第 {index} 个表格",
                $"当前「{ParagraphRules.AlignName(current)}」，要求「{ParagraphRules.AlignName(target)}」",
                "选中表格 → 表格属性 → 表格 → 对齐方式");
        }
    }

    /// <summary>Merged cells are not violations themselves but may appear misaligned in review systems; provide statistics for manual confirmation only.</summary>
    static IEnumerable<Finding> CheckMerge(RuleContext context, RuleSpec rule)
    {
        if (!context.Profile.Bool("table.check_merge", false)) yield break;
        var tables = new List<int>();
        var cells = 0;
        foreach (var (index, table) in TopTables(context))
        {
            var merged = table.Descendants(W.TcPr).Count(properties =>
                (W.IntAttr(properties.Element(W.Ns + "gridSpan"), "val") ?? 1) > 1
                || W.ValOf(properties.Element(W.Ns + "vMerge")) is "restart"
                || properties.Element(W.Ns + "hMerge") is not null);
            if (merged == 0) continue;
            tables.Add(index);
            cells += merged;
        }

        if (tables.Count == 0) yield break;
        var list = string.Join("、", tables.Take(12)) + (tables.Count > 12 ? " 等" : "");
        yield return context.Global(rule, "表格含合并单元格", "表格",
            $"共 {tables.Count} 个表格含合并单元格（第 {list} 个表格），合计 {cells} 处合并。合并单元格在评审系统中可能显示错位",
            "人工确认合并后的表格在评审系统中显示正常；必要时拆分单元格");
    }
}
