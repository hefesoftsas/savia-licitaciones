type RotationPage = {rotated: number; failed: number; nextCursor?: string};
export function rotateAccountCredentials(options: {ownerId: string; send: (input: {ownerId: string; cursor?: string}) => Promise<RotationPage>; signal?: AbortSignal; maxPages?: number}): Promise<{rotated: number; failed: number; complete: boolean}>;
