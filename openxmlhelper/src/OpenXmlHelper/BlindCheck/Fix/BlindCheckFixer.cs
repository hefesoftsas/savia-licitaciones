using System.Xml.Linq;
using Savia.OpenXmlHelper.BlindCheck.Model;
using Savia.OpenXmlHelper.BlindCheck.Ooxml;
using Savia.OpenXmlHelper.BlindCheck.Rules;

namespace Savia.OpenXmlHelper.BlindCheck.Fix;

/// <summary>Repair context: check session, writer, modification counts per rule, skip notes, and changed parts.</summary>
sealed class FixContext(BlindCheckSession session, DocxWriter writer)
{
    readonly HashSet<string> _touched = new(StringComparer.OrdinalIgnoreCase);
    readonly Dictionary<string, XDocument?> _extra = new(StringComparer.OrdinalIgnoreCase);

    public RuleContext Rules => session.Context;
    public DocumentModel Model => session.Context.Model;
    public DocxPackage Package => session.Package;
    public DocxWriter Writer => writer;
    public Dictionary<string, int> Counts { get; } = new(StringComparer.Ordinal);
    public List<string> Notes { get; } = [];

    public void Count(string ruleId, int amount = 1)
    {
        if (amount > 0) Counts[ruleId] = Counts.GetValueOrDefault(ruleId) + amount;
    }

    public void Note(string text)
    {
        if (!Notes.Contains(text)) Notes.Add(text);
    }

    public void Touch(string part) => _touched.Add(part);

    public void Touch(ParaRecord record) => _touched.Add(record.Container.Part);

    /// <summary>Parts outside the model, such as document properties and comment extensions, loaded and cached on first access.</summary>
    public XDocument? Extra(string? part)
    {
        if (string.IsNullOrEmpty(part)) return null;
        if (!_extra.TryGetValue(part, out var document))
        {
            document = Package.TryLoad(part);
            _extra[part] = document;
        }

        return document;
    }

    /// <summary>Pass changed XML parts to the writer; unchanged parts are copied verbatim.</summary>
    public void Commit()
    {
        foreach (var part in _touched)
        {
            var document = Model.Parts.GetValueOrDefault(part) ?? _extra.GetValueOrDefault(part);
            if (document is not null) Writer.SetXml(part, document);
        }
    }
}

/// <summary>
/// Repair dispatch does not depend on aggregated check samples; rerun each rule's checks per paragraph and run on the same model,
/// then repair only reported issues. Checking and repair share switches, scope, and formatting targets so detected issues can be repaired.
/// </summary>
static class BlindCheckFixer
{
    public static void Run(FixContext fix, IReadOnlySet<string> selected, ProgressRange progress)
    {
        var context = fix.Rules;
        var rules = RuleCatalog.All
            .Where(rule => selected.Contains(rule.Id) && context.Profile.RuleEnabled(rule.Id, rule.DefaultEnabled))
            .ToList();
        var paragraphRules = rules.Where(rule => rule.PerParagraph is not null && FormatFixes.Paragraph.ContainsKey(rule.Id)).ToList();
        var textRules = rules.Where(rule => rule.PerParagraph is not null && TextFixes.Supports(rule.Id)).ToList();
        var runRules = rules.Where(rule => rule.PerRun is not null && FormatFixes.Run.ContainsKey(rule.Id)).ToList();
        var wholeRules = rules.Where(rule => rule.Whole is not null && StructureFixes.Whole.ContainsKey(rule.Id)).ToList();
        var lineBreakRule = rules.FirstOrDefault(rule => rule.Id == "text.linebreak");
        var lineBreaks = new List<ParaRecord>();

        var regular = context.Groups.All.Count;
        var records = context.Groups.All.Concat(RuleEngine.OtherRegions(context)).ToList();
        for (var index = 0; index < records.Count; index += 1)
        {
            if (index % 500 == 0) progress.Report(0.8 * index / Math.Max(1, records.Count), "正在修复段落与文字格式");
            var record = records[index];
            var other = index >= regular;
            bool Applies(RuleSpec rule) => (!other || rule.AllRegions) && RuleEngine.Applies(context, rule, record);

            foreach (var rule in paragraphRules)
            {
                if (!Applies(rule) || !rule.PerParagraph!(context, rule, record).Any()) continue;
                FormatFixes.Paragraph[rule.Id](fix, record);
                fix.Count(rule.Id);
                fix.Touch(record);
            }

            if (textRules.Count > 0)
            {
                var edits = new TextEdits();
                foreach (var rule in textRules)
                {
                    if (!Applies(rule) || !rule.PerParagraph!(context, rule, record).Any()) continue;
                    TextFixes.Collect(rule.Id, context, record, edits);
                }

                var applied = TextFixes.Apply(record, edits);
                if (applied.Count > 0)
                {
                    foreach (var (ruleId, count) in applied) fix.Count(ruleId, count);
                    fix.Touch(record);
                }
            }

            foreach (var run in record.Runs)
            {
                if (run.Text.Length == 0) continue;
                foreach (var rule in runRules)
                {
                    if (!Applies(rule) || run.Element.Parent is null || !rule.PerRun!(context, rule, record, run).Any()) continue;
                    if (!FormatFixes.CanFixRun(rule.Id, run)) continue;
                    FormatFixes.Run[rule.Id](fix, record, run);
                    fix.Count(rule.Id);
                    fix.Touch(record);
                }
            }

            if (lineBreakRule is not null && Applies(lineBreakRule) && lineBreakRule.PerParagraph!(context, lineBreakRule, record).Any()) lineBreaks.Add(record);
        }

        // Splitting paragraphs moves runs into new paragraphs; do it after per-paragraph repair so corrected formatting and text move together.
        if (lineBreaks.Count > 0) fix.Count("text.linebreak", TextFixes.SplitLineBreaks(fix, lineBreaks));

        for (var index = 0; index < wholeRules.Count; index += 1)
        {
            var rule = wholeRules[index];
            progress.Report(0.8 + 0.2 * index / wholeRules.Count, $"正在修复：{rule.Title}");
            if (!rule.Whole!(context, rule).Any()) continue;
            fix.Count(rule.Id, StructureFixes.Whole[rule.Id](fix));
        }

        progress.Report(1, "修复完成");
    }
}
