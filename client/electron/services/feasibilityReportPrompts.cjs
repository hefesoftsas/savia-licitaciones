const OUTLINE_TEMPLATES = {
  government: {
    label: '政府投资项目通用大纲（2023版标准）',
    chapters: [
      '概述',
      '项目建设背景和必要性',
      '项目需求分析与产出方案',
      '项目选址与要素保障',
      '项目建设方案',
      '项目运营方案',
      '项目投融资与财务方案',
      '项目影响效果分析',
      '项目风险管控方案',
      '研究结论及建议',
    ],
    suggestedChildren: [
      ['项目概况', '项目单位概况', '编制依据', '主要结论和建议'],
      ['项目建设背景', '规划政策符合性', '项目建设必要性'],
      ['需求分析', '建设内容和规模', '项目产出方案'],
      ['项目选址', '项目建设条件', '要素保障分析'],
      ['技术方案', '设备方案', '工程方案', '用地征收补偿方案', '数字化方案', '建设管理方案'],
      ['运营模式选择', '运营组织方案', '安全保障方案', '绩效管理方案'],
      ['投资估算', '融资方案', '财务可持续性分析'],
      ['经济影响分析', '社会影响分析', '生态环境影响分析', '资源和能源利用效果分析', '碳达峰碳中和分析'],
      ['风险识别与评价', '风险管控方案', '风险应急预案'],
      ['主要研究结论', '问题与建议'],
    ],
  },
  enterprise: {
    label: '企业投资项目参考大纲（2023版标准）',
    chapters: [
      '概述',
      '项目建设背景、需求分析及产出方案',
      '项目选址与要素保障',
      '项目建设方案',
      '项目运营方案',
      '项目投融资与财务方案',
      '项目影响效果分析',
      '项目风险管控方案',
      '研究结论及建议',
    ],
    suggestedChildren: [
      ['项目概况', '项目单位概况', '编制依据', '主要结论和建议'],
      ['项目建设背景', '规划政策符合性', '项目需求分析', '项目产出方案'],
      ['项目选址', '项目建设条件', '要素保障分析'],
      ['技术方案', '设备方案', '工程方案', '数字化方案', '建设管理方案'],
      ['运营模式选择', '运营组织方案', '安全保障方案', '绩效管理方案'],
      ['投资估算', '盈利能力分析', '融资方案', '债务清偿能力分析', '财务可持续性分析'],
      ['经济影响分析', '社会影响分析', '生态环境影响分析', '资源和能源利用效果分析', '碳达峰碳中和分析'],
      ['风险识别与评价', '风险管控方案', '风险应急预案'],
      ['主要研究结论', '问题与建议'],
    ],
  },
  industrial: {
    label: '工业与高端制造可行性研究大纲',
    chapters: [
      '概述',
      '项目建设背景与必要性',
      '产品方案与生产规模',
      '工艺技术与主要设备方案',
      '厂址选择与公用工程',
      '节能减排与环境保护',
      '项目实施进度与组织架构',
      '投资估算与资金筹措',
      '财务评价与风险评估',
      '结论及建议',
    ],
    suggestedChildren: [
      ['项目概况', '编制依据与范围', '主要技术经济指标', '结论与建议'],
      ['国家与行业政策背景', '市场需求与产能缺口', '建设必要性分析'],
      ['产品大纲及质量标准', '生产规模及产能安排', '产品市场竞争力'],
      ['工艺技术路线与原理', '主要生产及检测设备选型', '设备自动化与智能化'],
      ['厂址选址与建设条件', '总图运输与公用工程', '辅助生产设施'],
      ['能耗分析与节能措施', '三废治理与环保方案', '绿色制造与低碳指标'],
      ['组织机构与劳动定员', '人员培训计划', '项目实施进度节点'],
      ['建设投资与流动资金估算', '资金筹措方案及还本付息'],
      ['营业收入及成本预测', 'NPV/IRR/投资回收期计算', '敏感性分析与风险管控'],
      ['综合可行性评估', '存在问题及后续实施建议'],
    ],
  },
  hi_tech: {
    label: '高新技术与数字化/信息化大纲',
    chapters: [
      '概述',
      '项目建设背景与必要性',
      '技术路线与系统架构设计',
      '数据要素与网络安全方案',
      '软硬件设备与部署实施',
      '运营模式与运维保障',
      '投资估算与资金筹措',
      '效益分析与财务评价',
      '风险管控与结论',
    ],
    suggestedChildren: [
      ['项目背景', '编制依据', '技术亮点', '总体结论'],
      ['数字经济/高新技术政策背景', '行业痛点与技术创新必要性', '经济与社会价值'],
      ['总体技术架构', '核心算法/关键技术突破', '模块划分与数据流向'],
      ['数据采集与存储方案', '网络安全与等级保护', '数据合规与隐私保护'],
      ['软硬件资源配置', '云原生/边缘计算部署', '系统集成与测试'],
      ['业务运营模式', '运维管理与SLA保障', '团队组织与人员培训'],
      ['研发及软硬件投入估算', '资金筹措与使用计划'],
      ['直接与间接经济效益', '财务可行性指标分析'],
      ['技术风险与合规风险管控', '研究结论与建议'],
    ],
  },
  infrastructure: {
    label: '基础设施与公用事业大纲',
    chapters: [
      '概述',
      '建设背景与规划符合性',
      '建设规模与工程技术方案',
      '线路选址与要素保障',
      '工程建设与运营保障方案',
      '投资估算与融资方案',
      '社会经济与公益效益评价',
      '风险管控与结论',
    ],
    suggestedChildren: [
      ['项目概况', '规划依据', '建设规模', '研究结论'],
      ['区域发展规划符合性', '基础设施建设必要性', '交通/公用事业需求'],
      ['工程建设规模', '主体工程与路线方案', '配套公用设施方案'],
      ['选址及用地征收方案', '水资源及能源保障', '生态与环境影响评价'],
      ['建设工期安排与施工方案', '运营管理模式与安全保障', '应急响应预案'],
      ['工程总投资估算', '政府专项债/PPP/自筹融资方案'],
      ['社会影响与民生改善评价', '区域经济拉动效益'],
      ['工程安全与社会稳定风险评估', '总体研究结论'],
    ],
  },
  eco_environmental: {
    label: '农业与生态环保项目大纲',
    chapters: [
      '概述',
      '背景与生态保护必要性',
      '资源禀赋与工程选址',
      '技术方案与工艺流程',
      '生态效益与碳中和评估',
      '项目建设与运营管理',
      '投资估算与资金筹措',
      '财务与可持续性分析',
      '风险防范与结论',
    ],
    suggestedChildren: [
      ['项目概况', '编制依据', '生态目标', '结论建议'],
      ['国家生态文明政策', '区域生态环境现状与痛点', '项目建设必要性'],
      ['自然地理与资源条件', '工程选址与合规性分析', '用地与水资源保障'],
      ['生态修复/农业循环技术方案', '主要工艺设备与治理流程', '自动化监控系统'],
      ['生态系统服务价值评估', '减碳/固碳量预测与碳达峰'],
      ['工程建设进度安排', '生态监测与长效运营机制'],
      ['工程建设与生态投资估算', '绿色金融/政府补贴资金'],
      ['直接收益与生态补偿收益', '财务可持续性评估'],
      ['生态风险与环境敏感区防范', '可行性结论与建议'],
    ],
  },
  commercial_realestate: {
    label: '商业/园区与地产开发大纲',
    chapters: [
      '概述',
      '项目背景与区域市场分析',
      '建设规模与规划设计方案',
      '选址条件与配套要素保障',
      '开发进度与营销运营方案',
      '投资估算与资金筹措',
      '财务评价与敏感性分析',
      '社会效益与风险控制',
      '研究结论与建议',
    ],
    suggestedChildren: [
      ['项目名称与性质', '编制依据', '项目定位', '综合结论'],
      ['区域经济与商业环境', '周边竞争格局与供需分析', '项目定位与客群分析'],
      ['建筑总体规划与指标', '空间布局与功能分区', '景观与建筑风格'],
      ['项目选址与交通条件', '市政配套与要素保障', '土地获取与权属说明'],
      ['开发建设周期与节点', '招商与营销推广方案', '物业运营与商业管理'],
      ['开发建设总投资估算', '资金筹措与动态现金流'],
      ['销售/租赁收入预测', 'NPV/IRR/动态回收期分析', '售价及出租率敏感性测试'],
      ['区域商业激活与就业带动', '市场与政策风险防范'],
      ['总体可行性结论', '项目实施推进建议'],
    ],
  },
};

const ANALYSIS_FIELDS = [
  ['project_overview', '项目概况'],
  ['background_and_necessity', '建设背景与必要性'],
  ['demand_and_output', '需求分析与产出方案'],
  ['site_and_conditions', '项目选址与要素保障'],
  ['construction_and_technical_conditions', '建设内容与技术条件'],
  ['operation_conditions', '运营条件'],
  ['investment_and_financing', '投资与资金资料'],
  ['impact_and_risks', '影响效果与风险'],
  ['missing_information', '缺失资料清单'],
];

function formatProjectInfo(info = {}) {
  const typeLabel = info.projectType === 'enterprise' ? '企业投资项目' : '政府投资项目';
  return [
    `项目名称：${info.projectName || '【待补充】'}`,
    `项目类型：${typeLabel}`,
    `所属行业：${info.industry || '【待补充】'}`,
    `建设单位：${info.constructionUnit || '【待补充】'}`,
    `建设地点：${info.location || '【待补充】'}`,
    `建设内容与规模：${info.constructionContent || '【待补充】'}`,
    `建设期：${info.constructionPeriodYears || '【待补充】'} 年`,
    `运营期：${info.operationPeriodYears || '【待补充】'} 年`,
    `总投资：${info.totalInvestment || '【待补充】'}`,
    `资金来源：${info.fundingSource || '【待补充】'}`,
  ].join('\n');
}

function formatOutlineTemplateTree(templateId) {
  const template = OUTLINE_TEMPLATES[templateId] || OUTLINE_TEMPLATES.government;
  return template.chapters.map((title, index) => {
    const children = template.suggestedChildren?.[index] || [];
    return `${index + 1}. ${title}\n${children.map((child, childIndex) => `  ${index + 1}.${childIndex + 1} ${child}`).join('\n')}`;
  }).join('\n');
}

function getOutlineTemplatePrompt(templateId) {
  const template = OUTLINE_TEMPLATES[templateId] || OUTLINE_TEMPLATES.government;
  return `选用的通用大纲：${template.label}\n${formatOutlineTemplateTree(templateId)}`;
}

function buildOutlineTemplateMarkdown(templateId, targetWords) {
  const template = OUTLINE_TEMPLATES[templateId] || OUTLINE_TEMPLATES.government;
  return [
    `# 选用的通用大纲：${template.label}`,
    '',
    `目标总字数约 ${Number(targetWords) || 30000} 字。`,
    '',
    '一级目录原则上保留本大纲主框架，可根据项目明显不适用的内容合并或调整，但不得遗漏结论、风险、影响和投资相关内容。',
    '二、三级目录必须结合本项目资料具体化；下列二级标题是大纲组成部分，应作为细化起点写入目录，而不是可忽略的参考清单。',
    '',
    formatOutlineTemplateTree(templateId),
  ].join('\n');
}

function buildAnalysisSystemPrompt() {
  return [
    'You are a rigorous analyst of feasibility-study materials for Chinese construction projects. Extract facts only from the project parameters and user-provided materials; never invent amounts, scale, locations, durations, policy names or technical parameters.',
    'When no supporting documents are available, use only the project parameters, including construction scope and scale; the materials block may say that no documents were imported.',
  ].join(' ');
}

function buildAnalysisUserInstruction(segmentIndex, totalSegments) {
  return `Organize information in this material that can support the feasibility study as JSON.

1. project_overview: project name, organization, location, nature, scale, construction scope and duration.
2. background_and_necessity: background, problems, relationship to plans and policies, and need for construction.
3. demand_and_output: beneficiaries, current gaps, basis for scale and expected outputs.
4. site_and_conditions: site selection, land use, transport, utilities, resources, approvals and construction conditions.
5. construction_and_technical_conditions: technical approach, works, equipment, digital systems and construction management.
6. operation_conditions: operating model, organization, safety, performance and maintenance.
7. investment_and_financing: investment, expenses, funding sources, revenue, costs and financing.
8. impact_and_risks: economic, social, ecological, energy, carbon emissions and risk information.
9. missing_information: list only key information clearly missing, contradictory or requiring user confirmation in this segment; do not assume information absent from this segment is missing if it may be present in others.
10. Return Markdown text in each field, or an empty string where information is unavailable. Return JSON only.

Current segment: ${segmentIndex}/${totalSegments}

JSON format:
${JSON.stringify(Object.fromEntries(ANALYSIS_FIELDS.map(([key]) => [key, 'Markdown text'])), null, 2)}`;
}

function buildAnalysisMergeSystemPrompt() {
  return 'You are a rigorous feasibility-study analysis editor. Merge only the analysis results provided by the user; do not invent facts.';
}

function buildAnalysisMergeUserInstruction() {
  return 'Merge duplicate information, preserve specific facts and identify contradictions. In missing_information retain only key items still missing, contradictory or requiring confirmation after reviewing all segments. Return only JSON with the same fields as the input.';
}

function analysisToMarkdown(payload = {}) {
  return ANALYSIS_FIELDS.map(([key, title]) => {
    const raw = String(payload[key] || '').trim();
    const body = raw || (key === 'missing_information'
      ? '- 【待补充】尚未识别到明确缺失项，请人工核对资料完整性。'
      : '【待补充】现有资料未提供足够信息。');
    return `## ${title}\n\n${body}`;
  }).join('\n\n');
}

function buildOutlineSystemPrompt() {
  return 'You are the lead editor of a feasibility study. Based on the actual project materials and within the general outline framework, produce a complete, actionable, editable report outline with no more than three levels.';
}

function buildParametersSystemPrompt() {
  return 'You review key parameters for a feasibility study. Distinguish known facts from missing information and never invent figures, policies, equipment parameters, locations or funding arrangements.';
}

function buildParametersUserInstruction() {
  return `Generate Markdown for key parameters and preparation assumptions, covering at least: project identity, construction objectives and scale, location and conditions, construction period and schedule, technical approach and principal equipment, investment and funding, operating period and organization, safety, environmental and energy assumptions, economic and social benefits, risks and items requiring confirmation.

1. State clearly established facts directly.
2. Mark missing key parameters as “【待补充】”; do not supply typical or estimated values.
3. Mark conflicting information as “【待确认】” and list the conflicts.
4. Do not calculate financial indicators such as NPV, IRR or payback period at this stage.
5. Use second-level headings and short bullets. Output Markdown directly.`;
}

function buildContentSystemPrompt() {
  return 'You are a professional feasibility-study writer. Base the report on project facts and materials supplied by the user, with clear reasoning and formal language. Do not invent amounts, scale, locations, durations, approvals, policy names, equipment parameters or financial indicators. Write in the language of the project.';
}

function buildContentWritingRules() {
  return `Writing rules:
1. Generate only the body of the current leaf section, without repeating its title.
2. Analyze and structure the available material; Markdown subheadings, lists and necessary tables are allowed.
3. Mark unsupported key data as “【待补充】” or use qualitative language without invented numbers.
4. Do not present requirements, recommendations or general standards as completed facts.
5. Remain consistent with the report's key parameters.
6. For engineering or site-selection sections covering site and construction conditions, general layout, process flow, environmental facilities or implementation schedule, insert exactly one illustration guide at the best location in this fixed format:
> 📸 **【插图指引】：图片名称**
> *说明：此处请插入...*
7. Output the Markdown body directly.`;
}

function buildHumanWritingSystemPrompt() {
  return [
    'Edit the given feasibility-report section to make the writing natural and human while retaining its formal consulting style and original language.',
    'Protect facts and parameters, reduce repetition, improve word order and remove formulaic or model-like wording.',
    'Preserve every quantity, unit, amount, date and percentage, as well as the exact markers 【待补充】【待确认】 and [Pendiente por completar], [Pendiente por confirmar].',
    'Do not add facts, change conclusions or calculate financial indicators.',
    'Do not output the section title or add facts absent from the materials. Output only the revised Markdown body without explanation.',
  ].join(' ');
}

function renderOutlineForPrompt(items, prefix = '') {
  return (items || []).flatMap((item, index) => {
    const number = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
    return [`${number} ${item.title}${item.description ? `：${item.description}` : ''}`, ...renderOutlineForPrompt(item.children, number)];
  }).join('\n');
}

module.exports = {
  OUTLINE_TEMPLATES,
  ANALYSIS_FIELDS,
  formatProjectInfo,
  formatOutlineTemplateTree,
  getOutlineTemplatePrompt,
  buildOutlineTemplateMarkdown,
  buildAnalysisSystemPrompt,
  buildAnalysisUserInstruction,
  buildAnalysisMergeSystemPrompt,
  buildAnalysisMergeUserInstruction,
  analysisToMarkdown,
  buildOutlineSystemPrompt,
  buildParametersSystemPrompt,
  buildParametersUserInstruction,
  buildContentSystemPrompt,
  buildContentWritingRules,
  buildHumanWritingSystemPrompt,
  renderOutlineForPrompt,
};
