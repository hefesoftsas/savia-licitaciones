export function projectOfferProgress(project) {
 if (project.latestResult === 'awarded') return {stage:'awarded',next:'after'};
 if (project.latestResult === 'not_awarded') return {stage:'not-awarded',next:'after'};
 if (project.latestResult === 'other') return {stage:'result',next:'after'};
 if (project.hasSubmission) return {stage:'submitted',next:'after'};
 if (project.hasReviewedWord) return {stage:'word',next:'submit'};
 if (project.hasDraft) return {stage:'draft',next:'prepare'};
 if (project.hasPreparation) return {stage:'preparation',next:'prepare'};
 if (project.fileCount > 0) return {stage:'documents',next:'prepare'};
 return {stage:'empty',next:'documents'};
}
