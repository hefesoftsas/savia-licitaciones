namespace Savia.OpenXmlHelper.BlindCheck.Rules;

/// <summary>Rule registry: privacy > structure > images > pages > paragraphs > fonts > text > tables > consistency. Rule IDs must be unique.</summary>
static class RuleCatalog
{
    public static readonly IReadOnlyList<RuleSpec> All = Build();

    static List<RuleSpec> Build()
    {
        var rules = PrivacyRules.All()
            .Concat(StructureRules.All())
            .Concat(ImageRules.All())
            .Concat(PageRules.All())
            .Concat(ParagraphRules.All())
            .Concat(FontRules.All())
            .Concat(TextRules.All())
            .Concat(TableRules.All())
            .Concat(ConsistencyRules.All())
            .ToList();
        var duplicate = rules.GroupBy(rule => rule.Id).FirstOrDefault(group => group.Count() > 1);
        if (duplicate is not null) throw new InvalidOperationException($"重复的规则 ID：{duplicate.Key}");
        return rules;
    }
}
