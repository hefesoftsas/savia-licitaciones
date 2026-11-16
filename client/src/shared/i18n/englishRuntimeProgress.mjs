// Match complete application messages so document quotations remain untouched.
const exact = new Map([
  ['Agent 正在等待您的回答', 'The agent is waiting for your answer'],
  ['正在提取投标文件元数据', 'Extracting bid metadata'],
  ['投标文件正文生成', 'Bid content generation'],
  ['投标文件正文导出修复', 'Bid content export repair'],
  ['全局事实变量生成', 'Global facts generation'],
  ['全局事实变量生成完成。', 'Global facts generation completed.'],
  ['技术方案目录生成 V2', 'Technical outline generation V2'],
  ['未选择参考知识库。', 'No reference knowledge base selected.'],
  ['技术方案目录已确认，开始生成子目录', 'Outline confirmed; generating subsections.'],
  ['第一轮：正在分析检查范围。', 'First round: analyzing the review scope.'],
  ['按推荐方案处理', 'Continue with the recommended option'],
  ['终止任务', 'Stop task'],
]);

const patterns = [
  [/^一致性修复([\s\S]*)$/, 'Consistency repair$1'],
  [/^No se pudo descargar (.+): HTTP (\d+)$/, 'Could not download $1: HTTP $2'],
  [/^(.+): formato de archivo no válido$/, '$1: invalid file format'],
  [/^(.+) supera 50 MB$/, '$1 exceeds 50 MB'],
  [/^申请 MinerU-Agent 上传链接失败：HTTP ([\s\S]*)$/, 'Failed to request the MinerU-Agent upload URL: HTTP $1'],
  [/^MinerU-Agent 响应缺少 task_id\/file_url：([\s\S]*)$/, 'The MinerU-Agent response is missing task_id/file_url: $1'],
  [/^查询 MinerU-Agent 任务失败：HTTP ([\s\S]*)$/, 'Failed to query the MinerU-Agent task: HTTP $1'],
  [/^申请 MinerU 精准解析上传链接失败：HTTP ([\s\S]*)$/, 'Failed to request the MinerU upload URL: HTTP $1'],
  [/^MinerU 精准解析响应缺少 batch_id\/file_url：([\s\S]*)$/, 'The MinerU response is missing batch_id/file_url: $1'],
  [/^查询 MinerU 精准解析任务失败：HTTP ([\s\S]*)$/, 'Failed to query the MinerU task: HTTP $1'],
  [/^MinerU 精准解析失败：([\s\S]*)$/, 'MinerU parsing failed: $1'],
  [/^文件上传失败：HTTP ([\s\S]*)$/, 'File upload failed: HTTP $1'],
  [/^正文比对 (\d+)\/(\d+)（(\d+)\/(\d+) 句）$/, 'Text comparison: file $1 of $2, sentence $3 of $4'],
  [/^正文比对 (\d+)\/(\d+)$/, 'Text comparison: $1 of $2 files'],
  [/^图片比对 (\d+)\/(\d+)$/, 'Image comparison: $1 of $2 files'],
  [/^正文内容提取 (\d+)\/(\d+)$/, 'Content extraction: $1 of $2'],
  [/^元数据提取 (\d+)\/(\d+)$/, 'Metadata extraction: $1 of $2'],
  [/^目录提取 (\d+)\/(\d+)$/, 'Outline extraction: $1 of $2'],
  [/^正在分析第 (\d+)\/(\d+) 段资料。$/, 'Analyzing source section $1 of $2.'],
  [/^开始生成 (\d+) 个章节正文。$/, 'Generating content for $1 sections.'],
  [/^继续生成 (\d+) 个未完成章节。$/, 'Continuing $1 unfinished sections.'],
  [/^开始审校 (\d+) 个已生成章节。$/, 'Reviewing $1 generated sections.'],
  [/^正在审校：(.+)$/, 'Reviewing: $1'],
  [/^正在调用工具：(.+)$/, 'Using tool: $1'],
  [/^修改正文小节：(.+)$/, 'Editing section: $1'],
  [/^全局事实变量整理完成：(\d+) 个大项。$/, 'Global facts prepared: $1 groups.'],
  [/^模型请求遇到临时错误，(\d+) 秒后进行第 (\d+)\/(\d+) 次重试：([\s\S]*)$/, 'Temporary model error; retry $2/$3 in $1 s: $4'],
  [/^模型请求已恢复，第 (\d+) 次重试成功$/, 'The model request recovered on retry $1'],
  [/^模型请求重试 (\d+) 次后仍失败$/, 'The model request failed after $1 retries'],
  [/^正文文件已保存：(.+)，(\d+) 字（(\d+)\/(\d+)）。$/, 'Content saved: $1, $2 words ($3/$4).'],
  [/^正在滚动审阅投标包第 (\d+)\/(\d+) 段。$/, 'Reviewing bid package section $1 of $2.'],
  [/^正在识别第 (\d+)\/(\d+) 段错别字。$/, 'Checking spelling in section $1 of $2.'],
  [/^正在滚动检查投标包第 (\d+)\/(\d+) 段逻辑。$/, 'Checking logic in bid package section $1 of $2.'],
  [/^正在定稿废标项风险第 (\d+)\/(\d+) 批。$/, 'Finalizing rejection risks in batch $1 of $2.'],
  [/^正在定稿逻辑问题第 (\d+)\/(\d+) 批。$/, 'Finalizing logic issues in batch $1 of $2.'],
  [/^检查完成，(\d+) 个任务失败。$/, 'Review completed; $1 tasks failed.'],
  [/^检查完成：高风险 (\d+) 处、中风险 (\d+) 处、低风险 (\d+) 处。$/, 'Review completed: $1 high-risk, $2 medium-risk, and $3 low-risk findings.'],
  [/^开始按上下文自动分段匹配，共 (\d+) 段$/, 'Starting automatic matching for $1 sections.'],
  [/^AI 正在匹配段落 第 (\d+)\/(\d+) 段$/, 'AI is matching section $1 of $2.'],
  [/^整理完成，共 (\d+) 条，覆盖率 ([\d.]+)%$/, 'Processing completed: $1 entries, $2% coverage.'],
  [/^原方案还原完成：已还原 (\d+) 个小节，未还原范围 (\d+) 处，还原率 ([\d.]+)%。$/, 'Restoration completed: $1 sections restored, $2 ranges pending, $3% restored.'],
  [/^去表格完成，已处理 (\d+) 个小节，图片表格保留。$/, 'Table removal completed in $1 sections; image tables were preserved.'],
];

export function localizeEnglishProgress(text) {
  if (exact.has(text)) return exact.get(text);
  for (const [pattern, replacement] of patterns) {
    if (pattern.test(text)) return text.replace(pattern, replacement);
  }
  return text;
}
