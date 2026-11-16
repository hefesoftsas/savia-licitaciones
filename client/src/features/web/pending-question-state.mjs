export function isWaitingForAnswer(job, questions) {
  return job?.state === 'running' && questions.some(question => question.jobId === job.id);
}
