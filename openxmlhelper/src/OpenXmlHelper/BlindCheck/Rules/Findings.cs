namespace Savia.OpenXmlHelper.BlindCheck.Rules;

/// <summary>Severity: high may directly invalidate a bid, such as identity disclosure; medium clearly violates formatting; low requires manual confirmation.</summary>
enum Severity
{
    High = 0,
    Medium = 1,
    Low = 2,
}

sealed class Finding
{
    public required string RuleId { get; init; }
    public required Severity Severity { get; init; }
    public required string Message { get; init; }
    public string Where { get; init; } = "全文";
    public string Text { get; init; } = "";
    public string Detail { get; init; } = "";
    public string Origin { get; init; } = "";
    public string Hint { get; init; } = "";
    /// <summary>Paragraph locator shared with structure export and Agent editing; empty for document-wide issues.</summary>
    public string Locator { get; init; } = "";
    /// <summary>Candidate issue: rules only screen, while AI review decides whether anonymous-bid requirements are actually violated.</summary>
    public bool Candidate { get; init; }
}

sealed class FindingSample
{
    public string Where { get; init; } = "";
    public string Text { get; init; } = "";
    public string Detail { get; init; } = "";
    public string Origin { get; init; } = "";
    public string Hint { get; init; } = "";
}

/// <summary>AI review location entry includes paragraph locator and has a higher count limit than display samples.</summary>
sealed class FindingItem
{
    public string Where { get; init; } = "";
    public string Text { get; init; } = "";
    public string Detail { get; init; } = "";
    public string Locator { get; init; } = "";
}

sealed class FindingGroup
{
    public string RuleId { get; init; } = "";
    public string RuleTitle { get; init; } = "";
    public string Category { get; init; } = "";
    public string Severity { get; init; } = "";
    public string Message { get; init; } = "";
    public bool Candidate { get; init; }
    public int Count { get; set; }
    public List<FindingSample> Samples { get; init; } = [];
    public List<FindingItem> Items { get; init; } = [];
}

/// <summary>
/// Aggregate online by rule + severity + conclusion + candidate flag; raw findings may number hundreds of thousands,
/// so retain samples across the document's beginning/end and collapse the rest into counts, plus the first several locator entries in document order for AI review.
/// </summary>
sealed class FindingAggregator
{
    const int MaxSamples = 6;
    const int MaxItems = 200;

    sealed class Bucket
    {
        public required RuleSpec Rule { get; init; }
        public required Severity Severity { get; init; }
        public required string Message { get; init; }
        public required bool Candidate { get; init; }
        public int Count;
        public readonly List<Finding> Head = [];
        public readonly Queue<Finding> Tail = new();
        public readonly List<Finding> Items = [];
    }

    readonly Dictionary<string, Bucket> _buckets = new(StringComparer.Ordinal);

    public int Total { get; private set; }

    public void Add(RuleSpec rule, Finding finding)
    {
        var candidate = rule.Candidate || finding.Candidate;
        var key = $"{finding.RuleId}\u0001{(int)finding.Severity}\u0001{finding.Message}\u0001{candidate}";
        if (!_buckets.TryGetValue(key, out var bucket))
        {
            bucket = new Bucket { Rule = rule, Severity = finding.Severity, Message = finding.Message, Candidate = candidate };
            _buckets[key] = bucket;
        }

        bucket.Count += 1;
        Total += 1;
        if (bucket.Items.Count < MaxItems) bucket.Items.Add(finding);
        if (bucket.Head.Count < MaxSamples)
        {
            bucket.Head.Add(finding);
            return;
        }

        bucket.Tail.Enqueue(finding);
        if (bucket.Tail.Count > MaxSamples / 2) bucket.Tail.Dequeue();
    }

    public Dictionary<string, int> CountBySeverity()
    {
        var counts = new Dictionary<string, int>(StringComparer.Ordinal) { ["high"] = 0, ["medium"] = 0, ["low"] = 0 };
        foreach (var bucket in _buckets.Values)
        {
            counts[SeverityName(bucket.Severity)] += bucket.Count;
        }

        return counts;
    }

    public List<FindingGroup> Groups()
    {
        return _buckets.Values
            .OrderBy(bucket => bucket.Severity)
            .ThenByDescending(bucket => bucket.Count)
            .ThenBy(bucket => bucket.Rule.Id, StringComparer.Ordinal)
            .Select(bucket => new FindingGroup
            {
                RuleId = bucket.Rule.Id,
                RuleTitle = bucket.Rule.Title,
                Category = bucket.Rule.Category,
                Severity = SeverityName(bucket.Severity),
                Message = bucket.Message,
                Candidate = bucket.Candidate,
                Count = bucket.Count,
                Samples = Samples(bucket),
                Items = bucket.Items.Select(item => new FindingItem { Where = item.Where, Text = item.Text, Detail = item.Detail, Locator = item.Locator }).ToList(),
            })
            .ToList();
    }

    /// <summary>Sample both beginning and end; once over the limit, replace the latter half with trailing samples.</summary>
    static List<FindingSample> Samples(Bucket bucket)
    {
        var findings = bucket.Tail.Count == 0
            ? bucket.Head
            : bucket.Head.Take(MaxSamples - bucket.Tail.Count).Concat(bucket.Tail).ToList();
        return findings.Select(item => new FindingSample
        {
            Where = item.Where,
            Text = item.Text,
            Detail = item.Detail,
            Origin = item.Origin,
            Hint = item.Hint,
        }).ToList();
    }

    public static string SeverityName(Severity severity) => severity switch
    {
        Severity.High => "high",
        Severity.Medium => "medium",
        _ => "low",
    };
}
