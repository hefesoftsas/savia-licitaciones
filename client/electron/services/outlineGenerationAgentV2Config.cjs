// Persistent agent task ID for outline generation V2, used only by the technical-plan business layer.
const OUTLINE_AGENT_TASK_KEY = 'technical-plan-outline-generation';
// Bid-template extraction uses a separate ordinary session and persistent workspace.
const TEMPLATE_EXTRACTION_AGENT_TASK_KEY = 'technical-plan-template-extraction';

module.exports = {
  OUTLINE_AGENT_TASK_KEY,
  TEMPLATE_EXTRACTION_AGENT_TASK_KEY,
};
