export interface TagDefinition {
	name: string;
	instructions: string;
	matchCriteria: string;
	otherCriteria: string;
	enabled: boolean;
}

export interface JevAnswer {
	choice?: string;
	confidence?: number;
	probabilities?: Record<string, number>;
}

export interface JevResponse {
	model: string;
	answers: Record<string, JevAnswer>;
	usage?: {
		input_tokens: number;
		output_tokens: number;
	};
}

export interface NoteEvaluationResult {
	tagName: string;
	probability: number;
	confidence: number;
	isMatch: boolean;
	description: string;
}
